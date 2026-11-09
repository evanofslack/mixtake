package store

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/evanofslack/mixtake/internal/mix"
)

func openTemp(t *testing.T) (*Store, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s, path
}

func TestTracks(t *testing.T) {
	s, _ := openTemp(t)
	ctx := context.Background()
	a := mix.Track{ID: "a", Title: "A", Artists: []mix.Artist{{Name: "X", SpotifyID: "x"}},
		DurationMS: 1000, Explicit: true, Cover: "c", ReleaseDate: "2020", PreviewURL: "https://p/a"}
	b := mix.Track{ID: "b", Title: "B", Artists: []mix.Artist{}}
	if err := s.PutTracks(ctx, []mix.Track{a, b}); err != nil {
		t.Fatal(err)
	}
	b.Title = "B2"
	if err := s.PutTracks(ctx, []mix.Track{b}); err != nil {
		t.Fatal(err)
	}
	got, err := s.Tracks(ctx, []string{"a", "b", "missing"})
	if err != nil {
		t.Fatal(err)
	}
	a.PreviewURL = "" // never stored
	want := map[string]mix.Track{"a": a, "b": b}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %+v\nwant %+v", got, want)
	}
	if got, err := s.Tracks(ctx, nil); err != nil || len(got) != 0 {
		t.Errorf("empty lookup = %v, %v", got, err)
	}
}

func TestManyIDs(t *testing.T) {
	s, _ := openTemp(t)
	ctx := context.Background()
	var ts []mix.Track
	var ids []string
	for i := range chunk*2 + 7 {
		id := fmt.Sprintf("t%04d", i)
		ts = append(ts, mix.Track{ID: id})
		ids = append(ids, id)
	}
	if err := s.PutTracks(ctx, ts); err != nil {
		t.Fatal(err)
	}
	for _, id := range ids {
		if err := s.PutFeatures(ctx, id, "v1", mix.Features{Tempo: 100}); err != nil {
			t.Fatal(err)
		}
	}
	tracks, err := s.Tracks(ctx, ids)
	if err != nil || len(tracks) != len(ids) {
		t.Fatalf("tracks = %d, %v", len(tracks), err)
	}
	feats, err := s.Features(ctx, ids, "v1")
	if err != nil || len(feats) != len(ids) {
		t.Fatalf("features = %d, %v", len(feats), err)
	}
}

func TestFeatures(t *testing.T) {
	s, _ := openTemp(t)
	ctx := context.Background()
	if err := s.PutTracks(ctx, []mix.Track{{ID: "a"}, {ID: "b"}}); err != nil {
		t.Fatal(err)
	}
	f1 := mix.Features{Tempo: 120, Key: "A", Mode: "minor", Happy: 0.3,
		Genres: []mix.Genre{{Name: "Electronic---House", Score: 0.8}}}
	f2 := mix.Features{Tempo: 90, Key: "C", Mode: "major"}
	for _, put := range []struct {
		id, version string
		f           mix.Features
	}{{"a", "v1", f2}, {"a", "v1", f1}, {"a", "v2", f2}, {"b", "v2", f2}} {
		if err := s.PutFeatures(ctx, put.id, put.version, put.f); err != nil {
			t.Fatal(err)
		}
	}
	tests := []struct {
		version string
		want    map[string]mix.Features
	}{
		{"v1", map[string]mix.Features{"a": f1}},
		{"v2", map[string]mix.Features{"a": f2, "b": f2}},
		{"v3", map[string]mix.Features{}},
	}
	for _, tt := range tests {
		got, err := s.Features(ctx, []string{"a", "b"}, tt.version)
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(got, tt.want) {
			t.Errorf("%s: got %+v, want %+v", tt.version, got, tt.want)
		}
	}
	if err := s.PutFeatures(ctx, "nope", "v1", f1); err == nil {
		t.Error("features for an unknown track should fail the foreign key")
	}
}

func TestMix(t *testing.T) {
	s, path := openTemp(t)
	ctx := context.Background()
	if _, err := s.Mix(ctx, "x"); !errors.Is(err, mix.ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
	m := mix.Mix{
		ID:        "abc",
		Source:    mix.Source{Kind: mix.KindPlaylist, SpotifyID: "p", Name: "N", Palette: []string{"#000000"}},
		TrackIDs:  []string{"a", "b"},
		Vibe:      "rainy",
		CreatedAt: time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC),
	}
	if err := s.PutMix(ctx, m); err != nil {
		t.Fatal(err)
	}
	if err := s.PutMix(ctx, m); err != nil {
		t.Fatal(err)
	}
	// reopening runs migrations again as a no-op and keeps the data
	s.Close()
	s2, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s2.Close()
	got, err := s2.Mix(ctx, "abc")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, m) {
		t.Errorf("got %+v\nwant %+v", got, m)
	}
}

func TestPragmas(t *testing.T) {
	s, _ := openTemp(t)
	for pragma, want := range map[string]string{
		"journal_mode": "wal", "foreign_keys": "1", "busy_timeout": "5000",
	} {
		var got string
		if err := s.db.QueryRow("PRAGMA " + pragma).Scan(&got); err != nil {
			t.Fatal(err)
		}
		if !strings.EqualFold(got, want) {
			t.Errorf("%s = %s, want %s", pragma, got, want)
		}
	}
	var version int
	if err := s.db.QueryRow("SELECT MAX(version) FROM schema_version").Scan(&version); err != nil || version != 1 {
		t.Errorf("schema version = %d, %v", version, err)
	}
}
