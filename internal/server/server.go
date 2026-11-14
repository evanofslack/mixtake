// Package server is mixtake's HTTP layer: routing, middleware, JSON helpers and static files.
package server

import (
	"encoding/json"
	"io/fs"
	"log/slog"
	"net/http"
	"time"

	"github.com/evanofslack/mixtake/internal/mix"
)

// Deps is everything the handlers need.
type Deps struct {
	Log *slog.Logger
	// Static is the exported web app, or nil when the binary was built without -tags embedweb.
	Static fs.FS
	Runner *mix.Runner
	Covers *mix.Covers
	Limits Limits
}

// Limits configures rate limiting of POST /api/mixes. A zero RateLimit disables it.
type Limits struct {
	RateLimit       int    // per client ip, per minute
	GlobalRateLimit int    // across all clients, per minute
	TrustProxy      bool   // take the client ip from ClientIPHeader
	ClientIPHeader  string // for X-Forwarded-For, the rightmost entry is used
}

// Server routes API requests and serves the web app.
type Server struct {
	deps    Deps
	mux     *http.ServeMux
	limiter *rateLimiter  // nil when rate limiting is off
	ping    time.Duration // SSE heartbeat interval
}

// New builds the server and registers every route.
func New(deps Deps) *Server {
	s := &Server{deps: deps, mux: http.NewServeMux(), ping: pingInterval}
	if l := deps.Limits; l.RateLimit > 0 {
		s.limiter = newRateLimiter(l.RateLimit, max(l.GlobalRateLimit, l.RateLimit))
	}
	s.mux.HandleFunc("GET /api/health", s.health)
	s.mux.HandleFunc("POST /api/mixes", s.createMix)
	s.mux.HandleFunc("GET /api/mixes/{id}", s.getMix)
	s.mux.HandleFunc("GET /api/mixes/{id}/events", s.mixEvents)
	s.mux.HandleFunc("GET /api/mixes/{id}/photos", s.mixPhotos)
	s.mux.HandleFunc("GET /api/photos/{id}/similar", s.similarPhotos)
	s.mux.HandleFunc("GET /api/img/{name}", s.image)
	s.mux.HandleFunc("GET /api/showcase", s.showcase)
	s.mux.Handle("/api/", http.HandlerFunc(s.apiNotFound))
	// the about page became a section of the front page; old links land on it
	s.mux.Handle("GET /about", http.RedirectHandler("/#how", http.StatusMovedPermanently))
	s.mux.Handle("/", staticHandler(deps.Static))
	return s
}

// Handler returns the root handler with middleware applied.
func (s *Server) Handler() http.Handler {
	return requestID(accessLog(s.deps.Log, recoverer(s.deps.Log, s.mux)))
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) apiNotFound(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotFound, "not found")
}

// writeJSON writes v as a JSON response.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// errorBody is every API error response.
type errorBody struct {
	Error string `json:"error"`
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, errorBody{Error: msg})
}
