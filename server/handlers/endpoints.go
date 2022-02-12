package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"mixtake/session"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/sessions"
	"github.com/zmb3/spotify/v2"
	"golang.org/x/oauth2"
)

func checkAccess(current_token, new_token *oauth2.Token, s *sessions.Session) {
	if new_token.AccessToken != current_token.AccessToken {
		session.SetToken(new_token, s)
		fmt.Println("New access toking, saving to db")
	}
}

func getClient(w http.ResponseWriter, r *http.Request) (*spotify.Client, error){
	s, err := session.Store.Get(r, session_name)
	if err != nil {
		return &spotify.Client{}, err
	}
	token := session.GetToken(s)
	client := spotify.New(auth.Client(r.Context(), token))
	new_token, err := client.Token()
	if err != nil {
		return &spotify.Client{}, err
	}

	checkAccess(token, new_token, s)
	e := s.Save(r, w)
	if e != nil {
		return &spotify.Client{}, err
	}
	return client, nil
}

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
	if err := json.NewEncoder(w).Encode(user); err != nil {
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

	// for _, p := range(playlists.Playlists) {
	// 	fmt.Println(p.ID)
	// }

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(playlists); err != nil {
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
	if err := json.NewEncoder(w).Encode(songs); err != nil {
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
	if err := json.NewEncoder(w).Encode(features[0]); err != nil {
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
	if err := json.NewEncoder(w).Encode(analysis); err != nil {
		log.Fatal(err)
	}
} 