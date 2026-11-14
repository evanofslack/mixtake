package mix

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
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
	// ideasTTL is how long a mix's LLM ideas are kept, so shuffles and new coverage reuse them.
	ideasTTL = 24 * time.Hour
	// goodIdeas is how many usable queries a reply should have; a shorter one is asked again.
	goodIdeas = 8
	// MaxSeed is the largest shuffle seed.
	MaxSeed = 1_000_000_000
)

// Covers picks cover photos for mixes from analogdb, caching the results in memory.
type Covers struct {
	photos Photos
	ttl    time.Duration
	// muse writes cover ideas when set (see UseMuse); prompt is its system prompt.
	muse      Muse
	prompt    string
	promptKey string

	mu    sync.Mutex
	cache map[string]cached
	ideas map[string]cachedIdeas

	showcase showcaseCache
}

type cached struct {
	set     PhotoSet
	expires time.Time
}

type cachedIdeas struct {
	ideas   Ideas
	expires time.Time
}

// NewCovers returns a Covers that keeps photo sets for ttl (default 30 minutes).
func NewCovers(photos Photos, ttl time.Duration) *Covers {
	if ttl <= 0 {
		ttl = 30 * time.Minute
	}
	return &Covers{photos: photos, ttl: ttl, cache: map[string]cached{}, ideas: map[string]cachedIdeas{}}
}

// UseMuse makes covers search for ideas an LLM writes from a brief about each mix, with prompt
// as the system prompt (DefaultIdeasPrompt when empty). When the LLM fails, or its reply has too
// few usable queries, the canned scenes are used. Call it before serving.
func (c *Covers) UseMuse(m Muse, prompt string) {
	if strings.TrimSpace(prompt) == "" {
		prompt = DefaultIdeasPrompt()
	}
	sum := sha256.Sum256([]byte(prompt))
	c.muse, c.prompt, c.promptKey = m, prompt, hex.EncodeToString(sum[:6])
}

// Pick is how a mix's covers were chosen, with the photos' original analogdb URLs.
type Pick struct {
	Quadrant Quadrant
	Queries  []SceneQuery
	// Ideas are the LLM's ideas when the queries came from them, and nil otherwise.
	Ideas *Ideas
	// Palette is the target palette: the LLM's when it gave one, else TargetPalette.
	Palette    []string
	Candidates []Candidate
	// Usable is how many usable photos each query found (Usable[i] is for Queries[i]).
	Usable   []int
	Requests int // analogdb requests made (cached ones included)
	Elapsed  time.Duration
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
	palette := TargetPalette(prof.Averages)
	var (
		queries []SceneQuery
		lookups int
		ideas   *Ideas
	)
	if is, err := c.ideasFor(ctx, snap, vibe); err == nil {
		ideas = &is
		queries = IdeaScenes(is, key, vibe, seed != 0)
		if len(is.Palette) >= minIdeaPalette {
			palette = is.Palette
		}
	} else {
		if c.muse != nil {
			slog.WarnContext(ctx, "cover ideas failed, using scenes", "mix", snap.Mix.ID, "error", err)
		}
		titles := make([]string, 0, len(snap.Tracks))
		for _, t := range snap.Tracks {
			titles = append(titles, t.Track.Title)
		}
		var words []string
		words, lookups = c.titleKeywords(ctx, TitleWords(snap.Mix.Source.Name, titles, key))
		queries = Scenes(prof, key, vibe, words)
	}

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
	usable := make([]int, len(results))
	for i, ps := range results {
		usable[i] = len(FilterPhotos(ps, prof.Quadrant == QuadrantSadCalm, len(ps)))
	}
	return Pick{
		Usable:     usable,
		Quadrant:   prof.Quadrant,
		Queries:    queries,
		Ideas:      ideas,
		Palette:    palette,
		Candidates: RankPhotos(queries, results, prof, palette, key, CoverCount),
		Requests:   len(queries) + lookups,
		Elapsed:    elapsed,
	}, nil
}

// errNoMuse means covers have no LLM, so the canned scenes are used.
var errNoMuse = errors.New("no muse")

// ideasFor returns a mix's LLM ideas, from the cache when it can. They are cached by mix, vibe
// and prompt, so a shuffle or more coverage reuses them; failures aren't cached.
func (c *Covers) ideasFor(ctx context.Context, snap Snapshot, vibe string) (Ideas, error) {
	if c.muse == nil {
		return Ideas{}, errNoMuse
	}
	key := snap.Mix.ID + "|" + c.promptKey + "|" + vibe
	now := time.Now()
	c.mu.Lock()
	e, ok := c.ideas[key]
	c.mu.Unlock()
	if ok && now.Before(e.expires) {
		return e.ideas, nil
	}
	start := time.Now()
	brief := Brief(snap, vibe)
	var (
		ideas Ideas
		err   error
	)
	// a short reply is asked for again once, keeping the longer of the two
	for attempt := 0; attempt < 2 && len(ideas.Queries) < goodIdeas; attempt++ {
		raw, cerr := c.muse.Complete(ctx, c.prompt, brief)
		if cerr != nil {
			err = cerr
			continue
		}
		is, perr := ParseIdeas(raw)
		if perr != nil {
			slog.WarnContext(ctx, "cover ideas unusable", "mix", snap.Mix.ID, "reply", raw)
			err = perr
			continue
		}
		if len(is.Queries) > len(ideas.Queries) {
			ideas = is
		}
	}
	if len(ideas.Queries) == 0 {
		return Ideas{}, err
	}
	slog.InfoContext(ctx, "cover ideas from llm", "mix", snap.Mix.ID, "queries", len(ideas.Queries),
		"palette", len(ideas.Palette), "elapsed", time.Since(start))
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.ideas) >= maxCached {
		c.ideas = map[string]cachedIdeas{}
	}
	c.ideas[key] = cachedIdeas{ideas: ideas, expires: now.Add(ideasTTL)}
	return ideas, nil
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
