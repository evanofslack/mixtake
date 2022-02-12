package handlers

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"mixtake/session"

	"github.com/zmb3/spotify/v2"
	spotifyauth "github.com/zmb3/spotify/v2/auth"
)

const session_name = "auth_session"

var auth = &spotifyauth.Authenticator{}

func InitAuth() {
	redirectURL := os.Getenv("REDIRECT_URL")
	auth = spotifyauth.New(spotifyauth.WithRedirectURL(redirectURL), spotifyauth.WithScopes(spotifyauth.ScopeUserReadPrivate))
}

func CompleteAuth(w http.ResponseWriter, r *http.Request) {
	s, _ := session.Store.Get(r, session_name)
	state, err := r.Cookie("oauthstate")
	if err != nil {
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

	s.Values["authenticated"] = true
	session.SetToken(token, s)

	e := s.Save(r, w)
	if e != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "http://localhost:3000/", http.StatusTemporaryRedirect)
	fmt.Println(user.ID)

}

func Login(w http.ResponseWriter, r *http.Request) {
	expiration := time.Now().Add(10 * time.Minute)
	state := generateState(16)
	http.SetCookie(w, &http.Cookie{Name: "oauthstate", Value: state, Path: "/", Expires: expiration, Secure: true, HttpOnly: true})

	type response struct {
		Url string `json:"url"`
	}
	resp := response{Url: auth.AuthURL(state)}

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(resp); err != nil {
		log.Fatal(err)
	}

	// url := auth.AuthURL(state)
	// http.Redirect(w, r, url, http.StatusTemporaryRedirect)

}

func generateState(length int) string {
	b := make([]byte, length)
	rand.Read(b)
	state := base64.URLEncoding.EncodeToString(b)
	return state
}
