package server

import (
	"net/http/httptest"
	"testing"
	"time"
)

func TestRateLimiter(t *testing.T) {
	l := newRateLimiter(2, 3)
	t0 := time.Unix(600, 0) // the start of a window
	steps := []struct {
		ip   string
		at   time.Duration
		want int
	}{
		{"a", 0, 0},
		{"a", time.Second, 0},
		{"a", 10 * time.Second, 50}, // per-ip limit; 50s left in the window
		{"b", 10 * time.Second, 0},
		{"c", 59*time.Second + 500*time.Millisecond, 1}, // global limit; rounds up to 1s
		{"a", time.Minute, 0},                           // new window
	}
	for i, s := range steps {
		if got := l.hit(s.ip, t0.Add(s.at)); got != s.want {
			t.Errorf("step %d (%s at %v) = %d, want %d", i, s.ip, s.at, got, s.want)
		}
	}
}

func TestClientIP(t *testing.T) {
	tests := []struct {
		name   string
		trust  bool
		header string
		value  string
		want   string
	}{
		{"untrusted ignores header", false, "X-Forwarded-For", "1.1.1.1", "192.0.2.1"},
		{"rightmost forwarded entry", true, "X-Forwarded-For", "6.6.6.6, 1.1.1.1", "1.1.1.1"},
		{"single forwarded entry", true, "X-Forwarded-For", " 1.1.1.1 ", "1.1.1.1"},
		{"missing header falls back", true, "X-Forwarded-For", "", "192.0.2.1"},
		{"custom header taken whole", true, "CF-Connecting-IP", "2.2.2.2", "2.2.2.2"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest("POST", "/api/mixes", nil)
			if tt.value != "" {
				r.Header.Set(tt.header, tt.value)
			}
			if got := clientIP(r, tt.trust, tt.header); got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}
