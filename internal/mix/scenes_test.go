package mix

import (
	"slices"
	"testing"
)

func TestScenesFile(t *testing.T) {
	for _, q := range []Quadrant{QuadrantHappyEnergetic, QuadrantHappyCalm, QuadrantSadEnergetic, QuadrantSadCalm} {
		if n := len(scenes.Quadrants[q]); n < 6 || n > 10 {
			t.Errorf("%s has %d scenes, want 6–10", q, n)
		}
	}
	for _, m := range scenes.Modifiers {
		if len(modifierScenes(m.Name)) == 0 || m.Min <= 0 {
			t.Errorf("modifier %+v", m)
		}
	}
}

func TestGenreFamily(t *testing.T) {
	tests := map[string]string{
		"Electronic---House":             "electronic",
		"Electronic---Ambient":           "ambient", // style beats parent
		"Classical---Neo-Classical":      "ambient",
		"Classical---Baroque":            "classical",
		"Hip Hop---Trap":                 "hiphop",
		"Hip Hop---Jazzy Hip-Hop":        "lofi",
		"Latin---Reggaeton":              "latin",
		"Jazz---Hard Bop":                "jazz",
		"Rock---Lo-Fi":                   "lofi",
		"Rock---Pop Rock":                "rock",
		"Folk, World, & Country---Folk":  "folk",
		"Funk / Soul---Contemporary R&B": "hiphop",
		"Pop---Ballad":                   "pop",
		"Non-Music---Field Recording":    "",
		"not a genre":                    "",
	}
	for genre, want := range tests {
		if got := GenreFamily(genre); got != want {
			t.Errorf("GenreFamily(%q) = %q, want %q", genre, got, want)
		}
	}
}

func TestScenes(t *testing.T) {
	jazz := []Genre{{Name: "Jazz---Hard Bop", Score: 5}, {Name: "Jazz---Modal", Score: 3}, {Name: "Pop---Ballad", Score: 1}}
	pop := []Genre{{Name: "Pop---Ballad", Score: 5}}
	tests := []struct {
		name     string
		p        Profile
		vibe     string
		keywords []string
		sources  []string
		contains string // one query must be this
	}{
		{"vibe first", Profile{Quadrant: QuadrantSadCalm, Genres: jazz}, "  rain on a tin roof ", nil,
			[]string{SceneVibe, SceneGenre, SceneQuadrant}, "rain on a tin roof"},
		{"genre and quadrant", Profile{Quadrant: QuadrantHappyEnergetic, Genres: jazz}, "", nil,
			[]string{SceneGenre, SceneQuadrant, SceneQuadrant}, ""},
		{"name keywords", Profile{Quadrant: QuadrantHappyCalm, Genres: pop}, "", []string{"piano", "rain"},
			[]string{SceneQuadrant, SceneName, SceneQuadrant}, "piano rain"},
		{"modifier without a family", Profile{Quadrant: QuadrantHappyCalm, Genres: pop,
			Averages: Averages{Acoustic: 0.9, Party: 0.65}}, "", nil,
			[]string{SceneModifier, SceneQuadrant, SceneQuadrant}, ""},
		{"genre and modifier", Profile{Quadrant: QuadrantSadEnergetic, Genres: jazz,
			Averages: Averages{Party: 0.8}}, "", nil,
			[]string{SceneGenre, SceneQuadrant, SceneModifier}, ""},
		{"no profile", Profile{}, "", nil, nil, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			qs := Scenes(tt.p, "abc123", tt.vibe, tt.keywords)
			var sources, texts []string
			for _, q := range qs {
				sources = append(sources, q.Source)
				texts = append(texts, q.Text)
			}
			if !slices.Equal(sources, tt.sources) {
				t.Errorf("sources = %v, want %v (%q)", sources, tt.sources, texts)
			}
			if tt.contains != "" && !slices.Contains(texts, tt.contains) {
				t.Errorf("queries %q lack %q", texts, tt.contains)
			}
			if len(slices.Compact(slices.Sorted(slices.Values(texts)))) != len(texts) {
				t.Errorf("duplicate queries %q", texts)
			}
		})
	}
}

func TestScenesDeterministic(t *testing.T) {
	p := Profile{Quadrant: QuadrantSadCalm}
	first := Scenes(p, "mix-a", "", nil)
	if again := Scenes(p, "mix-a", "", nil); !slices.Equal(first, again) {
		t.Errorf("same mix gave %v then %v", first, again)
	}
	// different mixes in the same quadrant don't all get the same scenes
	seen := map[string]bool{}
	for _, id := range []string{"a", "b", "c", "d", "e", "f", "g", "h"} {
		seen[Scenes(p, id, "", nil)[0].Text] = true
	}
	if len(seen) < 3 {
		t.Errorf("only %d distinct scenes across 8 mixes", len(seen))
	}
}

func TestNameWords(t *testing.T) {
	tests := []struct {
		name string
		want []string
	}{
		{"Peaceful Piano", []string{"peaceful", "piano"}},
		{"All Out 80s", nil},
		{"lofi beats", []string{"lofi"}},
		{"Rain, rain & Thunder: the Mix", []string{"rain", "thunder"}},
		{"Été à Paris", []string{"été", "paris"}},
		{"one two three four five six", []string{"one", "two", "three", "four"}},
	}
	for _, tt := range tests {
		if got := NameWords(tt.name); !slices.Equal(got, tt.want) {
			t.Errorf("NameWords(%q) = %q, want %q", tt.name, got, tt.want)
		}
	}
}
