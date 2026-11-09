package analogdb

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus/testutil"

	"github.com/evanofslack/mixtake/internal/metrics"
	"github.com/evanofslack/mixtake/internal/mix"
)

// newServer serves the testdata fixtures like analogdb does, and counts keyword lookups.
func newServer(t *testing.T, keywordCalls *atomic.Int32) *httptest.Server {
	t.Helper()
	fixture := func(name string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			b, err := os.ReadFile("testdata/" + name)
			if err != nil {
				t.Error(err)
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write(b)
		}
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/search", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if q.Get("nsfw") != "false" || q.Get("sprocket") != "false" || q.Get("page_size") != "50" {
			t.Errorf("search query %s", r.URL.RawQuery)
		}
		if q.Get("q") == "boom" {
			http.Error(w, "oops", http.StatusInternalServerError)
			return
		}
		fixture("search.json")(w, r)
	})
	mux.HandleFunc("GET /v1/post/34825/similar", fixture("similar.json"))
	mux.HandleFunc("GET /v1/post/1/similar", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"post 1 has no similarity embedding"}`, http.StatusNotFound)
	})
	mux.HandleFunc("GET /v1/keyword/{word}", func(w http.ResponseWriter, r *http.Request) {
		keywordCalls.Add(1)
		switch r.PathValue("word") {
		case "beach":
			fixture("keyword.json")(w, r)
		case "boom":
			http.Error(w, "oops", http.StatusBadGateway)
		default:
			http.Error(w, `{"error":"keyword not found"}`, http.StatusNotFound)
		}
	})
	mux.HandleFunc("GET /img/{name}", func(w http.ResponseWriter, r *http.Request) {
		switch r.PathValue("name") {
		case "ok.jpeg":
			w.Header().Set("Content-Type", "image/jpeg")
			w.Write([]byte("jpeg bytes"))
		case "html.jpeg":
			w.Header().Set("Content-Type", "text/html")
			w.Write([]byte("<html>"))
		default:
			http.Error(w, "<Error>AccessDenied</Error>", http.StatusForbidden)
		}
	})
	mux.HandleFunc("GET /v1/posts", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if q.Get("color") != "navy" || q.Get("sort") != "random" || q.Get("seed") != "7" ||
			q.Get("grayscale") != "false" || q.Get("nsfw") != "false" || q.Get("ratio_min") == "" {
			t.Errorf("posts query %s", r.URL.RawQuery)
		}
		if q.Get("keyword") == "boom" {
			http.Error(w, `{"error":"invalid"}`, http.StatusBadRequest)
			return
		}
		fixture("search.json")(w, r)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

// newClient returns a client for srv that retries without waiting long.
func newClient(srv *httptest.Server, m *metrics.Metrics) *Client {
	c := New(srv.URL, srv.URL+"/img", srv.Client(), m)
	c.retryBase = time.Millisecond
	return c
}

func TestSearch(t *testing.T) {
	srv := newServer(t, new(atomic.Int32))
	m := metrics.New()
	c := newClient(srv, m)
	ctx := context.Background()

	got, err := c.Search(ctx, mix.PhotoQuery{Text: "rain on window at night"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 {
		t.Fatalf("got %d photos", len(got))
	}
	p := got[0]
	if p.ID != 34825 || p.Author != "dihoidao" || !strings.Contains(p.Caption, "rainy city street") ||
		len(p.Images) != 4 || p.Images[2].Resolution != "high" || p.Images[2].Height != 1440 ||
		len(p.Colors) != 3 || p.Colors[0].Hex != "#1d1819" || p.Colors[0].Percent < 0.4 ||
		len(p.Keywords) != 4 || p.Keywords[0] != "city" {
		t.Errorf("photo = %+v", p)
	}

	if _, err := c.Search(ctx, mix.PhotoQuery{Text: "boom"}); !errors.Is(err, mix.ErrUpstream) {
		t.Errorf("upstream: err = %v", err)
	}
	if n := testutil.ToFloat64(m.AnalogdbRequests.WithLabelValues("ok")); n != 1 {
		t.Errorf("ok requests = %v", n)
	}
	if n := testutil.ToFloat64(m.AnalogdbRequests.WithLabelValues("error")); n != 1 {
		t.Errorf("error requests = %v", n)
	}
}

func TestSimilar(t *testing.T) {
	c := newClient(newServer(t, new(atomic.Int32)), nil)
	tests := []struct {
		id   int
		n    int
		want error
	}{
		{34825, 3, nil},
		{1, 0, mix.ErrNotFound},
		{2, 0, mix.ErrNotFound},
	}
	for _, tt := range tests {
		got, err := c.Similar(context.Background(), tt.id)
		if len(got) != tt.n || !errors.Is(err, tt.want) {
			t.Errorf("Similar(%d) = %d photos, %v; want %d, %v", tt.id, len(got), err, tt.n, tt.want)
		}
	}
}

func TestKeywordCount(t *testing.T) {
	var calls atomic.Int32
	c := newClient(newServer(t, &calls), nil)
	tests := []struct {
		word  string
		count int
		err   error
		calls int32
	}{
		{"beach", 2002, nil, 1},
		{"Beach", 2002, nil, 1}, // cached, case-insensitive
		{"zzqqxx", 0, nil, 2},
		{"zzqqxx", 0, nil, 2},
		{"boom", 0, mix.ErrUpstream, 5}, // retried
		{"boom", 0, mix.ErrUpstream, 8}, // failures aren't cached
	}
	for _, tt := range tests {
		n, err := c.KeywordCount(context.Background(), tt.word)
		if n != tt.count || !errors.Is(err, tt.err) || calls.Load() != tt.calls {
			t.Errorf("KeywordCount(%q) = %d, %v after %d calls; want %d, %v, %d", tt.word, n, err,
				calls.Load(), tt.count, tt.err, tt.calls)
		}
	}
}

func TestByColor(t *testing.T) {
	c := newClient(newServer(t, new(atomic.Int32)), nil)
	got, err := c.ByColor(context.Background(), mix.ColorQuery{Color: "navy", Keyword: "Fog", Seed: 7})
	if err != nil || len(got) != 3 || got[0].ID != 34825 {
		t.Errorf("got %d photos, %v", len(got), err)
	}
	_, err = c.ByColor(context.Background(), mix.ColorQuery{Color: "navy", Keyword: "boom", Seed: 7})
	if !errors.Is(err, mix.ErrUpstream) {
		t.Errorf("bad request: err = %v", err)
	}
}

// TestRetry serves each path's statuses in turn, then 200s.
func TestRetry(t *testing.T) {
	type step struct {
		status     int
		retryAfter string
	}
	tests := []struct {
		name  string
		steps []step
		err   error
		calls int32
	}{
		{"ok", nil, nil, 1},
		{"429 then ok", []step{{429, ""}}, nil, 2},
		{"429 with retry-after", []step{{429, "0"}, {429, "1"}}, nil, 3},
		{"503 twice then ok", []step{{503, ""}, {502, ""}}, nil, 3},
		{"gives up after three", []step{{500, ""}, {500, ""}, {500, ""}}, mix.ErrUpstream, 3},
		{"retry-after too long", []step{{429, "60"}}, mix.ErrUpstream, 1},
		{"400 isn't retried", []step{{400, ""}}, mix.ErrUpstream, 1},
		{"404 isn't retried", []step{{404, ""}}, mix.ErrNotFound, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var calls atomic.Int32
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				n := int(calls.Add(1))
				if n <= len(tt.steps) {
					if s := tt.steps[n-1]; s.retryAfter != "" {
						w.Header().Set("Retry-After", s.retryAfter)
					}
					http.Error(w, `{"error":"Too many requests"}`, tt.steps[n-1].status)
					return
				}
				w.Write([]byte(`{"posts":[{"id":1}]}`))
			}))
			defer srv.Close()
			start := time.Now()
			_, err := newClient(srv, nil).Search(context.Background(), mix.PhotoQuery{Text: "x"})
			if !errors.Is(err, tt.err) || calls.Load() != tt.calls {
				t.Errorf("err = %v after %d calls, want %v after %d", err, calls.Load(), tt.err, tt.calls)
			}
			if wait := time.Since(start); tt.name == "429 with retry-after" && wait < time.Second {
				t.Errorf("waited %s, want Retry-After's 1s", wait)
			}
		})
	}
}

func TestPageCache(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Query().Get("q") == "fail" {
			http.Error(w, "nope", http.StatusBadRequest)
			return
		}
		w.Write([]byte(`{"posts":[{"id":1},{"id":2}]}`))
	}))
	defer srv.Close()
	c := newClient(srv, nil)
	ctx := context.Background()
	tests := []struct {
		q     mix.PhotoQuery
		calls int32
	}{
		{mix.PhotoQuery{Text: "Rain on a window"}, 1},
		{mix.PhotoQuery{Text: "  rain on  a WINDOW "}, 1}, // normalised
		{mix.PhotoQuery{Text: "rain on a window", PageSize: 20}, 2},
		{mix.PhotoQuery{Text: "fog"}, 3},
		{mix.PhotoQuery{Text: "fail"}, 4},
		{mix.PhotoQuery{Text: "fail"}, 5}, // failures aren't cached
	}
	for _, tt := range tests {
		ps, err := c.Search(ctx, tt.q)
		if calls.Load() != tt.calls || (err == nil && len(ps) != 2) {
			t.Errorf("Search(%q) = %d photos, %v after %d calls, want %d calls", tt.q.Text, len(ps), err,
				calls.Load(), tt.calls)
		}
		if err == nil {
			ps[0].ID = 99 // callers can't change the cache
		}
	}
	if ps, _ := c.Search(ctx, mix.PhotoQuery{Text: "fog"}); ps[0].ID != 1 {
		t.Errorf("cache was modified: %d", ps[0].ID)
	}
}

func TestImage(t *testing.T) {
	srv := newServer(t, new(atomic.Int32))
	c := New(srv.URL, srv.URL+"/img", nil, nil)
	tests := []struct {
		name, body, ct string
		err            error
	}{
		{"ok.jpeg", "jpeg bytes", "image/jpeg", nil},
		{"missing.jpeg", "", "", mix.ErrNotFound},
		{"html.jpeg", "", "", mix.ErrUpstream},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rc, ct, err := c.Image(context.Background(), tt.name)
			if !errors.Is(err, tt.err) {
				t.Fatalf("err = %v, want %v", err, tt.err)
			}
			if err != nil {
				return
			}
			defer rc.Close()
			b, _ := io.ReadAll(rc)
			if string(b) != tt.body || ct != tt.ct {
				t.Errorf("got %q %q", b, ct)
			}
		})
	}
}
