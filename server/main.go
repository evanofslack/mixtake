package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/joho/godotenv"
)

func main() {

	err := godotenv.Load()
	if err != nil {
		log.Fatal("Error loading .env file")
	}

	s := newServer()
	s.mountMiddleware()
	s.mountStatus()
	s.mountAuth()
	s.mountCollections()
	s.mountPlayback()

	fmt.Println("listening...")
	http.ListenAndServe(s.port, s.router)

}
