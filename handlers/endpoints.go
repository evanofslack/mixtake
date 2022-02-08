package handlers

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/zmb3/spotify/v2"
	"golang.org/x/oauth2"
)


func GetID(w http.ResponseWriter, r *http.Request) {
	session, err := Store.Get(r, session_name)
	if err != nil {
		fmt.Print(err)
	}
	access := session.Values["access-token"].(string)
	refresh := session.Values["refresh-token"].(string)
	expiry := session.Values["expiry-token"].(string)
	tokenType := session.Values["type-token"].(string)

	t, err := time.Parse(time.RFC3339, expiry)
	if err != nil {
		fmt.Println(err)
	}

	token := new(oauth2.Token)
	token.AccessToken = access
	token.RefreshToken = refresh
	token.Expiry = t
	token.TokenType = tokenType
	
	client := spotify.New(auth.Client(r.Context(), token))
	user, err := client.CurrentUser(context.Background())
	if err != nil {
		log.Fatal(err)
	}

	fmt.Fprintf(w, user.ID)


}

