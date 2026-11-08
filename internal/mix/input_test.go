package mix

import (
	"errors"
	"slices"
	"strings"
	"testing"
)

func TestParseInput(t *testing.T) {
	const (
		pl = "37i9dQZF1DXcBWIGoYBM5M"
		al = "4yP0hdKOZPNshxUOjY0cZj"
		t1 = "0VjIjW4GlUZAMYd2vXMi3b"
		t2 = "6b5P51m8xx2XA6U7sdNZ5E"
		t3 = "2K9Ovn1o2bTGqbsABGC6m3"
	)
	tests := []struct {
		name    string
		text    string
		want    Input
		wantErr error
	}{
		{"playlist link with si", "https://open.spotify.com/playlist/" + pl + "?si=abc123",
			Input{Kind: KindPlaylist, ID: pl}, nil},
		{"intl playlist link", "  https://open.spotify.com/intl-de/playlist/" + pl + "\n",
			Input{Kind: KindPlaylist, ID: pl}, nil},
		{"no scheme", "open.spotify.com/album/" + al, Input{Kind: KindAlbum, ID: al}, nil},
		{"embed link", "https://open.spotify.com/embed/album/" + al, Input{Kind: KindAlbum, ID: al}, nil},
		{"album uri", "spotify:album:" + al, Input{Kind: KindAlbum, ID: al}, nil},
		{"legacy playlist uri", "spotify:user:spotify:playlist:" + pl, Input{Kind: KindPlaylist, ID: pl}, nil},
		{"pasted links keep order and drop duplicates",
			"https://open.spotify.com/track/" + t2 + "?si=x\nhttps://open.spotify.com/track/" + t1 +
				"\nhttps://open.spotify.com/track/" + t2 + "\n",
			Input{Kind: KindTracks, TrackIDs: []string{t2, t1}}, nil},
		{"mixed uris and links on one line",
			"spotify:track:" + t1 + " https://open.spotify.com/intl-fr/track/" + t3,
			Input{Kind: KindTracks, TrackIDs: []string{t1, t3}}, nil},
		{"stray words ignored", "my songs:\nspotify:track:" + t1, Input{Kind: KindTracks, TrackIDs: []string{t1}}, nil},
		{"empty", "  \n ", Input{}, ErrUnsupported},
		{"junk", "hello world", Input{}, ErrUnsupported},
		{"artist link", "https://open.spotify.com/artist/" + al, Input{}, ErrUnsupported},
		{"episode uri", "spotify:episode:" + al, Input{}, ErrUnsupported},
		{"empty kind", "spotify::" + t1, Input{}, ErrUnsupported},
		{"short link", "https://spotify.link/abcdef", Input{}, ErrUnsupported},
		{"other host", "https://evil.spotify.com.example/track/" + t1, Input{}, ErrUnsupported},
		{"bad id", "https://open.spotify.com/track/short", Input{}, ErrUnsupported},
		{"id with symbols", "spotify:track:0VjIjW4GlUZAMYd2vXMi3!", Input{}, ErrUnsupported},
		{"playlist plus tracks", "spotify:playlist:" + pl + " spotify:track:" + t1, Input{}, ErrUnsupported},
		{"two playlists", "spotify:playlist:" + pl + " spotify:album:" + al, Input{}, ErrUnsupported},
		{"too many", "spotify:track:" + t1 + " spotify:track:" + t2 + " spotify:track:" + t3,
			Input{}, ErrTooManyTracks},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseInput(tt.text, 2)
			if tt.wantErr != nil {
				var ie *InputError
				if !errors.Is(err, tt.wantErr) || !errors.As(err, &ie) || ie.Msg == "" {
					t.Fatalf("err = %v, want %v as *InputError", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got.Kind != tt.want.Kind || got.ID != tt.want.ID || !slices.Equal(got.TrackIDs, tt.want.TrackIDs) {
				t.Errorf("got %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestParseInputMessages(t *testing.T) {
	_, err := ParseInput("https://open.spotify.com/artist/4yP0hdKOZPNshxUOjY0cZj", 10)
	if err == nil || !strings.HasPrefix(err.Error(), "Artist links") {
		t.Errorf("err = %v", err)
	}
}
