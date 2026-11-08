//go:build !embedweb

package web

import "io/fs"

// FS returns nil: this binary was built without -tags embedweb, so the web app is served by
// `next dev` instead.
func FS() fs.FS { return nil }
