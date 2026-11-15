package examples

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"

	"github.com/evanofslack/mixtake/internal/analyzer"
	"github.com/evanofslack/mixtake/internal/mix"
	"github.com/evanofslack/mixtake/internal/store"
)

// noCatalog fails every call: a seeded example must never need Spotify.
type noCatalog struct{}

var errOffline = errors.New("offline")

func (noCatalog) Playlist(context.Context, string) (mix.Source, []mix.Track, error) {
	return mix.Source{}, nil, errOffline
}
func (noCatalog) Album(context.Context, string) (mix.Source, []mix.Track, error) {
	return mix.Source{}, nil, errOffline
}
func (noCatalog) Track(context.Context, string) (mix.Track, error) { return mix.Track{}, errOffline }
func (noCatalog) Preview(context.Context, string) (io.ReadCloser, error) {
	return nil, errOffline
}

func TestSeed(t *testing.T) {
	exs, err := Load(os.DirFS("testdata"))
	if err != nil || len(exs) != 1 {
		t.Fatalf("Load: %d examples, %v", len(exs), err)
	}
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	ctx := context.Background()

	for i, want := range []int{1, 0} { // the second run finds it already there
		n, err := Seed(ctx, st, exs)
		if err != nil || n != want {
			t.Fatalf("run %d: seeded %d, %v; want %d", i, n, err, want)
		}
	}

	runner := mix.NewRunner(ctx, noCatalog{}, analyzer.Fake{}, st, nil, mix.RunnerConfig{})
	t.Cleanup(runner.Wait)
	snap, err := runner.Snapshot(ctx, "tinyexample1")
	if err != nil {
		t.Fatal(err)
	}
	if snap.Status != mix.StatusDone || len(snap.Tracks) != 2 || snap.Tracks[1].Track.Title != "Night Ferry" {
		t.Errorf("snapshot status %s with %d tracks", snap.Status, len(snap.Tracks))
	}
}

func TestLoad(t *testing.T) {
	good, err := os.ReadFile("testdata/tiny.json")
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name  string
		files fstest.MapFS
		n     int
		err   bool
	}{
		{"example and readme", fstest.MapFS{"a.json": {Data: good}, "README.md": {Data: []byte("hi")}}, 1, false},
		{"not json", fstest.MapFS{"a.json": {Data: []byte("{")}}, 0, true},
		{"no mix id", fstest.MapFS{"a.json": {Data: []byte(`{"model_version":"v1"}`)}}, 0, true},
		{"empty", fstest.MapFS{}, 0, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			exs, err := Load(tt.files)
			if (err != nil) != tt.err || len(exs) != tt.n {
				t.Errorf("Load = %d examples, %v", len(exs), err)
			}
		})
	}
}

func TestEmbedded(t *testing.T) {
	if _, err := All(); err != nil {
		t.Fatal(err)
	}
}
