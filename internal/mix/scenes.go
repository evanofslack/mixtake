package mix

import (
	_ "embed"
	"encoding/json"
	"hash/fnv"
	"slices"
	"strconv"
	"strings"
	"unicode"
)

// Lenses are the kinds of image a mix's cover searches look for, so a set of covers spans more
// than one literal scene.
const (
	LensVibe     = "vibe"     // the user's vibe text, verbatim
	LensLiteral  = "literal"  // a scene for the genre family, mood quadrant or a strong modifier
	LensAbstract = "abstract" // light, texture, colour fields, blur, reflections, silhouettes
	LensWords    = "words"    // an evocative word from the track titles or the playlist name
	LensColor    = "color"    // photos with the target palette's colour and a keyword
)

// Sources of literal scenes.
const (
	SceneGenre    = "genre"
	SceneModifier = "modifier"
	SceneQuadrant = "quadrant"
)

const (
	// sceneQueries is how many searches a mix's covers use, besides the vibe.
	sceneQueries = 7
	// maxWords is how many title or name words become searches.
	maxWords = 2
	// wordCandidates is how many title or name words TitleWords offers.
	wordCandidates = 5
	// manyTitles is how many titles make a single mention of a word too weak to search for.
	manyTitles = 20
)

// SceneQuery is one analogdb search for a mix's covers, with how much its results count.
type SceneQuery struct {
	Text   string // the search text; for colour queries, the colour and keyword
	Lens   string // LensVibe, LensLiteral, …
	Source string // for literal scenes: SceneGenre, SceneModifier or SceneQuadrant
	Weight float64
	// Color and Keyword are set for LensColor queries, which list photos by colour.
	Color, Keyword string
}

//go:embed scenes.json
var scenesJSON []byte

// sceneBook is scenes.json: caption-style sentences that analogdb's text search matches well.
type sceneBook struct {
	Quadrants map[Quadrant]struct {
		Literal  []string `json:"literal"`
		Abstract []string `json:"abstract"`
	} `json:"quadrants"`
	// Colors are keywords to pair with each analogdb colour, each with plenty of posts in that
	// colour; colour alone gives clutter.
	Colors    map[string][]string `json:"colors"`
	Modifiers []struct {
		Name   string   `json:"name"`
		Field  string   `json:"field"` // an Averages field: acoustic, instrumental or party
		Min    float64  `json:"min"`
		Scenes []string `json:"scenes"`
	} `json:"modifiers"`
	// Families group discogs genres. A genre matches the first family listing its style, or
	// else the first listing its parent.
	Families []struct {
		Name     string   `json:"name"`
		Parents  []string `json:"parents"`
		Styles   []string `json:"styles"`
		Happy    []string `json:"happy"` // scenes for mood ≥ 0.5
		Sad      []string `json:"sad"`
		Abstract []string `json:"abstract"`
	} `json:"families"`
	// Stopwords are never searched for from titles or names.
	Stopwords []string `json:"stopwords"`
	// TitleWords are evocative analogdb keywords (each with plenty of posts), preferred when they
	// appear in titles and searched without checking their count.
	TitleWords []string `json:"title_words"`
}

var (
	scenes = func() sceneBook {
		var b sceneBook
		if err := json.Unmarshal(scenesJSON, &b); err != nil {
			panic("mix: scenes.json: " + err.Error())
		}
		return b
	}()
	stopwords = set(scenes.Stopwords)
	evocative = set(scenes.TitleWords)
)

func set(words []string) map[string]bool {
	m := make(map[string]bool, len(words))
	for _, w := range words {
		m[w] = true
	}
	return m
}

// familyShare is the share of the genre weight a family needs to add its scenes.
const familyShare = 0.3

// SeedKey is what scene picks and jitter are seeded with: the mix id, plus the shuffle seed when
// it isn't 0.
func SeedKey(mixID string, seed int) string {
	if seed == 0 {
		return mixID
	}
	return mixID + "#" + strconv.Itoa(seed)
}

// Scenes picks the searches for a mix's covers from several lenses, so the set mixes literal
// scenes with abstract and textural ones:
//
//   - the vibe verbatim, first, when there is one;
//   - literal scenes: two for the dominant genre family (split by mood) then the mood quadrant's;
//     without a family, a strong acoustic, instrumental or party modifier's alternating with the
//     quadrant's;
//   - abstract scenes: the family's, then the quadrant's;
//   - up to two title or name words (already checked to be analogdb keywords);
//   - one colour query: the target palette's colour with a keyword for that colour.
//
// There are sceneQueries besides the vibe, interleaved by lens. A genre family sets the literal
// scene better than the quadrant does (hip hop at mood 0.6 is a city at sunset, not a picnic).
// Choices are seeded by key (see SeedKey), so a mix always gets the same queries while mixes in
// the same quadrant, or the same mix with another seed, vary.
func Scenes(p Profile, key, vibe string, words []string) []SceneQuery {
	var qs []SceneQuery
	add := func(q SceneQuery) {
		if q.Text != "" && !slices.ContainsFunc(qs, func(o SceneQuery) bool { return o.Text == q.Text }) {
			qs = append(qs, q)
		}
	}
	// next picks a sentence from list that isn't a query yet
	next := func(list []string, slot string) string {
		rest := slices.DeleteFunc(slices.Clone(list), func(s string) bool {
			return slices.ContainsFunc(qs, func(q SceneQuery) bool { return q.Text == s })
		})
		return pick(rest, key, slot)
	}
	if vibe = strings.TrimSpace(vibe); vibe != "" {
		add(SceneQuery{Text: vibe, Lens: LensVibe, Weight: 1.2})
	}
	fam := family(dominantFamily(p.Genres))
	famLiteral := fam.Sad
	if p.Averages.Mood >= 0.5 {
		famLiteral = fam.Happy
	}
	quad := scenes.Quadrants[p.Quadrant]
	modifier := modifierScenes(strongModifier(p.Averages))

	// the sources of the first, second and third literal scenes
	type source struct {
		list []string
		name string
	}
	genre, mod, quadrant := source{famLiteral, SceneGenre}, source{modifier, SceneModifier},
		source{quad.Literal, SceneQuadrant}
	literals := []source{quadrant, quadrant, quadrant}
	switch {
	case len(famLiteral) > 0: // a family's scenes fit better than a modifier's
		literals = []source{genre, genre, quadrant}
	case len(modifier) > 0:
		literals = []source{mod, quadrant, mod}
	}
	nLiteral := 0
	literal := func(weight float64) {
		s := literals[min(nLiteral, len(literals)-1)]
		nLiteral++
		add(SceneQuery{Text: next(s.list, "literal"+strconv.Itoa(nLiteral)), Lens: LensLiteral,
			Source: s.name, Weight: weight})
	}
	abstracts := [][]string{quad.Abstract}
	if len(fam.Abstract) > 0 {
		abstracts = [][]string{fam.Abstract, quad.Abstract}
	}
	nAbstract := 0
	abstract := func(weight float64) {
		list := abstracts[nAbstract%len(abstracts)]
		nAbstract++
		add(SceneQuery{Text: next(list, "abstract"+strconv.Itoa(nAbstract)), Lens: LensAbstract,
			Weight: weight})
	}
	word := func(i int) {
		if i < min(len(words), maxWords) {
			add(SceneQuery{Text: words[i], Lens: LensWords, Weight: 0.95})
		}
	}
	color := ColorName(p.Averages)
	keyword := pick(scenes.Colors[color], key, "color")

	literal(1)
	abstract(1)
	word(0)
	literal(0.9)
	abstract(0.9)
	if color != "" && keyword != "" {
		add(SceneQuery{Text: color + " " + keyword, Lens: LensColor, Weight: 0.85, Color: color,
			Keyword: keyword})
	}
	word(1)
	target := sceneQueries
	if vibe != "" {
		target++
	}
	for i := 0; len(qs) < target && i < 4; i++ {
		if i%2 == 0 {
			literal(0.8)
		} else {
			abstract(0.8)
		}
	}
	return qs
}

// pick chooses a sentence deterministically from key and slot.
func pick(list []string, key, slot string) string {
	if len(list) == 0 {
		return ""
	}
	return list[hash(key+"|"+slot)%uint32(len(list))]
}

func hash(s string) uint32 {
	h := fnv.New32a()
	h.Write([]byte(s))
	return h.Sum32()
}

// ColorName is the analogdb colour name nearest the target palette's hue (see TargetPalette):
// golden to orange-red for happy mixes as energy rises, and grey, navy, then purple for sad ones.
// The calmest sad mixes get grey, since analogdb's navy includes bright tropical blues.
func ColorName(a Averages) string {
	if a.Mood >= 0.5 {
		switch {
		case a.Energy >= 0.8:
			return "red"
		case a.Energy >= 0.45:
			return "orange"
		case a.Energy >= 0.2:
			return "yellow"
		}
		return "tan"
	}
	switch {
	case a.Energy >= 0.6:
		return "purple"
	case a.Energy >= 0.25:
		return "navy"
	}
	return "gray"
}

// GenreFamily is the scenes.json family of a discogs genre such as "Electronic---Ambient", or "".
func GenreFamily(genre string) string {
	parent, style, _ := strings.Cut(genre, "---")
	for _, f := range scenes.Families {
		if slices.Contains(f.Styles, style) {
			return f.Name
		}
	}
	for _, f := range scenes.Families {
		if slices.Contains(f.Parents, parent) {
			return f.Name
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
	if total == 0 || bestW/total < familyShare || len(family(best).Happy) == 0 {
		return ""
	}
	return best
}

// family is a family's scenes, or none.
func family(name string) (f struct{ Happy, Sad, Abstract []string }) {
	for _, fam := range scenes.Families {
		if fam.Name == name {
			f.Happy, f.Sad, f.Abstract = fam.Happy, fam.Sad, fam.Abstract
		}
	}
	return f
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

// TitleWords returns up to wordCandidates words from track titles and a playlist or album name
// that might make good searches, best first. A word counts once per title it appears in, and
// more for being in the name or on the evocative title_words list. Words must be in the name or
// in two titles, except that evocative words in one title count for short albums (fewer than
// manyTitles titles): in a 100-track playlist "Midnight Sun" alone says little. The caller checks
// that words which aren't evocative are analogdb keywords. Ties are broken by key, so shuffling
// can change which words are used.
func TitleWords(name string, titles []string, key string) []string {
	type word struct {
		titles int
		name   bool
	}
	words := map[string]*word{}
	count := func(text string, inName bool) {
		seen := map[string]bool{}
		for _, w := range splitWords(text) {
			if seen[w] {
				continue
			}
			seen[w] = true
			if words[w] == nil {
				words[w] = &word{}
			}
			if inName {
				words[w].name = true
			} else {
				words[w].titles++
			}
		}
	}
	count(name, true)
	for _, t := range titles {
		count(cleanTitle(t), false)
	}
	score := func(w string) float64 {
		s := float64(words[w].titles)
		if words[w].name {
			s += 2
		}
		if evocative[w] {
			s += 1.5
		}
		return s
	}
	var out []string
	for w, c := range words {
		if c.name || c.titles >= 2 || (evocative[w] && len(titles) < manyTitles) {
			out = append(out, w)
		}
	}
	slices.SortFunc(out, func(a, b string) int {
		if sa, sb := score(a), score(b); sa != sb {
			if sa > sb {
				return -1
			}
			return 1
		}
		if ha, hb := hash(key+"|"+a), hash(key+"|"+b); ha != hb {
			if ha < hb {
				return -1
			}
			return 1
		}
		return strings.Compare(a, b)
	})
	return out[:min(len(out), wordCandidates)]
}

// cleanTitle drops what isn't the song's name: "(feat. …)", "[Remix]", " - Remastered 2009".
func cleanTitle(t string) string {
	t, _, _ = strings.Cut(t, " - ")
	var b strings.Builder
	depth := 0
	for _, r := range t {
		switch r {
		case '(', '[':
			depth++
		case ')', ']':
			depth = max(0, depth-1)
		default:
			if depth == 0 {
				b.WriteRune(r)
			}
		}
	}
	return b.String()
}

// splitWords splits text into lowercase words of at least three letters that aren't stopwords,
// with plurals of evocative words made singular ("Nights" is "night").
func splitWords(text string) []string {
	var out []string
	for _, w := range strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return !unicode.IsLetter(r)
	}) {
		if s, ok := strings.CutSuffix(w, "s"); ok && evocative[s] {
			w = s
		}
		if len([]rune(w)) >= 3 && !stopwords[w] {
			out = append(out, w)
		}
	}
	return out
}
