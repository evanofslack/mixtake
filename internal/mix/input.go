package mix

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
)

// Input is what a user pasted: one playlist, one album, or an ordered list of tracks.
type Input struct {
	Kind     SourceKind
	ID       string   // playlist or album id; empty for tracks
	TrackIDs []string // pasted track ids in order, without duplicates; empty otherwise
}

// ErrTooManyTracks is returned when more tracks are pasted than allowed.
var ErrTooManyTracks = errors.New("too many tracks")

// InputError is a problem with what the user pasted. Its message is safe to show them.
type InputError struct {
	Msg string
	Err error // ErrUnsupported or ErrTooManyTracks
}

func (e *InputError) Error() string { return e.Msg }
func (e *InputError) Unwrap() error { return e.Err }

func inputErr(err error, format string, args ...any) error {
	return &InputError{Msg: fmt.Sprintf(format, args...), Err: err}
}

// ParseInput reads one playlist or album link, or many track links or URIs separated by
// whitespace. Links may be open.spotify.com URLs (with or without an intl-xx/ prefix and query
// string) or spotify: URIs.
func ParseInput(text string, maxTracks int) (Input, error) {
	var (
		collections []ref // playlists and albums
		tracks      []string
		seen        = map[string]bool{}
	)
	for _, tok := range strings.Fields(text) {
		r, ok, err := parseRef(tok)
		if err != nil {
			return Input{}, err
		}
		if !ok {
			continue // not a Spotify link; ignore stray words from a paste
		}
		if r.kind == "track" {
			if !seen[r.id] {
				seen[r.id] = true
				tracks = append(tracks, r.id)
			}
			continue
		}
		collections = append(collections, r)
	}

	switch {
	case len(collections) == 0 && len(tracks) == 0:
		return Input{}, inputErr(ErrUnsupported,
			"Paste a Spotify playlist or album link, or some track links.")
	case len(collections) > 0 && len(tracks) > 0:
		return Input{}, inputErr(ErrUnsupported,
			"Paste either one playlist or album link, or track links, not both.")
	case len(collections) > 1:
		return Input{}, inputErr(ErrUnsupported, "Paste one playlist or album link at a time.")
	case len(collections) == 1:
		c := collections[0]
		return Input{Kind: SourceKind(c.kind), ID: c.id}, nil
	case len(tracks) > maxTracks:
		return Input{}, inputErr(ErrTooManyTracks,
			"That's %d tracks; the most a mix can have is %d.", len(tracks), maxTracks)
	}
	return Input{Kind: KindTracks, TrackIDs: tracks}, nil
}

type ref struct{ kind, id string }

// parseRef reads one token. ok is false when the token isn't Spotify-related at all; err is set
// when it is a Spotify link that mixtake can't use.
func parseRef(tok string) (r ref, ok bool, err error) {
	var kind, id string
	switch {
	case strings.HasPrefix(tok, "spotify:"):
		// spotify:track:id, or the legacy spotify:user:name:playlist:id
		parts := strings.Split(tok, ":")
		if len(parts) < 3 {
			return ref{}, false, unsupported(tok)
		}
		kind, id = parts[len(parts)-2], parts[len(parts)-1]
	case strings.Contains(tok, "spotify.com/") || strings.Contains(tok, "spotify.link/"):
		raw := tok
		if !strings.Contains(raw, "://") {
			raw = "https://" + raw
		}
		u, perr := url.Parse(raw)
		if perr == nil && u.Host == "spotify.link" {
			return ref{}, false, inputErr(ErrUnsupported,
				"Short spotify.link links aren't supported; open it and copy the full link.")
		}
		if perr != nil || u.Host != "open.spotify.com" {
			return ref{}, false, unsupported(tok)
		}
		segs := strings.Split(strings.Trim(u.Path, "/"), "/")
		if len(segs) > 0 && strings.HasPrefix(segs[0], "intl-") {
			segs = segs[1:]
		}
		if len(segs) > 0 && segs[0] == "embed" {
			segs = segs[1:]
		}
		if len(segs) < 2 {
			return ref{}, false, unsupported(tok)
		}
		kind, id = segs[0], segs[1]
	default:
		return ref{}, false, nil
	}
	switch kind {
	case "playlist", "album", "track":
	case "":
		return ref{}, false, unsupported(tok)
	default:
		return ref{}, false, inputErr(ErrUnsupported,
			"%s links aren't supported; paste a playlist, album or track link.", capitalize(kind))
	}
	if !validID(id) {
		return ref{}, false, unsupported(tok)
	}
	return ref{kind: kind, id: id}, true, nil
}

func unsupported(tok string) error {
	if len(tok) > 80 {
		tok = tok[:80] + "…"
	}
	return inputErr(ErrUnsupported, "%q isn't a Spotify playlist, album or track link.", tok)
}

// validID reports whether id is a 22 character base62 Spotify id.
func validID(id string) bool {
	if len(id) != 22 {
		return false
	}
	for _, c := range id {
		if !('0' <= c && c <= '9' || 'a' <= c && c <= 'z' || 'A' <= c && c <= 'Z') {
			return false
		}
	}
	return true
}

func capitalize(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
