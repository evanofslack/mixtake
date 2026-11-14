package mix

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestCoversShowcase(t *testing.T) {
	var ps []Photo
	for id := 1; id <= 20; id++ {
		ps = append(ps, photo(id, 1440, 1080, "#c08040", "#304060"))
	}
	tests := []struct {
		name     string
		photos   *fakePhotos
		want     int // photos in the set
		searches int // searches made by both calls together
		err      error
	}{
		{"every point gets its own photo", &fakePhotos{photos: ps}, len(showcasePoints), 8, nil},
		{"fewer photos than points", &fakePhotos{photos: ps[:5]}, 5, 8, nil},
		// the failure is remembered, so the second call doesn't search again
		{"analogdb down", &fakePhotos{failAll: true}, 0, 8, ErrUpstream},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := NewCovers(tt.photos, 0)
			for range 2 {
				set, err := c.Showcase(context.Background())
				if !errors.Is(err, tt.err) {
					t.Fatalf("err = %v, want %v", err, tt.err)
				}
				if len(set.Photos) != tt.want {
					t.Fatalf("got %d photos, want %d", len(set.Photos), tt.want)
				}
				seen := map[int]bool{}
				for _, p := range set.Photos {
					if seen[p.Photo.ID] {
						t.Errorf("photo %d used twice", p.Photo.ID)
					}
					seen[p.Photo.ID] = true
					for _, img := range p.Photo.Images {
						if !strings.HasPrefix(img.URL, "/api/img/") {
							t.Errorf("image %q isn't proxied", img.URL)
						}
					}
				}
			}
			if n := tt.photos.searchCount(); n != tt.searches {
				t.Errorf("%d searches, want %d", n, tt.searches)
			}
		})
	}
}

func TestShowcasePoints(t *testing.T) {
	count := map[Quadrant]int{}
	for _, pt := range showcasePoints {
		count[quadrant(pt.Mood, pt.Energy)]++
	}
	for _, q := range []Quadrant{QuadrantHappyEnergetic, QuadrantHappyCalm, QuadrantSadEnergetic, QuadrantSadCalm} {
		if count[q] != 3 {
			t.Errorf("%s has %d points, want 3", q, count[q])
		}
		if len(scenes.Quadrants[q].Literal) == 0 || len(scenes.Quadrants[q].Abstract) == 0 {
			t.Errorf("%s has no scenes to search", q)
		}
	}
}
