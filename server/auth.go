package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/sessions"
	"github.com/zmb3/spotify/v2"
	spotifyauth "github.com/zmb3/spotify/v2/auth"
	"golang.org/x/oauth2"
)

const session_name = "auth_session"

func newAuth() *spotifyauth.Authenticator {
	redirectURL := os.Getenv("REDIRECT_URL")
	auth := spotifyauth.New(spotifyauth.WithRedirectURL(redirectURL), spotifyauth.WithScopes(spotifyauth.ScopeUserReadPrivate, spotifyauth.ScopeUserReadPlaybackState, spotifyauth.ScopeUserModifyPlaybackState, spotifyauth.ScopeUserReadRecentlyPlayed, spotifyauth.ScopeUserReadCurrentlyPlaying))
	return auth
}

func (s *server) mountAuth() {
	s.router.Route("/login", func(r chi.Router) { r.Get("/", s.login) })
	s.router.Route("/logout", func(r chi.Router) { r.Get("/", s.logout) })
	s.router.Route("/callback", func(r chi.Router) {
		r.Get("/", s.callback)
	})
}

func (s *server) login(w http.ResponseWriter, r *http.Request) {
	expiration := time.Now().Add(10 * time.Minute)
	state := generateState(16)

	http.SetCookie(w, &http.Cookie{Name: "oauthstate", Value: state, Path: "/", Expires: expiration, Secure: false, HttpOnly: true})

	type response struct {
		Url string `json:"url"`
	}
	resp := response{Url: s.auth.AuthURL(state)}

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(resp); err != nil {
		log.Fatal(err)
	}
}

func (s *server) callback(w http.ResponseWriter, r *http.Request) {
	session, _ := s.store.Get(r, session_name)
	state, err := r.Cookie("oauthstate")
	if err != nil {
		log.Fatal(err)
	}
	token, err := s.auth.Token(r.Context(), state.Value, r)
	if err != nil {
		http.Error(w, "Couldn't get token", http.StatusForbidden)
		log.Fatal(err)
	}
	if st := r.FormValue("state"); st != state.Value {
		http.NotFound(w, r)
		log.Fatalf("State mismatch: %s != %s\n", st, state.Value)
	}

	client := spotify.New(s.auth.Client(r.Context(), token))
	user, err := client.CurrentUser(r.Context())
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(user.ID)

	session.Values["authenticated"] = true
	setToken(token, session)

	e := session.Save(r, w)
	if e != nil {
		http.Error(w, e.Error(), http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "http://localhost:3000/", http.StatusTemporaryRedirect)
}

func (s *server) logout(w http.ResponseWriter, r *http.Request) {
	session, _ := s.store.Get(r, session_name)
	session.Values["authenticated"] = false
	err := session.Save(r, w)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	type response struct {
		Message string `json:"message"`
	}
	resp := response{Message: "session ended"}

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)

	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Fatal(err)
	}
}

func checkAccess(current_token, new_token *oauth2.Token, s *sessions.Session) {
	if new_token.AccessToken != current_token.AccessToken {
		setToken(new_token, s)
		fmt.Println("New access toking, saving to db")
	}
}

func (s *server) getClient(w http.ResponseWriter, r *http.Request) (*spotify.Client, error) {
	session, err := s.store.Get(r, session_name)
	if err != nil {
		return &spotify.Client{}, err
	}
	token := getToken(session)
	client := spotify.New(s.auth.Client(r.Context(), token))
	new_token, err := client.Token()
	if err != nil {
		return &spotify.Client{}, err
	}

	checkAccess(token, new_token, session)
	e := session.Save(r, w)
	if e != nil {
		return &spotify.Client{}, err
	}
	return client, nil
}

func generateState(length int) string {
	b := make([]byte, length)
	rand.Read(b)
	state := base64.URLEncoding.EncodeToString(b)
	return state
}
