// Package llm calls an OpenAI-compatible chat completions API (Gemini, OpenAI, OpenRouter, a
// local server…) for mixtake's cover ideas.
package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/evanofslack/mixtake/internal/metrics"
	"github.com/evanofslack/mixtake/internal/mix"
)

const (
	timeout      = 20 * time.Second
	maxAttempts  = 2
	retryWait    = 500 * time.Millisecond
	maxBodyBytes = 1 << 20
	temperature  = 1.0
)

// Client completes chat prompts with one model.
type Client struct {
	base, key, model string
	http             *http.Client
	metrics          *metrics.Metrics
	retryWait        time.Duration
}

var _ mix.Muse = (*Client)(nil)

// New returns a client for the API at base (ending before /chat/completions). A nil httpClient
// uses http.DefaultClient; requests have their own timeout. m may be nil.
func New(base, key, model string, httpClient *http.Client, m *metrics.Metrics) *Client {
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	return &Client{base: strings.TrimRight(base, "/"), key: key, model: model, http: httpClient,
		metrics: m, retryWait: retryWait}
}

type message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type request struct {
	Model          string    `json:"model"`
	Messages       []message `json:"messages"`
	Temperature    float64   `json:"temperature"`
	ResponseFormat struct {
		Type string `json:"type"`
	} `json:"response_format"`
}

type response struct {
	Choices []struct {
		Message message `json:"message"`
	} `json:"choices"`
}

// Complete sends a system and a user message and returns the reply, which is asked to be JSON.
// 429s, 5xx and network errors are retried once. Failures wrap mix.ErrUpstream.
func (c *Client) Complete(ctx context.Context, system, user string) (out string, err error) {
	defer func() { c.record(ctx, err) }()
	req := request{Model: c.model, Temperature: temperature,
		Messages: []message{{Role: "system", Content: system}, {Role: "user", Content: user}}}
	req.ResponseFormat.Type = "json_object"
	body, err := json.Marshal(req)
	if err != nil {
		return "", err
	}
	for attempt := 1; ; attempt++ {
		var retry bool
		out, retry, err = c.try(ctx, body)
		if !retry || attempt == maxAttempts || ctx.Err() != nil {
			return out, err
		}
		select {
		case <-ctx.Done():
			return "", fmt.Errorf("%w: %w", mix.ErrUpstream, ctx.Err())
		case <-time.After(c.retryWait):
		}
	}
}

// try makes one request and says whether its failure is worth retrying.
func (c *Client) try(ctx context.Context, body []byte) (string, bool, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.base+"/chat/completions",
		bytes.NewReader(body))
	if err != nil {
		return "", false, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.key)
	resp, err := c.http.Do(req)
	if err != nil {
		return "", true, fmt.Errorf("%w: llm: %w", mix.ErrUpstream, err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxBodyBytes))
	if err != nil {
		return "", true, fmt.Errorf("%w: llm: read: %w", mix.ErrUpstream, err)
	}
	if resp.StatusCode != http.StatusOK {
		retry := resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500
		return "", retry, fmt.Errorf("%w: llm: status %d: %s", mix.ErrUpstream, resp.StatusCode,
			snippet(raw))
	}
	var r response
	if err := json.Unmarshal(raw, &r); err != nil {
		return "", false, fmt.Errorf("%w: llm: decode: %w", mix.ErrUpstream, err)
	}
	if len(r.Choices) == 0 || strings.TrimSpace(r.Choices[0].Message.Content) == "" {
		return "", false, fmt.Errorf("%w: llm: empty reply", mix.ErrUpstream)
	}
	return r.Choices[0].Message.Content, false, nil
}

// snippet is the start of an error body, for logs.
func snippet(b []byte) string {
	s := strings.Join(strings.Fields(string(b)), " ")
	if len(s) > 200 {
		s = s[:200] + "…"
	}
	return s
}

func (c *Client) record(ctx context.Context, err error) {
	result := "ok"
	if err != nil {
		result = "error"
		if !errors.Is(err, context.Canceled) {
			slog.WarnContext(ctx, "llm request failed", "model", c.model, "error", err)
		}
	}
	if c.metrics != nil {
		c.metrics.LLMRequests.WithLabelValues(result).Inc()
	}
}
