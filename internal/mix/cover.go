package mix

import (
	"cmp"
	"fmt"
	"math"
	"regexp"
	"slices"
	"strconv"
	"strings"
)

// Cover photo filters: a high resolution image at least this long on its long side, with an
// aspect ratio (width / height) in this range, so a square crop still looks good.
const (
	minLongSide = 1440
	minAspect   = 0.66
	maxAspect   = 1.5
	// CoverCount is how many photos a PhotoSet holds.
	CoverCount = 12
)

// Ranking weights. They sum to 1, so a score is 0–1.
const (
	rankWeight   = 0.55
	colourWeight = 0.3
	votesWeight  = 0.1
	jitterWeight = 0.05
	votesCap     = 3000 // upvotes beyond this don't count for more
	colourScale  = 30   // ΔE at which colour similarity falls to 1/e
)

// imageName matches analogdb image file names: a uuid, or (older posts) 24 hex digits and the
// resolution.
var imageName = regexp.MustCompile(
	`^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24}-(?:low|medium|high|raw))\.(?:jpeg|jpg|png)$`)

// ValidImageName reports whether name is an analogdb image file name that /api/img may proxy.
func ValidImageName(name string) bool { return imageName.MatchString(name) }

// ImageProxyPath is where the API serves an analogdb image.
func ImageProxyPath(name string) string { return "/api/img/" + name }

// imageFile returns the file name of an analogdb image URL, if it is valid.
func imageFile(url string) (string, bool) {
	name := url[strings.LastIndexByte(url, '/')+1:]
	return name, ValidImageName(name)
}

// Candidate is a ranked cover photo.
type Candidate struct {
	Photo Photo
	Score float64
	Query int // index of the query that ranked it highest
}

// usable reports whether a photo can be a cover: not nsfw, and a large enough high resolution
// image in a croppable aspect ratio, with a name the proxy will serve.
func usable(p Photo, allowGray bool) bool {
	if p.NSFW || (p.Grayscale && !allowGray) {
		return false
	}
	for _, img := range p.Images {
		if img.Resolution != "high" || img.Height == 0 {
			continue
		}
		aspect := float64(img.Width) / float64(img.Height)
		_, ok := imageFile(img.URL)
		return ok && max(img.Width, img.Height) >= minLongSide && aspect >= minAspect && aspect <= maxAspect
	}
	return false
}

// FilterPhotos keeps usable photos, in order, up to n.
func FilterPhotos(ps []Photo, allowGray bool, n int) []Photo {
	out := []Photo{}
	for _, p := range ps {
		if len(out) < n && usable(p, allowGray) {
			out = append(out, p)
		}
	}
	return out
}

// RankPhotos merges the results of each query (results[i] answered queries[i]), keeps usable
// photos, scores them by search rank, closeness to the profile's palette and upvotes, plus a
// little jitter seeded by key so mixes with the same queries still differ, then picks at most n
// with Diversify. Grayscale photos are only kept for calm, sad mixes.
func RankPhotos(queries []SceneQuery, results [][]Photo, p Profile, key string, n int) []Candidate {
	allowGray := p.Quadrant == QuadrantSadCalm
	targets := labs(TargetPalette(p.Averages))
	type entry struct {
		photo Photo
		rank  float64
		hits  int
		query int
	}
	merged := map[int]*entry{}
	for qi, ps := range results {
		w := 1.0
		if qi < len(queries) {
			w = queries[qi].Weight
		}
		for i, ph := range ps {
			r := w * (1 - float64(i)/float64(len(ps)))
			if e, ok := merged[ph.ID]; ok {
				if r > e.rank {
					e.rank, e.query = r, qi
				}
				e.hits++
				continue
			}
			merged[ph.ID] = &entry{photo: ph, rank: r, hits: 1, query: qi}
		}
	}
	var out []Candidate
	for _, e := range merged {
		if !usable(e.photo, allowGray) {
			continue
		}
		rank := min(1, e.rank/1.2+0.1*float64(e.hits-1))
		votes := min(1, math.Log1p(float64(max(e.photo.Score, 0)))/math.Log1p(votesCap))
		score := rankWeight*rank + colourWeight*colourSimilarity(e.photo.Colors, targets) +
			votesWeight*votes + jitterWeight*jitter(key, e.photo.ID)
		out = append(out, Candidate{Photo: e.photo, Score: score, Query: e.query})
	}
	slices.SortFunc(out, func(a, b Candidate) int {
		return cmp.Or(cmp.Compare(b.Score, a.Score), cmp.Compare(a.Photo.ID, b.Photo.ID))
	})
	return Diversify(out, queries, n)
}

// Diversity rules for a set of covers, so it spans queries and lenses instead of the best dozen
// matches of one scene.
const (
	maxPerQuery   = 2    // photos one query can contribute, while others have photos left
	queryPenalty  = 0.04 // per photo already picked from the same query
	lensPenalty   = 0.03 // per photo already picked from the same lens
	authorPenalty = 0.15 // for each photo already picked by the same author
	lookalike     = 0.75 // palette similarity above which photos count as near-duplicates
	lookPenalty   = 0.6  // per unit of similarity above lookalike
	subjectShare  = 0.3  // keyword overlap (Jaccard) above which photos share a subject
	subjectWeight = 0.3  // per unit of overlap above subjectShare
)

// Diversify picks up to n candidates greedily, like maximal marginal relevance: each step takes
// the best score after penalties for its query and lens already being in the set, for an author
// already in it, and for a palette or analogdb keywords too close to a photo already picked (two
// churches from different queries). A query contributes at most maxPerQuery photos unless
// nothing else is left. cs must be sorted best first; the result is in pick order, so it
// interleaves lenses.
func Diversify(cs []Candidate, queries []SceneQuery, n int) []Candidate {
	lens := func(c Candidate) string {
		if c.Query >= 0 && c.Query < len(queries) {
			return queries[c.Query].Lens
		}
		return ""
	}
	palettes := make([][][3]float64, len(cs))
	for i, c := range cs {
		hexes := make([]string, 0, len(c.Photo.Colors))
		for _, col := range c.Photo.Colors {
			hexes = append(hexes, col.Hex)
		}
		palettes[i] = labs(hexes)
	}
	taken := make([]bool, len(cs))
	var picked []int
	perQuery, perLens, perAuthor := map[int]int{}, map[string]int{}, map[string]int{}
	for capacity := maxPerQuery; len(picked) < min(n, len(cs)); {
		best, bestScore := -1, math.Inf(-1)
		for i, c := range cs {
			if taken[i] || perQuery[c.Query] >= capacity {
				continue
			}
			s := c.Score - queryPenalty*float64(perQuery[c.Query]) - lensPenalty*float64(perLens[lens(c)])
			if c.Photo.Author != "" {
				s -= authorPenalty * float64(perAuthor[c.Photo.Author])
			}
			var sim, overlap float64
			for _, j := range picked {
				sim = max(sim, colourSimilarity(c.Photo.Colors, palettes[j]),
					colourSimilarity(cs[j].Photo.Colors, palettes[i]))
				overlap = max(overlap, jaccard(c.Photo.Keywords, cs[j].Photo.Keywords))
			}
			s -= lookPenalty*max(0, sim-lookalike) + subjectWeight*max(0, overlap-subjectShare)
			if s > bestScore {
				best, bestScore = i, s
			}
		}
		if best < 0 {
			capacity++ // every query left is full
			continue
		}
		taken[best] = true
		picked = append(picked, best)
		perQuery[cs[best].Query]++
		perLens[lens(cs[best])]++
		perAuthor[cs[best].Photo.Author]++
	}
	out := make([]Candidate, 0, len(picked))
	for _, i := range picked {
		out = append(out, cs[i])
	}
	return out
}

// jaccard is the share of keywords two photos have in common, 0–1.
func jaccard(a, b []string) float64 {
	if len(a) == 0 || len(b) == 0 {
		return 0
	}
	shared := 0
	for _, w := range a {
		if slices.Contains(b, w) {
			shared++
		}
	}
	return float64(shared) / float64(len(a)+len(b)-shared)
}

// jitter is a stable pseudo-random number in [0, 1) for a seed key and photo.
func jitter(key string, photoID int) float64 {
	return float64(hash(key+"|"+strconv.Itoa(photoID))) / (1 << 32)
}

// TargetPalette is the colours a mix's cover aims for, as "#rrggbb": a shadow, a mid tone and a
// highlight of one hue. Happy mixes are warm (golden when calm, orange-red when energetic), sad
// ones cool (blue when calm, violet when energetic). Energy raises saturation; mood raises
// lightness.
func TargetPalette(a Averages) []string {
	var hue float64
	if a.Mood >= 0.5 {
		hue = 40 - 25*a.Energy
	} else {
		hue = 210 + 60*a.Energy
	}
	sat := 0.15 + 0.55*a.Energy
	lift := 0.15 * (a.Mood - 0.5)
	return []string{
		hslHex(hue, sat, 0.2+lift),
		hslHex(hue, sat, 0.45+lift),
		hslHex(hue, sat*0.8, 0.7+lift),
	}
}

// colourSimilarity is 0–1: how close a photo's colours, weighted by their share, are to the
// nearest target colour in Lab space.
func colourSimilarity(colors []PhotoColor, targets [][3]float64) float64 {
	var dist, total float64
	for _, c := range colors {
		lab, ok := hexLab(c.Hex)
		if !ok || c.Percent <= 0 {
			continue
		}
		nearest := math.Inf(1)
		for _, t := range targets {
			nearest = min(nearest, math.Sqrt(sq(lab[0]-t[0])+sq(lab[1]-t[1])+sq(lab[2]-t[2])))
		}
		dist += c.Percent * nearest
		total += c.Percent
	}
	if total == 0 || len(targets) == 0 {
		return 0
	}
	return math.Exp(-dist / total / colourScale)
}

func sq(v float64) float64 { return v * v }

func labs(hexes []string) [][3]float64 {
	var out [][3]float64
	for _, h := range hexes {
		if lab, ok := hexLab(h); ok {
			out = append(out, lab)
		}
	}
	return out
}

// hslHex converts hue (degrees), saturation and lightness (0–1) to "#rrggbb".
func hslHex(h, s, l float64) string {
	s, l = clamp01(s), clamp01(l)
	c := (1 - math.Abs(2*l-1)) * s
	hp := math.Mod(math.Mod(h, 360)+360, 360) / 60
	x := c * (1 - math.Abs(math.Mod(hp, 2)-1))
	var r, g, b float64
	switch {
	case hp < 1:
		r, g = c, x
	case hp < 2:
		r, g = x, c
	case hp < 3:
		g, b = c, x
	case hp < 4:
		g, b = x, c
	case hp < 5:
		r, b = x, c
	default:
		r, b = c, x
	}
	m := l - c/2
	to := func(v float64) int { return int(math.Round(clamp01(v+m) * 255)) }
	return fmt.Sprintf("#%02x%02x%02x", to(r), to(g), to(b))
}

// hexLab converts "#rrggbb" to CIE Lab (D65).
func hexLab(hex string) ([3]float64, bool) {
	hex = strings.TrimPrefix(hex, "#")
	v, err := strconv.ParseUint(hex, 16, 32)
	if len(hex) != 6 || err != nil {
		return [3]float64{}, false
	}
	lin := func(c uint64) float64 {
		f := float64(c) / 255
		if f <= 0.04045 {
			return f / 12.92
		}
		return math.Pow((f+0.055)/1.055, 2.4)
	}
	r, g, b := lin(v>>16&255), lin(v>>8&255), lin(v&255)
	x := (0.4124*r + 0.3576*g + 0.1805*b) / 0.95047
	y := 0.2126*r + 0.7152*g + 0.0722*b
	z := (0.0193*r + 0.1192*g + 0.9505*b) / 1.08883
	f := func(t float64) float64 {
		if t > 216.0/24389 {
			return math.Cbrt(t)
		}
		return (24389.0/27*t + 16) / 116
	}
	fx, fy, fz := f(x), f(y), f(z)
	return [3]float64{116*fy - 16, 500 * (fx - fy), 200 * (fy - fz)}, true
}
