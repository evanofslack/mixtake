package llm

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/evanofslack/mixtake/internal/mix"
)

func TestComplete(t *testing.T) {
	tests := []struct {
		name     string
		statuses []int // per attempt
		reply    string
		want     string
		wantErr  bool
		calls    int32
	}{
		{"ok", []int{200}, `{"choices":[{"message":{"role":"assistant","content":"{\"a\":1}"}}]}`, `{"a":1}`, false, 1},
		{"retries 429", []int{429, 200}, `{"choices":[{"message":{"content":"hi"}}]}`, "hi", false, 2},
		{"retries 500 once", []int{500, 500}, `{}`, "", true, 2},
		{"no retry on 400", []int{400}, `{"error":"bad"}`, "", true, 1},
		{"empty reply", []int{200}, `{"choices":[]}`, "", true, 1},
		{"bad json", []int{200}, `nope`, "", true, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var calls atomic.Int32
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				n := calls.Add(1)
				if r.URL.Path != "/v1/chat/completions" || r.Method != http.MethodPost {
					t.Errorf("request %s %s", r.Method, r.URL.Path)
				}
				if got := r.Header.Get("Authorization"); got != "Bearer key" {
					t.Errorf("auth = %q", got)
				}
				var req request
				if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
					t.Error(err)
				}
				if req.Model != "m" || len(req.Messages) != 2 || req.Messages[0].Role != "system" ||
					req.Messages[1].Content != "user text" || req.ResponseFormat.Type != "json_object" {
					t.Errorf("request body %+v", req)
				}
				w.WriteHeader(tt.statuses[min(int(n), len(tt.statuses))-1])
				w.Write([]byte(tt.reply))
			}))
			defer srv.Close()
			c := New(srv.URL+"/v1/", "key", "m", srv.Client(), nil)
			c.retryWait = 0
			got, err := c.Complete(context.Background(), "system text", "user text")
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if err != nil && !errors.Is(err, mix.ErrUpstream) {
				t.Errorf("err = %v, want ErrUpstream", err)
			}
			if got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
			if calls.Load() != tt.calls {
				t.Errorf("calls = %d, want %d", calls.Load(), tt.calls)
			}
		})
	}
}
