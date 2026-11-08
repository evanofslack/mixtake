package server

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/evanofslack/mixtake/internal/analyzer"
	"github.com/evanofslack/mixtake/internal/mix"
	"github.com/evanofslack/mixtake/internal/store"
)

// Playlist ids that make testCatalog fail in a particular way.
const (
	plOK       = "37i9dQZF1DXcBWIGoYBM5M"
	plMissing  = "0000000000000000000000"
	plPrivate  = "1111111111111111111111"
	plUpstream = "2222222222222222222222"
)

type testCatalog struct{}

func (testCatalog) Playlist(_ context.Context, id string) (mix.Source, []mix.Track, error) {
	switch id {
	case plMissing:
		return mix.Source{}, nil, mix.ErrNotFound
	case plPrivate:
		return mix.Source{}, nil, mix.ErrPrivate
	case plUpstream:
		return mix.Source{}, nil, errors.New("connection reset")
	}
	return mix.Source{Name: "Hits"}, []mix.Track{
		{ID: "3zOYmiNOuyDL0ClxJcEJ0T", Title: "A", Artists: []mix.Artist{{Name: "X"}}, PreviewURL: "p"},
		{ID: "7bxaFZ1O3cHkgLKMsdC3xR", Title: "B", Artists: []mix.Artist{{Name: "Y"}}, PreviewURL: "p"},
	}, nil
}

func (c testCatalog) Album(ctx context.Context, id string) (mix.Source, []mix.Track, error) {
	return c.Playlist(ctx, id)
}

func (testCatalog) Track(_ context.Context, id string) (mix.Track, error) {
	return mix.Track{ID: id, Title: "T " + id, Artists: []mix.Artist{{Name: "Z"}}, PreviewURL: "p"}, nil
}

func (testCatalog) Preview(context.Context, string) (io.ReadCloser, error) {
	return io.NopCloser(strings.NewReader("mp3")), nil
}

func newMixServer(t *testing.T, delay time.Duration, limits Limits, cfg mix.RunnerConfig) *Server {
	t.Helper()
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	runner := mix.NewRunner(ctx, testCatalog{}, analyzer.Fake{Delay: delay}, st, nil, cfg)
	t.Cleanup(func() {
		cancel()
		runner.Wait()
		st.Close()
	})
	return New(Deps{Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Runner: runner, Limits: limits})
}

func post(h http.Handler, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/mixes", strings.NewReader(body))
	req.RemoteAddr = "192.0.2.1:1234"
	h.ServeHTTP(rec, req)
	return rec
}

func TestCreateMixErrors(t *testing.T) {
	h := newMixServer(t, 0, Limits{}, mix.RunnerConfig{MaxPasteTracks: 1}).Handler()
	tests := []struct {
		name, body string
		code       int
		msg        string
	}{
		{"not json", "input=x", 400, "must be JSON"},
		{"junk", `{"input":"hello"}`, 400, "Paste a Spotify playlist"},
		{"artist", `{"input":"https://open.spotify.com/artist/` + plOK + `"}`, 400, "Artist links"},
		{"too many", `{"input":"spotify:track:` + plOK + ` spotify:track:` + plMissing + `"}`, 400, "most a mix can have is 1"},
		{"missing", `{"input":"spotify:playlist:` + plMissing + `"}`, 404, "couldn't find"},
		{"private", `{"input":"spotify:playlist:` + plPrivate + `"}`, 403, "private"},
		{"upstream", `{"input":"spotify:playlist:` + plUpstream + `"}`, 502, "Try again"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := post(h, tt.body)
			var body errorBody
			_ = json.Unmarshal(rec.Body.Bytes(), &body)
			if rec.Code != tt.code || !strings.Contains(body.Error, tt.msg) {
				t.Errorf("got %d %s, want %d containing %q", rec.Code, rec.Body, tt.code, tt.msg)
			}
		})
	}
}

func TestCreateMixLimits(t *testing.T) {
	h := newMixServer(t, time.Hour, Limits{RateLimit: 2, GlobalRateLimit: 10},
		mix.RunnerConfig{MaxQueue: 2}).Handler()
	if rec := post(h, `{"input":"spotify:playlist:`+plOK+`"}`); rec.Code != http.StatusCreated {
		t.Fatalf("first: %d %s", rec.Code, rec.Body)
	}
	// the slow analyzer keeps both tracks queued
	rec := post(h, `{"input":"spotify:track:`+plOK+`"}`)
	if rec.Code != http.StatusServiceUnavailable || rec.Header().Get("Retry-After") == "" {
		t.Errorf("busy: %d %s", rec.Code, rec.Body)
	}
	rec = post(h, `{"input":"spotify:track:`+plOK+`"}`)
	if rec.Code != http.StatusTooManyRequests || rec.Header().Get("Retry-After") == "" {
		t.Errorf("limited: %d %s", rec.Code, rec.Body)
	}
}

func TestMixLifecycle(t *testing.T) {
	s := newMixServer(t, 20*time.Millisecond, Limits{}, mix.RunnerConfig{})
	s.ping = 10 * time.Millisecond
	srv := httptest.NewServer(s.Handler())
	defer srv.Close()

	resp, err := http.Post(srv.URL+"/api/mixes", "application/json",
		strings.NewReader(`{"input":"https://open.spotify.com/playlist/`+plOK+`?si=abc","vibe":"rain"}`))
	if err != nil {
		t.Fatal(err)
	}
	var created createResponse
	_ = json.NewDecoder(resp.Body).Decode(&created)
	resp.Body.Close()
	if resp.StatusCode != http.StatusCreated || len(created.ID) != 12 {
		t.Fatalf("create: %d %+v", resp.StatusCode, created)
	}

	resp, err = http.Get(srv.URL + "/api/mixes/" + created.ID + "/events")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("content type %q", ct)
	}
	var names []string
	pings := 0
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(nil, 1<<20)
	for sc.Scan() {
		line := sc.Text()
		switch {
		case line == ": ping":
			pings++
		case strings.HasPrefix(line, "event: "):
			names = append(names, strings.TrimPrefix(line, "event: "))
		case strings.HasPrefix(line, "data: "):
			if !json.Valid([]byte(strings.TrimPrefix(line, "data: "))) {
				t.Errorf("bad data line %q", line)
			}
		}
	}
	if len(names) < 3 || names[0] != mix.EventSnapshot || names[len(names)-1] != mix.EventDone {
		t.Errorf("events = %v", names)
	}
	if pings == 0 {
		t.Error("no heartbeat")
	}

	resp, err = http.Get(srv.URL + "/api/mixes/" + created.ID)
	if err != nil {
		t.Fatal(err)
	}
	var snap mix.Snapshot
	_ = json.NewDecoder(resp.Body).Decode(&snap)
	resp.Body.Close()
	if snap.Status != mix.StatusDone || len(snap.Tracks) != 2 || snap.Profile == nil || snap.Mix.Vibe != "rain" {
		t.Errorf("snapshot = %+v", snap)
	}
}

func TestMixNotFound(t *testing.T) {
	h := newMixServer(t, 0, Limits{}, mix.RunnerConfig{}).Handler()
	for _, target := range []string{"/api/mixes/nope", "/api/mixes/nope/events"} {
		if rec := do(h, "GET", target); rec.Code != http.StatusNotFound {
			t.Errorf("%s = %d %s", target, rec.Code, rec.Body)
		}
	}
}
