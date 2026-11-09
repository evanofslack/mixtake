// Package analyzer implements mix.Analyzer: Client talks to the Essentia sidecar in analyzer/,
// and Fake returns deterministic features for development and tests.
package analyzer

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"github.com/evanofslack/mixtake/internal/mix"
)

// startupWait is how long NewClient keeps retrying /health, so the sidecar can start after mixtake.
const startupWait = 30 * time.Second

// Client calls the analyzer sidecar over HTTP.
type Client struct {
	baseURL      string
	http         *http.Client
	modelVersion string
}

var _ mix.Analyzer = (*Client)(nil)

// NewClient checks the sidecar's /health to learn its model version. It retries for up to 30
// seconds while the sidecar starts, or until ctx is done. A nil httpClient uses one with a
// 2 minute timeout.
func NewClient(ctx context.Context, baseURL string, httpClient *http.Client) (*Client, error) {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 2 * time.Minute}
	}
	c := &Client{baseURL: strings.TrimRight(baseURL, "/"), http: httpClient}

	ctx, cancel := context.WithTimeout(ctx, startupWait)
	defer cancel()
	delay := 250 * time.Millisecond
	for {
		v, err := c.health(ctx)
		if err == nil {
			c.modelVersion = v
			return c, nil
		}
		slog.DebugContext(ctx, "analyzer not ready", "url", c.baseURL, "err", err)
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("analyzer %s not ready: %w", c.baseURL, err)
		case <-time.After(delay):
		}
		delay = min(2*delay, 2*time.Second)
	}
}

func (c *Client) health(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/health", nil)
	if err != nil {
		return "", err
	}
	var body struct {
		Status       string `json:"status"`
		ModelVersion string `json:"model_version"`
	}
	if err := c.do(req, &body); err != nil {
		return "", err
	}
	if body.ModelVersion == "" {
		return "", errors.New("health: no model_version")
	}
	return body.ModelVersion, nil
}

// ModelVersion is the sidecar's model version, as reported when the client was created.
func (c *Client) ModelVersion() string { return c.modelVersion }

// Analyze uploads a track's audio to the sidecar and returns its features.
func (c *Client) Analyze(ctx context.Context, trackID string, audio io.Reader) (mix.Features, error) {
	// previews are at most a few hundred KB, so buffering the form is simpler than streaming it
	var buf bytes.Buffer
	form := multipart.NewWriter(&buf)
	part, err := form.CreateFormFile("audio", trackID+".mp3")
	if err != nil {
		return mix.Features{}, err
	}
	if _, err := io.Copy(part, audio); err != nil {
		return mix.Features{}, fmt.Errorf("read audio: %w", err)
	}
	if err := form.Close(); err != nil {
		return mix.Features{}, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/analyze", &buf)
	if err != nil {
		return mix.Features{}, err
	}
	req.Header.Set("Content-Type", form.FormDataContentType())
	var body struct {
		ModelVersion string       `json:"model_version"`
		Features     mix.Features `json:"features"`
	}
	if err := c.do(req, &body); err != nil {
		return mix.Features{}, fmt.Errorf("analyze %s: %w", trackID, err)
	}
	if body.ModelVersion != c.modelVersion {
		// the sidecar was upgraded under us; features would be cached under the wrong version
		return mix.Features{}, fmt.Errorf("analyze %s: model version changed from %s to %s",
			trackID, c.modelVersion, body.ModelVersion)
	}
	return body.Features, nil
}

// StatusError is a non-2xx response from the sidecar.
type StatusError struct {
	Code    int
	Message string
}

func (e *StatusError) Error() string {
	return fmt.Sprintf("analyzer: %d %s: %s", e.Code, http.StatusText(e.Code), e.Message)
}

// do sends req and decodes a 2xx JSON response into out.
func (c *Client) do(req *http.Request, out any) error {
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return &StatusError{Code: resp.StatusCode, Message: errorMessage(resp.Body)}
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}
	return nil
}

// errorMessage reads FastAPI's {"detail": "…"}, falling back to the raw body.
func errorMessage(r io.Reader) string {
	b, _ := io.ReadAll(io.LimitReader(r, 4<<10))
	var body struct {
		Detail json.RawMessage `json:"detail"`
	}
	if json.Unmarshal(b, &body) == nil && len(body.Detail) > 0 {
		var s string
		if json.Unmarshal(body.Detail, &s) == nil {
			return s
		}
		return string(body.Detail) // validation errors are a list
	}
	return strings.TrimSpace(string(b))
}
