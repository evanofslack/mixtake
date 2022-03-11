package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

func GetCurrentPlayback(w http.ResponseWriter, r *http.Request) {
	client, err := getClient(w, r)
	if err != nil {
		fmt.Println(err)
	}
	current, err := client.PlayerCurrentlyPlaying(context.Background())
	if err != nil {
		log.Fatal(err)
	}

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(current); err != nil {
		log.Fatal(err)
	}
}

func GetRecentlyPlayed(w http.ResponseWriter, r *http.Request) {
	client, err := getClient(w, r)
	if err != nil {
		fmt.Println(err)
	}
	recent, err := client.PlayerRecentlyPlayed(context.Background())
	if err != nil {
		log.Fatal(err)
	}

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(recent); err != nil {
		log.Fatal(err)
	}
}

func GetPlaybackState(w http.ResponseWriter, r *http.Request) {
	client, err := getClient(w, r)
	if err != nil {
		fmt.Println(err)
	}
	recent, err := client.PlayerState(context.Background())
	if err != nil {
		log.Fatal(err)
	}

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(recent); err != nil {
		log.Fatal(err)
	}
}

func StartPlayback(w http.ResponseWriter, r *http.Request) {
	client, err := getClient(w, r)
	if err != nil {
		fmt.Println(err)
	}
	play := client.Play(context.Background())

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(play); err != nil {
		log.Fatal(err)
	}
}

func PausePlayback(w http.ResponseWriter, r *http.Request) {
	client, err := getClient(w, r)
	if err != nil {
		fmt.Println(err)
	}
	pause := client.Pause(context.Background())

	w.Header().Set("Content-Type", "application/json; charset=UTF-8")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(pause); err != nil {
		log.Fatal(err)
	}
}
