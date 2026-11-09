package mix

import (
	"cmp"
	"fmt"
	"math"
	"slices"
	"strings"
)

// Tempo histogram: 10 BPM bins from 60 to 180, with slower and faster tracks in the end bins.
const (
	tempoLow   = 60
	tempoHigh  = 180
	tempoWidth = 10
	topN       = 10
)

// CoverageOf counts finished and failed tracks. Tracks without audio or that don't resolve count
// as failed.
func CoverageOf(tracks []TrackResult) Coverage {
	c := Coverage{Total: len(tracks)}
	for _, t := range tracks {
		switch t.Status {
		case TrackDone:
			c.Done++
		case TrackPending:
		default:
			c.Failed++
		}
	}
	return c
}

// BuildProfile summarises the analysed tracks, which are the ones with features.
func BuildProfile(tracks []TrackResult) Profile {
	p := Profile{
		Coverage:  CoverageOf(tracks),
		EnergyArc: []ArcPoint{},
		Tempos:    make([]Bin, (tempoHigh-tempoLow)/tempoWidth),
		Keys:      []KeyCount{},
		Genres:    []Genre{},
		Artists:   []ArtistCount{},
	}
	for i := range p.Tempos {
		p.Tempos[i] = Bin{Low: float64(tempoLow + i*tempoWidth), High: float64(tempoLow + (i+1)*tempoWidth)}
	}

	var feats []Features
	keys := map[[2]string]int{}
	genres := map[string]float64{}
	artists := map[string]int{}
	for i, t := range tracks {
		for _, a := range t.Track.Artists {
			artists[a.Name]++
		}
		if t.Features == nil {
			continue
		}
		f := *t.Features
		feats = append(feats, f)
		p.EnergyArc = append(p.EnergyArc, ArcPoint{Index: i, Energy: f.Energy(), Mood: f.Mood()})
		bin := int(math.Floor((f.Tempo - tempoLow) / tempoWidth))
		p.Tempos[min(max(bin, 0), len(p.Tempos)-1)].Count++
		if f.Key != "" {
			keys[[2]string{f.Key, f.Mode}]++
		}
		for _, g := range f.Genres {
			genres[g.Name] += g.Score
		}
	}

	for k, n := range keys {
		p.Keys = append(p.Keys, KeyCount{Key: k[0], Mode: k[1], Count: n})
	}
	slices.SortFunc(p.Keys, func(a, b KeyCount) int {
		return cmp.Or(cmp.Compare(b.Count, a.Count), cmp.Compare(a.Key, b.Key), cmp.Compare(a.Mode, b.Mode))
	})
	for name, w := range genres {
		p.Genres = append(p.Genres, Genre{Name: name, Score: w})
	}
	slices.SortFunc(p.Genres, func(a, b Genre) int {
		return cmp.Or(cmp.Compare(b.Score, a.Score), cmp.Compare(a.Name, b.Name))
	})
	p.Genres = p.Genres[:min(len(p.Genres), topN)]
	for name, n := range artists {
		p.Artists = append(p.Artists, ArtistCount{Name: name, Count: n})
	}
	slices.SortFunc(p.Artists, func(a, b ArtistCount) int {
		return cmp.Or(cmp.Compare(b.Count, a.Count), cmp.Compare(a.Name, b.Name))
	})
	p.Artists = p.Artists[:min(len(p.Artists), topN)]

	p.Averages, p.Spread = meanSpread(feats)
	p.Quadrant = quadrant(p.Averages.Mood, p.Averages.Energy)
	p.Summary = summary(p, feats)
	return p
}

// fields lists the averaged values of a track, in the order of the Averages fields.
func fields(f Features) [11]float64 {
	return [11]float64{f.Mood(), f.Energy(), f.Tempo, f.Danceable, f.Happy, f.Sad, f.Relaxed,
		f.Aggressive, f.Party, f.Acoustic, f.Instrumental}
}

func averages(v [11]float64) Averages {
	return Averages{Mood: v[0], Energy: v[1], Tempo: v[2], Danceable: v[3], Happy: v[4], Sad: v[5],
		Relaxed: v[6], Aggressive: v[7], Party: v[8], Acoustic: v[9], Instrumental: v[10]}
}

// meanSpread returns the means and population standard deviations.
func meanSpread(feats []Features) (Averages, Averages) {
	if len(feats) == 0 {
		return Averages{}, Averages{}
	}
	var sum, sumSq [11]float64
	for _, f := range feats {
		for i, v := range fields(f) {
			sum[i] += v
			sumSq[i] += v * v
		}
	}
	n := float64(len(feats))
	var mean, sd [11]float64
	for i := range sum {
		mean[i] = sum[i] / n
		sd[i] = math.Sqrt(max(0, sumSq[i]/n-mean[i]*mean[i]))
	}
	return averages(mean), averages(sd)
}

func quadrant(mood, energy float64) Quadrant {
	switch {
	case mood >= 0.5 && energy >= 0.5:
		return QuadrantHappyEnergetic
	case mood >= 0.5:
		return QuadrantHappyCalm
	case energy >= 0.5:
		return QuadrantSadEnergetic
	}
	return QuadrantSadCalm
}

// summary is one line such as "Bittersweet and driving · 118 BPM · mostly minor keys · 87 of 100
// analysed".
func summary(p Profile, feats []Features) string {
	analysed := fmt.Sprintf("%d of %d analysed", p.Coverage.Done, p.Coverage.Total)
	if len(feats) == 0 {
		return analysed
	}
	parts := []string{
		capitalize(moodWord(p.Averages.Mood)) + " and " + energyWord(p.Averages.Energy),
		fmt.Sprintf("%.0f BPM", p.Averages.Tempo),
	}
	minor := 0
	for _, f := range feats {
		if f.Mode == "minor" {
			minor++
		}
	}
	switch share := float64(minor) / float64(len(feats)); {
	case share >= 0.6:
		parts = append(parts, "mostly minor keys")
	case share <= 0.4:
		parts = append(parts, "mostly major keys")
	default:
		parts = append(parts, "major and minor keys")
	}
	return strings.Join(append(parts, analysed), " · ")
}

func moodWord(m float64) string {
	switch {
	case m < 0.35:
		return "melancholy"
	case m < 0.5:
		return "bittersweet"
	case m < 0.65:
		return "warm"
	}
	return "euphoric"
}

func energyWord(e float64) string {
	switch {
	case e < 0.35:
		return "hushed"
	case e < 0.5:
		return "laid-back"
	case e < 0.65:
		return "driving"
	}
	return "intense"
}
