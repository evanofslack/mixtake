package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/joho/godotenv"
)

func main() {

	err := godotenv.Load()
	if err != nil {
		log.Fatal("Error loading .env file")
	}

	s := newServer()

	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"https://*", "http://*", "http://localhost"},
		AllowedMethods:   []string{"GET"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           500,
	}))

	r.Route("/ping", func(r chi.Router) {
		r.Get("/", Ping)
	})
	r.Route("/login", func(r chi.Router) {
		r.Get("/", s.login)
	})
	r.Route("/logout", func(r chi.Router) {
		r.Get("/", s.logout)
	})
	r.Route("/callback", func(r chi.Router) {
		r.Get("/", s.callback)
	})

	r.Group(func(r chi.Router) {
		r.Use(s.Authenticated)
		r.Get("/current-user", s.GetUser)
		r.Get("/playlists", s.GetPlaylists)
		r.Get("/playlist/{id}", s.GetPlaylist)
		r.Get("/playlist-features/{id}", s.GetPlaylistFeatures)
	})

	r.Group(func(r chi.Router) {
		r.Use(s.Authenticated)
		// r.Get("/play", StartPlayback)
		// r.Get("/pause", PausePlayback)
		// r.Get("/current-track", GetCurrentPlayback)
		// r.Get("/recent-track", GetRecentlyPlayed)
		// r.Get("/playback-state", GetPlaybackState)

	})

	fmt.Println("listening...")
	http.ListenAndServe(getPort(), r)

}

func getPort() string {
	var port = os.Getenv("PORT")
	if port == "" {
		port = "8080"
		fmt.Println("No PORT env variable found, defaulting to: " + port)
	}
	return ":" + port
}
