package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"mixtake/handlers"
	mw "mixtake/middleware"
	"mixtake/session"

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

	handlers.InitAuth()
	session.InitSession()

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
		r.Get("/", handlers.Ping)
	})
	r.Route("/login", func(r chi.Router) {
		r.Get("/", handlers.Login)
	})
	r.Route("/logout", func(r chi.Router) {
		r.Get("/", handlers.Logout)
	})
	r.Route("/callback", func(r chi.Router) {
		r.Get("/", handlers.CompleteAuth)
	})

	r.Group(func(r chi.Router) {
		r.Use(mw.Authenticated)
		r.Get("/current-user", handlers.GetUser)
		r.Get("/playlists", handlers.GetPlaylists)
		r.Get("/playlist/{id}", handlers.GetPlaylist)
		r.Get("/playlist-features/{id}", handlers.GetPlaylistFeatures)
	})

	r.Group(func(r chi.Router) {
		r.Use(mw.Authenticated)
		r.Get("/play", handlers.StartPlayback)
		r.Get("/pause", handlers.PausePlayback)
		r.Get("/current-track", handlers.GetCurrentPlayback)
		r.Get("/recent-track", handlers.GetRecentlyPlayed)
		r.Get("/playback-state", handlers.GetPlaybackState)

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
