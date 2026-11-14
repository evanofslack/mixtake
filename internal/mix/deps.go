package mix

import (
	"context"
	"errors"
	"io"
)

// The interfaces below are the only ones in mixtake: one per IO dependency, so the logic in this
// package can be tested with fakes. Implementations live in internal/spotify, internal/analyzer,
// internal/analogdb, internal/store and internal/llm.

// Catalog reads Spotify's public embed pages and preview audio.
type Catalog interface {
	// Playlist returns a public playlist and its tracks (Spotify serves at most 100).
	Playlist(ctx context.Context, id string) (Source, []Track, error)
	// Album returns an album and its tracks.
	Album(ctx context.Context, id string) (Source, []Track, error)
	// Track returns one track's metadata, including its preview URL.
	Track(ctx context.Context, id string) (Track, error)
	// Preview downloads a track's 30 second MP3 preview.
	Preview(ctx context.Context, url string) (io.ReadCloser, error)
}

// Analyzer extracts features from a track's audio.
type Analyzer interface {
	Analyze(ctx context.Context, trackID string, audio io.Reader) (Features, error)
	// ModelVersion identifies the models, so cached features are recomputed when they change.
	ModelVersion() string
}

// Photos searches analogdb and fetches its images. Methods return ErrNotFound for unknown posts,
// images or keywords and ErrUpstream for other failures.
type Photos interface {
	Search(ctx context.Context, q PhotoQuery) ([]Photo, error)
	// ByColor lists colour photos with a share of a colour, in a random order fixed by the seed.
	ByColor(ctx context.Context, q ColorQuery) ([]Photo, error)
	Similar(ctx context.Context, id int) ([]Photo, error)
	// Image streams an image from i.analogdb.com by its file name, with its content type.
	Image(ctx context.Context, name string) (io.ReadCloser, string, error)
	// KeywordCount is how many posts have the keyword word, or 0 if none do.
	KeywordCount(ctx context.Context, word string) (int, error)
}

// Muse is an LLM behind a chat completions API, which writes cover ideas. It is optional.
type Muse interface {
	// Complete sends a system and a user message and returns the reply.
	Complete(ctx context.Context, system, user string) (string, error)
}

// Store persists tracks, features and mixes.
type Store interface {
	// Tracks returns the stored tracks among ids, keyed by id. Missing ids are absent.
	Tracks(ctx context.Context, ids []string) (map[string]Track, error)
	PutTracks(ctx context.Context, ts []Track) error
	// Features returns stored features for ids computed with modelVersion. Missing ids are absent.
	Features(ctx context.Context, ids []string, modelVersion string) (map[string]Features, error)
	PutFeatures(ctx context.Context, trackID, modelVersion string, f Features) error
	// Mix returns ErrNotFound if there is no mix with that id.
	Mix(ctx context.Context, id string) (Mix, error)
	PutMix(ctx context.Context, m Mix) error
}

// Errors that implementations return, wrapped or bare, so callers can map them to responses.
var (
	ErrNotFound    = errors.New("not found")
	ErrPrivate     = errors.New("private or unavailable")
	ErrUnsupported = errors.New("unsupported link")
)
