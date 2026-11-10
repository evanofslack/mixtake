package mix

import (
	"fmt"
	"regexp"
	"slices"
	"testing"
)

// photo builds a usable analogdb photo whose high image is w×h.
func photo(id, w, h int, colors ...string) Photo {
	p := Photo{ID: id, Caption: fmt.Sprintf("photo %d", id), Score: 100, Images: []PhotoImage{
		{Resolution: "low", URL: fmt.Sprintf("https://i.analogdb.com/%08x-0000-4000-8000-000000000000.jpeg", id), Width: w / 2, Height: h / 2},
		{Resolution: "high", URL: fmt.Sprintf("https://i.analogdb.com/%024x-high.jpeg", id), Width: w, Height: h},
	}}
	for _, c := range colors {
		p.Colors = append(p.Colors, PhotoColor{Hex: c, Percent: 1 / float64(len(colors))})
	}
	return p
}

func ids(cs []Candidate) []int {
	var out []int
	for _, c := range cs {
		out = append(out, c.Photo.ID)
	}
	return out
}

func TestValidImageName(t *testing.T) {
	tests := map[string]bool{
		"9e2be093-8564-4543-998e-0840cbd941b2.jpeg": true,
		"9e2be093-8564-4543-998e-0840cbd941b2.jpg":  true,
		"9e2be093-8564-4543-998e-0840cbd941b2.png":  true,
		"24aec317a2de79c1fea6c80d-high.jpeg":        true,
		"24aec317a2de79c1fea6c80d-raw.jpeg":         true,
		"9E2BE093-8564-4543-998E-0840CBD941B2.jpeg": false,
		"9e2be093-8564-4543-998e-0840cbd941b2.gif":  false,
		"9e2be093-8564-4543-998e-0840cbd941b2":      false,
		"../etc/passwd":                             false,
		"24aec317a2de79c1fea6c80d-huge.jpeg":        false,
		"":                                          false,
	}
	for name, want := range tests {
		if got := ValidImageName(name); got != want {
			t.Errorf("ValidImageName(%q) = %v", name, got)
		}
	}
}

func TestUsable(t *testing.T) {
	nsfw := photo(1, 1440, 1080)
	nsfw.NSFW = true
	gray := photo(2, 1440, 1080)
	gray.Grayscale = true
	badName := photo(3, 1440, 1080)
	badName.Images[1].URL = "https://i.analogdb.com/whatever.jpeg"
	noHigh := photo(4, 1440, 1080)
	noHigh.Images = noHigh.Images[:1]
	tests := []struct {
		name      string
		p         Photo
		allowGray bool
		want      bool
	}{
		{"landscape", photo(5, 1440, 1080), false, true},
		{"portrait", photo(6, 1027, 1440), false, true},
		{"too small", photo(7, 1080, 810), false, false},
		{"panorama", photo(8, 1440, 600), false, false},
		{"tall", photo(9, 800, 1440), false, false},
		{"nsfw", nsfw, true, false},
		{"gray", gray, false, false},
		{"gray allowed", gray, true, true},
		{"bad name", badName, false, false},
		{"no high", noHigh, false, false},
	}
	for _, tt := range tests {
		if got := usable(tt.p, tt.allowGray); got != tt.want {
			t.Errorf("%s: usable = %v", tt.name, got)
		}
	}
}

func TestTargetPalette(t *testing.T) {
	hex := regexp.MustCompile(`^#[0-9a-f]{6}$`)
	tests := []struct {
		name string
		a    Averages
		warm bool
	}{
		{"happy energetic", Averages{Mood: 0.9, Energy: 0.9}, true},
		{"happy calm", Averages{Mood: 0.7, Energy: 0.1}, true},
		{"sad energetic", Averages{Mood: 0.2, Energy: 0.8}, false},
		{"sad calm", Averages{Mood: 0.1, Energy: 0.1}, false},
	}
	for _, tt := range tests {
		pal := TargetPalette(tt.a)
		if len(pal) != 3 {
			t.Fatalf("%s: %v", tt.name, pal)
		}
		for _, h := range pal {
			if !hex.MatchString(h) {
				t.Errorf("%s: bad hex %q", tt.name, h)
			}
		}
		lab, _ := hexLab(pal[1])
		// Lab b > 0 is yellow (warm), b < 0 is blue (cool)
		if warm := lab[2] > 0; warm != tt.warm {
			t.Errorf("%s: mid tone %s has b = %.1f, want warm %v", tt.name, pal[1], lab[2], tt.warm)
		}
	}
	calm, energetic := TargetPalette(Averages{Mood: 0.8, Energy: 0.1}), TargetPalette(Averages{Mood: 0.8, Energy: 0.9})
	c, _ := hexLab(calm[1])
	e, _ := hexLab(energetic[1])
	if chroma(e) <= chroma(c) {
		t.Errorf("energetic %s should be more saturated than calm %s", energetic[1], calm[1])
	}
}

func chroma(lab [3]float64) float64 { return lab[1]*lab[1] + lab[2]*lab[2] }

func TestHexLab(t *testing.T) {
	tests := []struct {
		hex  string
		want [3]float64
		ok   bool
	}{
		{"#ffffff", [3]float64{100, 0, 0}, true},
		{"#000000", [3]float64{0, 0, 0}, true},
		{"#ff0000", [3]float64{53.2, 80.1, 67.2}, true},
		{"red", [3]float64{}, false},
		{"#12345", [3]float64{}, false},
	}
	for _, tt := range tests {
		got, ok := hexLab(tt.hex)
		if ok != tt.ok {
			t.Errorf("hexLab(%q) ok = %v", tt.hex, ok)
		}
		for i := range got {
			if d := got[i] - tt.want[i]; d > 0.5 || d < -0.5 {
				t.Errorf("hexLab(%q) = %.1f, want %.1f", tt.hex, got, tt.want)
				break
			}
		}
	}
}

func TestRankPhotos(t *testing.T) {
	warm := Profile{Quadrant: QuadrantHappyCalm, Averages: Averages{Mood: 0.8, Energy: 0.3}}
	orange, blue := "#d9a05b", "#2a4d7a"
	queries := []SceneQuery{{Text: "a", Weight: 1}, {Text: "b", Weight: 0.8}}

	t.Run("filters and dedupes", func(t *testing.T) {
		gray := photo(3, 1440, 1080, orange)
		gray.Grayscale = true
		results := [][]Photo{
			{photo(1, 1440, 1080, orange), photo(2, 800, 600, orange), gray},
			{photo(1, 1440, 1080, orange), photo(4, 1080, 1440, orange)},
		}
		if got := ids(RankPhotos(queries, results, warm, "m", 12)); !slices.Equal(got, []int{1, 4}) {
			t.Errorf("got %v", got)
		}
		sad := Profile{Quadrant: QuadrantSadCalm, Averages: Averages{Mood: 0.2, Energy: 0.2}}
		if got := ids(RankPhotos(queries, results, sad, "m", 12)); !slices.Contains(got, 3) {
			t.Errorf("sad calm should keep grayscale: %v", got)
		}
	})

	t.Run("colour breaks a rank tie", func(t *testing.T) {
		results := [][]Photo{{photo(1, 1440, 1080, blue)}, {photo(2, 1440, 1080, orange)}}
		same := []SceneQuery{{Text: "a", Weight: 1}, {Text: "b", Weight: 1}}
		if got := ids(RankPhotos(same, results, warm, "m", 12)); got[0] != 2 {
			t.Errorf("warm profile ranked %v", got)
		}
		cool := Profile{Quadrant: QuadrantSadCalm, Averages: Averages{Mood: 0.2, Energy: 0.3}}
		if got := ids(RankPhotos(same, results, cool, "m", 12)); got[0] != 1 {
			t.Errorf("cool profile ranked %v", got)
		}
	})

	t.Run("search rank matters", func(t *testing.T) {
		var ps []Photo
		for i := range 30 {
			ps = append(ps, photo(i+1, 1440, 1080, orange))
		}
		got := ids(RankPhotos(queries[:1], [][]Photo{ps}, warm, "m", 12))
		if len(got) != 12 || slices.Contains(got, 30) || !slices.Contains(got, 1) {
			t.Errorf("got %v", got)
		}
	})

	t.Run("deterministic per mix", func(t *testing.T) {
		var ps []Photo
		for i := range 40 {
			ps = append(ps, photo(i+1, 1440, 1080, orange))
		}
		ps2 := slices.Clone(ps)
		slices.Reverse(ps2)
		results := [][]Photo{ps, ps2} // equal rank weights, so jitter decides
		same := []SceneQuery{{Text: "a", Weight: 1}, {Text: "b", Weight: 1}}
		a := ids(RankPhotos(same, results, warm, "mix-a", 12))
		if again := ids(RankPhotos(same, results, warm, "mix-a", 12)); !slices.Equal(a, again) {
			t.Errorf("not deterministic: %v vs %v", a, again)
		}
		if b := ids(RankPhotos(same, results, warm, "mix-b", 12)); slices.Equal(a, b) {
			t.Errorf("different mixes got the same order %v", a)
		}
	})
}
