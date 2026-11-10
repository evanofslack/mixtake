package mix

import (
	"cmp"
	"fmt"
	"hash/fnv"
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
// photos and orders them by search rank, closeness to the profile's palette and upvotes, plus a
// little jitter seeded by mixID so mixes with the same queries still differ. Grayscale photos
// are only kept for calm, sad mixes. It returns at most n candidates.
func RankPhotos(queries []SceneQuery, results [][]Photo, p Profile, mixID string, n int) []Candidate {
	allowGray := p.Quadrant == QuadrantSadCalm
	targets := labs(TargetPalette(p.Averages))
	type entry struct {
		photo Photo
		rank  float64
		hits  int
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
				e.rank = max(e.rank, r)
				e.hits++
				continue
			}
			merged[ph.ID] = &entry{photo: ph, rank: r, hits: 1}
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
			votesWeight*votes + jitterWeight*jitter(mixID, e.photo.ID)
		out = append(out, Candidate{Photo: e.photo, Score: score})
	}
	slices.SortFunc(out, func(a, b Candidate) int {
		return cmp.Or(cmp.Compare(b.Score, a.Score), cmp.Compare(a.Photo.ID, b.Photo.ID))
	})
	return out[:min(len(out), n)]
}

// jitter is a stable pseudo-random number in [0, 1) for a mix and photo.
func jitter(mixID string, photoID int) float64 {
	h := fnv.New32a()
	h.Write([]byte(mixID + "|" + strconv.Itoa(photoID)))
	return float64(h.Sum32()) / (1 << 32)
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
