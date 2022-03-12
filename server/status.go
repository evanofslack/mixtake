package main

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (s *server) mountStatus() {

	s.router.Route("/ping", func(r chi.Router) { r.Get("/", s.ping) })
}

func (s *server) ping(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	if err := enc.Encode("message: pong"); err != nil {
		log.Fatal(err)
	}
}
