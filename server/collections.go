package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/zmb3/spotify/v2"
)

func (s *server) mountCollections() {

	s.router.Group(func(r chi.Router) {
		r.Use(s.authenticated)
		r.Get("/current-user", s.GetUser)
		r.Get("/playlists", s.GetPlaylists)
		r.Get("/playlist/{id}", s.GetPlaylist)
		r.Get("/playlist-features/{id}", s.GetPlaylistFeatures)
	})
}

func (s *server) GetUser(w http.ResponseWriter, r *http.Request) {

	client, err := s.getClient(w, r)
	if err != nil {
		fmt.Println(err)
	}
	user, err := client.CurrentUser(context.Background())
	if err != nil {
		log.Fatal(err)
	}

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(user); err != nil {
		log.Fatal(err)
	}
}

func (s *server) GetPlaylists(w http.ResponseWriter, r *http.Request) {

	type response struct {
		Items []spotify.FullPlaylist `json:"items"`
	}

	resp := response{}

	client, err := s.getClient(w, r)
	if err != nil {
		fmt.Println(err)
	}
	playlistPage, err := client.CurrentUsersPlaylists(context.Background())
	if err != nil {
		fmt.Println(err)
	}
	for _, playlist := range playlistPage.Playlists {
		p, err := client.GetPlaylist(context.Background(), playlist.ID)
		if err != nil {
			fmt.Println(err)
		}
		resp.Items = append(resp.Items, *p)
	}

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(resp); err != nil {
		fmt.Println(err)
	}
}

func (s *server) GetPlaylist(w http.ResponseWriter, r *http.Request) {

	var _id spotify.ID
	if id := chi.URLParam(r, "id"); id != "" {
		_id = spotify.ID(id)
	} else {
		http.Error(w, http.StatusText(http.StatusBadRequest), http.StatusBadRequest)
		fmt.Println("No playlist ID provided")
		return
	}

	client, err := s.getClient(w, r)
	if err != nil {
		fmt.Println(err)
	}
	playlist, err := client.GetPlaylist(context.Background(), _id)
	if err != nil {
		log.Fatal(err)
	}

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(playlist); err != nil {
		log.Fatal(err)
	}
}

func (s *server) GetPlaylistFeatures(w http.ResponseWriter, r *http.Request) {

	type playlistFeatures struct {
		Acousticness     float32 `json:"acousticness"`
		Danceability     float32 `json:"danceability"`
		Energy           float32 `json:"energy"`
		Valence          float32 `json:"valence"`
		Instrumentalness float32 `json:"instrumentalness"`
		Liveness         float32 `json:"liveness"`
		Loudness         float32 `json:"loudness"`
		Speechiness      float32 `json:"speechiness"`
		Key              int     `json:"key"`
		Mode             int     `json:"mode"`
		Duration         int     `json:"duration_ms"`
		TimeSignature    int     `json:"time_signature"`
		Tempo            float32 `json:"tempo"`
	}

	var _id spotify.ID
	if id := chi.URLParam(r, "id"); id != "" {
		_id = spotify.ID(id)
	} else {
		http.Error(w, http.StatusText(http.StatusBadRequest), http.StatusBadRequest)
		fmt.Println("No playlist ID provided")
		return
	}

	client, err := s.getClient(w, r)
	if err != nil {
		fmt.Println(err)
	}

	trackPage, err := client.GetPlaylistTracks(context.Background(), _id)
	if err != nil {
		log.Fatal(err)
	}

	songIDs := []spotify.ID{}
	for _, song := range trackPage.Tracks {
		songIDs = append(songIDs, song.Track.ID)
	}

	features, err := client.GetAudioFeatures(context.Background(), songIDs...)
	if err != nil {
		log.Fatal(err)
	}

	pf := playlistFeatures{}
	for _, f := range features {
		pf.Acousticness += f.Acousticness
		pf.Danceability += f.Danceability
		pf.Energy += f.Energy
		pf.Valence += f.Valence
		pf.Instrumentalness += f.Instrumentalness
		pf.Liveness += f.Liveness
		pf.Loudness += f.Loudness
		pf.Speechiness += f.Speechiness
		pf.Key += f.Key
		pf.Mode += f.Mode
		pf.Duration += f.Duration
		pf.TimeSignature += f.TimeSignature
		pf.Tempo += f.Tempo
	}

	pf.Acousticness = (float32(pf.Acousticness) / float32(len(songIDs)))
	pf.Danceability = (float32(pf.Danceability) / float32(len(songIDs)))
	pf.Energy = (float32(pf.Energy) / float32(len(songIDs)))
	pf.Valence = (float32(pf.Valence) / float32(len(songIDs)))
	pf.Instrumentalness = (float32(pf.Instrumentalness) / float32(len(songIDs)))
	pf.Liveness = (float32(pf.Liveness) / float32(len(songIDs)))
	pf.Loudness = (float32(pf.Loudness) / float32(len(songIDs)))
	pf.Speechiness = (float32(pf.Speechiness) / float32(len(songIDs)))
	pf.Key = (pf.Key / len(songIDs))
	pf.Mode = (pf.Mode / len(songIDs))
	pf.Duration = (pf.Duration / len(songIDs))
	pf.TimeSignature = (pf.TimeSignature / len(songIDs))
	pf.Tempo = (float32(pf.Tempo) / float32(len(songIDs)))

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(pf); err != nil {
		log.Fatal(err)
	}
}
