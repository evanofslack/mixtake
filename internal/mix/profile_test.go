package mix

import (
	"math"
	"reflect"
	"testing"
)

func done(f Features, artists ...string) TrackResult {
	tr := TrackResult{Status: TrackDone, Features: &f}
	for _, a := range artists {
		tr.Track.Artists = append(tr.Track.Artists, Artist{Name: a})
	}
	return tr
}

func near(a, b float64) bool { return math.Abs(a-b) < 1e-9 }

func TestBuildProfile(t *testing.T) {
	happyFast := Features{Tempo: 128, Key: "A", Mode: "minor", Happy: 1, Party: 1, Aggressive: 1,
		Genres: []Genre{{"Electronic---House", 0.8}, {"Pop---Synth-pop", 0.1}}}
	sadSlow := Features{Tempo: 50, Key: "A", Mode: "minor", Sad: 1, Relaxed: 1,
		Genres: []Genre{{"Rock---Indie Rock", 0.6}, {"Electronic---House", 0.3}}}
	mid := Features{Tempo: 200, Key: "C", Mode: "major", Happy: 0.5, Party: 0.5,
		Genres: []Genre{{"Hip Hop---Trap", 0.5}}}
	tracks := []TrackResult{
		done(happyFast, "Ashe", "Dave"),
		{Status: TrackNoAudio, Track: Track{Artists: []Artist{{Name: "Dave"}}}},
		done(sadSlow, "Dave"),
		{Status: TrackPending},
		done(mid, "Ashe"),
		{Status: TrackFailed},
	}
	p := BuildProfile(tracks)

	if want := (Coverage{Total: 6, Done: 3, Failed: 2}); p.Coverage != want {
		t.Errorf("coverage = %+v, want %+v", p.Coverage, want)
	}
	// moods 1, 0, 0.75; energies 1, 0, 0.5
	if !near(p.Averages.Mood, 1.75/3) || !near(p.Averages.Energy, 0.5) || !near(p.Averages.Tempo, 126) {
		t.Errorf("averages = %+v", p.Averages)
	}
	if !near(p.Spread.Energy, math.Sqrt(1.0/6)) {
		t.Errorf("energy spread = %v", p.Spread.Energy)
	}
	if p.Quadrant != QuadrantHappyEnergetic {
		t.Errorf("quadrant = %s", p.Quadrant)
	}
	wantArc := []ArcPoint{{0, 1, 1}, {2, 0, 0}, {4, 0.5, 0.75}}
	if !reflect.DeepEqual(p.EnergyArc, wantArc) {
		t.Errorf("arc = %+v", p.EnergyArc)
	}
	if len(p.Tempos) != 12 || p.Tempos[0] != (Bin{60, 70, 1}) || p.Tempos[6] != (Bin{120, 130, 1}) ||
		p.Tempos[11] != (Bin{170, 180, 1}) {
		t.Errorf("tempos = %+v", p.Tempos)
	}
	wantKeys := []KeyCount{{"A", "minor", 2}, {"C", "major", 1}}
	if !reflect.DeepEqual(p.Keys, wantKeys) {
		t.Errorf("keys = %+v", p.Keys)
	}
	if p.Genres[0].Name != "Electronic---House" || !near(p.Genres[0].Score, 1.1) || len(p.Genres) != 4 {
		t.Errorf("genres = %+v", p.Genres)
	}
	wantArtists := []ArtistCount{{"Dave", 3}, {"Ashe", 2}}
	if !reflect.DeepEqual(p.Artists, wantArtists) {
		t.Errorf("artists = %+v", p.Artists)
	}
	if want := "Warm and driving"; p.Summary != want {
		t.Errorf("summary = %q, want %q", p.Summary, want)
	}
}

func TestBuildProfileEmpty(t *testing.T) {
	p := BuildProfile([]TrackResult{{Status: TrackPending}, {Status: TrackFailed}})
	if p.Summary != "" || p.Quadrant != QuadrantSadCalm || p.EnergyArc == nil || p.Genres == nil {
		t.Errorf("profile = %+v", p)
	}
}

func TestSummaryWords(t *testing.T) {
	tests := []struct {
		mood, energy float64
		minor, total int
		want         string
	}{
		{0.1, 0.1, 0, 2, "Melancholy and hushed"},
		{0.4, 0.4, 1, 2, "Bittersweet and laid-back"},
		{0.9, 0.9, 2, 2, "Euphoric and intense"},
	}
	for _, tt := range tests {
		var feats []Features
		for i := range tt.total {
			mode := "major"
			if i < tt.minor {
				mode = "minor"
			}
			feats = append(feats, Features{Tempo: 100, Mode: mode})
		}
		p := Profile{Coverage: Coverage{Total: 2, Done: 2}, Averages: Averages{Mood: tt.mood, Energy: tt.energy, Tempo: 100}}
		if got := summary(p, feats); got != tt.want {
			t.Errorf("got %q, want %q", got, tt.want)
		}
	}
}
