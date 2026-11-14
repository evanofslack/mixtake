package server

import (
	"bytes"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func newTestServer(static fstest.MapFS) *Server {
	deps := Deps{Log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	if static != nil {
		deps.Static = static
	}
	return New(deps)
}

func do(h http.Handler, method, target string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, target, nil))
	return rec
}

func TestHealth(t *testing.T) {
	rec := do(newTestServer(nil).Handler(), "GET", "/api/health")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"ok"`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
	if rec.Header().Get("X-Request-ID") == "" {
		t.Error("missing request id header")
	}
}

func TestAPINotFoundIsJSON(t *testing.T) {
	rec := do(newTestServer(nil).Handler(), "GET", "/api/nope")
	if rec.Code != http.StatusNotFound || !strings.Contains(rec.Body.String(), `"error"`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
}

func TestStatic(t *testing.T) {
	static := fstest.MapFS{
		"index.html":            {Data: []byte("home")},
		"mix.html":              {Data: []byte("mix page")},
		"404.html":              {Data: []byte("missing")},
		"_next/static/chunk.js": {Data: []byte("js")},
		"images/cover.webp":     {Data: []byte("img")},
	}
	h := newTestServer(static).Handler()
	tests := []struct {
		target, body, cache string
		code                int
	}{
		{"/", "home", "no-cache", 200},
		{"/mix?id=abc", "mix page", "no-cache", 200},
		{"/_next/static/chunk.js", "js", "public, max-age=31536000, immutable", 200},
		{"/images/cover.webp", "img", "no-cache", 200},
		{"/nope", "missing", "no-cache", 404},
		{"/etc/passwd", "missing", "no-cache", 404},
	}
	for _, tt := range tests {
		t.Run(tt.target, func(t *testing.T) {
			rec := do(h, "GET", tt.target)
			if rec.Code != tt.code || !bytes.Equal(rec.Body.Bytes(), []byte(tt.body)) {
				t.Errorf("got %d %q, want %d %q", rec.Code, rec.Body, tt.code, tt.body)
			}
			if got := rec.Header().Get("Cache-Control"); got != tt.cache {
				t.Errorf("Cache-Control = %q, want %q", got, tt.cache)
			}
		})
	}
	if rec := do(h, "GET", "/about"); rec.Code != http.StatusMovedPermanently ||
		rec.Header().Get("Location") != "/#how" {
		t.Errorf("GET /about = %d %q, want a redirect to /#how", rec.Code, rec.Header().Get("Location"))
	}
	if rec := do(h, "POST", "/"); rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST / = %d", rec.Code)
	}
}

func TestStaticMissing(t *testing.T) {
	rec := do(newTestServer(nil).Handler(), "GET", "/")
	if rec.Code != http.StatusNotFound || !strings.Contains(rec.Body.String(), "just web") {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
}

func TestRecoverer(t *testing.T) {
	s := newTestServer(nil)
	s.mux.HandleFunc("GET /api/boom", func(http.ResponseWriter, *http.Request) { panic("boom") })
	rec := do(s.Handler(), "GET", "/api/boom")
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("got %d", rec.Code)
	}
}
