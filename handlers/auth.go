package handlers

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/sessions"
	"github.com/joho/godotenv"
	"github.com/zmb3/spotify/v2"
	spotifyauth "github.com/zmb3/spotify/v2/auth"
)

const redirectURI = "http://localhost:8080/callback"
const session_name = "auth_session"

var auth = &spotifyauth.Authenticator{}
var Store = &sessions.CookieStore{}


func InitAuth()  {
	err := godotenv.Load()
	if err != nil {
		log.Fatal("Error loading .env file")
	}
	auth = spotifyauth.New(spotifyauth.WithRedirectURL(redirectURI), spotifyauth.WithScopes(spotifyauth.ScopeUserReadPrivate))
	Store = sessions.NewCookieStore([]byte(os.Getenv("SESSION_KEY")))

}

func CompleteAuth(w http.ResponseWriter, r *http.Request) {
	session, _ := Store.Get(r, session_name)
	state, _ := r.Cookie("oauthstate")
	tok, err := auth.Token(r.Context(), state.Value, r)
	if err != nil {
		http.Error(w, "Couldn't get token", http.StatusForbidden)
		log.Fatal(err)
	}
	if st := r.FormValue("state"); st != state.Value {
		http.NotFound(w, r)
		log.Fatalf("State mismatch: %s != %s\n", st, state.Value)
	}

	// use the token to get an authenticated client
	client := spotify.New(auth.Client(r.Context(), tok))


	user, err := client.CurrentUser(context.Background())
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("You are logged in as:", user.ID)

	session.Values["access-token"] = tok.AccessToken
	session.Values["refresh-token"] = tok.RefreshToken
	session.Values["expiry-token"] = tok.Expiry
	session.Values["type-token"] = tok.TokenType
	e := session.Save(r, w)
	if e != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	

	// fmt.Println(tok.AccessToken)
	// fmt.Println(tok.RefreshToken)
	// fmt.Println(tok.Expiry)
	// fmt.Println(tok.TokenType)
	fmt.Fprintf(w, "Login Completed!")

}

func Login(w http.ResponseWriter, r *http.Request) {
	expiration := time.Now().Add(10 * time.Minute)
	state := generateState(16)
	http.SetCookie(w, &http.Cookie{Name:"oauthstate", Value: state, Expires: expiration, Secure: true, HttpOnly: true})

	url := auth.AuthURL(state)
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

func generateState(length int) string {
	b := make([]byte, length)
	rand.Read(b)
	state := base64.URLEncoding.EncodeToString(b)
	return state
}

