package logging

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"
)

func TestRequestIDAttached(t *testing.T) {
	var buf bytes.Buffer
	log := New(&buf, "json", slog.LevelInfo).With("app", "mixtake")
	log.InfoContext(WithRequestID(context.Background(), "abc123"), "hello")
	log.InfoContext(context.Background(), "no id")
	lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
	if len(lines) != 2 {
		t.Fatalf("got %d lines", len(lines))
	}
	if !strings.Contains(lines[0], `"request_id":"abc123"`) || !strings.Contains(lines[0], `"app":"mixtake"`) {
		t.Errorf("first line missing attrs: %s", lines[0])
	}
	if strings.Contains(lines[1], "request_id") {
		t.Errorf("second line has a request id: %s", lines[1])
	}
}
