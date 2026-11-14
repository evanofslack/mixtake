package mix

import (
	"cmp"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"unicode"
)

// Cover ideas are analogdb queries and a palette written by an LLM from a brief about the mix,
// so each mix gets its own imagery instead of sentences shared by every mix in its quadrant.

//go:embed ideas_prompt.txt
var defaultIdeasPrompt string

// DefaultIdeasPrompt is the system prompt for cover ideas, used when no prompt file is set.
func DefaultIdeasPrompt() string { return defaultIdeasPrompt }

const (
	briefTracks    = 100 // track lines in a brief
	briefArtists   = 12
	briefGenres    = 5
	minIdeas       = 4 // fewer usable queries than this and the canned scenes are used
	minIdeaWords   = 2
	maxIdeaWords   = 14
	minIdeaPalette = 3 // colours an LLM palette needs to replace TargetPalette
)

// Idea is one LLM-written analogdb query and the angle on the record it comes from.
type Idea struct {
	Text  string `json:"text"`
	Angle string `json:"angle"`
	// From is what in the brief led to it: songs, artists, the name or the era.
	From string `json:"from"`
}

// Ideas are an LLM's reading of a mix, its queries (best first) and a palette for the covers.
type Ideas struct {
	Read    string   `json:"read"`
	Queries []Idea   `json:"queries"`
	Palette []string `json:"palette"`
}

// bannedIdeaWords are subjects that make poor covers or that analogdb can't show well, dropped
// from LLM queries in case the prompt is ignored.
var bannedIdeaWords = set([]string{
	"concert", "concerts", "stage", "microphone", "headphones", "speaker", "speakers", "vinyl",
	"record", "records", "turntable", "guitar", "piano", "drums", "studio", "logo", "logos",
	"text", "album", "flowers", "flower", "roses", "petals", "bouquet", "hearts",
})

// stockImages are what LLMs write for every record despite the prompt: each entry is a set of
// words that all appear in a stock query. stockIdea matches them.
var stockImages = [][]string{
	{"neon", "wet"}, {"neon", "rain"}, {"neon", "puddle"}, {"rain-streaked"}, {"rain-slicked"},
	{"light", "trails"}, {"payphone"}, {"lone", "streetlamp"}, {"single", "streetlamp"},
	{"single", "streetlight"}, {"lone", "streetlight"}, {"walking", "away"}, {"graffiti"},
	{"headlights", "long", "exposure"}, {"diner", "booth"},
}

// stockIdea reports whether a query is one of the stockImages.
func stockIdea(text string) bool {
	words := set(strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return r != '-' && !unicode.IsLetter(r)
	}))
	return slices.ContainsFunc(stockImages, func(stock []string) bool {
		return !slices.ContainsFunc(stock, func(w string) bool { return !words[w] })
	})
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

// Brief describes a mix for the cover ideas prompt. The tracklist comes first, with each
// track's artist and year, since that is where a record's character is; the audio analysis
// comes last and is marked approximate, because its genres are often wrong. vibe is the
// listener's own words, if any.
func Brief(snap Snapshot, vibe string) string {
	var b strings.Builder
	src := snap.Mix.Source
	kind := string(src.Kind)
	if src.Kind == KindTracks {
		kind = "a hand-picked set of tracks"
	}
	fmt.Fprintf(&b, "Type: %s\n", kind)
	if src.Name != "" {
		fmt.Fprintf(&b, "Name: %s\n", src.Name)
	}
	if src.Subtitle != "" {
		label := "By"
		if src.Kind == KindPlaylist {
			label = "Curated by"
		}
		fmt.Fprintf(&b, "%s: %s\n", label, src.Subtitle)
	}
	if v := strings.TrimSpace(vibe); v != "" {
		fmt.Fprintf(&b, "The listener describes the vibe as: %s\n", v)
	}
	if years := releaseYears(snap.Tracks); years != "" {
		fmt.Fprintf(&b, "Released: %s\n", years)
	}
	if n := len(snap.Tracks); n > 0 {
		fmt.Fprintf(&b, "\nTracks (%d", n)
		if n > briefTracks {
			fmt.Fprintf(&b, ", first %d shown", briefTracks)
		}
		b.WriteString("):\n")
		for _, t := range snap.Tracks[:min(n, briefTracks)] {
			title := strings.TrimSpace(cleanTitle(t.Track.Title))
			if title == "" {
				title = t.Track.Title
			}
			b.WriteString("- " + title)
			if len(t.Track.Artists) > 0 && src.Kind != KindAlbum {
				b.WriteString(" — " + t.Track.Artists[0].Name)
			}
			if y := t.Track.ReleaseDate; len(y) >= 4 && src.Kind != KindAlbum {
				b.WriteString(" (" + y[:4] + ")")
			}
			b.WriteString("\n")
		}
	}
	p := snap.Profile
	if p == nil {
		return b.String()
	}
	if len(p.Artists) > 1 && src.Kind != KindAlbum {
		var as []string
		for _, a := range p.Artists[:min(len(p.Artists), briefArtists)] {
			as = append(as, fmt.Sprintf("%s (%d)", a.Name, a.Count))
		}
		fmt.Fprintf(&b, "\nMost tracks by: %s\n", strings.Join(as, ", "))
	}
	b.WriteString("\nApproximate audio analysis (a classifier; trust the tracklist over it):\n")
	if len(p.Genres) > 0 {
		var gs []string
		for _, g := range p.Genres[:min(len(p.Genres), briefGenres)] {
			gs = append(gs, strings.ReplaceAll(g.Name, "---", " / "))
		}
		fmt.Fprintf(&b, "- Genre guesses: %s\n", strings.Join(gs, "; "))
	}
	if p.Summary != "" {
		a := p.Averages
		fmt.Fprintf(&b, "- Sound: %s. Mood %.2f (0 sad, 1 happy), energy %.2f (0 calm, 1 intense), about %.0f BPM",
			strings.ToLower(p.Summary[:1])+p.Summary[1:], a.Mood, a.Energy, a.Tempo)
		if a.Acoustic >= 0.6 {
			b.WriteString(", mostly acoustic")
		}
		if a.Instrumental >= 0.7 {
			b.WriteString(", mostly instrumental")
		}
		if a.Danceable >= 0.7 {
			b.WriteString(", danceable")
		}
		b.WriteString(".\n")
	}
	return b.String()
}

// releaseYears is the span of the tracks' release years, such as "1959" or "1994–2003".
func releaseYears(ts []TrackResult) string {
	lo, hi := "", ""
	for _, t := range ts {
		y := t.Track.ReleaseDate
		if len(y) < 4 {
			continue
		}
		y = y[:4]
		if lo == "" || y < lo {
			lo = y
		}
		if y > hi {
			hi = y
		}
	}
	if lo == hi {
		return lo
	}
	return lo + "–" + hi
}

// ParseIdeas reads an LLM's reply: JSON, possibly in a code fence. It keeps queries of
// minIdeaWords to maxIdeaWords words without banned subjects, once each, and palette colours
// that are "#rrggbb". It fails when fewer than minIdeas queries are left.
func ParseIdeas(raw string) (Ideas, error) {
	raw = strings.TrimSpace(raw)
	if i, j := strings.Index(raw, "{"), strings.LastIndex(raw, "}"); i >= 0 && j > i {
		raw = raw[i : j+1]
	}
	var in struct {
		Read    string            `json:"read"`
		Queries []json.RawMessage `json:"queries"`
		Palette []string          `json:"palette"`
	}
	if err := json.Unmarshal([]byte(raw), &in); err != nil {
		return Ideas{}, fmt.Errorf("cover ideas: %w", err)
	}
	out := Ideas{Read: strings.TrimSpace(in.Read)}
	for _, q := range in.Queries {
		var idea Idea
		if err := json.Unmarshal(q, &idea); err != nil {
			// a bare string is fine too
			if json.Unmarshal(q, &idea.Text) != nil {
				continue
			}
		}
		idea.Text = strings.Join(strings.Fields(strings.Trim(idea.Text, ` "'.`)), " ")
		idea.Angle = strings.ToLower(strings.TrimSpace(idea.Angle))
		idea.From = strings.TrimSpace(idea.From)
		if idea.Angle == "" {
			idea.Angle = "other"
		}
		words := strings.Fields(strings.ToLower(idea.Text))
		if len(words) < minIdeaWords || len(words) > maxIdeaWords ||
			slices.ContainsFunc(words, func(w string) bool {
				return bannedIdeaWords[strings.Trim(w, ",.;:!?'\"()")]
			}) ||
			slices.ContainsFunc(out.Queries, func(o Idea) bool { return strings.EqualFold(o.Text, idea.Text) }) {
			continue
		}
		out.Queries = append(out.Queries, idea)
	}
	for _, c := range in.Palette {
		c = strings.ToLower(strings.TrimSpace(c))
		if _, ok := hexLab(c); ok && strings.HasPrefix(c, "#") {
			out.Palette = append(out.Palette, c)
		}
	}
	// stock images go last, so they are the first left out of a set
	slices.SortStableFunc(out.Queries, func(a, b Idea) int {
		return cmp.Compare(b2i(stockIdea(a.Text)), b2i(stockIdea(b.Text)))
	})
	if len(out.Queries) < minIdeas {
		return Ideas{}, errors.New("cover ideas: too few usable queries")
	}
	return out, nil
}
