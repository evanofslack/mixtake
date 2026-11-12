package server

import (
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/evanofslack/mixtake/internal/mix"
)

const (
	msgTooFew      = "Not enough songs analyzed yet."
	msgPhotosError = "analogdb didn't respond. Try again in a moment."
	imageCache     = "public, max-age=31536000, immutable"
)

// mixPhotos handles GET /api/mixes/{id}/photos?vibe=&seed=: ranked cover photos for the mix's
// current profile. vibe overrides the mix's stored vibe for this search only; a seed other than 0
// shuffles to a different set.
func (s *Server) mixPhotos(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	vibe, err := mix.CoverVibe(q.Get("vibe"))
	var seed int
	if err == nil {
		seed, err = mix.CoverSeed(q.Get("seed"))
	}
	var inputErr *mix.InputError
	if errors.As(err, &inputErr) {
		writeError(w, http.StatusBadRequest, inputErr.Msg)
		return
	}
	snap, err := s.deps.Runner.Snapshot(r.Context(), r.PathValue("id"))
	if errors.Is(err, mix.ErrNotFound) {
		writeError(w, http.StatusNotFound, "mix not found")
		return
	} else if err != nil {
		s.internalError(w, r, err)
		return
	}
	set, err := s.deps.Covers.ForMix(r.Context(), snap, vibe, seed)
	s.writePhotos(w, r, set, err)
}

// similarPhotos handles GET /api/photos/{id}/similar.
func (s *Server) similarPhotos(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		writeError(w, http.StatusNotFound, "photo not found")
		return
	}
	set, err := s.deps.Covers.Similar(r.Context(), id)
	s.writePhotos(w, r, set, err)
}

func (s *Server) writePhotos(w http.ResponseWriter, r *http.Request, set mix.PhotoSet, err error) {
	switch {
	case err == nil:
		writeJSON(w, http.StatusOK, set)
	case errors.Is(err, mix.ErrTooFew):
		writeError(w, http.StatusConflict, msgTooFew)
	case errors.Is(err, mix.ErrNotFound):
		writeError(w, http.StatusNotFound, "photo not found")
	case errors.Is(err, mix.ErrUpstream):
		s.deps.Log.WarnContext(r.Context(), "photos", "path", r.URL.Path, "error", err)
		writeError(w, http.StatusBadGateway, msgPhotosError)
	default:
		s.internalError(w, r, err)
	}
}

// image handles GET /api/img/{name}: an analogdb image, proxied so the browser canvas can export
// it. Only analogdb image file names are served.
func (s *Server) image(w http.ResponseWriter, r *http.Request) {
	body, contentType, err := s.deps.Covers.Image(r.Context(), r.PathValue("name"))
	switch {
	case errors.Is(err, mix.ErrNotFound):
		writeError(w, http.StatusNotFound, "image not found")
		return
	case err != nil:
		s.deps.Log.WarnContext(r.Context(), "image", "path", r.URL.Path, "error", err)
		writeError(w, http.StatusBadGateway, msgPhotosError)
		return
	}
	defer body.Close()
	h := w.Header()
	h.Set("Content-Type", contentType)
	h.Set("Cache-Control", imageCache)
	h.Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	if _, err := io.Copy(w, body); err != nil && r.Context().Err() == nil {
		s.deps.Log.WarnContext(r.Context(), "image copy", "path", r.URL.Path, "error", err)
	}
}
