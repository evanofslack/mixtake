package main

import (
	"fmt"
	"net/http"
	"os"

	"mixtake/handlers"

	"github.com/go-chi/chi/v5"
)


func main() {

	handlers.InitAuth()

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
	r.Route("/read", func(r chi.Router) {
		r.Get("/", handlers.TestSessionRead)
	})
	r.Route("/write", func(r chi.Router) {
		r.Get("/", handlers.TestSessionWrite)
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