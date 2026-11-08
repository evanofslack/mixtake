package mix

import (
	"context"
	"errors"
	"fmt"
	"io"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus/testutil"

	"github.com/evanofslack/mixtake/internal/metrics"
)

// fakeCatalog serves playlists and tracks from maps. Track ids starting with "nopreview" have no
// preview and ids starting with "gone" are not found.
type fakeCatalog struct {
	mu         sync.Mutex
	playlists  map[string][]Track
	err        error // returned by Playlist when set
	trackCalls int
}

func (c *fakeCatalog) Playlist(_ context.Context, id string) (Source, []Track, error) {
	if c.err != nil {
		return Source{}, nil, c.err
	}
	ts, ok := c.playlists[id]
	if !ok {
		return Source{}, nil, fmt.Errorf("playlist %s: %w", id, ErrNotFound)
	}
	return Source{Name: "List " + id}, ts, nil
}

func (c *fakeCatalog) Album(ctx context.Context, id string) (Source, []Track, error) {
	return c.Playlist(ctx, id)
}

func (c *fakeCatalog) Track(_ context.Context, id string) (Track, error) {
	c.mu.Lock()
	c.trackCalls++
	c.mu.Unlock()
	if strings.HasPrefix(id, "gone") {
		return Track{}, ErrNotFound
	}
	t := Track{ID: id, Title: "Title " + id, Artists: []Artist{{Name: "Artist"}}}
	if !strings.HasPrefix(id, "nopreview") {
		t.PreviewURL = "https://p/" + id
	}
	return t, nil
}

func (c *fakeCatalog) Preview(_ context.Context, url string) (io.ReadCloser, error) {
	return io.NopCloser(strings.NewReader(url)), nil
}

// fakeAnalyzer counts calls per track, fails ids starting with "bad", and blocks on gate if set.
type fakeAnalyzer struct {
	mu    sync.Mutex
	calls map[string]int
	gate  chan struct{}
}

func (a *fakeAnalyzer) ModelVersion() string { return "test-1" }

func (a *fakeAnalyzer) Analyze(ctx context.Context, id string, audio io.Reader) (Features, error) {
	a.mu.Lock()
	if a.calls == nil {
		a.calls = map[string]int{}
	}
	a.calls[id]++
	a.mu.Unlock()
	if _, err := io.ReadAll(audio); err != nil {
		return Features{}, err
	}
	if a.gate != nil {
		select {
		case <-a.gate:
		case <-ctx.Done():
			return Features{}, ctx.Err()
		}
	}
	if strings.HasPrefix(id, "bad") {
		return Features{}, errors.New("boom")
	}
	return Features{Tempo: 120, Key: "C", Mode: "major", Happy: 0.7, Party: 0.6}, nil
}

// callCount returns the total calls and the most calls for any one track.
func (a *fakeAnalyzer) callCount() (total, most int) {
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, n := range a.calls {
		total += n
		most = max(most, n)
	}
	return total, most
}

// memStore is an in-memory Store that, like SQLite, refuses features for unknown tracks.
type memStore struct {
	mu     sync.Mutex
	tracks map[string]Track
	feats  map[string]Features // key: id + "/" + version
	mixes  map[string]Mix
}

func newMemStore() *memStore {
	return &memStore{tracks: map[string]Track{}, feats: map[string]Features{}, mixes: map[string]Mix{}}
}

func (s *memStore) Tracks(_ context.Context, ids []string) (map[string]Track, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := map[string]Track{}
	for _, id := range ids {
		if t, ok := s.tracks[id]; ok {
			out[id] = t
		}
	}
	return out, nil
}

func (s *memStore) PutTracks(_ context.Context, ts []Track) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, t := range ts {
		t.PreviewURL = ""
		s.tracks[t.ID] = t
	}
	return nil
}

func (s *memStore) Features(_ context.Context, ids []string, v string) (map[string]Features, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := map[string]Features{}
	for _, id := range ids {
		if f, ok := s.feats[id+"/"+v]; ok {
			out[id] = f
		}
	}
	return out, nil
}

func (s *memStore) PutFeatures(_ context.Context, id, v string, f Features) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.tracks[id]; !ok {
		return fmt.Errorf("features for unknown track %s", id)
	}
	s.feats[id+"/"+v] = f
	return nil
}

func (s *memStore) Mix(_ context.Context, id string) (Mix, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	m, ok := s.mixes[id]
	if !ok {
		return Mix{}, ErrNotFound
	}
	return m, nil
}

func (s *memStore) PutMix(_ context.Context, m Mix) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.mixes[m.ID] = m
	return nil
}

// tid makes a valid-looking 22 character track id with a readable prefix.
func tid(prefix string, n int) string {
	s := fmt.Sprintf("%s%dx", prefix, n)
	return s + strings.Repeat("0", 22-len(s))
}

func paste(ids ...string) string {
	var b strings.Builder
	for _, id := range ids {
		b.WriteString("https://open.spotify.com/track/" + id + "?si=x\n")
	}
	return b.String()
}

type harness struct {
	cat *fakeCatalog
	an  *fakeAnalyzer
	st  *memStore
	m   *metrics.Metrics
	r   *Runner
}

func newHarness(t *testing.T, cfg RunnerConfig) *harness {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	h := &harness{cat: &fakeCatalog{playlists: map[string][]Track{}}, an: &fakeAnalyzer{},
		st: newMemStore(), m: metrics.New()}
	h.r = NewRunner(ctx, h.cat, h.an, h.st, h.m, cfg)
	t.Cleanup(func() { cancel(); h.r.Wait() })
	return h
}

// drain collects events until the channel closes.
func drain(t *testing.T, ch <-chan Event) []Event {
	t.Helper()
	var evs []Event
	timeout := time.After(5 * time.Second)
	for {
		select {
		case ev, ok := <-ch:
			if !ok {
				return evs
			}
			evs = append(evs, ev)
		case <-timeout:
			t.Fatalf("timed out after %d events", len(evs))
		}
	}
}

func names(evs []Event) map[string]int {
	out := map[string]int{}
	for _, ev := range evs {
		out[ev.Name]++
	}
	return out
}

func (h *harness) waitDone(t *testing.T, id string) []Event {
	t.Helper()
	ch, cancel, err := h.r.Subscribe(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	defer cancel()
	evs := drain(t, ch)
	if len(evs) < 2 || evs[0].Name != EventSnapshot {
		t.Fatalf("events = %v", names(evs))
	}
	return evs
}

func TestRunnerPlaylist(t *testing.T) {
	h := newHarness(t, RunnerConfig{ProfileEvery: 2})
	pl := tid("pl", 1)
	var tracks []Track
	for i := range 5 {
		tracks = append(tracks, Track{ID: tid("t", i), Title: "T", Artists: []Artist{{Name: "A"}},
			PreviewURL: "https://p/" + tid("t", i)})
	}
	tracks[3].PreviewURL = ""
	tracks = append(tracks, tracks[0]) // duplicate rows are dropped
	h.cat.playlists[pl] = tracks

	m, err := h.r.Create(context.Background(), "https://open.spotify.com/playlist/"+pl, " rainy  day ")
	if err != nil {
		t.Fatal(err)
	}
	if m.Source.Kind != KindPlaylist || m.Source.SpotifyID != pl || m.Source.Name != "List "+pl ||
		len(m.TrackIDs) != 5 || m.Vibe != "rainy day" {
		t.Errorf("mix = %+v", m)
	}
	evs := h.waitDone(t, m.ID)
	got := names(evs)
	if got[EventDone] != 1 || evs[len(evs)-1].Name != EventDone || got[EventProfile] < 2 {
		t.Errorf("events = %v", got)
	}
	if want := (Coverage{Total: 5, Done: 4, Failed: 1}); evs[len(evs)-1].Data != want {
		t.Errorf("done = %+v, want %+v", evs[len(evs)-1].Data, want)
	}
	if h.cat.trackCalls != 0 {
		t.Errorf("playlist tracks needed %d Track calls, want 0", h.cat.trackCalls)
	}

	snap, err := h.r.Snapshot(context.Background(), m.ID)
	if err != nil {
		t.Fatal(err)
	}
	if snap.Status != StatusDone || snap.Profile == nil || snap.Tracks[3].Status != TrackNoAudio ||
		snap.Tracks[0].Features == nil {
		t.Errorf("snapshot = %+v", snap)
	}
	if n := testutil.ToFloat64(h.m.Jobs.WithLabelValues("done")); n != 1 {
		t.Errorf("jobs done = %v", n)
	}

	// the same input again is the same mix, and its finished job isn't rerun
	again, err := h.r.Create(context.Background(), "spotify:playlist:"+pl, "rainy day")
	if err != nil || again.ID != m.ID || !again.CreatedAt.Equal(m.CreatedAt) {
		t.Fatalf("again = %+v, %v", again, err)
	}
	if total, _ := h.an.callCount(); total != 4 {
		t.Errorf("analyzer calls = %d, want 4", total)
	}
}

func TestRunnerPasted(t *testing.T) {
	h := newHarness(t, RunnerConfig{})
	ids := []string{tid("ok", 1), tid("gone", 2), tid("bad", 3), tid("nopreview", 4), tid("ok", 5)}
	m, err := h.r.Create(context.Background(), paste(ids...), "")
	if err != nil {
		t.Fatal(err)
	}
	if m.Source.Kind != KindTracks || !slices.Equal(m.TrackIDs, ids) {
		t.Fatalf("mix = %+v", m)
	}
	h.waitDone(t, m.ID)
	snap, _ := h.r.Snapshot(context.Background(), m.ID)
	want := []TrackStatus{TrackDone, TrackNotFound, TrackFailed, TrackNoAudio, TrackDone}
	for i, tr := range snap.Tracks {
		if tr.Status != want[i] {
			t.Errorf("track %d status = %s, want %s", i, tr.Status, want[i])
		}
	}
	if snap.Tracks[0].Track.Title == "" {
		t.Error("pasted track metadata wasn't resolved")
	}
	if n := testutil.ToFloat64(h.m.Jobs.WithLabelValues("partial")); n != 1 {
		t.Errorf("jobs partial = %v", n)
	}
}

func TestRunnerCacheHit(t *testing.T) {
	h := newHarness(t, RunnerConfig{})
	ids := []string{tid("a", 1), tid("a", 2)}
	ctx := context.Background()
	for _, id := range ids {
		_ = h.st.PutTracks(ctx, []Track{{ID: id, Title: id}})
		_ = h.st.PutFeatures(ctx, id, "test-1", Features{Tempo: 90})
	}
	m, err := h.r.Create(ctx, paste(ids...), "")
	if err != nil {
		t.Fatal(err)
	}
	evs := h.waitDone(t, m.ID)
	if len(evs) != 2 || evs[1].Name != EventDone {
		t.Errorf("events = %v", names(evs))
	}
	snap := evs[0].Data.(Snapshot)
	if snap.Status != StatusDone || snap.Profile == nil {
		t.Errorf("snapshot = %+v", snap)
	}
	if total, _ := h.an.callCount(); total != 0 || h.cat.trackCalls != 0 {
		t.Errorf("analyzer calls = %d, track calls = %d", total, h.cat.trackCalls)
	}
	if hits := testutil.ToFloat64(h.m.FeatureCache.WithLabelValues("hit")); hits != 2 {
		t.Errorf("cache hits = %v", hits)
	}
}

func TestRunnerDedupe(t *testing.T) {
	h := newHarness(t, RunnerConfig{AnalyzeConcurrency: 8})
	h.an.gate = make(chan struct{})
	ids := []string{tid("d", 1), tid("d", 2), tid("d", 3)}
	ctx := context.Background()
	m1, err := h.r.Create(ctx, paste(ids...), "")
	if err != nil {
		t.Fatal(err)
	}
	m2, err := h.r.Create(ctx, paste(ids...), "different vibe")
	if err != nil || m2.ID == m1.ID {
		t.Fatalf("m2 = %+v, %v", m2, err)
	}
	// let both jobs reach the analyzer or its in-flight wait, then release it
	time.Sleep(50 * time.Millisecond)
	close(h.an.gate)
	h.waitDone(t, m1.ID)
	h.waitDone(t, m2.ID)
	if total, most := h.an.callCount(); total != 3 || most != 1 {
		t.Errorf("analyzer calls = %d (max %d per track), want 3 (1)", total, most)
	}
	if hits := testutil.ToFloat64(h.m.FeatureCache.WithLabelValues("miss")); hits != 6 {
		t.Errorf("misses = %v", hits)
	}
}

func TestRunnerTimeout(t *testing.T) {
	h := newHarness(t, RunnerConfig{JobTimeout: 50 * time.Millisecond, AnalyzeConcurrency: 1})
	h.an.gate = make(chan struct{}) // never opened: every analysis times out
	m, err := h.r.Create(context.Background(), paste(tid("x", 1), tid("x", 2)), "")
	if err != nil {
		t.Fatal(err)
	}
	evs := h.waitDone(t, m.ID)
	if last := evs[len(evs)-1]; last.Name != EventError {
		t.Errorf("last event = %+v", last)
	}
	snap, _ := h.r.Snapshot(context.Background(), m.ID)
	if snap.Status != StatusFailed || snap.Tracks[0].Status != TrackFailed {
		t.Errorf("snapshot = %+v", snap)
	}
	if n := testutil.ToFloat64(h.m.Jobs.WithLabelValues("failed")); n != 1 {
		t.Errorf("jobs failed = %v", n)
	}
}

func TestRunnerRestart(t *testing.T) {
	h := newHarness(t, RunnerConfig{Retain: time.Millisecond})
	ids := []string{tid("r", 1), tid("r", 2)}
	ctx := context.Background()
	m := Mix{ID: MixID(ids, ""), Source: Source{Kind: KindTracks}, TrackIDs: ids}
	_ = h.st.PutMix(ctx, m)
	_ = h.st.PutTracks(ctx, []Track{{ID: ids[0]}})
	_ = h.st.PutFeatures(ctx, ids[0], "test-1", Features{})

	snap, err := h.r.Snapshot(ctx, m.ID)
	if err != nil {
		t.Fatal(err)
	}
	if snap.Status != StatusRunning || snap.Tracks[0].Status != TrackDone {
		t.Errorf("snapshot = %+v", snap)
	}
	h.waitDone(t, m.ID)
	if total, _ := h.an.callCount(); total != 1 {
		t.Errorf("analyzer calls = %d, want 1", total)
	}
	// once evicted, a complete mix is served from the store without a job
	time.Sleep(20 * time.Millisecond)
	snap, err = h.r.Snapshot(ctx, m.ID)
	if err != nil || snap.Status != StatusDone {
		t.Errorf("snapshot = %+v, %v", snap, err)
	}
	if _, err := h.r.Snapshot(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Errorf("err = %v", err)
	}
}

func TestRunnerCreateErrors(t *testing.T) {
	h := newHarness(t, RunnerConfig{MaxQueue: 2, MaxPasteTracks: 3})
	h.an.gate = make(chan struct{})
	defer close(h.an.gate)
	ctx := context.Background()
	var ie *InputError
	if _, err := h.r.Create(ctx, "hello", ""); !errors.As(err, &ie) {
		t.Errorf("junk: err = %v", err)
	}
	if _, err := h.r.Create(ctx, paste(tid("v", 1)), strings.Repeat("x", 201)); !errors.As(err, &ie) {
		t.Errorf("long vibe: err = %v", err)
	}
	if _, err := h.r.Create(ctx, "spotify:playlist:"+tid("missing", 1), ""); !errors.Is(err, ErrNotFound) {
		t.Errorf("missing: err = %v", err)
	}
	h.cat.playlists[tid("empty", 1)] = nil
	if _, err := h.r.Create(ctx, "spotify:album:"+tid("empty", 1), ""); !errors.As(err, &ie) {
		t.Errorf("empty: err = %v", err)
	}
	h.cat.err = errors.New("connection reset")
	if _, err := h.r.Create(ctx, "spotify:playlist:"+tid("x", 1), ""); !errors.Is(err, ErrUpstream) {
		t.Errorf("upstream: err = %v", err)
	}
	if _, err := h.r.Create(ctx, paste(tid("q", 1), tid("q", 2)), ""); err != nil {
		t.Fatal(err)
	}
	if _, err := h.r.Create(ctx, paste(tid("q", 3)), ""); !errors.Is(err, ErrBusy) {
		t.Errorf("busy: err = %v", err)
	}
}

func TestRunnerShutdown(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	an := &fakeAnalyzer{gate: make(chan struct{})}
	r := NewRunner(ctx, &fakeCatalog{}, an, newMemStore(), nil, RunnerConfig{})
	m, err := r.Create(context.Background(), paste(tid("z", 1), tid("z", 2)), "")
	if err != nil {
		t.Fatal(err)
	}
	ch, unsubscribe, _ := r.Subscribe(context.Background(), m.ID)
	defer unsubscribe()
	cancel()
	r.Wait()
	if got := names(drain(t, ch)); len(got) != 1 || got[EventSnapshot] != 1 {
		t.Errorf("events after shutdown = %v, want only the snapshot", got)
	}
}

func TestRunnerSlowSubscriber(t *testing.T) {
	h := newHarness(t, RunnerConfig{AnalyzeConcurrency: 8})
	var ids []string
	for i := range subBuffer {
		ids = append(ids, tid("s", i))
	}
	m, err := h.r.Create(context.Background(), paste(ids...), "")
	if err != nil {
		t.Fatal(err)
	}
	slow, cancelSlow, _ := h.r.Subscribe(context.Background(), m.ID)
	defer cancelSlow()
	h.waitDone(t, m.ID) // the job finishes although slow never reads

	evs := drain(t, slow)
	if len(evs) > subBuffer || names(evs)[EventDone] != 0 {
		t.Errorf("slow subscriber got %d events %v; want it dropped before done", len(evs), names(evs))
	}
}
