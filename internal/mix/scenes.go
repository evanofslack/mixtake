package mix

import (
	_ "embed"
	"encoding/json"
	"hash/fnv"
	"slices"
	"strings"
	"unicode"
)

// Scene sources, which say where a query came from.
const (
	SceneVibe     = "vibe"
	SceneGenre    = "genre"
	SceneModifier = "modifier"
	SceneQuadrant = "quadrant"
	SceneName     = "name"
)

// maxQueries is how many analogdb searches a mix's covers use.
const maxQueries = 3

// SceneQuery is one analogdb search for a mix's covers, with how much its results count.
type SceneQuery struct {
	Text   string
	Source string // SceneVibe, SceneGenre, …
	Weight float64
}

//go:embed scenes.json
var scenesJSON []byte

// sceneBook is scenes.json: caption-style sentences that analogdb's text search matches well.
type sceneBook struct {
	Quadrants map[Quadrant][]string `json:"quadrants"`
	Modifiers []struct {
		Name   string   `json:"name"`
		Field  string   `json:"field"` // an Averages field: acoustic, instrumental or party
		Min    float64  `json:"min"`
		Scenes []string `json:"scenes"`
	} `json:"modifiers"`
	// Families group discogs genres. A genre matches the first family listing its style, or
	// else the first listing its parent.
	Families []struct {
		Name    string   `json:"name"`
		Parents []string `json:"parents"`
		Styles  []string `json:"styles"`
		Scenes  []string `json:"scenes"`
	} `json:"families"`
	Stopwords []string `json:"stopwords"`
}

var scenes = func() sceneBook {
	var b sceneBook
	if err := json.Unmarshal(scenesJSON, &b); err != nil {
		panic("mix: scenes.json: " + err.Error())
	}
	return b
}()

// familyShare is the share of the genre weight a family needs to add its scene.
const familyShare = 0.3

// Scenes picks up to three searches for a mix: the vibe verbatim when there is one, a scene for
// the dominant genre family or a strong acoustic, instrumental or party score, a scene for the
// mood quadrant, and the playlist-name keywords. Choices among sentences are seeded by mixID, so
// a mix always gets the same queries while mixes in the same quadrant vary.
func Scenes(p Profile, mixID, vibe string, nameKeywords []string) []SceneQuery {
	var qs []SceneQuery
	add := func(text, source string, weight float64) {
		for _, q := range qs {
			if q.Text == text {
				return
			}
		}
		if text != "" && len(qs) < maxQueries {
			qs = append(qs, SceneQuery{Text: text, Source: source, Weight: weight})
		}
	}
	if vibe = strings.TrimSpace(vibe); vibe != "" {
		add(vibe, SceneVibe, 1.2)
	}
	family := dominantFamily(p.Genres)
	modifier := strongModifier(p.Averages)
	quadrant := scenes.Quadrants[p.Quadrant]
	switch {
	case family != "":
		add(pick(familyScenes(family), mixID, "genre"), SceneGenre, 0.9)
	case modifier != "":
		add(pick(modifierScenes(modifier), mixID, "modifier"), SceneModifier, 0.8)
	}
	add(pick(quadrant, mixID, "quadrant"), SceneQuadrant, 1)
	if len(nameKeywords) > 0 {
		add(strings.Join(nameKeywords, " "), SceneName, 0.7)
	}
	if family != "" && modifier != "" {
		add(pick(modifierScenes(modifier), mixID, "modifier"), SceneModifier, 0.8)
	}
	// a second quadrant scene fills any slot left
	var rest []string
	for _, s := range quadrant {
		if !slices.ContainsFunc(qs, func(q SceneQuery) bool { return q.Text == s }) {
			rest = append(rest, s)
		}
	}
	add(pick(rest, mixID, "quadrant2"), SceneQuadrant, 0.9)
	return qs
}

// pick chooses a sentence deterministically from mixID and slot.
func pick(list []string, mixID, slot string) string {
	if len(list) == 0 {
		return ""
	}
	h := fnv.New32a()
	h.Write([]byte(mixID + "|" + slot))
	return list[h.Sum32()%uint32(len(list))]
}

// GenreFamily is the scenes.json family of a discogs genre such as "Electronic---Ambient", or "".
func GenreFamily(genre string) string {
	parent, style, _ := strings.Cut(genre, "---")
	for _, f := range scenes.Families {
		for _, s := range f.Styles {
			if s == style {
				return f.Name
			}
		}
	}
	for _, f := range scenes.Families {
		for _, s := range f.Parents {
			if s == parent {
				return f.Name
			}
		}
	}
	return ""
}

// dominantFamily is the family holding the most genre weight, if it has at least familyShare of
// it and some scenes.
func dominantFamily(genres []Genre) string {
	weights := map[string]float64{}
	var total float64
	for _, g := range genres {
		total += g.Score
		if f := GenreFamily(g.Name); f != "" {
			weights[f] += g.Score
		}
	}
	best, bestW := "", 0.0
	for _, f := range scenes.Families { // in file order, so ties are deterministic
		if w := weights[f.Name]; w > bestW {
			best, bestW = f.Name, w
		}
	}
	if total == 0 || bestW/total < familyShare || len(familyScenes(best)) == 0 {
		return ""
	}
	return best
}

func familyScenes(name string) []string {
	for _, f := range scenes.Families {
		if f.Name == name {
			return f.Scenes
		}
	}
	return nil
}

// strongModifier is the modifier whose score is furthest above its threshold, or "".
func strongModifier(a Averages) string {
	values := map[string]float64{"acoustic": a.Acoustic, "instrumental": a.Instrumental, "party": a.Party}
	best, bestOver := "", 0.0
	for _, m := range scenes.Modifiers {
		if over := values[m.Field] - m.Min; over >= 0 && (best == "" || over > bestOver) {
			best, bestOver = m.Name, over
		}
	}
	return best
}

func modifierScenes(name string) []string {
	for _, m := range scenes.Modifiers {
		if m.Name == name {
			return m.Scenes
		}
	}
	return nil
}

// NameWords splits a playlist or album name into lowercase words worth checking as analogdb
// keywords: at least three letters, not a stopword, at most four.
func NameWords(name string) []string {
	stop := map[string]bool{}
	for _, w := range scenes.Stopwords {
		stop[w] = true
	}
	var words []string
	seen := map[string]bool{}
	for _, w := range strings.FieldsFunc(strings.ToLower(name), func(r rune) bool {
		return !unicode.IsLetter(r)
	}) {
		if len([]rune(w)) < 3 || stop[w] || seen[w] {
			continue
		}
		seen[w] = true
		words = append(words, w)
		if len(words) == 4 {
			break
		}
	}
	return words
}
