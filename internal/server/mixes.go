package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/evanofslack/mixtake/internal/mix"
)

const (
	maxCreateBody = 256 << 10 // a few hundred pasted links fit easily
	pingInterval  = 15 * time.Second
	busyRetry     = 30 // seconds, for Retry-After on 503
)

type createRequest struct {
	Input string `json:"input"`
	Vibe  string `json:"vibe"`
}

type createResponse struct {
	ID string `json:"id"`
}

// Messages for errors that aren't the user's input. Input errors carry their own message.
const (
	copyTracksHint = "Private playlists can't be read: open it in the Spotify app, select the " +
		"tracks, copy them and paste them here instead."
	msgNotFound = "Spotify couldn't find that playlist or album. " + copyTracksHint
	msgPrivate  = "That playlist is private or unavailable. " + copyTracksHint
	msgUpstream = "Spotify didn't respond as expected. Try again in a moment."
	msgBusy     = "mixtake is busy analysing other mixes. Try again in a minute."
	msgLimited  = "Too many new mixes from you. Try again in a minute."
)

// createMix handles POST /api/mixes. See docs/plan.md for the status codes.
func (s *Server) createMix(w http.ResponseWriter, r *http.Request) {
	if s.limiter != nil {
		ip := clientIP(r, s.deps.Limits.TrustProxy, s.deps.Limits.ClientIPHeader)
		if retry := s.limiter.hit(ip, time.Now()); retry > 0 {
			w.Header().Set("Retry-After", strconv.Itoa(retry))
			writeError(w, http.StatusTooManyRequests, msgLimited)
			return
		}
	}
	var req createRequest
	dec := json.NewDecoder(io.LimitReader(r.Body, maxCreateBody))
	if err := dec.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "The request body must be JSON like {\"input\": \"…\"}.")
		return
	}
	m, err := s.deps.Runner.Create(r.Context(), req.Input, req.Vibe)
	var inputErr *mix.InputError
	switch {
	case err == nil:
		writeJSON(w, http.StatusCreated, createResponse{ID: m.ID})
	case errors.As(err, &inputErr):
		writeError(w, http.StatusBadRequest, inputErr.Msg)
	case errors.Is(err, mix.ErrNotFound):
		writeError(w, http.StatusNotFound, msgNotFound)
	case errors.Is(err, mix.ErrPrivate):
		writeError(w, http.StatusForbidden, msgPrivate)
	case errors.Is(err, mix.ErrBusy):
		w.Header().Set("Retry-After", strconv.Itoa(busyRetry))
		writeError(w, http.StatusServiceUnavailable, msgBusy)
	case errors.Is(err, mix.ErrUpstream):
		s.deps.Log.WarnContext(r.Context(), "create mix", "error", err)
		writeError(w, http.StatusBadGateway, msgUpstream)
	default:
		s.internalError(w, r, err)
	}
}

// getMix handles GET /api/mixes/{id}.
func (s *Server) getMix(w http.ResponseWriter, r *http.Request) {
	snap, err := s.deps.Runner.Snapshot(r.Context(), r.PathValue("id"))
	switch {
	case err == nil:
		writeJSON(w, http.StatusOK, snap)
	case errors.Is(err, mix.ErrNotFound):
		writeError(w, http.StatusNotFound, "mix not found")
	default:
		s.internalError(w, r, err)
	}
}

// mixEvents handles GET /api/mixes/{id}/events: server-sent events, starting with a snapshot.
// The stream ends after done or error, when the client goes away, or when the client falls too
// far behind (it can reconnect for a fresh snapshot).
func (s *Server) mixEvents(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	events, unsubscribe, err := s.deps.Runner.Subscribe(ctx, r.PathValue("id"))
	switch {
	case errors.Is(err, mix.ErrNotFound):
		writeError(w, http.StatusNotFound, "mix not found")
		return
	case err != nil:
		s.internalError(w, r, err)
		return
	}
	defer unsubscribe()

	rc := http.NewResponseController(w)
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	// no-transform stops proxies that compress (next dev's rewrites, Cloudflare) from gzipping
	// the stream, which holds events back until the stream ends
	h.Set("Cache-Control", "no-cache, no-transform")
	h.Set("X-Accel-Buffering", "no") // no proxy buffering
	w.WriteHeader(http.StatusOK)
	if err := rc.Flush(); err != nil {
		return
	}
	ping := time.NewTicker(s.ping)
	defer ping.Stop()
	for {
		var err error
		select {
		case <-ctx.Done():
			return
		case ev, ok := <-events:
			if !ok {
				return
			}
			err = writeEvent(w, ev)
		case <-ping.C:
			_, err = io.WriteString(w, ": ping\n\n")
		}
		if err == nil {
			err = rc.Flush()
		}
		if err != nil {
			return
		}
	}
}

func writeEvent(w io.Writer, ev mix.Event) error {
	data, err := json.Marshal(ev.Data)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Name, data)
	return err
}

func (s *Server) internalError(w http.ResponseWriter, r *http.Request, err error) {
	s.deps.Log.ErrorContext(r.Context(), "request failed", "path", r.URL.Path, "error", err)
	writeError(w, http.StatusInternalServerError, "internal error")
}
