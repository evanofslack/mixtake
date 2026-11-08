package analyzer

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/evanofslack/mixtake/internal/mix"
)

const okFeatures = `{"model_version":"v1","features":{"tempo":120.5,"key":"A","mode":"minor",
"danceable":0.8,"happy":0.1,"sad":0.6,"relaxed":0.3,"aggressive":0.2,"party":0.5,"acoustic":0.05,
"instrumental":0.9,"valence":0.4,"arousal":0.55,
"genres":[{"name":"Electronic---House","score":0.7},{"name":"Electronic---Techno","score":0.2},
{"name":"Hip Hop---Trap","score":0.05}]}}`

// sidecar fakes the analyzer: /health reports v1, /analyze answers with status and body.
func sidecar(t *testing.T, status int, body string) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, `{"status":"ok","model_version":"v1"}`)
	})
	mux.HandleFunc("POST /analyze", func(w http.ResponseWriter, r *http.Request) {
		f, h, err := r.FormFile("audio")
		if err != nil {
			http.Error(w, `{"detail":"no audio"}`, http.StatusUnprocessableEntity)
			return
		}
		b, _ := io.ReadAll(f)
		if h.Filename != "track1.mp3" || string(b) != "ID3mp3data" {
			http.Error(w, `{"detail":"unexpected upload"}`, http.StatusTeapot)
			return
		}
		w.WriteHeader(status)
		io.WriteString(w, body)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestNewClient(t *testing.T) {
	srv := sidecar(t, http.StatusOK, okFeatures)
	c, err := NewClient(t.Context(), srv.URL+"/", nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := c.ModelVersion(); got != "v1" {
		t.Errorf("ModelVersion() = %q, want v1", got)
	}
}

func TestNewClientRetriesUntilReady(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) < 3 {
			http.Error(w, "starting", http.StatusServiceUnavailable)
			return
		}
		io.WriteString(w, `{"status":"ok","model_version":"v2"}`)
	}))
	defer srv.Close()

	c, err := NewClient(t.Context(), srv.URL, nil)
	if err != nil {
		t.Fatal(err)
	}
	if c.ModelVersion() != "v2" || calls.Load() != 3 {
		t.Errorf("version %q after %d calls, want v2 after 3", c.ModelVersion(), calls.Load())
	}
}

func TestNewClientGivesUp(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "down", http.StatusBadGateway)
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(t.Context(), 600*time.Millisecond)
	defer cancel()
	_, err := NewClient(ctx, srv.URL, nil)
	var se *StatusError
	if !errors.As(err, &se) || se.Code != http.StatusBadGateway || se.Message != "down" {
		t.Fatalf("err = %v, want a 502 StatusError", err)
	}
}

func TestAnalyze(t *testing.T) {
	tests := []struct {
		name    string
		status  int
		body    string
		wantErr string
	}{
		{name: "ok", status: http.StatusOK, body: okFeatures},
		{
			name:    "undecodable",
			status:  http.StatusBadRequest,
			body:    `{"detail":"can't decode audio: unsupported format"}`,
			wantErr: "400 Bad Request: can't decode audio: unsupported format",
		},
		{
			name:    "server error",
			status:  http.StatusInternalServerError,
			body:    "Internal Server Error",
			wantErr: "500 Internal Server Error: Internal Server Error",
		},
		{
			name:    "validation error",
			status:  http.StatusUnprocessableEntity,
			body:    `{"detail":[{"msg":"Field required"}]}`,
			wantErr: `[{"msg":"Field required"}]`,
		},
		{
			name:    "model version changed",
			status:  http.StatusOK,
			body:    `{"model_version":"v2","features":{}}`,
			wantErr: "model version changed from v1 to v2",
		},
		{name: "bad json", status: http.StatusOK, body: `{`, wantErr: "decode response"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := sidecar(t, tt.status, tt.body)
			c, err := NewClient(t.Context(), srv.URL, srv.Client())
			if err != nil {
				t.Fatal(err)
			}
			f, err := c.Analyze(t.Context(), "track1", strings.NewReader("ID3mp3data"))
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("err = %v, want it to contain %q", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if f.Tempo != 120.5 || f.Key != "A" || f.Mode != "minor" || f.Instrumental != 0.9 ||
				f.Arousal != 0.55 || len(f.Genres) != 3 ||
				f.Genres[0] != (mix.Genre{Name: "Electronic---House", Score: 0.7}) {
				t.Errorf("features = %+v", f)
			}
		})
	}
}
