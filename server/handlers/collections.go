package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/zmb3/spotify/v2"
)

func GetUser(w http.ResponseWriter, r *http.Request) {

	client, err := getClient(w, r)
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

func GetPlaylists(w http.ResponseWriter, r *http.Request) {
	client, err := getClient(w, r)
	if err != nil {
		fmt.Println(err)
	}
	playlists, err := client.CurrentUsersPlaylists(context.Background())
	if err != nil {
		log.Fatal(err)
	}

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(playlists); err != nil {
		log.Fatal(err)
	}
}

func GetPlaylistSongs(w http.ResponseWriter, r *http.Request) {

	var _id spotify.ID
	if id := chi.URLParam(r, "id"); id != "" {
		_id = spotify.ID(id)
	} else {
		http.Error(w, http.StatusText(http.StatusBadRequest), http.StatusBadRequest)
		fmt.Println("No playlist ID provided")
		return
	}

	client, err := getClient(w, r)
	if err != nil {
		fmt.Println(err)
	}
	songs, err := client.GetPlaylistTracks(context.Background(), _id)
	if err != nil {
		log.Fatal(err)
	}

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(songs); err != nil {
		log.Fatal(err)
	}
}

func GetSongFeatures(w http.ResponseWriter, r *http.Request) {

	var _id spotify.ID
	if id := chi.URLParam(r, "id"); id != "" {
		_id = spotify.ID(id)
	} else {
		http.Error(w, http.StatusText(http.StatusBadRequest), http.StatusBadRequest)
		fmt.Println("No song ID provided")
		return
	}

	client, err := getClient(w, r)
	if err != nil {
		fmt.Println(err)
	}
	features, err := client.GetAudioFeatures(context.Background(), _id)
	if err != nil {
		log.Fatal(err)
	}

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(features[0]); err != nil {
		log.Fatal(err)
	}
}

func GetSongAnalysis(w http.ResponseWriter, r *http.Request) {

	var _id spotify.ID
	if id := chi.URLParam(r, "id"); id != "" {
		_id = spotify.ID(id)
	} else {
		http.Error(w, http.StatusText(http.StatusBadRequest), http.StatusBadRequest)
		fmt.Println("No song ID provided")
		return
	}

	client, err := getClient(w, r)
	if err != nil {
		fmt.Println(err)
	}
	analysis, err := client.GetAudioAnalysis(context.Background(), _id)
	if err != nil {
		log.Fatal(err)
	}

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(analysis); err != nil {
		log.Fatal(err)
	}
}
