package mix

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"
	"testing"
)

func TestBrief(t *testing.T) {
	prof := Profile{Summary: "Melancholy and hushed", Averages: Averages{Mood: 0.2, Energy: 0.15,
		Tempo: 72, Acoustic: 0.8, Instrumental: 0.9},
		Genres:  []Genre{{Name: "Electronic---Ambient", Score: 3}, {Name: "Classical---Modern", Score: 2}},
		Artists: []ArtistCount{{Name: "Nils Frahm", Count: 4}, {Name: "Ólafur Arnalds", Count: 2}}}
	tracks := []TrackResult{
		{Track: Track{Title: "Says (feat. Someone)", Artists: []Artist{{Name: "Nils Frahm"}}, ReleaseDate: "2013-05-01"}},
		{Track: Track{Title: "Near Light - Remastered", Artists: []Artist{{Name: "Ólafur Arnalds"}}, ReleaseDate: "2011"}},
	}
	tests := []struct {
		name    string
		snap    Snapshot
		vibe    string
		want    []string
		notWant []string
	}{
		{"playlist", Snapshot{Mix: Mix{Source: Source{Kind: KindPlaylist, Name: "Peaceful Piano", Subtitle: "Spotify"}},
			Tracks: tracks, Profile: &prof}, "snow at dawn",
			[]string{"Type: playlist", "Name: Peaceful Piano", "Curated by: Spotify",
				"vibe as: snow at dawn", "Nils Frahm (4)", "Electronic / Ambient; Classical / Modern",
				"melancholy and hushed. Mood 0.20", "72 BPM, mostly acoustic, mostly instrumental.",
				"Released: 2011–2013", "Tracks (2):", "- Says — Nils Frahm", "- Near Light — Ólafur Arnalds"},
			[]string{"feat.", "Remastered", "danceable"}},
		{"album omits track artists", Snapshot{Mix: Mix{Source: Source{Kind: KindAlbum, Name: "Spaces", Subtitle: "Nils Frahm"}},
			Tracks: tracks[:1]}, "",
			[]string{"Type: album", "By: Nils Frahm", "Released: 2013", "- Says\n"},
			[]string{"vibe", "Sound:", "— Nils Frahm"}},
		{"pasted tracks", Snapshot{Mix: Mix{Source: Source{Kind: KindTracks}}}, "",
			[]string{"Type: a hand-picked set of tracks"}, []string{"Name:", "Tracks ("}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Brief(tt.snap, tt.vibe)
			for _, w := range tt.want {
				if !strings.Contains(got, w) {
					t.Errorf("brief lacks %q:\n%s", w, got)
				}
			}
			for _, w := range tt.notWant {
				if strings.Contains(got, w) {
					t.Errorf("brief has %q:\n%s", w, got)
				}
			}
		})
	}
}

func TestBriefCapsTracks(t *testing.T) {
	var ts []TrackResult
	for i := range 60 { // all shown, under briefTracks
		ts = append(ts, TrackResult{Track: Track{Title: fmt.Sprintf("Song %d", i)}})
	}
	got := Brief(Snapshot{Mix: Mix{Source: Source{Kind: KindPlaylist}}, Tracks: ts}, "")
	if !strings.Contains(got, "Tracks (60):") || !strings.Contains(got, "Song 59") {
		t.Errorf("brief:\n%s", got)
	}
}

func TestParseIdeas(t *testing.T) {
	six := `{"text":"motel pool with one leaf","angle":"place"},{"text":"heat shimmer on a road","angle":"light"},` +
		`{"text":"frost on a car window","angle":"Texture"},{"text":"a ferry wake at dusk","angle":"motion"}`
	tests := []struct {
		name    string
		raw     string
		texts   []string
		palette []string
		wantErr bool
	}{
		{"plain", `{"palette":["#112233","#AABBCC","red","#12345"],"queries":[` + six + `]}`,
			[]string{"motel pool with one leaf", "heat shimmer on a road", "frost on a car window", "a ferry wake at dusk"},
			[]string{"#112233", "#aabbcc"}, false},
		{"fenced", "```json\n{\"queries\":[" + six + "]}\n```",
			[]string{"motel pool with one leaf", "heat shimmer on a road", "frost on a car window", "a ferry wake at dusk"},
			nil, false},
		{"drops banned, short, long and duplicate", `{"queries":[` + six + `,
			{"text":"Motel pool with one leaf"},{"text":"red roses on a table"},{"text":"fog"},
			{"text":"one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen"},
			"bare string query here",{"text":"crowd at a concert."}]}`,
			[]string{"motel pool with one leaf", "heat shimmer on a road", "frost on a car window", "a ferry wake at dusk",
				"bare string query here"}, nil, false},
		{"too few", `{"queries":[{"text":"motel pool at night"},{"text":"fog on a lake"}]}`, nil, nil, true},
		{"not json", `sorry, I can't`, nil, nil, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseIdeas(tt.raw)
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v", err)
			}
			var texts []string
			for _, q := range got.Queries {
				texts = append(texts, q.Text)
			}
			if !slices.Equal(texts, tt.texts) || !slices.Equal(got.Palette, tt.palette) {
				t.Errorf("got %q %q, want %q %q", texts, got.Palette, tt.texts, tt.palette)
			}
		})
	}
	got, _ := ParseIdeas(`{"queries":[` + six + `,{"text":"no kind given here"}]}`)
	if got.Queries[2].Angle != "texture" || got.Queries[4].Angle != "other" {
		t.Errorf("kinds %+v", got.Queries)
	}
}

func TestParseIdeasDemotesStock(t *testing.T) {
	got, err := ParseIdeas(`{"queries":["neon sign reflected on wet asphalt","a payphone at midnight",` +
		`"stacked plastic chairs on a boardwalk","grain silos in a wheat field at noon",` +
		`"rain-streaked bus window at dusk","motel pool with one floating leaf"]}`)
	if err != nil {
		t.Fatal(err)
	}
	var texts []string
	for _, q := range got.Queries {
		texts = append(texts, q.Text)
	}
	want := []string{"stacked plastic chairs on a boardwalk", "grain silos in a wheat field at noon",
		"motel pool with one floating leaf", "neon sign reflected on wet asphalt", "a payphone at midnight",
		"rain-streaked bus window at dusk"}
	if !slices.Equal(texts, want) {
		t.Errorf("got %q, want %q", texts, want)
	}
}

func testIdeas(n int) Ideas {
	var is Ideas
	for i := range n {
		is.Queries = append(is.Queries, Idea{Text: fmt.Sprintf("idea number %d", i), Angle: []string{"place", "light"}[i%2]})
	}
	return is
}

func TestIdeaScenes(t *testing.T) {
	qs := IdeaScenes(testIdeas(12), "mix1", "snow at dawn", false)
	if len(qs) != 1+maxIdeaQueries || qs[0].Lens != LensVibe || qs[0].Text != "snow at dawn" {
		t.Fatalf("queries %+v", qs)
	}
	for i, q := range qs[1:] {
		hero := i < heroIdeas
		if q.Lens != LensIdea || q.Text != fmt.Sprintf("idea number %d", i) ||
			(q.Cap == heroCap) != hero || (q.Weight > 0.9) != hero {
			t.Errorf("query %d: %+v", i, q)
		}
	}
	if qs[1].Source != "place" {
		t.Errorf("angle %q", qs[1].Source)
	}

	a := IdeaScenes(testIdeas(12), "mix1#7", "", true)
	b := IdeaScenes(testIdeas(12), "mix1#8", "", true)
	if slices.EqualFunc(a[:heroIdeas], b[:heroIdeas], func(x, y SceneQuery) bool { return x.Text == y.Text }) {
		t.Errorf("shuffles with different seeds have the same heroes: %+v", a[:heroIdeas])
	}
	if again := IdeaScenes(testIdeas(12), "mix1#7", "", true); !slices.Equal(a, again) {
		t.Error("the same seed should pick the same ideas")
	}
	if few := IdeaScenes(testIdeas(4), "mix1", "", false); len(few) != 4 {
		t.Errorf("4 ideas gave %d queries", len(few))
	}
}

// fakeMuse replies with reply, or fails, and counts calls.
type fakeMuse struct {
	reply string
	err   error

	mu    sync.Mutex
	calls int
	user  string
}

func (f *fakeMuse) Complete(_ context.Context, system, user string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	f.user = user
	if system == "" {
		return "", errors.New("no system prompt")
	}
	return f.reply, f.err
}

func TestCoversWithMuse(t *testing.T) {
	var ps []Photo
	for i := range 20 {
		ps = append(ps, photo(i+1, 1440, 1080, "#2a4d7a"))
	}
	reply := `{"palette":["#101820","#203040","#405060","#708090","#c0d0e0"],"queries":[` +
		`{"text":"empty ferry deck in fog","angle":"place"},{"text":"frost on a bus window","angle":"texture"},` +
		`{"text":"streetlight halo in snow","angle":"light"},{"text":"a single swan on black water","angle":"object"},` +
		`{"text":"long exposure of a night train","angle":"motion"},{"text":"overcast beach in winter","angle":"weather"},` +
		`{"text":"curtain moving in an open window","angle":"motion"}]}`
	ctx := context.Background()
	snap := coverSnapshot(10, StatusRunning)

	t.Run("ideas lead and are cached", func(t *testing.T) {
		muse := &fakeMuse{reply: reply}
		ph := &fakePhotos{photos: ps, keywords: map[string]int{"piano": 300}}
		c := NewCovers(ph, 0)
		c.UseMuse(muse, "")
		set, err := c.ForMix(ctx, snap, "", 0)
		if err != nil {
			t.Fatal(err)
		}
		if set.Queries[0] != "empty ferry deck in fog" || slices.Contains(set.Queries, "piano") ||
			len(set.Queries) != 7 {
			t.Errorf("queries %q", set.Queries)
		}
		if set.Palette[0] != "#101820" {
			t.Errorf("palette %v should be the llm's", set.Palette)
		}
		if len(ph.lookups) != 0 {
			t.Errorf("keyword lookups %v with ideas", ph.lookups)
		}
		if !strings.Contains(muse.user, "Peaceful Piano") {
			t.Errorf("brief %q", muse.user)
		}
		if muse.calls != 2 {
			t.Errorf("a 7-query reply should be asked again once: %d calls", muse.calls)
		}
		shuffled, err := c.ForMix(ctx, snap, "", 3)
		if err != nil || muse.calls != 2 {
			t.Fatalf("shuffle: %v after %d llm calls", err, muse.calls)
		}
		if slices.Equal(shuffled.Queries, set.Queries) {
			t.Errorf("shuffle kept the same queries %q", set.Queries)
		}
		if _, err := c.ForMix(ctx, snap, "fog", 0); err != nil || muse.calls != 4 {
			t.Errorf("a new vibe should ask again: %v after %d calls", err, muse.calls)
		}
	})

	for _, tt := range []struct {
		name string
		muse *fakeMuse
	}{
		{"llm error", &fakeMuse{err: ErrUpstream}},
		{"unusable reply", &fakeMuse{reply: `{"queries":[]}`}},
	} {
		t.Run(tt.name+" falls back to scenes", func(t *testing.T) {
			c := NewCovers(&fakePhotos{photos: ps, keywords: map[string]int{"piano": 300}}, 0)
			c.UseMuse(tt.muse, "")
			set, err := c.ForMix(ctx, snap, "", 0)
			if err != nil || !slices.Contains(set.Queries, "piano") || len(set.Queries) != 7 {
				t.Errorf("err %v, queries %q", err, set.Queries)
			}
			if _, err := c.ForMix(ctx, snap, "", 1); err != nil || tt.muse.calls != 4 {
				t.Errorf("failures are retried once and not cached: %v after %d calls", err, tt.muse.calls)
			}
		})
	}
}
