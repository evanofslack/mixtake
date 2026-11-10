package mix

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// ErrTooFew means a mix doesn't have enough analysed tracks to pick covers yet.
var ErrTooFew = errors.New("not enough tracks analysed")

const (
	// MinCoverTracks is how many analysed tracks a mix needs for covers, unless its job has
	// finished with fewer (a short album).
	MinCoverTracks = 10
	// minKeywordCount is how many analogdb posts a playlist-name word needs to be searched for.
	minKeywordCount = 20
	searchPageSize  = 50
	maxCached       = 1000 // cached photo sets before expired ones are swept
)

// Covers picks cover photos for mixes from analogdb, caching the results in memory.
type Covers struct {
	photos Photos
	ttl    time.Duration

	mu    sync.Mutex
	cache map[string]cached
}

type cached struct {
	set     PhotoSet
	expires time.Time
}

// NewCovers returns a Covers that keeps photo sets for ttl (default 30 minutes).
func NewCovers(photos Photos, ttl time.Duration) *Covers {
	if ttl <= 0 {
		ttl = 30 * time.Minute
	}
	return &Covers{photos: photos, ttl: ttl, cache: map[string]cached{}}
}

// Pick is how a mix's covers were chosen, with the photos' original analogdb URLs.
type Pick struct {
	Quadrant   Quadrant
	Queries    []SceneQuery
	Palette    []string
	Candidates []Candidate
}

// CoverVibe normalises a vibe override, returning an *InputError if it is too long.
func CoverVibe(vibe string) (string, error) {
	vibe = strings.Join(strings.Fields(vibe), " ")
	if utf8.RuneCountInString(vibe) > maxVibeRunes {
		return "", inputErr(ErrUnsupported, "Keep the vibe under %d characters.", maxVibeRunes)
	}
	return vibe, nil
}

// ForMix returns about CoverCount cover photos for a mix, with image URLs rewritten to the
// /api/img proxy. vibe overrides the mix's own vibe when set. It returns ErrTooFew until
// MinCoverTracks tracks are analysed (or the job has finished with at least one), and
// ErrUpstream if analogdb fails. Results are cached per mix, vibe and ten tracks of coverage.
func (c *Covers) ForMix(ctx context.Context, snap Snapshot, vibe string) (PhotoSet, error) {
	if !ready(snap) {
		return PhotoSet{}, ErrTooFew
	}
	if vibe == "" {
		vibe = snap.Mix.Vibe
	}
	key := fmt.Sprintf("mix|%s|%d|%s", snap.Mix.ID, snap.Profile.Coverage.Done/10, vibe)
	if set, ok := c.cached(key); ok {
		return set, nil
	}
	p, err := c.Pick(ctx, snap, vibe)
	if err != nil {
		return PhotoSet{}, err
	}
	set := PhotoSet{Queries: []string{}, Palette: p.Palette, Photos: make([]Photo, 0, len(p.Candidates))}
	for _, q := range p.Queries {
		set.Queries = append(set.Queries, q.Text)
	}
	for _, cand := range p.Candidates {
		set.Photos = append(set.Photos, proxied(cand.Photo))
	}
	c.store(key, set)
	return set, nil
}

func ready(snap Snapshot) bool {
	if snap.Profile == nil {
		return false
	}
	done := snap.Profile.Coverage.Done
	finished := snap.Status == StatusDone || snap.Status == StatusFailed
	return done >= MinCoverTracks || (finished && done > 0)
}

// Pick runs the cover pipeline without the cache: scene queries from the profile, vibe and
// playlist name, the analogdb searches, then ranking. The mix must have a profile.
func (c *Covers) Pick(ctx context.Context, snap Snapshot, vibe string) (Pick, error) {
	if snap.Profile == nil {
		return Pick{}, ErrTooFew
	}
	prof := *snap.Profile
	queries := Scenes(prof, snap.Mix.ID, vibe, c.nameKeywords(ctx, snap.Mix.Source.Name))
	results := make([][]Photo, len(queries))
	errs := make([]error, len(queries))
	var wg sync.WaitGroup
	for i, q := range queries {
		wg.Go(func() {
			results[i], errs[i] = c.photos.Search(ctx, PhotoQuery{Text: q.Text, PageSize: searchPageSize})
		})
	}
	wg.Wait()
	failed := 0
	for i, err := range errs {
		if err != nil {
			failed++
			slog.WarnContext(ctx, "cover search failed", "mix", snap.Mix.ID, "query", queries[i].Text,
				"error", err)
		}
	}
	if failed == len(queries) {
		return Pick{}, fmt.Errorf("%w: every cover search failed: %w", ErrUpstream, errors.Join(errs...))
	}
	return Pick{
		Quadrant:   prof.Quadrant,
		Queries:    queries,
		Palette:    TargetPalette(prof.Averages),
		Candidates: RankPhotos(queries, results, prof, snap.Mix.ID, CoverCount),
	}, nil
}

// nameKeywords returns the words of a playlist or album name that are common analogdb keywords.
// Lookup failures just leave a word out.
func (c *Covers) nameKeywords(ctx context.Context, name string) []string {
	var out []string
	for _, w := range NameWords(name) {
		n, err := c.photos.KeywordCount(ctx, w)
		if err != nil {
			slog.WarnContext(ctx, "keyword lookup failed", "word", w, "error", err)
			continue
		}
		if n >= minKeywordCount {
			out = append(out, w)
		}
	}
	return out
}

// Similar returns about CoverCount usable photos that look like analogdb post id, with image
// URLs rewritten to the proxy. It returns ErrNotFound for unknown posts and ErrUpstream if
// analogdb fails.
func (c *Covers) Similar(ctx context.Context, id int) (PhotoSet, error) {
	key := "similar|" + strconv.Itoa(id)
	if set, ok := c.cached(key); ok {
		return set, nil
	}
	ps, err := c.photos.Similar(ctx, id)
	if err != nil {
		return PhotoSet{}, err
	}
	set := PhotoSet{Queries: []string{}, Palette: []string{}, Photos: []Photo{}}
	ps = slices.DeleteFunc(ps, func(p Photo) bool { return p.ID == id })
	for _, p := range FilterPhotos(ps, true, CoverCount) {
		set.Photos = append(set.Photos, proxied(p))
	}
	c.store(key, set)
	return set, nil
}

// Image streams an analogdb image by file name. Names that aren't analogdb's are ErrNotFound.
func (c *Covers) Image(ctx context.Context, name string) (io.ReadCloser, string, error) {
	if !ValidImageName(name) {
		return nil, "", ErrNotFound
	}
	return c.photos.Image(ctx, name)
}

// proxied returns a copy of p with image URLs pointing at /api/img, dropping any it won't serve.
func proxied(p Photo) Photo {
	imgs := make([]PhotoImage, 0, len(p.Images))
	for _, img := range p.Images {
		if name, ok := imageFile(img.URL); ok {
			img.URL = ImageProxyPath(name)
			imgs = append(imgs, img)
		}
	}
	p.Images = imgs
	return p
}

func (c *Covers) cached(key string) (PhotoSet, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.cache[key]
	if !ok || time.Now().After(e.expires) {
		return PhotoSet{}, false
	}
	return e.set, true
}

func (c *Covers) store(key string, set PhotoSet) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	if len(c.cache) >= maxCached {
		for k, e := range c.cache {
			if now.After(e.expires) {
				delete(c.cache, k)
			}
		}
		if len(c.cache) >= maxCached {
			c.cache = map[string]cached{}
		}
	}
	c.cache[key] = cached{set: set, expires: now.Add(c.ttl)}
}
