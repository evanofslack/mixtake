package analyzer

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"io"
	"math"
	"time"

	"github.com/evanofslack/mixtake/internal/mix"
)

// Fake is a deterministic mix.Analyzer for dev and tests: the same track id always gives the same
// plausible features, without any audio analysis.
type Fake struct {
	// Delay is added to each Analyze call so the UI can watch results stream in.
	Delay time.Duration
}

var _ mix.Analyzer = Fake{}

// ModelVersion is fixed, so fake features are cached separately from real ones.
func (Fake) ModelVersion() string { return "fake-1" }

var (
	fakeKeys   = []string{"C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"}
	fakeGenres = []string{
		"Electronic---House", "Electronic---Techno", "Electronic---Ambient", "Electronic---Synth-pop",
		"Hip Hop---Trap", "Hip Hop---Boom Bap", "Rock---Indie Rock", "Rock---Alternative Rock",
		"Pop---Synth-pop", "Pop---Indie Pop", "Funk / Soul---Neo Soul", "Jazz---Contemporary Jazz",
		"Folk, World, & Country---Folk", "Latin---Reggaeton",
	}
)

// Analyze drains audio and returns features derived from a hash of trackID.
func (f Fake) Analyze(ctx context.Context, trackID string, audio io.Reader) (mix.Features, error) {
	if _, err := io.Copy(io.Discard, audio); err != nil {
		return mix.Features{}, err
	}
	if f.Delay > 0 {
		t := time.NewTimer(f.Delay)
		defer t.Stop()
		select {
		case <-ctx.Done():
			return mix.Features{}, ctx.Err()
		case <-t.C:
		}
	}
	r := newHashRand(trackID)
	// two latent axes, so the mood heads agree with each other the way real ones do
	valence, energy := r.float(), r.float()
	feat := mix.Features{
		Tempo:        math.Round((70+100*r.float())*10) / 10,
		Key:          fakeKeys[r.intn(len(fakeKeys))],
		Mode:         "major",
		Happy:        jitter(r, valence),
		Sad:          jitter(r, 1-valence),
		Relaxed:      jitter(r, 1-energy),
		Aggressive:   jitter(r, energy*energy),
		Party:        jitter(r, energy*valence),
		Danceable:    jitter(r, 0.3+0.6*energy),
		Acoustic:     jitter(r, 0.8-0.6*energy),
		Instrumental: jitter(r, 0.3),
		Valence:      0.36 + 0.28*valence,
		Arousal:      0.36 + 0.28*energy,
	}
	if r.float() < 0.45 {
		feat.Mode = "minor"
	}
	score := 0.4 + 0.4*r.float()
	for _, i := range r.perm(len(fakeGenres))[:3] {
		feat.Genres = append(feat.Genres, mix.Genre{Name: fakeGenres[i], Score: round3(score)})
		score *= 0.3 + 0.4*r.float()
	}
	return feat, nil
}

// jitter nudges v by up to ±0.15 and clamps it to 0–1.
func jitter(r *hashRand, v float64) float64 {
	return round3(min(1, max(0, v+0.3*(r.float()-0.5))))
}

func round3(v float64) float64 { return math.Round(v*1000) / 1000 }

// hashRand is a tiny deterministic generator seeded from a string.
type hashRand struct{ state [32]byte }

func newHashRand(seed string) *hashRand { return &hashRand{state: sha256.Sum256([]byte(seed))} }

func (r *hashRand) next() uint64 {
	r.state = sha256.Sum256(r.state[:])
	return binary.LittleEndian.Uint64(r.state[:8])
}

func (r *hashRand) float() float64 { return float64(r.next()>>11) / (1 << 53) }

func (r *hashRand) intn(n int) int { return int(r.next() % uint64(n)) }

func (r *hashRand) perm(n int) []int {
	p := make([]int, n)
	for i := range p {
		p[i] = i
	}
	for i := n - 1; i > 0; i-- {
		j := r.intn(i + 1)
		p[i], p[j] = p[j], p[i]
	}
	return p
}
