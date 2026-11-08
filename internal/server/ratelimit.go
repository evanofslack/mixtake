package server

import (
	"math"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const rateWindow = time.Minute

// rateLimiter is an in-memory fixed-window limiter with a per-ip and a global budget per minute.
// Counters reset each window, so memory stays bounded.
type rateLimiter struct {
	perIP, global int

	mu     sync.Mutex
	window int64
	total  int
	ips    map[string]int
}

func newRateLimiter(perIP, global int) *rateLimiter {
	return &rateLimiter{perIP: perIP, global: global, window: -1, ips: map[string]int{}}
}

// hit counts a request from ip. It returns 0 if allowed, or else the seconds until the window
// resets, for Retry-After.
func (l *rateLimiter) hit(ip string, now time.Time) int {
	l.mu.Lock()
	defer l.mu.Unlock()
	window := now.UnixNano() / int64(rateWindow)
	if window != l.window {
		l.window, l.total, l.ips = window, 0, map[string]int{}
	}
	if l.total >= l.global || l.ips[ip] >= l.perIP {
		end := time.Unix(0, (window+1)*int64(rateWindow))
		return max(1, int(math.Ceil(end.Sub(now).Seconds())))
	}
	l.total++
	l.ips[ip]++
	return 0
}

// clientIP is the request's peer address, or with trustProxy the value of header. For
// X-Forwarded-For only the rightmost entry is used: it is the one our own proxy appended, while
// the rest is whatever the client sent.
func clientIP(r *http.Request, trustProxy bool, header string) string {
	fallback, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		fallback = r.RemoteAddr
	}
	if fallback == "" {
		fallback = "unknown"
	}
	if !trustProxy {
		return fallback
	}
	value := r.Header.Get(header)
	if strings.EqualFold(header, "X-Forwarded-For") {
		if i := strings.LastIndexByte(value, ','); i >= 0 {
			value = value[i+1:]
		}
	}
	if value = strings.TrimSpace(value); value != "" {
		return value
	}
	return fallback
}
