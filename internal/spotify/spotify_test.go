package spotify

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strconv"
	"strings"
	"testing"

	"github.com/prometheus/client_golang/prometheus/testutil"

	"github.com/evanofslack/mixtake/internal/metrics"
	"github.com/evanofslack/mixtake/internal/mix"
)

// newTestClient serves /embed/<kind>/<id> from testdata/<id>.html, a few special ids for error
// cases, and /preview/<size> bodies.
func newTestClient(t *testing.T) (*Client, *metrics.Metrics) {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /embed/{kind}/{id}", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("User-Agent") != userAgent {
			http.Error(w, "bad ua", http.StatusBadRequest)
			return
		}
		switch id := r.PathValue("id"); id {
		case "forbidden":
			w.WriteHeader(http.StatusForbidden)
		case "broken":
			_, _ = io.WriteString(w, "<html>no data</html>")
		case "badjson":
			_, _ = io.WriteString(w, `<script id="__NEXT_DATA__" type="application/json">{nope</script>`)
		default:
			b, err := os.ReadFile("testdata/" + id + ".html")
			if err != nil {
				http.NotFound(w, r)
				return
			}
			_, _ = w.Write(b)
		}
	})
	mux.HandleFunc("GET /preview/{size}", func(w http.ResponseWriter, r *http.Request) {
		n := map[string]int{"small": 1000, "huge": maxPreviewBytes + 10}[r.PathValue("size")]
		if n == 0 {
			http.NotFound(w, r)
			return
		}
		if r.URL.Query().Has("chunked") {
			w.(http.Flusher).Flush() // headers go out without a Content-Length
		} else {
			w.Header().Set("Content-Length", strconv.Itoa(n))
		}
		_, _ = w.Write(bytes.Repeat([]byte{'x'}, n))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	m := metrics.New()
	c := New(m)
	c.BaseURL = srv.URL
	return c, m
}

func TestPlaylist(t *testing.T) {
	c, m := newTestClient(t)
	src, tracks, err := c.Playlist(context.Background(), "playlist")
	if err != nil {
		t.Fatal(err)
	}
	wantSrc := mix.Source{
		Kind:     mix.KindPlaylist,
		Name:     "Today’s Top Hits",
		Subtitle: "Spotify",
		Cover:    "https://i.scdn.co/image/ab67706f00000002e06fabee7abffa117bed662f",
		Palette:  []string{"#8d3525", "#610700", "#ffffff", "#ffbeae"},
	}
	if !reflect.DeepEqual(src, wantSrc) {
		t.Errorf("source = %+v\nwant %+v", src, wantSrc)
	}
	if len(tracks) != 3 {
		t.Fatalf("got %d tracks", len(tracks))
	}
	want0 := mix.Track{
		ID: "3zOYmiNOuyDL0ClxJcEJ0T", Title: "Stop The Wedding!", Artists: []mix.Artist{{Name: "Ashe"}},
		DurationMS: 198840,
		PreviewURL: "https://p.scdn.co/mp3-preview/8a374e33d78679e1143d7a07797ddfa0225f8586",
	}
	if !reflect.DeepEqual(tracks[0], want0) {
		t.Errorf("track 0 = %+v\nwant %+v", tracks[0], want0)
	}
	if tracks[1].PreviewURL != "" || !tracks[1].Explicit {
		t.Errorf("track 1 = %+v, want no preview and explicit", tracks[1])
	}
	if got := tracks[2].Artists; len(got) != 3 || got[0].Name != "KAROL G" || got[2].Name != "rusowsky" {
		t.Errorf("track 2 artists = %+v", got)
	}
	if n := testutil.ToFloat64(m.SpotifyRequests.WithLabelValues("playlist", "ok")); n != 1 {
		t.Errorf("ok count = %v", n)
	}
}

func TestAlbum(t *testing.T) {
	c, _ := newTestClient(t)
	src, tracks, err := c.Album(context.Background(), "album")
	if err != nil {
		t.Fatal(err)
	}
	if src.Kind != mix.KindAlbum || src.Name != "IGOR" || src.Subtitle != "Tyler, The Creator" ||
		!strings.Contains(src.Cover, "ab67616d0000b273") || len(src.Palette) == 0 {
		t.Errorf("source = %+v", src)
	}
	if len(tracks) != 3 {
		t.Fatalf("got %d tracks", len(tracks))
	}
	for _, tr := range tracks {
		if len(tr.Artists) != 1 || tr.Artists[0].Name != "Tyler, The Creator" {
			t.Errorf("artists = %+v", tr.Artists)
		}
		if !strings.Contains(tr.Cover, "ab67616d00001e02") || tr.PreviewURL == "" || tr.DurationMS == 0 {
			t.Errorf("track = %+v", tr)
		}
	}
}

func TestTrack(t *testing.T) {
	c, _ := newTestClient(t)
	got, err := c.Track(context.Background(), "track")
	if err != nil {
		t.Fatal(err)
	}
	want := mix.Track{
		ID: "track", Title: "Blinding Lights",
		Artists:     []mix.Artist{{Name: "The Weeknd", SpotifyID: "1Xyo4u8uXC1ZmMpatF05PJ"}},
		DurationMS:  200040,
		Cover:       "https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e028863bc11d2aa12b54f5aeb36",
		ReleaseDate: "2020-03-20",
		PreviewURL:  "https://p.scdn.co/mp3-preview/51c08d92815cce4ac2de94a7335a430b81234624",
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %+v\nwant %+v", got, want)
	}
}

func TestErrors(t *testing.T) {
	c, m := newTestClient(t)
	tests := []struct {
		id      string
		want    error
		result  string
		isParse bool
	}{
		{"notfound", mix.ErrNotFound, "not_found", false},
		{"missing", mix.ErrNotFound, "not_found", false},
		{"forbidden", mix.ErrPrivate, "private", false},
		{"broken", errParse, "parse_error", true},
		{"badjson", errParse, "parse_error", true},
		{"track", errParse, "parse_error", true}, // a track page where a playlist was asked for
	}
	for _, tt := range tests {
		t.Run(tt.id, func(t *testing.T) {
			before := testutil.ToFloat64(m.SpotifyRequests.WithLabelValues("playlist", tt.result))
			_, _, err := c.Playlist(context.Background(), tt.id)
			if !errors.Is(err, tt.want) {
				t.Fatalf("err = %v, want %v", err, tt.want)
			}
			if got := testutil.ToFloat64(m.SpotifyRequests.WithLabelValues("playlist", tt.result)); got != before+1 {
				t.Errorf("%s count = %v, want %v", tt.result, got, before+1)
			}
		})
	}
}

func TestPreview(t *testing.T) {
	c, _ := newTestClient(t)
	tests := []struct {
		path    string
		want    int
		openErr bool
		readErr bool
	}{
		{"/preview/small", 1000, false, false},
		{"/preview/huge", 0, true, false},           // rejected by Content-Length
		{"/preview/huge?chunked=1", 0, false, true}, // no length; cut off while reading
		{"/preview/missing", 0, true, false},
	}
	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			body, err := c.Preview(context.Background(), c.BaseURL+tt.path)
			if (err != nil) != tt.openErr {
				t.Fatalf("open err = %v", err)
			}
			if err != nil {
				return
			}
			defer body.Close()
			b, err := io.ReadAll(body)
			if (err != nil) != tt.readErr {
				t.Fatalf("read err = %v", err)
			}
			if err == nil && len(b) != tt.want {
				t.Errorf("read %d bytes, want %d", len(b), tt.want)
			}
		})
	}
}

func TestSplitArtists(t *testing.T) {
	tests := []struct {
		in   string
		want []string
	}{
		{"", nil},
		{"Ashe", []string{"Ashe"}},
		{"Tyler, The Creator", []string{"Tyler, The Creator"}},
		{"Dave, Tems", []string{"Dave", "Tems"}},
		{"Tyler, The Creator, Kali Uchis", []string{"Tyler, The Creator", "Kali Uchis"}},
	}
	for _, tt := range tests {
		var got []string
		for _, a := range splitArtists(tt.in) {
			got = append(got, a.Name)
		}
		if !reflect.DeepEqual(got, tt.want) {
			t.Errorf("splitArtists(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}
