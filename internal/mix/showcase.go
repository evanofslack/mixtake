package mix

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"sync"
	"time"
)

const (
	// showcaseTTL is how long the front page's photos are kept; the queries change each day.
	showcaseTTL = 6 * time.Hour
	// showcaseRetry is how long a failed showcase is remembered, so a down analogdb isn't asked
	// again on every page view.
	showcaseRetry = time.Minute
)

// showcasePoints are where the front page's photos sit on the mood map: three per quadrant,
// spread so dragging across a quadrant changes the photo.
var showcasePoints = []struct{ Mood, Energy float64 }{
	{0.72, 0.86}, {0.86, 0.62}, {0.6, 0.7}, // happy, energetic
	{0.84, 0.3}, {0.66, 0.14}, {0.58, 0.38}, // happy, calm
	{0.18, 0.86}, {0.12, 0.6}, {0.36, 0.7}, // sad, energetic
	{0.16, 0.32}, {0.34, 0.14}, {0.4, 0.4}, // sad, calm
}

// ShowcasePhoto is a front page photo and the point on the mood map it was picked for.
type ShowcasePhoto struct {
	Mood   float64 `json:"mood"`
	Energy float64 `json:"energy"`
	Photo  Photo   `json:"photo"`
}

// Showcase is the front page's demo set.
type Showcase struct {
	Photos []ShowcasePhoto `json:"photos"`
}

type showcaseCache struct {
	mu      sync.Mutex // held while fetching, so concurrent page views share one fetch
	set     Showcase
	err     error
	expires time.Time
}

// Showcase returns a photo for each of the front page's points on the mood map, with image URLs
// rewritten to the proxy. Each quadrant gets one literal and one abstract search from its scene
// list (chosen by the day, so the set changes daily), and each point takes the best photo for its
// own palette that no other point has. It returns ErrUpstream if every search fails. Results
// are cached for showcaseTTL, and failures for showcaseRetry.
func (c *Covers) Showcase(ctx context.Context) (Showcase, error) {
	sc := &c.showcase
	sc.mu.Lock()
	defer sc.mu.Unlock()
	if time.Now().Before(sc.expires) {
		return sc.set, sc.err
	}
	set, err := c.pickShowcase(ctx, "showcase|"+time.Now().UTC().Format(time.DateOnly))
	if ctx.Err() != nil {
		// the page view went away; don't remember its cancellation as analogdb's failure
		return set, err
	}
	sc.set, sc.err = set, err
	sc.expires = time.Now().Add(showcaseTTL)
	if err != nil {
		sc.expires = time.Now().Add(showcaseRetry)
	}
	return set, err
}

func (c *Covers) pickShowcase(ctx context.Context, key string) (Showcase, error) {
	quadrants := []Quadrant{QuadrantHappyEnergetic, QuadrantHappyCalm, QuadrantSadEnergetic, QuadrantSadCalm}
	queries := map[Quadrant][]SceneQuery{}
	for _, q := range quadrants {
		book := scenes.Quadrants[q]
		queries[q] = []SceneQuery{
			{Text: pick(book.Literal, key, string(q)+"|literal"), Lens: LensLiteral, Source: SceneQuadrant, Weight: 1},
			{Text: pick(book.Abstract, key, string(q)+"|abstract"), Lens: LensAbstract, Weight: 1},
		}
	}

	type job struct {
		quadrant Quadrant
		i        int
	}
	var jobs []job
	for _, q := range quadrants {
		for i := range queries[q] {
			jobs = append(jobs, job{q, i})
		}
	}
	results := map[Quadrant][][]Photo{}
	for _, q := range quadrants {
		results[q] = make([][]Photo, len(queries[q]))
	}
	errs := make([]error, len(jobs))
	sem := make(chan struct{}, searchConcurrency)
	var wg sync.WaitGroup
	for n, j := range jobs {
		wg.Go(func() {
			sem <- struct{}{}
			defer func() { <-sem }()
			// each goroutine writes its own slot, so the map itself is only read here
			results[j.quadrant][j.i], errs[n] = c.photos.Search(ctx,
				PhotoQuery{Text: queries[j.quadrant][j.i].Text, PageSize: searchPageSize})
		})
	}
	wg.Wait()
	failed := 0
	for n, err := range errs {
		if err != nil {
			failed++
			slog.WarnContext(ctx, "showcase search failed", "query", queries[jobs[n].quadrant][jobs[n].i].Text,
				"error", err)
		}
	}
	if failed == len(jobs) {
		return Showcase{}, fmt.Errorf("%w: every showcase search failed: %w", ErrUpstream, errors.Join(errs...))
	}

	set := Showcase{Photos: []ShowcasePhoto{}}
	used := map[int]bool{}
	for i, pt := range showcasePoints {
		q := quadrant(pt.Mood, pt.Energy)
		prof := Profile{Quadrant: q, Averages: Averages{Mood: pt.Mood, Energy: pt.Energy}}
		for _, cand := range RankPhotos(queries[q], results[q], prof, key+"|"+strconv.Itoa(i), CoverCount) {
			if !used[cand.Photo.ID] {
				used[cand.Photo.ID] = true
				set.Photos = append(set.Photos, ShowcasePhoto{Mood: pt.Mood, Energy: pt.Energy, Photo: proxied(cand.Photo)})
				break
			}
		}
	}
	slog.DebugContext(ctx, "showcase", "photos", len(set.Photos), "failed", failed)
	return set, nil
}
