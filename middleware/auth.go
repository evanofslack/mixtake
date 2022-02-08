package middleware

import (
	"net/http"

	"github.com/gorilla/sessions"
)


var Store = sessions.NewCookieStore([]byte("test-session-key"))
const session_name = "auth_session"

func Authenticated(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request){
		session, _ := Store.Get(r, session_name)
		if auth, ok := session.Values["authenticated"].(bool); !auth || !ok {
			http.Error(w, "Forbidden", http.StatusForbidden)

		} else {
			next.ServeHTTP(w, r)
		}
	})
}
