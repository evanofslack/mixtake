// Package mix holds the domain types, the interfaces to every IO dependency, and the pure logic
// that turns a list of Spotify tracks into an analysed mix and a cover photo.
package mix

import (
	"crypto/sha256"
	"encoding/base32"
	"math"
	"strings"
	"time"
)

// SourceKind is where a mix's tracks came from.
type SourceKind string

const (
	KindPlaylist SourceKind = "playlist"
	KindAlbum    SourceKind = "album"
	KindTracks   SourceKind = "tracks" // pasted track links or URIs
)

// Source describes the playlist or album a mix came from. Pasted tracks have only Kind.
type Source struct {
	Kind      SourceKind `json:"kind"`
	SpotifyID string     `json:"spotify_id,omitempty"`
	Name      string     `json:"name,omitempty"`
	Subtitle  string     `json:"subtitle,omitempty"` // playlist owner or album artists
	Cover     string     `json:"cover,omitempty"`    // image URL
	// Palette is Spotify's visualIdentity colours as "#rrggbb", most prominent first.
	Palette []string `json:"palette,omitempty"`
}

// Artist is a track's credited artist.
type Artist struct {
	Name      string `json:"name"`
	SpotifyID string `json:"spotify_id,omitempty"`
}

// Track is a Spotify track's metadata.
type Track struct {
	ID          string   `json:"id"` // Spotify base62 id
	Title       string   `json:"title"`
	Artists     []Artist `json:"artists"`
	DurationMS  int      `json:"duration_ms"`
	Explicit    bool     `json:"explicit"`
	Cover       string   `json:"cover,omitempty"`        // album art URL
	ReleaseDate string   `json:"release_date,omitempty"` // as Spotify gives it: YYYY, YYYY-MM or YYYY-MM-DD
	// PreviewURL is the 30 second MP3. It is short lived, so it isn't stored long term or sent to
	// the browser.
	PreviewURL string `json:"-"`
}

// Genre is one of Essentia's discogs400 styles, such as "Electronic---House".
type Genre struct {
	Name  string  `json:"name"`
	Score float64 `json:"score"`
}

// Features is what the analyzer measures for one track. Scores are 0–1.
type Features struct {
	Tempo        float64 `json:"tempo"` // BPM
	Key          string  `json:"key"`   // "C", "F#", …
	Mode         string  `json:"mode"`  // "major" or "minor"
	Danceable    float64 `json:"danceable"`
	Happy        float64 `json:"happy"`
	Sad          float64 `json:"sad"`
	Relaxed      float64 `json:"relaxed"`
	Aggressive   float64 `json:"aggressive"`
	Party        float64 `json:"party"`
	Acoustic     float64 `json:"acoustic"`
	Instrumental float64 `json:"instrumental"`
	Valence      float64 `json:"valence"` // DEAM, uses about 0.2–0.85
	Arousal      float64 `json:"arousal"` // DEAM, uses about 0.2–0.85
	Genres       []Genre `json:"genres"`  // top 3
}

// The mood map's axes blend two kinds of signal. The Essentia mood heads are binary classifiers
// whose outputs pile up near 0 and 1, so every piano or ambient track scores about 0.001 for
// party and 0.99 for relaxed and they all land on one spot; soften() pulls them in from the
// extremes. DEAM valence and arousal are regressions, continuous even among calm songs, so they
// carry most of the spread there. The weights were tuned on internal/mix/testdata/axes.json.
const (
	headTemp      = 3.0 // logit divisor in soften; 1 leaves the heads unchanged
	moodDEAM      = 0.5 // share of valence in Mood
	energyDEAM    = 0.6 // share of arousal in Energy
	deamLo        = 0.2 // the range DEAM's 0–1 outputs actually use
	deamHi        = 0.8
	probabilityLo = 1e-4 // keeps logit finite
)

// Mood is the sad–happy axis of the mood map, 0–1.
func (f Features) Mood() float64 {
	heads := 0.5 + (soften(f.Happy)-soften(f.Sad))/2
	return clamp01(moodDEAM*deam(f.Valence) + (1-moodDEAM)*heads)
}

// Energy is the calm–energetic axis of the mood map, 0–1.
func (f Features) Energy() float64 {
	heads := 0.4*soften(f.Party) + 0.3*soften(f.Aggressive) + 0.3*(1-soften(f.Relaxed))
	return clamp01(energyDEAM*deam(f.Arousal) + (1-energyDEAM)*heads)
}

// soften maps a classifier probability through its logit scaled down by headTemp, so 0.001 and
// 0.01 differ visibly while 0.5 stays 0.5.
func soften(p float64) float64 {
	p = min(1-probabilityLo, max(probabilityLo, p))
	return 1 / (1 + math.Exp(-math.Log(p/(1-p))/headTemp))
}

// deam stretches a DEAM score over the range it really uses to 0–1.
func deam(v float64) float64 { return clamp01((v - deamLo) / (deamHi - deamLo)) }

func clamp01(v float64) float64 { return min(1, max(0, v)) }

// Mix is a set of tracks to analyse, identified by its content.
type Mix struct {
	ID        string    `json:"id"`
	Source    Source    `json:"source"`
	TrackIDs  []string  `json:"track_ids"` // in order
	Vibe      string    `json:"vibe,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// MixID hashes the ordered track ids and the vibe, so the same input always gives the same mix.
func MixID(trackIDs []string, vibe string) string {
	h := sha256.New()
	for _, id := range trackIDs {
		h.Write([]byte(id))
		h.Write([]byte{0})
	}
	h.Write([]byte(strings.TrimSpace(vibe)))
	enc := base32.StdEncoding.WithPadding(base32.NoPadding)
	return strings.ToLower(enc.EncodeToString(h.Sum(nil))[:12])
}

// Status is the state of a mix's analysis job.
type Status string

const (
	StatusQueued  Status = "queued"
	StatusRunning Status = "running"
	StatusDone    Status = "done"
	StatusFailed  Status = "failed"
)

// TrackStatus is the state of one track within a job.
type TrackStatus string

const (
	TrackPending  TrackStatus = "pending"
	TrackDone     TrackStatus = "done"
	TrackFailed   TrackStatus = "failed"    // no preview or analysis error
	TrackNoAudio  TrackStatus = "no_audio"  // Spotify has no preview for it
	TrackNotFound TrackStatus = "not_found" // the id doesn't resolve
)

// TrackResult is a track and, once analysed, its features.
type TrackResult struct {
	Track    Track       `json:"track"`
	Status   TrackStatus `json:"status"`
	Features *Features   `json:"features,omitempty"`
}

// Coverage counts how much of a mix has been analysed.
type Coverage struct {
	Total  int `json:"total"`
	Done   int `json:"done"`
	Failed int `json:"failed"`
}

// Quadrant is the mood map quadrant a mix falls in.
type Quadrant string

const (
	QuadrantHappyEnergetic Quadrant = "happy_energetic"
	QuadrantHappyCalm      Quadrant = "happy_calm"
	QuadrantSadEnergetic   Quadrant = "sad_energetic"
	QuadrantSadCalm        Quadrant = "sad_calm"
)

// Averages are the mean features over the analysed tracks.
type Averages struct {
	Mood         float64 `json:"mood"`
	Energy       float64 `json:"energy"`
	Tempo        float64 `json:"tempo"`
	Danceable    float64 `json:"danceable"`
	Happy        float64 `json:"happy"`
	Sad          float64 `json:"sad"`
	Relaxed      float64 `json:"relaxed"`
	Aggressive   float64 `json:"aggressive"`
	Party        float64 `json:"party"`
	Acoustic     float64 `json:"acoustic"`
	Instrumental float64 `json:"instrumental"`
}

// ArcPoint is one track's energy, by its position in the mix.
type ArcPoint struct {
	Index  int     `json:"index"`
	Energy float64 `json:"energy"`
	Mood   float64 `json:"mood"`
}

// Bin is one bar of a histogram over [Low, High).
type Bin struct {
	Low   float64 `json:"low"`
	High  float64 `json:"high"`
	Count int     `json:"count"`
}

// KeyCount is how many tracks are in a key.
type KeyCount struct {
	Key   string `json:"key"`
	Mode  string `json:"mode"`
	Count int    `json:"count"`
}

// ArtistCount is how many tracks an artist appears on.
type ArtistCount struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// Profile summarises a mix's analysed tracks. It is recomputed as tracks arrive.
type Profile struct {
	Coverage  Coverage      `json:"coverage"`
	Averages  Averages      `json:"averages"`
	Spread    Averages      `json:"spread"` // standard deviations
	Quadrant  Quadrant      `json:"quadrant"`
	EnergyArc []ArcPoint    `json:"energy_arc"`
	Tempos    []Bin         `json:"tempos"`
	Keys      []KeyCount    `json:"keys"`
	Genres    []Genre       `json:"genres"`  // summed weights, top 10
	Artists   []ArtistCount `json:"artists"` // top 10
	Summary   string        `json:"summary"`
}

// Snapshot is the full state of a mix, as served by GET /api/mixes/{id} and the first SSE event.
type Snapshot struct {
	Mix     Mix           `json:"mix"`
	Status  Status        `json:"status"`
	Tracks  []TrackResult `json:"tracks"`
	Profile *Profile      `json:"profile,omitempty"`
}

// PhotoQuery is a text search against analogdb.
type PhotoQuery struct {
	Text     string
	PageSize int
}

// ColorQuery lists analogdb colour photos with a share of one colour, in a seeded random order.
type ColorQuery struct {
	Color    string // an analogdb colour name, such as "navy"
	Keyword  string // optional: only posts with this keyword
	Seed     int    // 1–500
	PageSize int
}

// PhotoImage is one resolution of a photo.
type PhotoImage struct {
	Resolution string `json:"resolution"` // low, medium, high, raw
	URL        string `json:"url"`
	Width      int    `json:"width"`
	Height     int    `json:"height"`
}

// PhotoColor is one of a photo's dominant colours.
type PhotoColor struct {
	Hex     string  `json:"hex"`
	Percent float64 `json:"percent"`
}

// PhotoSet is a ranked list of cover candidates and how they were chosen.
type PhotoSet struct {
	Queries []string `json:"queries"` // the analogdb searches used, for the "why this cover" line
	Palette []string `json:"palette"` // target colours "#rrggbb" the ranking aimed for
	Photos  []Photo  `json:"photos"`
}

// Photo is an analogdb post. The API serves image URLs as /api/img/{name} proxy paths.
type Photo struct {
	ID        int          `json:"id"`
	Title     string       `json:"title"`
	Author    string       `json:"author"`
	Permalink string       `json:"permalink"`
	Caption   string       `json:"caption"`
	Score     int          `json:"score"` // upvotes
	Grayscale bool         `json:"grayscale"`
	NSFW      bool         `json:"-"`
	Images    []PhotoImage `json:"images"`
	Colors    []PhotoColor `json:"colors"`
	Keywords  []string     `json:"keywords"`
}
