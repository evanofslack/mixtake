package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/sessions"
	"github.com/zmb3/spotify/v2"
	spotifyauth "github.com/zmb3/spotify/v2/auth"
)

type Handler struct {
	store *sessions.CookieStore
	auth  *spotifyauth.Authenticator
}

func NewHandler() *Handler {

	store := sessions.NewCookieStore([]byte(os.Getenv("SESSION_KEY")))
	store.Options = &sessions.Options{
		Domain:   "localhost",
		Path:     "/",
		MaxAge:   0,
		HttpOnly: true,
	}
	auth := spotifyauth.New(spotifyauth.WithRedirectURL(os.Getenv("REDIRECT_URL")), spotifyauth.WithScopes(spotifyauth.ScopeUserReadPrivate, spotifyauth.ScopeUserReadPlaybackState, spotifyauth.ScopeUserModifyPlaybackState, spotifyauth.ScopeUserReadRecentlyPlayed, spotifyauth.ScopeUserReadCurrentlyPlaying))

	h := &Handler{store: store, auth: auth}
	return h
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {

	expiration := time.Now().Add(10 * time.Minute)
	// state := generateState(16)
	state := "1234"
	http.SetCookie(w, &http.Cookie{Name: "oauthstate", Value: state, Path: "/", Expires: expiration, Secure: false, HttpOnly: true})

	type response struct {
		Url string `json:"url"`
	}
	resp := response{Url: h.auth.AuthURL(state)}

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(resp); err != nil {
		log.Fatal(err)
	}
}

func (h *Handler) Callback(w http.ResponseWriter, r *http.Request) {
	s, _ := h.store.Get(r, session_name)
	state, err := r.Cookie("oauthstate")
	if err != nil {
		fmt.Println("here")
		log.Fatal(err)
	}
	token, err := auth.Token(r.Context(), state.Value, r)
	if err != nil {
		http.Error(w, "Couldn't get token", http.StatusForbidden)
		log.Fatal(err)
	}
	if st := r.FormValue("state"); st != state.Value {
		http.NotFound(w, r)
		log.Fatalf("State mismatch: %s != %s\n", st, state.Value)
	}

	client := spotify.New(auth.Client(r.Context(), token))
	user, err := client.CurrentUser(context.Background())
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(user.ID)

	s.Values["authenticated"] = true
	SetToken(token, s)

	e := s.Save(r, w)
	if e != nil {
		http.Error(w, e.Error(), http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "http://localhost:3000/", http.StatusTemporaryRedirect)
}
