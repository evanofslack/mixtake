package mix

import (
	"encoding/json"
	"math"
	"os"
	"slices"
	"testing"
)

func TestMixID(t *testing.T) {
	a := MixID([]string{"x", "y"}, "")
	if len(a) != 12 {
		t.Fatalf("len = %d, want 12", len(a))
	}
	tests := []struct {
		name string
		ids  []string
		vibe string
		same bool
	}{
		{"same input", []string{"x", "y"}, "", true},
		{"vibe whitespace ignored", []string{"x", "y"}, "  ", true},
		{"order matters", []string{"y", "x"}, "", false},
		{"no concatenation collisions", []string{"xy"}, "", false},
		{"vibe matters", []string{"x", "y"}, "rainy", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := MixID(tt.ids, tt.vibe) == a; got != tt.same {
				t.Errorf("same = %v, want %v", got, tt.same)
			}
		})
	}
}

func TestAxesBounds(t *testing.T) {
	tests := []struct {
		name string
		f    Features
		lo   float64 // Mood and Energy both at most lo, or both at least -lo when negative
	}{
		{"all zero", Features{}, 0},
		{"sad calm", Features{Sad: 1, Relaxed: 1}, 0.2},
		{"happy party", Features{Happy: 1, Party: 1, Aggressive: 1, Valence: 1, Arousal: 1}, -0.8},
		{"out of range", Features{Happy: 2, Sad: -1, Valence: 3, Arousal: -2}, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m, e := tt.f.Mood(), tt.f.Energy()
			for _, v := range []float64{m, e} {
				if v < 0 || v > 1 || math.IsNaN(v) {
					t.Fatalf("mood %v, energy %v outside 0–1", m, e)
				}
			}
			if tt.lo > 0 && (m > tt.lo || e > tt.lo) {
				t.Errorf("mood %.2f, energy %.2f, want both ≤ %.2f", m, e, tt.lo)
			}
			if tt.lo < 0 && (m < -tt.lo || e < -tt.lo) {
				t.Errorf("mood %.2f, energy %.2f, want both ≥ %.2f", m, e, -tt.lo)
			}
		})
	}
}

// TestAxesCalibration checks the axes on real analyser output (testdata/axes.json, the scores of
// about 500 tracks with their top genre family): calm music must spread out instead of sitting
// on one point, and the genres must still come out in a sensible order.
func TestAxesCalibration(t *testing.T) {
	raw, err := os.ReadFile("testdata/axes.json")
	if err != nil {
		t.Fatal(err)
	}
	var rows []struct {
		Family string `json:"family"`
		Features
	}
	if err := json.Unmarshal(raw, &rows); err != nil {
		t.Fatal(err)
	}
	moods := map[string][]float64{}
	energies := map[string][]float64{}
	for _, r := range rows {
		for _, k := range []string{r.Family, "all"} {
			moods[k] = append(moods[k], r.Mood())
			energies[k] = append(energies[k], r.Energy())
		}
	}
	spread := func(v []float64) float64 { return quantile(v, 0.9) - quantile(v, 0.1) }
	median := func(v []float64) float64 { return quantile(v, 0.5) }

	spreads := []struct {
		family string
		min    float64
	}{
		{"all", 0.3},
		{"Jazz", 0.2},
		{"Classical", 0.05}, // one album of slow piano: before, 0.00
	}
	for _, tt := range spreads {
		if s := spread(moods[tt.family]); s < tt.min {
			t.Errorf("%s mood p10–p90 = %.2f, want ≥ %.2f", tt.family, s, tt.min)
		}
		if s := spread(energies[tt.family]); s < tt.min {
			t.Errorf("%s energy p10–p90 = %.2f, want ≥ %.2f", tt.family, s, tt.min)
		}
	}

	order := []struct {
		axis        string
		lower, more string
	}{
		{"energy", "Classical", "Jazz"},
		{"energy", "Jazz", "Hip Hop"},
		{"energy", "Folk, World, & Country", "Rock"},
		{"energy", "Classical", "Electronic"},
		{"mood", "Classical", "Pop"},
		{"mood", "Classical", "Funk / Soul"},
		{"mood", "Folk, World, & Country", "Rock"},
	}
	for _, tt := range order {
		vals := energies
		if tt.axis == "mood" {
			vals = moods
		}
		lo, hi := median(vals[tt.lower]), median(vals[tt.more])
		if lo >= hi {
			t.Errorf("%s median: %s %.2f should be below %s %.2f", tt.axis, tt.lower, lo, tt.more, hi)
		}
	}
}

func quantile(v []float64, q float64) float64 {
	s := slices.Clone(v)
	slices.Sort(s)
	return s[int(q*float64(len(s)-1))]
}
