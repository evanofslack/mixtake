package main

import (
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
		auth:   NewAuth(),
		store:  NewStore(),
	}
	return s
}
