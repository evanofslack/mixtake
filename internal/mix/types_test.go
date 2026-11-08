package mix

import "testing"

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

func TestAxes(t *testing.T) {
	tests := []struct {
		name         string
		f            Features
		mood, energy float64
	}{
		{"neutral", Features{Relaxed: 1}, 0.5, 0},
		{"happy party", Features{Happy: 1, Party: 1, Aggressive: 1}, 1, 1},
		{"sad calm", Features{Sad: 1, Relaxed: 1}, 0, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.f.Mood(); got != tt.mood {
				t.Errorf("Mood = %v, want %v", got, tt.mood)
			}
			if got := tt.f.Energy(); got != tt.energy {
				t.Errorf("Energy = %v, want %v", got, tt.energy)
			}
		})
	}
}
