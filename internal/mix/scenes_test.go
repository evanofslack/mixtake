package mix

import (
	"slices"
	"testing"
)

func TestScenesFile(t *testing.T) {
	sized := func(name string, list []string, lo, hi int) {
		t.Helper()
		if len(list) < lo || len(list) > hi {
			t.Errorf("%s has %d entries, want %d–%d", name, len(list), lo, hi)
		}
		if len(slices.Compact(slices.Sorted(slices.Values(list)))) != len(list) {
			t.Errorf("%s has duplicates", name)
		}
	}
	for _, q := range []Quadrant{QuadrantHappyEnergetic, QuadrantHappyCalm, QuadrantSadEnergetic, QuadrantSadCalm} {
		sized(string(q)+" literal", scenes.Quadrants[q].Literal, 15, 25)
		sized(string(q)+" abstract", scenes.Quadrants[q].Abstract, 15, 25)
	}
	for _, a := range []Averages{{Mood: 0.9, Energy: 0.9}, {Mood: 0.9, Energy: 0.5}, {Mood: 0.9, Energy: 0.3},
		{Mood: 0.9}, {Mood: 0.1, Energy: 0.9}, {Mood: 0.1, Energy: 0.4}, {Mood: 0.1}} {
		sized(ColorName(a)+" color keywords", scenes.Colors[ColorName(a)], 3, 10)
	}
	for _, m := range scenes.Modifiers {
		sized("modifier "+m.Name, m.Scenes, 10, 25)
		if m.Min <= 0 {
			t.Errorf("modifier %+v", m)
		}
	}
	for _, f := range scenes.Families {
		if len(f.Happy) == 0 {
			continue // a family without scenes falls back to the quadrant
		}
		sized(f.Name+" happy", f.Happy, 12, 25)
		sized(f.Name+" sad", f.Sad, 12, 25)
		sized(f.Name+" abstract", f.Abstract, 8, 25)
	}
	for _, w := range scenes.TitleWords {
		if stopwords[w] || len(splitWords(w)) != 1 {
			t.Errorf("title word %q is a stopword or too short", w)
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
	const (
		V = LensVibe
		L = LensLiteral
		A = LensAbstract
		W = LensWords
		C = LensColor
	)
	tests := []struct {
		name     string
		p        Profile
		vibe     string
		words    []string
		lenses   []string
		sources  []string // of the literal scenes
		contains string   // one query must be this
	}{
		{"vibe first", Profile{Quadrant: QuadrantSadCalm, Genres: jazz}, "  rain on a tin roof ", nil,
			[]string{V, L, A, L, A, C, L, A}, []string{SceneGenre, SceneGenre, SceneQuadrant},
			"rain on a tin roof"},
		{"words", Profile{Quadrant: QuadrantSadCalm, Genres: jazz}, "", []string{"rain", "blue", "moon"},
			[]string{L, A, W, L, A, C, W}, []string{SceneGenre, SceneGenre}, "blue"},
		{"one word", Profile{Quadrant: QuadrantHappyCalm, Genres: pop}, "", []string{"piano"},
			[]string{L, A, W, L, A, C, L}, []string{SceneQuadrant, SceneQuadrant, SceneQuadrant}, "piano"},
		{"modifier without a family", Profile{Quadrant: QuadrantHappyCalm, Genres: pop,
			Averages: Averages{Mood: 0.6, Acoustic: 0.9, Party: 0.65}}, "", nil,
			[]string{L, A, L, A, C, L, A}, []string{SceneModifier, SceneQuadrant, SceneModifier},
			"tan morning"},
		{"family beats modifier", Profile{Quadrant: QuadrantSadCalm, Genres: jazz,
			Averages: Averages{Instrumental: 0.9}}, "", nil,
			[]string{L, A, L, A, C, L, A}, []string{SceneGenre, SceneGenre, SceneQuadrant}, ""},
		{"no profile", Profile{}, "", nil, []string{C}, nil, "gray "},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			qs := Scenes(tt.p, "abc123", tt.vibe, tt.words)
			var lenses, sources, texts []string
			for _, q := range qs {
				lenses = append(lenses, q.Lens)
				texts = append(texts, q.Text)
				if q.Lens == LensLiteral {
					sources = append(sources, q.Source)
				}
				if (q.Lens == LensColor) != (q.Color != "" && q.Keyword != "") {
					t.Errorf("query %+v", q)
				}
			}
			if !slices.Equal(lenses, tt.lenses) || !slices.Equal(sources, tt.sources) {
				t.Errorf("lenses %v and sources %v, want %v and %v (%q)", lenses, sources, tt.lenses, tt.sources, texts)
			}
			if tt.contains != "" && !slices.Contains(texts, tt.contains) &&
				!slices.ContainsFunc(texts, func(s string) bool { return len(s) > 4 && s[:4] == tt.contains[:4] }) {
				t.Errorf("queries %q lack %q", texts, tt.contains)
			}
			if len(slices.Compact(slices.Sorted(slices.Values(texts)))) != len(texts) {
				t.Errorf("duplicate queries %q", texts)
			}
		})
	}
}

func TestScenesSeeded(t *testing.T) {
	p := Profile{Quadrant: QuadrantSadCalm}
	texts := func(key string) []string {
		var out []string
		for _, q := range Scenes(p, key, "", nil) {
			out = append(out, q.Text)
		}
		return out
	}
	first := texts("mix-a")
	if again := texts("mix-a"); !slices.Equal(first, again) {
		t.Errorf("same mix gave %q then %q", first, again)
	}
	if shuffled := texts(SeedKey("mix-a", 1)); slices.Equal(first, shuffled) {
		t.Errorf("seed 1 gave the same queries %q", first)
	}
	if SeedKey("mix-a", 0) != "mix-a" {
		t.Errorf("seed 0 should be the mix's own key")
	}
	// different mixes in the same quadrant don't all get the same scenes
	seen := map[string]bool{}
	for _, id := range []string{"a", "b", "c", "d", "e", "f", "g", "h"} {
		seen[texts(id)[0]] = true
	}
	if len(seen) < 4 {
		t.Errorf("only %d distinct scenes across 8 mixes", len(seen))
	}
}

func TestColorName(t *testing.T) {
	tests := []struct {
		a    Averages
		want string
	}{
		{Averages{Mood: 0.9, Energy: 0.9}, "red"},
		{Averages{Mood: 0.7, Energy: 0.6}, "orange"},
		{Averages{Mood: 0.6, Energy: 0.3}, "yellow"},
		{Averages{Mood: 0.6, Energy: 0.1}, "tan"},
		{Averages{Mood: 0.3, Energy: 0.7}, "purple"},
		{Averages{Mood: 0.3, Energy: 0.4}, "navy"},
		{Averages{Mood: 0.1, Energy: 0.1}, "gray"},
	}
	for _, tt := range tests {
		if got := ColorName(tt.a); got != tt.want {
			t.Errorf("ColorName(%+v) = %q, want %q", tt.a, got, tt.want)
		}
	}
}

func TestTitleWords(t *testing.T) {
	tests := []struct {
		name   string
		source string
		titles []string
		want   []string
	}{
		// light is in 3 titles and evocative; rain in 2; desert and moon are evocative; the name's
		// words come next
		{"recurring evocative words first", "Peaceful Piano",
			[]string{"New Light", "Light in Silence", "Soft Rain", "Desert Rain", "At The Edge Of Light", "Eternal Moon", "Totem"},
			[]string{"light", "rain", "desert", "moon", "peaceful"}},
		{"name words and plurals", "Kind of Blue",
			[]string{"So What (feat. John Coltrane)", "Blue in Green (feat. Bill Evans)", "All Blues", "Flamenco Sketches"},
			[]string{"blue"}}, // colour words other than blue are stopwords
		// solo recurs but isn't evocative, so it comes after night; ferrari is in one title and
		// not evocative
		{"recurring plain words", "",
			[]string{"Solo", "Solo (Reprise)", "Nights", "Pink + White", "White Ferrari", "Godspeed"},
			[]string{"night", "solo"}},
		{"long playlists need words in two titles", "Beast Mode",
			append(slices.Repeat([]string{"Banger"}, 20), "Midnight Sun", "Rain", "Rain on Me"),
			[]string{"banger", "rain", "beast"}},
		{"versions and features are dropped", "",
			[]string{"Gravity - Remastered 2009", "Gravity [Live]", "Thing (feat. Sunshine Orchestra)"},
			[]string{"gravity"}},
		{"one-off plain words are left out", "This Is Drake", []string{"Hotline Bling"}, []string{"drake"}},
		{"nothing", "", nil, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := TitleWords(tt.source, tt.titles, "k"); !slices.Equal(got, tt.want) {
				t.Errorf("TitleWords = %q, want %q", got, tt.want)
			}
		})
	}
	// the key breaks ties, so shuffles can change the words
	titles := []string{"Rain", "Moon", "Ocean", "Fire", "Snow", "Gold", "Summer"}
	seen := map[string]bool{}
	for _, key := range []string{"a", "b", "c", "d", "e", "f"} {
		seen[TitleWords("", titles, key)[0]] = true
	}
	if len(seen) < 3 {
		t.Errorf("only %d distinct first words across 6 keys", len(seen))
	}
}

func TestCleanTitle(t *testing.T) {
	tests := map[string]string{
		"So What (feat. John Coltrane & Bill Evans)": "So What ",
		"The Days - NOTION Remix":                    "The Days",
		"Life Is Simple (Move Your Body) [Feat X]":   "Life Is Simple  ",
		"Weird Fishes / Arpeggi":                     "Weird Fishes / Arpeggi",
	}
	for in, want := range tests {
		if got := cleanTitle(in); got != want {
			t.Errorf("cleanTitle(%q) = %q, want %q", in, got, want)
		}
	}
}
