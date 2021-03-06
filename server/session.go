package main

import (
	"fmt"
	"os"
	"time"

	"github.com/gorilla/sessions"
	"golang.org/x/oauth2"
)

func newStore() *sessions.CookieStore {

	store := sessions.NewCookieStore([]byte(os.Getenv("SESSION_KEY")))
	store.Options = &sessions.Options{
		Domain:   "localhost",
		Path:     "/",
		MaxAge:   0,
		HttpOnly: true,
	}
	return store
}

func getToken(s *sessions.Session) *oauth2.Token {
	access := s.Values["access-token"].(string)
	refresh := s.Values["refresh-token"].(string)
	expiry := s.Values["expiry-token"].(string)
	tokenType := s.Values["type-token"].(string)

	t, err := time.Parse(time.RFC3339, expiry)
	if err != nil {
		fmt.Println(err)
	}

	token := new(oauth2.Token)
	token.AccessToken = access
	token.RefreshToken = refresh
	token.Expiry = t
	token.TokenType = tokenType

	return token
}

func setToken(t *oauth2.Token, s *sessions.Session) {
	s.Values["access-token"] = t.AccessToken
	s.Values["refresh-token"] = t.RefreshToken
	s.Values["expiry-token"] = t.Expiry.Format(time.RFC3339)
	s.Values["type-token"] = t.TokenType
}
