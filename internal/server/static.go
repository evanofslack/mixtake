package server

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// staticHandler serves the Next.js static export: exact files, then "<path>.html", then
// "<path>/index.html", then 404.html. Hashed build assets are cached forever, pages are revalidated.
func staticHandler(static fs.FS) http.Handler {
	if static == nil {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "web app not embedded: run `just web` for dev, or build with -tags embedweb",
				http.StatusNotFound)
		})
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if strings.HasPrefix(name, "_next/static/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		for _, candidate := range []string{name, name + ".html", path.Join(name, "index.html")} {
			if candidate == "" || candidate == "." {
				continue
			}
			if st, err := fs.Stat(static, candidate); err == nil && !st.IsDir() {
				http.ServeFileFS(w, r, static, candidate)
				return
			}
		}
		body, err := fs.ReadFile(static, "404.html")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write(body)
	})
}
