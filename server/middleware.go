package main

import (
	"net/http"
)

func Authenticated(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s, _ := Store.Get(r, session_name)
		if auth, ok := s.Values["authenticated"].(bool); !auth || !ok {
			http.Error(w, http.StatusText(http.StatusUnauthorized), http.StatusUnauthorized)

		} else {
			next.ServeHTTP(w, r)
		}
	})
}
