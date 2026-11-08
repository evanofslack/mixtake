// Package logging sets up slog and carries a request id through contexts, so every
// slog.*Context call made while handling a request is tagged with it.
package logging

import (
	"context"
	"io"
	"log/slog"
)

type ctxKey struct{}

// WithRequestID returns a context whose log lines include id.
func WithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, ctxKey{}, id)
}

// RequestID returns the request id stored in ctx, or "".
func RequestID(ctx context.Context) string {
	id, _ := ctx.Value(ctxKey{}).(string)
	return id
}

// New returns a logger writing text or json to w at level.
func New(w io.Writer, format string, level slog.Level) *slog.Logger {
	opts := &slog.HandlerOptions{Level: level}
	var h slog.Handler
	if format == "json" {
		h = slog.NewJSONHandler(w, opts)
	} else {
		h = slog.NewTextHandler(w, opts)
	}
	return slog.New(contextHandler{h})
}

// contextHandler adds the request id from the record's context.
type contextHandler struct{ slog.Handler }

func (h contextHandler) Handle(ctx context.Context, r slog.Record) error {
	if id := RequestID(ctx); id != "" {
		r.AddAttrs(slog.String("request_id", id))
	}
	return h.Handler.Handle(ctx, r)
}

func (h contextHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return contextHandler{h.Handler.WithAttrs(attrs)}
}

func (h contextHandler) WithGroup(name string) slog.Handler {
	return contextHandler{h.Handler.WithGroup(name)}
}
