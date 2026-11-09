// Package analogdb implements mix.Photos against the analogdb API (https://api.analogdb.com) and
// its image host (https://i.analogdb.com).
package analogdb

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/evanofslack/mixtake/internal/metrics"
	"github.com/evanofslack/mixtake/internal/mix"
)

// DefaultImageURL is where analogdb serves its images.
const DefaultImageURL = "https://i.analogdb.com"

const (
	apiTimeout     = 10 * time.Second
	imageTimeout   = 30 * time.Second
	maxBodyBytes   = 8 << 20
	searchPageSize = 50
	similarSize    = 50
	maxKeywords    = 4096 // cached keyword counts before the cache is reset
	userAgent      = "mixtake (+https://mixtake.evanslack.dev)"
)

// Client calls analogdb. It is safe for concurrent use.
type Client struct {
	base, imgBase string
	http          *http.Client
	metrics       *metrics.Metrics

	mu       sync.Mutex
	keywords map[string]int // KeywordCount results
}

var _ mix.Photos = (*Client)(nil)

// New returns a client for the API at base and images at imgBase (DefaultImageURL when empty).
// A nil httpClient uses http.DefaultClient; requests have their own timeouts. m may be nil.
func New(base, imgBase string, httpClient *http.Client, m *metrics.Metrics) *Client {
	if imgBase == "" {
		imgBase = DefaultImageURL
	}
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	return &Client{base: strings.TrimRight(base, "/"), imgBase: strings.TrimRight(imgBase, "/"),
		http: httpClient, metrics: m, keywords: map[string]int{}}
}

// Search runs a text search over captions, keywords and titles, without nsfw or sprocket posts.
func (c *Client) Search(ctx context.Context, q mix.PhotoQuery) ([]mix.Photo, error) {
	size := q.PageSize
	if size <= 0 || size > 100 {
		size = searchPageSize
	}
	v := url.Values{"q": {q.Text}, "page_size": {strconv.Itoa(size)}, "nsfw": {"false"},
		"sprocket": {"false"}}
	var body struct {
		Posts []post `json:"posts"`
	}
	if err := c.getJSON(ctx, "/v1/search?"+v.Encode(), &body); err != nil {
		return nil, fmt.Errorf("analogdb search %q: %w", q.Text, err)
	}
	return photos(body.Posts), nil
}

// Similar returns posts that look like post id. Posts without a similarity embedding are
// ErrNotFound, like unknown posts.
func (c *Client) Similar(ctx context.Context, id int) ([]mix.Photo, error) {
	v := url.Values{"page_size": {strconv.Itoa(similarSize)}, "nsfw": {"false"}, "sprocket": {"false"}}
	var body struct {
		Posts []post `json:"posts"`
	}
	if err := c.getJSON(ctx, "/v1/post/"+strconv.Itoa(id)+"/similar?"+v.Encode(), &body); err != nil {
		return nil, fmt.Errorf("analogdb similar %d: %w", id, err)
	}
	return photos(body.Posts), nil
}

// KeywordCount returns how many posts have a keyword, or 0 for unknown keywords. Results are
// cached in memory; failures are not.
func (c *Client) KeywordCount(ctx context.Context, word string) (int, error) {
	word = strings.ToLower(strings.TrimSpace(word))
	c.mu.Lock()
	n, ok := c.keywords[word]
	c.mu.Unlock()
	if ok {
		return n, nil
	}
	var body struct {
		Count int `json:"count"`
	}
	err := c.getJSON(ctx, "/v1/keyword/"+url.PathEscape(word)+"?top_posts=0&related=0", &body)
	switch {
	case errors.Is(err, mix.ErrNotFound):
		body.Count = 0
	case err != nil:
		return 0, fmt.Errorf("analogdb keyword %q: %w", word, err)
	}
	c.mu.Lock()
	if len(c.keywords) >= maxKeywords {
		c.keywords = map[string]int{}
	}
	c.keywords[word] = body.Count
	c.mu.Unlock()
	return body.Count, nil
}

// Image streams an image by its file name. The caller validates the name and closes the body.
func (c *Client) Image(ctx context.Context, name string) (io.ReadCloser, string, error) {
	ctx, cancel := context.WithTimeout(ctx, imageTimeout)
	resp, err := c.get(ctx, c.imgBase+"/"+url.PathEscape(name))
	if err != nil {
		cancel()
		c.record(ctx, err)
		return nil, "", fmt.Errorf("analogdb image %s: %w: %w", name, mix.ErrUpstream, err)
	}
	ct := resp.Header.Get("Content-Type")
	switch {
	// S3 answers 403 for missing keys
	case resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusForbidden:
		err = mix.ErrNotFound
	case resp.StatusCode != http.StatusOK:
		err = fmt.Errorf("%w: status %d", mix.ErrUpstream, resp.StatusCode)
	case !strings.HasPrefix(ct, "image/"):
		err = fmt.Errorf("%w: content type %q", mix.ErrUpstream, ct)
	}
	c.record(ctx, err)
	if err != nil {
		resp.Body.Close()
		cancel()
		return nil, "", fmt.Errorf("analogdb image %s: %w", name, err)
	}
	return &cancelOnClose{ReadCloser: resp.Body, cancel: cancel}, ct, nil
}

// cancelOnClose cancels the request's context when the body is closed.
type cancelOnClose struct {
	io.ReadCloser
	cancel context.CancelFunc
}

func (b *cancelOnClose) Close() error {
	err := b.ReadCloser.Close()
	b.cancel()
	return err
}

func (c *Client) get(ctx context.Context, u string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)
	return c.http.Do(req)
}

// getJSON decodes an API response, mapping 404 to ErrNotFound and other failures to ErrUpstream.
func (c *Client) getJSON(ctx context.Context, path string, v any) (err error) {
	ctx, cancel := context.WithTimeout(ctx, apiTimeout)
	defer cancel()
	defer func() { c.record(ctx, err) }()
	resp, err := c.get(ctx, c.base+path)
	if err != nil {
		return fmt.Errorf("%w: %w", mix.ErrUpstream, err)
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusOK:
	case http.StatusNotFound:
		return mix.ErrNotFound
	default:
		return fmt.Errorf("%w: status %d", mix.ErrUpstream, resp.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxBodyBytes)).Decode(v); err != nil {
		return fmt.Errorf("%w: decode: %w", mix.ErrUpstream, err)
	}
	return nil
}

func (c *Client) record(ctx context.Context, err error) {
	result := "ok"
	switch {
	case errors.Is(err, mix.ErrNotFound):
		result = "not_found"
	case err != nil:
		result = "error"
		slog.WarnContext(ctx, "analogdb request failed", "error", err)
	}
	if c.metrics != nil {
		c.metrics.AnalogdbRequests.WithLabelValues(result).Inc()
	}
}

// post is the part of an analogdb post we read.
type post struct {
	ID        int    `json:"id"`
	Title     string `json:"title"`
	Author    string `json:"author"`
	Permalink string `json:"permalink"`
	Caption   string `json:"caption"`
	Score     int    `json:"score"`
	NSFW      bool   `json:"nsfw"`
	Grayscale bool   `json:"grayscale"`
	Images    []struct {
		Resolution string `json:"resolution"`
		URL        string `json:"url"`
		Width      int    `json:"width"`
		Height     int    `json:"height"`
	} `json:"images"`
	Colors []struct {
		Hex     string  `json:"hex"`
		Percent float64 `json:"percent"`
	} `json:"colors"`
	Keywords []struct {
		Word string `json:"word"`
	} `json:"keywords"`
}

func photos(posts []post) []mix.Photo {
	out := make([]mix.Photo, 0, len(posts))
	for _, p := range posts {
		ph := mix.Photo{ID: p.ID, Title: p.Title, Author: p.Author, Permalink: p.Permalink,
			Caption: p.Caption, Score: p.Score, NSFW: p.NSFW, Grayscale: p.Grayscale,
			Images:   make([]mix.PhotoImage, 0, len(p.Images)),
			Colors:   make([]mix.PhotoColor, 0, len(p.Colors)),
			Keywords: make([]string, 0, len(p.Keywords))}
		for _, i := range p.Images {
			ph.Images = append(ph.Images, mix.PhotoImage{Resolution: i.Resolution, URL: i.URL,
				Width: i.Width, Height: i.Height})
		}
		for _, c := range p.Colors {
			ph.Colors = append(ph.Colors, mix.PhotoColor{Hex: c.Hex, Percent: c.Percent})
		}
		for _, k := range p.Keywords {
			ph.Keywords = append(ph.Keywords, k.Word)
		}
		out = append(out, ph)
	}
	return out
}
