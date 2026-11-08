package config

import (
	"log/slog"
	"strings"
	"testing"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestParseDefaults(t *testing.T) {
	c, err := Parse(env(nil))
	if err != nil {
		t.Fatal(err)
	}
	if c.Port != 8080 || c.MetricsPort != 9090 || c.AnalyzerURL != "" || c.LogLevel != slog.LevelInfo {
		t.Errorf("unexpected defaults: %+v", c)
	}
	if c.AnalogdbURL != "https://api.analogdb.com" {
		t.Errorf("AnalogdbURL = %q", c.AnalogdbURL)
	}
}

func TestParseValues(t *testing.T) {
	c, err := Parse(env(map[string]string{
		"PORT": "3001", "ANALYZER_URL": "http://analyzer:8000/", "TRUST_PROXY": "true",
		"LOG_LEVEL": "debug", "LOG_FORMAT": "json", "METRICS_PORT": "0",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if c.Port != 3001 || c.AnalyzerURL != "http://analyzer:8000" || !c.TrustProxy ||
		c.LogLevel != slog.LevelDebug || c.LogFormat != "json" || c.MetricsPort != 0 {
		t.Errorf("unexpected config: %+v", c)
	}
}

func TestParseErrors(t *testing.T) {
	tests := []struct {
		name string
		env  map[string]string
		want string
	}{
		{"bad int", map[string]string{"PORT": "x"}, "PORT"},
		{"bad bool", map[string]string{"TRUST_PROXY": "maybe"}, "TRUST_PROXY"},
		{"bad level", map[string]string{"LOG_LEVEL": "loud"}, "LOG_LEVEL"},
		{"bad format", map[string]string{"LOG_FORMAT": "xml"}, "LOG_FORMAT"},
		{"not positive", map[string]string{"ANALYZE_CONCURRENCY": "0"}, "ANALYZE_CONCURRENCY"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := Parse(env(tt.env))
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Errorf("err = %v, want mention of %s", err, tt.want)
			}
		})
	}
}
