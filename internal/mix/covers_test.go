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
// fail, and colour queries when failColor is set. Keywords in keywords exist.
type fakePhotos struct {
	photos    []Photo
	keywords  map[string]int
	failAll   bool
	failColor bool

	mu       sync.Mutex
	searches []string
	lookups  []string
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

func (f *fakePhotos) ByColor(_ context.Context, q ColorQuery) ([]Photo, error) {
	f.mu.Lock()
	f.searches = append(f.searches, q.Color+" "+q.Keyword)
	f.mu.Unlock()
	if f.failAll || f.failColor || q.Seed < 1 || q.Seed > 500 {
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
	f.mu.Lock()
	f.lookups = append(f.lookups, word)
	f.mu.Unlock()
	if word == "boom" {
		return 0, ErrUpstream
	}
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
		name    string
		snap    Snapshot
		vibe    string
		seed    int
		err     error
		search  int // searches made so far
		queries int
	}{
		{"nothing analysed", coverSnapshot(0, StatusRunning), "", 0, ErrTooFew, 0, 0},
		{"too few while running", coverSnapshot(9, StatusRunning), "", 0, ErrTooFew, 0, 0},
		{"short album finished", coverSnapshot(5, StatusDone), "", 0, nil, 7, 7},
		{"ten analysed", coverSnapshot(10, StatusRunning), "", 0, nil, 14, 7},
		{"cached within ten tracks", coverSnapshot(19, StatusRunning), "", 0, nil, 14, 7},
		{"vibe override", coverSnapshot(19, StatusRunning), "rain on a tin roof", 0, nil, 22, 8},
		{"shuffled", coverSnapshot(19, StatusRunning), "", 7, nil, 29, 7},
		{"shuffle cached", coverSnapshot(19, StatusRunning), "", 7, nil, 29, 7},
		{"more coverage", coverSnapshot(20, StatusDone), "", 0, nil, 36, 7},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			set, err := c.ForMix(ctx, tt.snap, tt.vibe, tt.seed)
			if !errors.Is(err, tt.err) || ph.searchCount() != tt.search {
				t.Fatalf("err = %v after %d searches, want %v after %d", err, ph.searchCount(), tt.err, tt.search)
			}
			if err != nil {
				return
			}
			if len(set.Photos) != CoverCount || len(set.Palette) != 3 || len(set.Queries) != tt.queries {
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

	// failed searches still give covers
	set, err := NewCovers(&fakePhotos{photos: ps, failColor: true}, 0).ForMix(context.Background(), snap, "boom", 0)
	if err != nil || len(set.Photos) != 5 || len(set.Queries) != 8 {
		t.Errorf("partial failure: %d photos, %d queries, %v", len(set.Photos), len(set.Queries), err)
	}
	if _, err := NewCovers(&fakePhotos{failAll: true}, 0).ForMix(context.Background(), snap, "", 0); !errors.Is(err, ErrUpstream) {
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

func TestTitleKeywords(t *testing.T) {
	tests := []struct {
		name       string
		candidates []string
		want       []string
		lookups    []string
	}{
		{"evocative words need no lookup", []string{"rain", "night", "moon"}, []string{"rain", "night"}, nil},
		{"others are checked", []string{"piano", "peaceful", "rain"}, []string{"piano", "rain"},
			[]string{"peaceful", "piano"}},
		{"lookups are capped", []string{"aaa", "bbb", "ccc", "ddd", "piano"}, nil,
			[]string{"aaa", "bbb", "ccc"}},
		{"failed lookups are left out", []string{"boom", "piano"}, []string{"piano"}, []string{"boom", "piano"}},
		{"none", nil, nil, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ph := &fakePhotos{keywords: map[string]int{"piano": 300, "peaceful": 5}}
			got, n := NewCovers(ph, 0).titleKeywords(context.Background(), tt.candidates)
			slices.Sort(ph.lookups)
			if !slices.Equal(got, tt.want) || !slices.Equal(ph.lookups, tt.lookups) || n != len(tt.lookups) {
				t.Errorf("got %q after lookups %q (%d), want %q after %q", got, ph.lookups, n, tt.want, tt.lookups)
			}
		})
	}
}

func TestCoverSeed(t *testing.T) {
	tests := map[string]int{"": 0, "0": 0, "42": 42, "1000000000": 1_000_000_000}
	for in, want := range tests {
		if got, err := CoverSeed(in); got != want || err != nil {
			t.Errorf("CoverSeed(%q) = %d, %v", in, got, err)
		}
	}
	for _, in := range []string{"-1", "x", "1.5", "1000000001", " 3"} {
		var ie *InputError
		if _, err := CoverSeed(in); !errors.As(err, &ie) {
			t.Errorf("CoverSeed(%q): err = %v", in, err)
		}
	}
}
