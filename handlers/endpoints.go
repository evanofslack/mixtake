package handlers

import (
	"context"
	"fmt"
	"log"
	"net/http"

	"mixtake/session"

	"github.com/zmb3/spotify/v2"
)


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

	if new_token.AccessToken != token.AccessToken {
		// db.saveTok()
		session.SetToken(new_token, s)
		e := s.Save(r, w)
		if e != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		fmt.Println("New access toking, saving to db")
	}

	user, err := client.CurrentUser(context.Background())
	if err != nil {
		log.Fatal(err)
	}

	fmt.Fprintf(w, user.ID)
}

