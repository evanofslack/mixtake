package handlers

import (
	"fmt"
	"net/http"
)

func GetID(w http.ResponseWriter, r *http.Request) {
	session, err := Store.Get(r, session_name)
	if err != nil {
		fmt.Print(err)
	}
	access := session.Values["access-token"].(string)
	refresh := session.Values["refresh-token"].(string)
	// expiry := session.Values["expiry-token"].(time.Time)
	tokenType := session.Values["type-token"].(string)

	fmt.Println(access, refresh, tokenType)


	

	
	
	// client := spotify.New(auth.Client(r.Context(), tok))
	// user, err := client.CurrentUser(context.Background())
	// if err != nil {
	// 	log.Fatal(err)
	// }
	// fmt.Println("You are logged in as:", user.ID)



}

