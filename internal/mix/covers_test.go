package mix

import (
	"context"
	"errors"
	"io"
	"slices"
	"strings"
	"sync"
	"testing"
)

// fakePhotos answers every search with the same photos, except queries containing "boom", which
// fail. Keywords in keywords exist.
type fakePhotos struct {
	photos   []Photo
	keywords map[string]int
	failAll  bool

	mu       sync.Mutex
	searches []string
}

func (f *fakePhotos) Search(_ context.Context, q PhotoQuery) ([]Photo, error) {
	f.mu.Lock()
	f.searches = append(f.searches, q.Text)
	f.mu.Unlock()
	if f.failAll || strings.Contains(q.Text, "boom") {
		return nil, ErrUpstream
	}
	return slices.Clone(f.photos), nil
}

func (f *fakePhotos) Similar(_ context.Context, id int) ([]Photo, error) {
	if id == 404 {
		return nil, ErrNotFound
	}
	return append([]Photo{photo(id, 1440, 1080)}, f.photos...), nil
}

func (f *fakePhotos) Image(_ context.Context, name string) (io.ReadCloser, string, error) {
	return io.NopCloser(strings.NewReader(name)), "image/jpeg", nil
}

func (f *fakePhotos) KeywordCount(_ context.Context, word string) (int, error) {
	return f.keywords[word], nil
}

func (f *fakePhotos) searchCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.searches)
}

func coverSnapshot(done int, status Status) Snapshot {
	p := Profile{Coverage: Coverage{Total: 20, Done: done}, Quadrant: QuadrantSadCalm,
		Averages: Averages{Mood: 0.2, Energy: 0.2}}
	s := Snapshot{Mix: Mix{ID: "mix1", Source: Source{Name: "Peaceful Piano"}}, Status: status}
	if done > 0 {
		s.Profile = &p
	}
	return s
}

func TestCoversForMix(t *testing.T) {
	var ps []Photo
	for i := range 20 {
		ps = append(ps, photo(i+1, 1440, 1080, "#2a4d7a"))
	}
	ph := &fakePhotos{photos: ps, keywords: map[string]int{"piano": 300, "peaceful": 5}}
	c := NewCovers(ph, 0)
	ctx := context.Background()

	tests := []struct {
		name   string
		snap   Snapshot
		vibe   string
		err    error
		search int // searches made so far
	}{
		{"nothing analysed", coverSnapshot(0, StatusRunning), "", ErrTooFew, 0},
		{"too few while running", coverSnapshot(9, StatusRunning), "", ErrTooFew, 0},
		{"short album finished", coverSnapshot(5, StatusDone), "", nil, 3},
		{"ten analysed", coverSnapshot(10, StatusRunning), "", nil, 6},
		{"cached within ten tracks", coverSnapshot(19, StatusRunning), "", nil, 6},
		{"vibe override", coverSnapshot(19, StatusRunning), "rain on a tin roof", nil, 9},
		{"more coverage", coverSnapshot(20, StatusDone), "", nil, 12},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			set, err := c.ForMix(ctx, tt.snap, tt.vibe)
			if !errors.Is(err, tt.err) || ph.searchCount() != tt.search {
				t.Fatalf("err = %v after %d searches, want %v after %d", err, ph.searchCount(), tt.err, tt.search)
			}
			if err != nil {
				return
			}
			if len(set.Photos) != CoverCount || len(set.Palette) != 3 || len(set.Queries) != 3 {
				t.Errorf("set has %d photos, palette %v, queries %q", len(set.Photos), set.Palette, set.Queries)
			}
			if !slices.Contains(set.Queries, "piano") || slices.Contains(set.Queries, "peaceful") {
				t.Errorf("queries %q should include piano only from the name", set.Queries)
			}
			if tt.vibe != "" && set.Queries[0] != tt.vibe {
				t.Errorf("queries %q should start with the vibe", set.Queries)
			}
			for _, p := range set.Photos {
				for _, img := range p.Images {
					if !strings.HasPrefix(img.URL, "/api/img/") || !ValidImageName(strings.TrimPrefix(img.URL, "/api/img/")) {
						t.Errorf("image url %q", img.URL)
					}
				}
			}
		})
	}
	// the original photos are untouched by the proxy rewrite
	if !strings.HasPrefix(ph.photos[0].Images[0].URL, "https://i.analogdb.com/") {
		t.Errorf("fake photos were modified: %s", ph.photos[0].Images[0].URL)
	}
}

func TestCoversUpstream(t *testing.T) {
	var ps []Photo
	for i := range 5 {
		ps = append(ps, photo(i+1, 1440, 1080))
	}
	snap := coverSnapshot(10, StatusRunning)

	// one failed search still gives covers
	set, err := NewCovers(&fakePhotos{photos: ps}, 0).ForMix(context.Background(), snap, "boom")
	if err != nil || len(set.Photos) != 5 {
		t.Errorf("partial failure: %d photos, %v", len(set.Photos), err)
	}
	if _, err := NewCovers(&fakePhotos{failAll: true}, 0).ForMix(context.Background(), snap, ""); !errors.Is(err, ErrUpstream) {
		t.Errorf("all failed: err = %v", err)
	}
}

func TestCoversSimilar(t *testing.T) {
	small := photo(3, 800, 600)
	c := NewCovers(&fakePhotos{photos: []Photo{photo(2, 1440, 1080), small, photo(4, 1080, 1440)}}, 0)
	set, err := c.Similar(context.Background(), 1)
	if err != nil {
		t.Fatal(err)
	}
	var got []int
	for _, p := range set.Photos {
		got = append(got, p.ID)
	}
	if !slices.Equal(got, []int{2, 4}) || set.Queries == nil || set.Palette == nil {
		t.Errorf("similar = %+v", set)
	}
	if _, err := c.Similar(context.Background(), 404); !errors.Is(err, ErrNotFound) {
		t.Errorf("err = %v", err)
	}
}

func TestCoversImage(t *testing.T) {
	c := NewCovers(&fakePhotos{}, 0)
	if _, _, err := c.Image(context.Background(), "../secret"); !errors.Is(err, ErrNotFound) {
		t.Errorf("err = %v", err)
	}
	rc, ct, err := c.Image(context.Background(), "24aec317a2de79c1fea6c80d-high.jpeg")
	if err != nil || ct != "image/jpeg" {
		t.Fatalf("got %q, %v", ct, err)
	}
	rc.Close()
}

func TestCoverVibe(t *testing.T) {
	if v, err := CoverVibe("  rain   at night "); v != "rain at night" || err != nil {
		t.Errorf("got %q, %v", v, err)
	}
	var ie *InputError
	if _, err := CoverVibe(strings.Repeat("é", 201)); !errors.As(err, &ie) {
		t.Errorf("long vibe: err = %v", err)
	}
}
