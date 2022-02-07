package middleware

import (
	"fmt"
	"net/http"

	"github.com/gorilla/sessions"
)

// var store = sessions.NewCookieStore([]byte(os.Getenv("SESSION_KEY")))
var store = sessions.NewCookieStore([]byte("test-session-key"))

func TestSessionWrite(w http.ResponseWriter, r *http.Request) {
	session, _ := store.Get(r, "test-session")
	session.Values["authenticated"] = true
	err := session.Save(r, w)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

func TestSessionRead(w http.ResponseWriter, r *http.Request) {
	session, _ := store.Get(r, "test-session")
	if auth, ok := session.Values["authenticated"].(bool); !ok || !auth {
		fmt.Println("Not authenticated")
        http.Error(w, "Forbidden", http.StatusForbidden)
        return
	}
	fmt.Println("Authenticated")

}