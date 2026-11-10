package mix

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/evanofslack/mixtake/internal/logging"
	"github.com/evanofslack/mixtake/internal/metrics"
)

var (
	// ErrBusy means too many tracks are already waiting for analysis.
	ErrBusy = errors.New("analysis queue is full")
	// ErrUpstream wraps unexpected Spotify or analogdb failures (network errors, format changes).
	ErrUpstream = errors.New("upstream request failed")
)

const maxVibeRunes = 200

// RunnerConfig sets the runner's limits. Zero values get the defaults noted.
type RunnerConfig struct {
	MaxPasteTracks     int           // tracks allowed in a paste; default 300
	SpotifyConcurrency int           // Catalog.Track calls at once, per job; default 4
	AnalyzeConcurrency int           // tracks analysed at once, across all jobs; default 4
	MaxQueue           int           // pending tracks across jobs before Create returns ErrBusy; default 1000
	JobTimeout         time.Duration // a job then finishes with partial results; default 5m
	Retain             time.Duration // finished jobs stay in memory this long; default 10m
	ProfileEvery       int           // a profile event every this many tracks; default 10
}

func (c *RunnerConfig) defaults() {
	set := func(v *int, d int) {
		if *v <= 0 {
			*v = d
		}
	}
	set(&c.MaxPasteTracks, 300)
	set(&c.SpotifyConcurrency, 4)
	set(&c.AnalyzeConcurrency, 4)
	set(&c.MaxQueue, 1000)
	set(&c.ProfileEvery, 10)
	if c.JobTimeout <= 0 {
		c.JobTimeout = 5 * time.Minute
	}
	if c.Retain <= 0 {
		c.Retain = 10 * time.Minute
	}
}

// Runner creates mixes and runs their analysis jobs in the background, fanning each job's events
// out to subscribers. Jobs live in memory while running and for RunnerConfig.Retain afterwards;
// after that (or a restart) a mix's state is rebuilt from the Store, and a job is started again if
// any track is still unanalysed. Tracks that had no preview or failed are not stored, so they are
// retried then.
type Runner struct {
	cat Catalog
	an  Analyzer
	st  Store
	m   *metrics.Metrics
	cfg RunnerConfig

	ctx        context.Context // cancelled on shutdown; every job runs under it
	wg         sync.WaitGroup
	analyzeSem chan struct{}

	mu      sync.Mutex
	jobs    map[string]*job
	pending int // unfinished tracks across running jobs

	flightMu sync.Mutex
	flights  map[string]*flight // per-track analysis in progress, shared across jobs
}

// NewRunner returns a runner whose jobs stop when ctx is cancelled. m may be nil.
func NewRunner(ctx context.Context, cat Catalog, an Analyzer, st Store, m *metrics.Metrics,
	cfg RunnerConfig) *Runner {
	cfg.defaults()
	if m == nil {
		m = metrics.New()
	}
	return &Runner{
		cat: cat, an: an, st: st, m: m, cfg: cfg, ctx: ctx,
		analyzeSem: make(chan struct{}, cfg.AnalyzeConcurrency),
		jobs:       map[string]*job{},
		flights:    map[string]*flight{},
	}
}

// Wait blocks until every job has stopped. Cancel the runner's context first.
func (r *Runner) Wait() { r.wg.Wait() }

// Create parses input, fetches a playlist or album if that's what it is, stores the mix and starts
// its job. It returns an *InputError for bad input, ErrNotFound or ErrPrivate for links Spotify
// won't serve, ErrBusy when the queue is full and the mix would add to it (a mix whose job is in
// memory or whose tracks are all cached is never busy), and ErrUpstream when Spotify fails.
func (r *Runner) Create(ctx context.Context, input, vibe string) (Mix, error) {
	in, err := ParseInput(input, r.cfg.MaxPasteTracks)
	if err != nil {
		return Mix{}, err
	}
	vibe = strings.Join(strings.Fields(vibe), " ")
	if utf8.RuneCountInString(vibe) > maxVibeRunes {
		return Mix{}, inputErr(ErrUnsupported, "Keep the vibe under %d characters.", maxVibeRunes)
	}
	src := Source{Kind: in.Kind}
	ids := in.TrackIDs
	var known map[string]Track // fetched with their preview URLs
	if in.Kind != KindTracks {
		fetch := r.cat.Playlist
		if in.Kind == KindAlbum {
			fetch = r.cat.Album
		}
		s, tracks, err := fetch(ctx, in.ID)
		if err != nil {
			if !errors.Is(err, ErrNotFound) && !errors.Is(err, ErrPrivate) {
				err = fmt.Errorf("%w: %w", ErrUpstream, err)
			}
			return Mix{}, err
		}
		s.Kind, s.SpotifyID = in.Kind, in.ID
		src = s
		known = make(map[string]Track, len(tracks))
		var unique []Track
		for _, t := range tracks {
			if _, dup := known[t.ID]; !dup {
				known[t.ID] = t
				unique = append(unique, t)
				ids = append(ids, t.ID)
			}
		}
		if len(ids) == 0 {
			return Mix{}, inputErr(ErrUnsupported, "That %s has no tracks.", in.Kind)
		}
		if err := r.st.PutTracks(ctx, unique); err != nil {
			return Mix{}, err
		}
	}

	m := Mix{ID: MixID(ids, vibe), Source: src, TrackIDs: ids, Vibe: vibe, CreatedAt: time.Now().UTC()}
	switch old, err := r.st.Mix(ctx, m.ID); {
	case err == nil:
		m = old
	case errors.Is(err, ErrNotFound):
		if err := r.st.PutMix(ctx, m); err != nil {
			return Mix{}, err
		}
	default:
		return Mix{}, err
	}
	if _, err := r.ensureJob(ctx, m, known, true); err != nil {
		return Mix{}, err
	}
	return m, nil
}

// Snapshot returns a mix's current state, starting its job again if it is incomplete and not
// running. It returns ErrNotFound for unknown ids.
func (r *Runner) Snapshot(ctx context.Context, id string) (Snapshot, error) {
	j, err := r.job(ctx, id)
	if err != nil {
		return Snapshot{}, err
	}
	return j.snapshot(), nil
}

// Subscribe streams a mix's events: a snapshot first, then live events until done or error,
// after which the channel is closed. A subscriber that falls more than a buffer behind is
// dropped (its channel closes early) so a slow client never holds up a job; it can reconnect and
// start again from a fresh snapshot. Call the returned func to unsubscribe.
func (r *Runner) Subscribe(ctx context.Context, id string) (<-chan Event, func(), error) {
	j, err := r.job(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	ch, cancel := j.subscribe()
	return ch, cancel, nil
}

// job returns the in-memory job for id, or rebuilds it from the store.
func (r *Runner) job(ctx context.Context, id string) (*job, error) {
	r.mu.Lock()
	j := r.jobs[id]
	r.mu.Unlock()
	if j != nil {
		return j, nil
	}
	m, err := r.st.Mix(ctx, id)
	if err != nil {
		return nil, err
	}
	return r.ensureJob(ctx, m, nil, false)
}

// ensureJob returns the job for m, loading its state from the store and starting it if it isn't
// in memory. known holds freshly fetched tracks with preview URLs. With checkBusy, it returns
// ErrBusy instead of starting a job that would add tracks to a full queue.
func (r *Runner) ensureJob(ctx context.Context, m Mix, known map[string]Track, checkBusy bool) (*job, error) {
	r.mu.Lock()
	j := r.jobs[m.ID]
	r.mu.Unlock()
	if j != nil {
		return j, nil
	}
	results, err := r.load(ctx, m, known)
	if err != nil {
		return nil, err
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	if j := r.jobs[m.ID]; j != nil {
		return j, nil // another request got there first
	}
	cov := CoverageOf(results)
	if checkBusy && cov.Done < cov.Total && r.pending >= r.cfg.MaxQueue {
		return nil, ErrBusy
	}
	j = newJob(m, results)
	for id := range known {
		j.fetched[id] = true
	}
	r.jobs[m.ID] = j
	r.m.FeatureCache.WithLabelValues("hit").Add(float64(cov.Done))
	r.m.FeatureCache.WithLabelValues("miss").Add(float64(cov.Total - cov.Done))
	if cov.Done == cov.Total {
		j.finish(StatusDone, Event{EventDone, cov})
		r.evictLater(j)
		return j, nil
	}
	r.pending += cov.Total - cov.Done
	jobCtx := logging.WithRequestID(r.ctx, logging.RequestID(ctx))
	r.wg.Add(1)
	go r.run(jobCtx, j)
	return j, nil
}

// load builds a mix's track results from the store, preferring known tracks.
func (r *Runner) load(ctx context.Context, m Mix, known map[string]Track) ([]TrackResult, error) {
	tracks, err := r.st.Tracks(ctx, m.TrackIDs)
	if err != nil {
		return nil, err
	}
	feats, err := r.st.Features(ctx, m.TrackIDs, r.an.ModelVersion())
	if err != nil {
		return nil, err
	}
	results := make([]TrackResult, len(m.TrackIDs))
	for i, id := range m.TrackIDs {
		t, ok := known[id]
		if !ok {
			t, ok = tracks[id]
		}
		if !ok {
			t = Track{ID: id, Artists: []Artist{}}
		}
		results[i] = TrackResult{Track: t, Status: TrackPending}
		if f, ok := feats[id]; ok {
			results[i].Status, results[i].Features = TrackDone, &f
		}
	}
	return results, nil
}

func (r *Runner) evictLater(j *job) {
	time.AfterFunc(r.cfg.Retain, func() {
		r.mu.Lock()
		defer r.mu.Unlock()
		if r.jobs[j.mix.ID] == j {
			delete(r.jobs, j.mix.ID)
		}
	})
}

// run processes every pending track, then finishes the job.
func (r *Runner) run(ctx context.Context, j *job) {
	defer r.wg.Done()
	start := time.Now()
	ctx, cancel := context.WithTimeout(ctx, r.cfg.JobTimeout)
	defer cancel()
	slog.InfoContext(ctx, "job started", "mix", j.mix.ID, "tracks", len(j.mix.TrackIDs))

	spotifySem := make(chan struct{}, r.cfg.SpotifyConcurrency)
	var wg sync.WaitGroup
	for i, res := range j.snapshot().Tracks {
		if res.Status != TrackPending {
			continue
		}
		wg.Go(func() {
			out := r.process(ctx, spotifySem, res.Track, j.fetched[res.Track.ID])

			r.mu.Lock()
			r.pending--
			r.mu.Unlock()
			if r.ctx.Err() == nil { // on shutdown, tracks cut short aren't failures
				j.update(i, out, r.cfg.ProfileEvery)
			}
		})
	}
	wg.Wait()

	if r.ctx.Err() != nil { // shutting down: drop the job; it restarts from the store next time
		j.abort()
		r.mu.Lock()
		delete(r.jobs, j.mix.ID)
		r.mu.Unlock()
		return
	}
	cov := j.coverage()
	failed := j.count(TrackFailed)
	result, status, final := "done", StatusDone, Event{EventDone, cov}
	switch {
	case cov.Done == 0:
		result, status = "failed", StatusFailed
		final = Event{EventError, ErrorEvent{Message: "None of these tracks could be analysed. " +
			"Spotify may not have previews for them."}}
	case failed > 0 || ctx.Err() != nil:
		result = "partial"
	}
	r.m.Jobs.WithLabelValues(result).Inc()
	slog.InfoContext(ctx, "job finished", "mix", j.mix.ID, "result", result, "done", cov.Done,
		"failed", cov.Failed, "total", cov.Total, "timed_out", ctx.Err() != nil,
		"duration_ms", time.Since(start).Milliseconds())
	j.finish(status, final)
	r.evictLater(j)
}

// process analyses one track. Unless it was just fetched with its playlist or album, its
// metadata and short-lived preview URL are fetched first.
func (r *Runner) process(ctx context.Context, spotifySem chan struct{}, t Track, fetched bool) TrackResult {
	if !fetched {
		select {
		case spotifySem <- struct{}{}:
		case <-ctx.Done():
			return TrackResult{Track: t, Status: TrackFailed}
		}
		fresh, err := r.cat.Track(ctx, t.ID)
		<-spotifySem
		if errors.Is(err, ErrNotFound) {
			return TrackResult{Track: t, Status: TrackNotFound}
		}
		if err != nil {
			slog.WarnContext(ctx, "track lookup failed", "track", t.ID, "error", err)
			return TrackResult{Track: t, Status: TrackFailed}
		}
		if err := r.st.PutTracks(ctx, []Track{fresh}); err != nil {
			slog.ErrorContext(ctx, "storing track", "track", t.ID, "error", err)
			return TrackResult{Track: fresh, Status: TrackFailed}
		}
		t = fresh
	}
	if t.PreviewURL == "" {
		return TrackResult{Track: t, Status: TrackNoAudio}
	}
	f, err := r.analyze(ctx, t)
	switch {
	case errors.Is(err, ErrNotFound):
		return TrackResult{Track: t, Status: TrackNoAudio} // the preview URL is dead
	case err != nil:
		if ctx.Err() == nil {
			slog.WarnContext(ctx, "analysis failed", "track", t.ID, "error", err)
		}
		return TrackResult{Track: t, Status: TrackFailed}
	}
	return TrackResult{Track: t, Status: TrackDone, Features: &f}
}

// flight is one track's analysis, which concurrent jobs wait on instead of repeating.
type flight struct {
	done chan struct{}
	f    Features
	err  error
}

// analyze analyses and stores a track once, however many jobs ask for it at the same time.
func (r *Runner) analyze(ctx context.Context, t Track) (Features, error) {
	r.flightMu.Lock()
	if fl, ok := r.flights[t.ID]; ok {
		r.flightMu.Unlock()
		select {
		case <-fl.done:
			return fl.f, fl.err
		case <-ctx.Done():
			return Features{}, ctx.Err()
		}
	}
	fl := &flight{done: make(chan struct{})}
	r.flights[t.ID] = fl
	r.flightMu.Unlock()

	// another job may have finished this track since our job loaded its cached features
	if cached, err := r.st.Features(ctx, []string{t.ID}, r.an.ModelVersion()); err == nil && len(cached) == 1 {
		fl.f = cached[t.ID]
	} else {
		fl.f, fl.err = r.analyzeOnce(ctx, t)
	}
	r.flightMu.Lock()
	delete(r.flights, t.ID)
	r.flightMu.Unlock()
	close(fl.done)
	return fl.f, fl.err
}

func (r *Runner) analyzeOnce(ctx context.Context, t Track) (Features, error) {
	r.m.AnalyzerQueueDepth.Inc()
	select {
	case r.analyzeSem <- struct{}{}:
		r.m.AnalyzerQueueDepth.Dec()
	case <-ctx.Done():
		r.m.AnalyzerQueueDepth.Dec()
		return Features{}, ctx.Err()
	}
	defer func() { <-r.analyzeSem }()

	audio, err := r.cat.Preview(ctx, t.PreviewURL)
	if err != nil {
		return Features{}, fmt.Errorf("preview: %w", err)
	}
	defer audio.Close()
	start := time.Now()
	f, err := r.an.Analyze(ctx, t.ID, audio)
	if err != nil {
		return Features{}, fmt.Errorf("analyze: %w", err)
	}
	r.m.AnalyzerDuration.Observe(time.Since(start).Seconds())
	if err := r.st.PutFeatures(ctx, t.ID, r.an.ModelVersion(), f); err != nil {
		return Features{}, fmt.Errorf("store features: %w", err)
	}
	return f, nil
}

// subBuffer is how many events a subscriber can fall behind before it is dropped.
const subBuffer = 256

// job is one mix's analysis state and its subscribers.
type job struct {
	mix Mix

	mu        sync.Mutex
	status    Status
	results   []TrackResult   // in mix order; Track.PreviewURL is kept in memory only
	fetched   map[string]bool // tracks Create just fetched, with fresh preview URLs; read-only
	finished  bool
	final     Event // done or error, replayed to late subscribers
	completed int   // tracks finished by this job
	subs      map[chan Event]struct{}
}

func newJob(m Mix, results []TrackResult) *job {
	return &job{mix: m, status: StatusRunning, results: results, fetched: map[string]bool{},
		subs: map[chan Event]struct{}{}}
}

func (j *job) snapshot() Snapshot {
	j.mu.Lock()
	defer j.mu.Unlock()
	return j.snapshotLocked()
}

func (j *job) snapshotLocked() Snapshot {
	s := Snapshot{Mix: j.mix, Status: j.status, Tracks: slices.Clone(j.results)}
	if p := BuildProfile(j.results); p.Coverage.Done > 0 {
		s.Profile = &p
	}
	return s
}

func (j *job) coverage() Coverage {
	j.mu.Lock()
	defer j.mu.Unlock()
	return CoverageOf(j.results)
}

func (j *job) count(s TrackStatus) int {
	j.mu.Lock()
	defer j.mu.Unlock()
	n := 0
	for _, r := range j.results {
		if r.Status == s {
			n++
		}
	}
	return n
}

func (j *job) subscribe() (<-chan Event, func()) {
	j.mu.Lock()
	defer j.mu.Unlock()
	ch := make(chan Event, subBuffer)
	ch <- Event{EventSnapshot, j.snapshotLocked()}
	if j.finished {
		ch <- j.final
		close(ch)
		return ch, func() {}
	}
	j.subs[ch] = struct{}{}
	return ch, func() {
		j.mu.Lock()
		defer j.mu.Unlock()
		if _, ok := j.subs[ch]; ok {
			delete(j.subs, ch)
			close(ch)
		}
	}
}

// publish sends ev to every subscriber without blocking, dropping any whose buffer is full.
// j.mu must be held.
func (j *job) publish(ev Event) {
	for ch := range j.subs {
		select {
		case ch <- ev:
		default:
			delete(j.subs, ch)
			close(ch)
		}
	}
}

// update records a finished track and publishes its events.
func (j *job) update(i int, res TrackResult, profileEvery int) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.results[i] = res
	j.completed++
	j.publish(Event{EventTrack, res})
	j.publish(Event{EventProgress, CoverageOf(j.results)})
	if j.completed%profileEvery == 0 {
		if p := BuildProfile(j.results); p.Coverage.Done > 0 {
			j.publish(Event{EventProfile, p})
		}
	}
}

// finish publishes the final profile and event, then closes every subscriber.
func (j *job) finish(status Status, final Event) {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.status, j.finished, j.final = status, true, final
	if p := BuildProfile(j.results); p.Coverage.Done > 0 {
		j.publish(Event{EventProfile, p})
	}
	j.publish(final)
	j.closeSubs()
}

// abort closes every subscriber without a final event.
func (j *job) abort() {
	j.mu.Lock()
	defer j.mu.Unlock()
	j.closeSubs()
}

func (j *job) closeSubs() {
	for ch := range j.subs {
		delete(j.subs, ch)
		close(ch)
	}
}
