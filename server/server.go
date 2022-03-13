package main

import (
	"fmt"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/sessions"
	spotifyauth "github.com/zmb3/spotify/v2/auth"
)

type server struct {
	router *chi.Mux
	port   string
	auth   *spotifyauth.Authenticator
	store  *sessions.CookieStore
}

func newServer() *server {
	s := &server{
		router: chi.NewRouter(),
		port:   getPort(),
		auth:   newAuth(),
		store:  newStore(),
	}
	return s
}

func getPort() string {
	var port = os.Getenv("PORT")
	if port == "" {
		port = "8080"
		fmt.Println("No PORT env variable found, defaulting to: " + port)
	}
	return ":" + port
}
