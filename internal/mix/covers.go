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
	// minKeywordCount is how many analogdb posts a title or name word that isn't on the
	// evocative list needs to be searched for.
	minKeywordCount = 20
	// maxKeywordLookups is how many such words are checked per set.
	maxKeywordLookups = 3
	searchPageSize    = 50
	// searchConcurrency is how many analogdb requests a set makes at once; analogdb returns 429
	// to bursts.
	searchConcurrency = 2
	maxCached         = 1000 // cached photo sets before expired ones are swept
	// MaxSeed is the largest shuffle seed.
	MaxSeed = 1_000_000_000
)

// Covers picks cover photos for mixes from analogdb, caching the results in memory.
type Covers struct {
	photos Photos
	ttl    time.Duration

	mu    sync.Mutex
	cache map[string]cached

	showcase showcaseCache
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
	Requests   int // analogdb requests made (cached ones included)
	Elapsed    time.Duration
}

// CoverVibe normalises a vibe override, returning an *InputError if it is too long.
func CoverVibe(vibe string) (string, error) {
	vibe = strings.Join(strings.Fields(vibe), " ")
	if utf8.RuneCountInString(vibe) > maxVibeRunes {
		return "", inputErr(ErrUnsupported, "Keep the vibe under %d characters.", maxVibeRunes)
	}
	return vibe, nil
}

// CoverSeed parses a shuffle seed: empty is 0, otherwise a whole number from 0 to MaxSeed. It
// returns an *InputError for anything else.
func CoverSeed(s string) (int, error) {
	if s == "" {
		return 0, nil
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 0 || n > MaxSeed {
		return 0, inputErr(ErrUnsupported, "The seed must be a whole number from 0 to %d.", MaxSeed)
	}
	return n, nil
}

// ForMix returns about CoverCount cover photos for a mix, with image URLs rewritten to the
// /api/img proxy. vibe overrides the mix's own vibe when set; seed 0 is the mix's usual set and
// any other seed shuffles to a different one. It returns ErrTooFew until MinCoverTracks tracks
// are analysed (or the job has finished with at least one), and ErrUpstream if every analogdb
// search fails. Results are cached per mix, vibe, seed and ten tracks of coverage.
func (c *Covers) ForMix(ctx context.Context, snap Snapshot, vibe string, seed int) (PhotoSet, error) {
	if !ready(snap) {
		return PhotoSet{}, ErrTooFew
	}
	if vibe == "" {
		vibe = snap.Mix.Vibe
	}
	key := fmt.Sprintf("mix|%s|%d|%d|%s", snap.Mix.ID, snap.Profile.Coverage.Done/10, seed, vibe)
	if set, ok := c.cached(key); ok {
		return set, nil
	}
	p, err := c.Pick(ctx, snap, vibe, seed)
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

// Pick runs the cover pipeline without the cache: scene queries from the profile, vibe, track
// titles and playlist name, the analogdb searches, then ranking. The mix must have a profile.
// Searches run searchConcurrency at a time; a failing one is left out, and only if every one
// fails is the result ErrUpstream.
func (c *Covers) Pick(ctx context.Context, snap Snapshot, vibe string, seed int) (Pick, error) {
	if snap.Profile == nil {
		return Pick{}, ErrTooFew
	}
	start := time.Now()
	prof := *snap.Profile
	key := SeedKey(snap.Mix.ID, seed)
	titles := make([]string, 0, len(snap.Tracks))
	for _, t := range snap.Tracks {
		titles = append(titles, t.Track.Title)
	}
	words, lookups := c.titleKeywords(ctx, TitleWords(snap.Mix.Source.Name, titles, key))
	queries := Scenes(prof, key, vibe, words)

	results := make([][]Photo, len(queries))
	errs := make([]error, len(queries))
	sem := make(chan struct{}, searchConcurrency)
	var wg sync.WaitGroup
	for i, q := range queries {
		wg.Go(func() {
			sem <- struct{}{}
			defer func() { <-sem }()
			if q.Lens == LensColor {
				results[i], errs[i] = c.photos.ByColor(ctx, ColorQuery{Color: q.Color, Keyword: q.Keyword,
					Seed: int(hash(key+"|color")%500) + 1, PageSize: searchPageSize})
			} else {
				results[i], errs[i] = c.photos.Search(ctx, PhotoQuery{Text: q.Text, PageSize: searchPageSize})
			}
		})
	}
	wg.Wait()
	failed := 0
	for i, err := range errs {
		if err != nil {
			failed++
			slog.WarnContext(ctx, "cover search failed", "mix", snap.Mix.ID, "lens", queries[i].Lens,
				"query", queries[i].Text, "error", err)
		}
	}
	elapsed := time.Since(start)
	slog.DebugContext(ctx, "cover searches", "mix", snap.Mix.ID, "seed", seed, "queries", len(queries),
		"keyword_lookups", lookups, "failed", failed, "elapsed", elapsed)
	if failed == len(queries) {
		return Pick{}, fmt.Errorf("%w: every cover search failed: %w", ErrUpstream, errors.Join(errs...))
	}
	return Pick{
		Quadrant:   prof.Quadrant,
		Queries:    queries,
		Palette:    TargetPalette(prof.Averages),
		Candidates: RankPhotos(queries, results, prof, key, CoverCount),
		Requests:   len(queries) + lookups,
		Elapsed:    elapsed,
	}, nil
}

// titleKeywords keeps up to maxWords of the candidate words, in order: evocative words as they
// are, and others if analogdb has at least minKeywordCount posts with them. It checks at most
// maxKeywordLookups words, searchConcurrency at a time; lookup failures just leave a word out.
// It also returns how many lookups it made.
func (c *Covers) titleKeywords(ctx context.Context, candidates []string) ([]string, int) {
	var check []string
	for _, w := range candidates {
		if !evocative[w] && len(check) < maxKeywordLookups {
			check = append(check, w)
		}
	}
	ok := make(map[string]bool, len(check))
	var mu sync.Mutex
	sem := make(chan struct{}, searchConcurrency)
	var wg sync.WaitGroup
	for _, w := range check {
		wg.Go(func() {
			sem <- struct{}{}
			defer func() { <-sem }()
			n, err := c.photos.KeywordCount(ctx, w)
			if err != nil {
				slog.WarnContext(ctx, "keyword lookup failed", "word", w, "error", err)
				return
			}
			mu.Lock()
			ok[w] = n >= minKeywordCount
			mu.Unlock()
		})
	}
	wg.Wait()
	var out []string
	for _, w := range candidates {
		if len(out) < maxWords && (evocative[w] || ok[w]) {
			out = append(out, w)
		}
	}
	return out, len(check)
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
