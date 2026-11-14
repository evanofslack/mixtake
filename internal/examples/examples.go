// Package examples holds the front page's example mixes, baked with `tune -export`: each one's
// tracks, features and the photo set its cover was made from. On startup they are seeded into
// the store and their photo sets pinned, so the examples open the same on any server, without
// analysing anything or asking analogdb or the LLM again.
package examples

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"path"
	"slices"

	"github.com/evanofslack/mixtake/internal/mix"
)

//go:embed all:data
var data embed.FS

// Example is one baked mix.
type Example struct {
	Mix    mix.Mix     `json:"mix"`
	Tracks []mix.Track `json:"tracks"`
	// Features are keyed by track id; tracks that couldn't be analysed have none.
	Features     map[string]mix.Features `json:"features"`
	ModelVersion string                  `json:"model_version"`
	// Photos is the mix's usual set (its own vibe, seed 0) when it was baked.
	Photos mix.PhotoSet `json:"photos"`
}

// All returns the embedded examples.
func All() ([]Example, error) {
	sub, err := fs.Sub(data, "data")
	if err != nil {
		return nil, err
	}
	return Load(sub)
}

// Load reads every *.json example in fsys, in file name order.
func Load(fsys fs.FS) ([]Example, error) {
	names, err := fs.Glob(fsys, "*.json")
	if err != nil {
		return nil, err
	}
	slices.Sort(names)
	exs := make([]Example, 0, len(names))
	for _, name := range names {
		b, err := fs.ReadFile(fsys, name)
		if err != nil {
			return nil, err
		}
		var ex Example
		if err := json.Unmarshal(b, &ex); err != nil {
			return nil, fmt.Errorf("%s: %w", path.Base(name), err)
		}
		if ex.Mix.ID == "" || len(ex.Mix.TrackIDs) == 0 || ex.ModelVersion == "" {
			return nil, fmt.Errorf("%s: missing mix id, tracks or model version", name)
		}
		exs = append(exs, ex)
	}
	return exs, nil
}

// Seed writes each example that isn't in st yet: tracks, then features, then the mix, so a mix
// is never stored without its tracks. It returns how many were written.
func Seed(ctx context.Context, st mix.Store, exs []Example) (int, error) {
	n := 0
	for _, ex := range exs {
		_, err := st.Mix(ctx, ex.Mix.ID)
		if err == nil {
			continue
		}
		if !errors.Is(err, mix.ErrNotFound) {
			return n, err
		}
		if err := st.PutTracks(ctx, ex.Tracks); err != nil {
			return n, fmt.Errorf("example %s: %w", ex.Mix.ID, err)
		}
		for id, f := range ex.Features {
			if err := st.PutFeatures(ctx, id, ex.ModelVersion, f); err != nil {
				return n, fmt.Errorf("example %s: %w", ex.Mix.ID, err)
			}
		}
		if err := st.PutMix(ctx, ex.Mix); err != nil {
			return n, fmt.Errorf("example %s: %w", ex.Mix.ID, err)
		}
		n++
	}
	return n, nil
}

// New builds an example from a finished mix's snapshot and its usual photo set.
func New(snap mix.Snapshot, modelVersion string, photos mix.PhotoSet) Example {
	ex := Example{
		Mix:          snap.Mix,
		Tracks:       make([]mix.Track, 0, len(snap.Tracks)),
		Features:     map[string]mix.Features{},
		ModelVersion: modelVersion,
		Photos:       photos,
	}
	for _, r := range snap.Tracks {
		ex.Tracks = append(ex.Tracks, r.Track)
		if r.Status == mix.TrackDone && r.Features != nil {
			ex.Features[r.Track.ID] = *r.Features
		}
	}
	return ex
}
