//go:build embedweb

// Package web embeds the Next.js static export (web/out) into the binary. Build with
// -tags embedweb after `npm run build`.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:out
var out embed.FS

// FS returns the exported site rooted at web/out.
func FS() fs.FS {
	sub, err := fs.Sub(out, "out")
	if err != nil {
		panic(err)
	}
	return sub
}
