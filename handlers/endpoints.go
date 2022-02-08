package handlers

import (
	"context"
	"fmt"
	"log"
	"net/http"

	"mixtake/session"

	"github.com/gorilla/sessions"
	"github.com/zmb3/spotify/v2"
	"golang.org/x/oauth2"
)

func checkAccess(current_token, new_token *oauth2.Token, s *sessions.Session) {
	if new_token.AccessToken != current_token.AccessToken {
		session.SetToken(new_token, s)
		fmt.Println("New access toking, saving to db")
	}

}

func GetID(w http.ResponseWriter, r *http.Request) {
	s, err := session.Store.Get(r, session_name)
	if err != nil {
		fmt.Print(err)
	}
	token := session.GetToken(s)
	client := spotify.New(auth.Client(r.Context(), token))
	new_token, err := client.Token()
	if err != nil {
		fmt.Println(err)
	}

	checkAccess(token, new_token, s)
	e := s.Save(r, w)
	if e != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	user, err := client.CurrentUser(context.Background())
	if err != nil {
		log.Fatal(err)
	}

	fmt.Fprintf(w, user.ID)
}


func GetPlaylists(w http.ResponseWriter, r *http.Request) {
	s, err := session.Store.Get(r, session_name)
	if err != nil {
		fmt.Print(err)
	}
	token := session.GetToken(s)
	client := spotify.New(auth.Client(r.Context(), token))
	new_token, err := client.Token()
	if err != nil {
		fmt.Println(err)
	}

	checkAccess(token, new_token, s)
	e := s.Save(r, w)
	if e != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	playlists, err := client.CurrentUsersPlaylists(context.Background())
	if err != nil {
		log.Fatal(err)
	}
	for _,p := range(playlists.Playlists) {
		fmt.Println(p.Name)
	}
 
	fmt.Fprintf(w, playlists.Playlists[0].Name)
}