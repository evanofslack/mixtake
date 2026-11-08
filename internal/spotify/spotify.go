// Package spotify implements mix.Catalog by reading Spotify's public embed pages, which carry a
// __NEXT_DATA__ JSON block with the playlist, album or track, and by downloading MP3 previews.
// The format is undocumented, so parse failures are counted as parse_error in metrics.
package spotify

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/evanofslack/mixtake/internal/metrics"
	"github.com/evanofslack/mixtake/internal/mix"
)

const (
	// DefaultBaseURL serves the embed pages.
	DefaultBaseURL = "https://open.spotify.com"
	// userAgent: the embed pages need something browser-like.
	userAgent = "Mozilla/5.0"

	maxPageBytes    = 4 << 20
	maxPreviewBytes = 2 << 20
	pageTimeout     = 15 * time.Second
	previewTimeout  = 20 * time.Second
)

// errParse means the page didn't have the shape we expect; Spotify probably changed it.
var errParse = errors.New("unexpected embed page format")

// Client is a mix.Catalog backed by open.spotify.com.
type Client struct {
	// BaseURL is the embed host, without a trailing slash. Tests point it at httptest.
	BaseURL string
	HTTP    *http.Client
	metrics *metrics.Metrics
}

var _ mix.Catalog = (*Client)(nil)

// New returns a client for the real Spotify. m may be nil.
func New(m *metrics.Metrics) *Client {
	return &Client{BaseURL: DefaultBaseURL, HTTP: &http.Client{}, metrics: m}
}

// Playlist returns a public playlist and up to 100 of its tracks. Spotify serves the same
// not-found page for missing and private playlists, so both give mix.ErrNotFound.
func (c *Client) Playlist(ctx context.Context, id string) (mix.Source, []mix.Track, error) {
	e, err := c.entity(ctx, "playlist", id)
	if err != nil {
		return mix.Source{}, nil, err
	}
	return e.source(mix.KindPlaylist), e.tracks(""), nil
}

// Album returns an album and its tracks.
func (c *Client) Album(ctx context.Context, id string) (mix.Source, []mix.Track, error) {
	e, err := c.entity(ctx, "album", id)
	if err != nil {
		return mix.Source{}, nil, err
	}
	src := e.source(mix.KindAlbum)
	return src, e.tracks(bestImage(e.VisualIdentity.Image, 300)), nil
}

// Track returns one track's metadata and preview URL.
func (c *Client) Track(ctx context.Context, id string) (mix.Track, error) {
	e, err := c.entity(ctx, "track", id)
	if err != nil {
		return mix.Track{}, err
	}
	t := mix.Track{
		ID:         id,
		Title:      e.Name,
		DurationMS: e.Duration,
		Explicit:   e.IsExplicit,
		Cover:      bestImage(e.VisualIdentity.Image, 300),
		PreviewURL: e.AudioPreview.URL,
		Artists:    []mix.Artist{},
	}
	if e.ReleaseDate != nil {
		t.ReleaseDate, _, _ = strings.Cut(e.ReleaseDate.ISOString, "T")
	}
	for _, a := range e.Artists {
		t.Artists = append(t.Artists, mix.Artist{Name: a.Name, SpotifyID: uriID(a.URI, "artist")})
	}
	return t, nil
}

// Preview downloads an MP3 preview, refusing anything over 2 MB. The body must be closed.
func (c *Client) Preview(ctx context.Context, url string) (io.ReadCloser, error) {
	ctx, cancel := context.WithTimeout(ctx, previewTimeout)
	resp, err := c.get(ctx, url)
	if err != nil {
		cancel()
		c.record(ctx, "preview", "error")
		return nil, err
	}
	switch {
	case resp.StatusCode == http.StatusNotFound:
		err = mix.ErrNotFound
	case resp.StatusCode != http.StatusOK:
		err = fmt.Errorf("preview: status %d", resp.StatusCode)
	case resp.ContentLength > maxPreviewBytes:
		err = fmt.Errorf("preview: %d bytes is too large", resp.ContentLength)
	}
	if err != nil {
		resp.Body.Close()
		cancel()
		c.record(ctx, "preview", resultOf(err))
		return nil, err
	}
	c.record(ctx, "preview", "ok")
	return &capped{body: resp.Body, left: maxPreviewBytes, cancel: cancel}, nil
}

// capped errors once more than left bytes are read, and cancels the request on close.
type capped struct {
	body   io.ReadCloser
	left   int64
	cancel context.CancelFunc
}

func (c *capped) Read(p []byte) (int, error) {
	if c.left <= 0 {
		return 0, errors.New("preview: too large")
	}
	if int64(len(p)) > c.left {
		p = p[:c.left+1] // read one extra byte to detect overflow
	}
	n, err := c.body.Read(p)
	c.left -= int64(n)
	if c.left < 0 {
		return n, errors.New("preview: too large")
	}
	return n, err
}

func (c *capped) Close() error {
	err := c.body.Close()
	c.cancel()
	return err
}

func (c *Client) get(ctx context.Context, url string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)
	return c.HTTP.Do(req)
}

// entity fetches an embed page and returns its entity, checking it is the kind asked for.
func (c *Client) entity(ctx context.Context, kind, id string) (*entity, error) {
	e, err := c.fetchEntity(ctx, kind, id)
	c.record(ctx, kind, resultOf(err))
	if err != nil {
		if errors.Is(err, errParse) {
			slog.WarnContext(ctx, "spotify embed parse failed", "kind", kind, "id", id, "error", err)
		}
		return nil, fmt.Errorf("spotify %s %s: %w", kind, id, err)
	}
	return e, nil
}

func (c *Client) fetchEntity(ctx context.Context, kind, id string) (*entity, error) {
	ctx, cancel := context.WithTimeout(ctx, pageTimeout)
	defer cancel()
	resp, err := c.get(ctx, c.BaseURL+"/embed/"+kind+"/"+id)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusOK:
	case http.StatusNotFound:
		return nil, mix.ErrNotFound
	case http.StatusUnauthorized, http.StatusForbidden, http.StatusUnavailableForLegalReasons:
		return nil, mix.ErrPrivate
	default:
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	page, err := io.ReadAll(io.LimitReader(resp.Body, maxPageBytes))
	if err != nil {
		return nil, err
	}
	e, err := parsePage(page)
	if err != nil {
		return nil, err
	}
	if e.Type != kind {
		return nil, fmt.Errorf("%w: entity type %q", errParse, e.Type)
	}
	return e, nil
}

func (c *Client) record(ctx context.Context, kind, result string) {
	if c.metrics != nil {
		c.metrics.SpotifyRequests.WithLabelValues(kind, result).Inc()
	}
	if result != "ok" {
		slog.DebugContext(ctx, "spotify request", "kind", kind, "result", result)
	}
}

func resultOf(err error) string {
	switch {
	case err == nil:
		return "ok"
	case errors.Is(err, mix.ErrNotFound):
		return "not_found"
	case errors.Is(err, mix.ErrPrivate):
		return "private"
	case errors.Is(err, errParse):
		return "parse_error"
	}
	return "error"
}

// nextData is the part of __NEXT_DATA__ we read.
type nextData struct {
	Props struct {
		PageProps struct {
			Status int `json:"status"` // 404 on the not-found page, which is served with HTTP 200
			State  *struct {
				Data struct {
					Entity *entity `json:"entity"`
				} `json:"data"`
			} `json:"state"`
		} `json:"pageProps"`
	} `json:"props"`
}

type entity struct {
	Type       string `json:"type"`
	Name       string `json:"name"`
	Subtitle   string `json:"subtitle"`
	Duration   int    `json:"duration"`
	IsExplicit bool   `json:"isExplicit"`
	CoverArt   struct {
		Sources []struct {
			URL string `json:"url"`
		} `json:"sources"`
	} `json:"coverArt"`
	VisualIdentity struct {
		BackgroundBase       *rgba   `json:"backgroundBase"`
		BackgroundTintedBase *rgba   `json:"backgroundTintedBase"`
		TextBrightAccent     *rgba   `json:"textBrightAccent"`
		TextSubdued          *rgba   `json:"textSubdued"`
		Image                []image `json:"image"`
	} `json:"visualIdentity"`
	TrackList []struct {
		URI          string  `json:"uri"`
		Title        string  `json:"title"`
		Subtitle     string  `json:"subtitle"`
		Duration     int     `json:"duration"`
		IsExplicit   bool    `json:"isExplicit"`
		AudioPreview preview `json:"audioPreview"`
	} `json:"trackList"`
	// track pages only
	Artists []struct {
		Name string `json:"name"`
		URI  string `json:"uri"`
	} `json:"artists"`
	ReleaseDate *struct {
		ISOString string `json:"isoString"`
	} `json:"releaseDate"`
	AudioPreview preview `json:"audioPreview"`
}

type preview struct {
	URL string `json:"url"`
}

type rgba struct {
	Red   int `json:"red"`
	Green int `json:"green"`
	Blue  int `json:"blue"`
}

func (c rgba) hex() string { return fmt.Sprintf("#%02x%02x%02x", c.Red&255, c.Green&255, c.Blue&255) }

type image struct {
	URL       string `json:"url"`
	MaxWidth  int    `json:"maxWidth"`
	MaxHeight int    `json:"maxHeight"`
}

var (
	scriptOpen  = []byte(`<script id="__NEXT_DATA__"`)
	scriptClose = []byte(`</script>`)
)

// parsePage extracts the entity from an embed page.
func parsePage(page []byte) (*entity, error) {
	i := bytes.Index(page, scriptOpen)
	if i < 0 {
		return nil, fmt.Errorf("%w: no __NEXT_DATA__", errParse)
	}
	rest := page[i+len(scriptOpen):]
	start := bytes.IndexByte(rest, '>')
	end := bytes.Index(rest, scriptClose)
	if start < 0 || end < start {
		return nil, fmt.Errorf("%w: unterminated __NEXT_DATA__", errParse)
	}
	var nd nextData
	if err := json.Unmarshal(rest[start+1:end], &nd); err != nil {
		return nil, fmt.Errorf("%w: %v", errParse, err)
	}
	pp := nd.Props.PageProps
	switch {
	case pp.Status == http.StatusNotFound:
		return nil, mix.ErrNotFound
	case pp.Status == http.StatusForbidden || pp.Status == http.StatusUnauthorized:
		return nil, mix.ErrPrivate
	case pp.State == nil || pp.State.Data.Entity == nil:
		return nil, fmt.Errorf("%w: no entity", errParse)
	}
	return pp.State.Data.Entity, nil
}

func (e *entity) source(kind mix.SourceKind) mix.Source {
	s := mix.Source{Kind: kind, Name: e.Name, Subtitle: e.Subtitle, Palette: e.palette()}
	if len(e.CoverArt.Sources) > 0 {
		s.Cover = e.CoverArt.Sources[0].URL
	} else {
		s.Cover = bestImage(e.VisualIdentity.Image, 640)
	}
	return s
}

// palette returns the visualIdentity colours as #rrggbb, most prominent first, without repeats.
func (e *entity) palette() []string {
	vi := e.VisualIdentity
	var out []string
	for _, c := range []*rgba{vi.BackgroundBase, vi.BackgroundTintedBase, vi.TextBrightAccent, vi.TextSubdued} {
		if c == nil {
			continue
		}
		if h := c.hex(); !slices.Contains(out, h) {
			out = append(out, h)
		}
	}
	return out
}

// tracks converts a playlist or album track list, skipping episodes and other non-tracks.
func (e *entity) tracks(cover string) []mix.Track {
	out := make([]mix.Track, 0, len(e.TrackList))
	for _, row := range e.TrackList {
		id := uriID(row.URI, "track")
		if id == "" {
			continue
		}
		out = append(out, mix.Track{
			ID:         id,
			Title:      row.Title,
			Artists:    splitArtists(row.Subtitle),
			DurationMS: row.Duration,
			Explicit:   row.IsExplicit,
			Cover:      cover,
			PreviewURL: row.AudioPreview.URL,
		})
	}
	return out
}

// splitArtists splits a track row's subtitle. Spotify joins artists with ", " (a comma and
// a no-break space), so names with ordinary commas like "Tyler, The Creator" stay whole.
func splitArtists(subtitle string) []mix.Artist {
	out := []mix.Artist{}
	for name := range strings.SplitSeq(subtitle, ", ") {
		if name = strings.TrimSpace(name); name != "" {
			out = append(out, mix.Artist{Name: name})
		}
	}
	return out
}

// uriID returns the id of "spotify:<kind>:<id>", or "" if uri is something else.
func uriID(uri, kind string) string {
	id, ok := strings.CutPrefix(uri, "spotify:"+kind+":")
	if !ok {
		return ""
	}
	return id
}

// bestImage returns the smallest image at least want pixels wide, or else the largest.
func bestImage(imgs []image, want int) string {
	var best image
	for _, im := range imgs {
		switch {
		case best.URL == "":
			best = im
		case best.MaxWidth < want && im.MaxWidth > best.MaxWidth:
			best = im
		case im.MaxWidth >= want && im.MaxWidth < best.MaxWidth:
			best = im
		}
	}
	return best.URL
}
