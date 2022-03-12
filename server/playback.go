package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (s *server) mountPlayback() {

	s.router.Group(func(r chi.Router) {
		s.router.Use(s.authenticated)
		s.router.Get("/play", s.startPlayback)
		s.router.Get("/pause", s.pausePlayback)
		s.router.Get("/current-track", s.getCurrentPlayback)
		s.router.Get("/recent-track", s.getRecentlyPlayed)
		s.router.Get("/playback-state", s.getPlaybackState)
	})
}

func (s *server) getCurrentPlayback(w http.ResponseWriter, r *http.Request) {
	client, err := s.getClient(w, r)
	if err != nil {
		fmt.Println(err)
	}
	current, err := client.PlayerCurrentlyPlaying(context.Background())
	if err != nil {
		log.Fatal(err)
	}

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(current); err != nil {
		log.Fatal(err)
	}
}

func (s *server) getRecentlyPlayed(w http.ResponseWriter, r *http.Request) {
	client, err := s.getClient(w, r)
	if err != nil {
		fmt.Println(err)
	}
	recent, err := client.PlayerRecentlyPlayed(context.Background())
	if err != nil {
		log.Fatal(err)
	}

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(recent); err != nil {
		log.Fatal(err)
	}
}

func (s *server) getPlaybackState(w http.ResponseWriter, r *http.Request) {
	client, err := s.getClient(w, r)
	if err != nil {
		fmt.Println(err)
	}
	recent, err := client.PlayerState(context.Background())
	if err != nil {
		log.Fatal(err)
	}

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(recent); err != nil {
		log.Fatal(err)
	}
}

func (s *server) startPlayback(w http.ResponseWriter, r *http.Request) {
	client, err := s.getClient(w, r)
	if err != nil {
		fmt.Println(err)
	}
	play := client.Play(context.Background())

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(play); err != nil {
		log.Fatal(err)
	}
}

func (s *server) pausePlayback(w http.ResponseWriter, r *http.Request) {
	client, err := s.getClient(w, r)
	if err != nil {
		fmt.Println(err)
	}
	pause := client.Pause(context.Background())

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(pause); err != nil {
		log.Fatal(err)
	}
}
