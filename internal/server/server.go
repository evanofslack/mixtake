// Package server is mixtake's HTTP layer: routing, middleware, JSON helpers and static files.
package server

import (
	"encoding/json"
	"io/fs"
	"log/slog"
	"net/http"
)

// Deps is everything the handlers need.
type Deps struct {
	Log *slog.Logger
	// Static is the exported web app, or nil when the binary was built without -tags embedweb.
	Static fs.FS
}

// Server routes API requests and serves the web app.
type Server struct {
	deps Deps
	mux  *http.ServeMux
}

// New builds the server and registers every route.
func New(deps Deps) *Server {
	s := &Server{deps: deps, mux: http.NewServeMux()}
	s.mux.HandleFunc("GET /api/health", s.health)
	s.mux.Handle("/api/", http.HandlerFunc(s.apiNotFound))
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
