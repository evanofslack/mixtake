package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/evanofslack/mixtake/internal/mix"
)

// testPhotos serves testdata/photos.json for every search and similar request, and fake images.
// With fail set, every call is an upstream failure.
type testPhotos struct{ fail bool }

func (p *testPhotos) load() ([]mix.Photo, error) {
	if p.fail {
		return nil, mix.ErrUpstream
	}
	b, err := os.ReadFile("testdata/photos.json")
	if err != nil {
		return nil, err
	}
	var ps []mix.Photo
	return ps, json.Unmarshal(b, &ps)
}

func (p *testPhotos) Search(context.Context, mix.PhotoQuery) ([]mix.Photo, error) { return p.load() }

func (p *testPhotos) ByColor(context.Context, mix.ColorQuery) ([]mix.Photo, error) { return p.load() }

func (p *testPhotos) Similar(_ context.Context, id int) ([]mix.Photo, error) {
	if id == 404 {
		return nil, mix.ErrNotFound
	}
	return p.load()
}

func (p *testPhotos) Image(_ context.Context, name string) (io.ReadCloser, string, error) {
	switch {
	case p.fail:
		return nil, "", mix.ErrUpstream
	case strings.HasPrefix(name, "00000000"):
		return nil, "", mix.ErrNotFound
	}
	return io.NopCloser(strings.NewReader("jpeg " + name)), "image/jpeg", nil
}

func (p *testPhotos) KeywordCount(context.Context, string) (int, error) { return 0, nil }

// pasteTracks is n pasted track links.
func pasteTracks(n int) string {
	var b strings.Builder
	for i := range n {
		id := strings.Repeat("a", 20) + string(rune('A'+i/26)) + string(rune('a'+i%26))
		b.WriteString("spotify:track:" + id + " ")
	}
	return b.String()
}

func createAndWait(t *testing.T, s *Server, input string, wait bool) string {
	t.Helper()
	body, _ := json.Marshal(createRequest{Input: input})
	rec := post(s.Handler(), string(body))
	var created createResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil || rec.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", rec.Code, rec.Body)
	}
	for deadline := time.Now().Add(5 * time.Second); wait; {
		snap, err := s.deps.Runner.Snapshot(context.Background(), created.ID)
		if err != nil || snap.Status == mix.StatusDone {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("job didn't finish")
		}
		time.Sleep(5 * time.Millisecond)
	}
	return created.ID
}

func TestMixPhotos(t *testing.T) {
	s := newMixServer(t, 0, Limits{}, mix.RunnerConfig{})
	ready := createAndWait(t, s, pasteTracks(12), true)
	slow := newMixServer(t, time.Hour, Limits{}, mix.RunnerConfig{})
	running := createAndWait(t, slow, pasteTracks(12), false)
	broken := newServerWith(t, 0, Limits{}, mix.RunnerConfig{}, &testPhotos{fail: true})
	brokenID := createAndWait(t, broken, pasteTracks(12), true)

	tests := []struct {
		name   string
		s      *Server
		target string
		code   int
		msg    string
	}{
		{"unknown mix", s, "/api/mixes/nope/photos", 404, "not found"},
		{"too few analysed", slow, "/api/mixes/" + running + "/photos", 409, "Not enough songs analysed yet."},
		{"long vibe", s, "/api/mixes/" + ready + "/photos?vibe=" + strings.Repeat("x", 201), 400, "vibe"},
		{"upstream", broken, "/api/mixes/" + brokenID + "/photos", 502, "analogdb"},
		{"ok", s, "/api/mixes/" + ready + "/photos", 200, ""},
		{"vibe", s, "/api/mixes/" + ready + "/photos?vibe=rain+on+a+tin+roof", 200, ""},
		{"seed", s, "/api/mixes/" + ready + "/photos?seed=3", 200, ""},
		{"bad seed", s, "/api/mixes/" + ready + "/photos?seed=-1", 400, "seed"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(tt.s.Handler(), "GET", tt.target)
			if rec.Code != tt.code {
				t.Fatalf("got %d %s", rec.Code, rec.Body)
			}
			if tt.code != 200 {
				var body errorBody
				if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || !strings.Contains(body.Error, tt.msg) {
					t.Errorf("body %s, want error containing %q", rec.Body, tt.msg)
				}
				return
			}
			var set mix.PhotoSet
			if err := json.Unmarshal(rec.Body.Bytes(), &set); err != nil {
				t.Fatal(err)
			}
			// every fixture photo is usable, though the grayscale one only for sad, calm mixes
			if len(set.Photos) < 2 || len(set.Queries) == 0 || len(set.Palette) != 3 {
				t.Errorf("set = %+v", set)
			}
			if strings.Contains(tt.target, "vibe=") && set.Queries[0] != "rain on a tin roof" {
				t.Errorf("queries = %q", set.Queries)
			}
			for _, p := range set.Photos {
				if p.Author == "" || p.Permalink == "" {
					t.Errorf("photo %d lacks credit", p.ID)
				}
				for _, img := range p.Images {
					if !strings.HasPrefix(img.URL, "/api/img/") {
						t.Errorf("image url %q isn't proxied", img.URL)
					}
				}
			}
			if strings.Contains(rec.Body.String(), "i.analogdb.com") || strings.Contains(rec.Body.String(), "nsfw") {
				t.Errorf("body leaks upstream fields: %s", rec.Body)
			}
		})
	}
}

func TestSimilarPhotos(t *testing.T) {
	ok := newMixServer(t, 0, Limits{}, mix.RunnerConfig{}).Handler()
	broken := newServerWith(t, 0, Limits{}, mix.RunnerConfig{}, &testPhotos{fail: true}).Handler()
	tests := []struct {
		name   string
		h      http.Handler
		target string
		code   int
	}{
		{"ok", ok, "/api/photos/34825/similar", 200},
		{"unknown", ok, "/api/photos/404/similar", 404},
		{"not a number", ok, "/api/photos/abc/similar", 404},
		{"upstream", broken, "/api/photos/1/similar", 502},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(tt.h, "GET", tt.target)
			if rec.Code != tt.code {
				t.Fatalf("got %d %s", rec.Code, rec.Body)
			}
			if tt.code != 200 {
				return
			}
			var set mix.PhotoSet
			_ = json.Unmarshal(rec.Body.Bytes(), &set)
			// the source photo is left out of its own similar set
			if len(set.Photos) != 2 || set.Photos[0].ID == 34825 || !strings.Contains(rec.Body.String(), `"queries":[]`) ||
				!strings.Contains(rec.Body.String(), `"palette":[]`) {
				t.Errorf("body = %s", rec.Body)
			}
		})
	}
}

func TestImage(t *testing.T) {
	ok := newMixServer(t, 0, Limits{}, mix.RunnerConfig{}).Handler()
	broken := newServerWith(t, 0, Limits{}, mix.RunnerConfig{}, &testPhotos{fail: true}).Handler()
	tests := []struct {
		name string
		h    http.Handler
		file string
		code int
	}{
		{"uuid", ok, "9e2be093-8564-4543-998e-0840cbd941b2.jpeg", 200},
		{"png", ok, "9e2be093-8564-4543-998e-0840cbd941b2.png", 200},
		{"older name", ok, "24aec317a2de79c1fea6c80d-high.jpeg", 200},
		{"upper case", ok, "9E2BE093-8564-4543-998E-0840CBD941B2.jpeg", 404},
		{"gif", ok, "9e2be093-8564-4543-998e-0840cbd941b2.gif", 404},
		{"traversal", ok, "..%2f..%2fetc%2fpasswd", 404},
		{"query", ok, "9e2be093-8564-4543-998e-0840cbd941b2.jpeg%3Fx=1", 404},
		{"missing upstream", ok, "00000000-0000-0000-0000-000000000000.jpeg", 404},
		{"upstream", broken, "9e2be093-8564-4543-998e-0840cbd941b2.jpeg", 502},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(tt.h, "GET", "/api/img/"+tt.file)
			if rec.Code != tt.code {
				t.Fatalf("got %d %s", rec.Code, rec.Body)
			}
			if tt.code != 200 {
				if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
					t.Errorf("error content type %q", ct)
				}
				return
			}
			h := rec.Header()
			if h.Get("Content-Type") != "image/jpeg" || h.Get("Cache-Control") != "public, max-age=31536000, immutable" ||
				rec.Body.String() != "jpeg "+tt.file {
				t.Errorf("headers %v body %q", h, rec.Body)
			}
		})
	}
}
