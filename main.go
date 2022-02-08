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
	r.Route("/ping", func(r chi.Router) {
		r.Get("/", handlers.Ping)
	})
	r.Route("/login", func(r chi.Router) {
		r.Get("/", handlers.Login)
	})
	r.Route("/callback", func(r chi.Router) {
		r.Get("/", handlers.CompleteAuth)
	})
	r.Route("/current_user", func(r chi.Router) {
		r.Use(mw.Authenticated)
		r.Get("/", handlers.GetID)
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