// Package config reads mixtake's settings from environment variables.
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
)

// Config is every setting, with defaults suitable for local dev.
type Config struct {
	Port        int    // PORT
	MetricsPort int    // METRICS_PORT, 0 disables the metrics listener
	DBPath      string // DB_PATH
	// AnalyzerURL is the Essentia sidecar. Empty uses the deterministic fake analyzer.
	AnalyzerURL string // ANALYZER_URL
	AnalogdbURL string // ANALOGDB_URL

	TrustProxy     bool   // TRUST_PROXY: take the client ip from ClientIPHeader
	ClientIPHeader string // CLIENT_IP_HEADER
	RateLimit      int    // RATE_LIMIT_PER_MINUTE: new mixes per client ip

	MaxPasteTracks     int // MAX_PASTE_TRACKS
	AnalyzeConcurrency int // ANALYZE_CONCURRENCY: tracks analysed at once, across all jobs
	SpotifyConcurrency int // SPOTIFY_CONCURRENCY: Spotify requests at once, per job

	LogLevel  slog.Level // LOG_LEVEL: debug, info, warn, error
	LogFormat string     // LOG_FORMAT: text or json
}

// Load reads the config from the process environment.
func Load() (Config, error) { return Parse(os.Getenv) }

// Parse reads the config using getenv, so tests can supply their own environment.
func Parse(getenv func(string) string) (Config, error) {
	p := parser{getenv: getenv}
	c := Config{
		Port:               p.int("PORT", 8080),
		MetricsPort:        p.int("METRICS_PORT", 9090),
		DBPath:             p.str("DB_PATH", "mixtake.db"),
		AnalyzerURL:        strings.TrimRight(p.str("ANALYZER_URL", ""), "/"),
		AnalogdbURL:        strings.TrimRight(p.str("ANALOGDB_URL", "https://api.analogdb.com"), "/"),
		TrustProxy:         p.bool("TRUST_PROXY", false),
		ClientIPHeader:     p.str("CLIENT_IP_HEADER", "X-Forwarded-For"),
		RateLimit:          p.int("RATE_LIMIT_PER_MINUTE", 10),
		MaxPasteTracks:     p.int("MAX_PASTE_TRACKS", 300),
		AnalyzeConcurrency: p.int("ANALYZE_CONCURRENCY", 4),
		SpotifyConcurrency: p.int("SPOTIFY_CONCURRENCY", 4),
		LogFormat:          p.str("LOG_FORMAT", "text"),
	}
	if err := c.LogLevel.UnmarshalText([]byte(p.str("LOG_LEVEL", "info"))); err != nil {
		p.errs = append(p.errs, fmt.Errorf("LOG_LEVEL: %w", err))
	}
	if c.LogFormat != "text" && c.LogFormat != "json" {
		p.errs = append(p.errs, fmt.Errorf("LOG_FORMAT: want text or json, got %q", c.LogFormat))
	}
	for name, v := range map[string]int{
		"PORT": c.Port, "RATE_LIMIT_PER_MINUTE": c.RateLimit, "MAX_PASTE_TRACKS": c.MaxPasteTracks,
		"ANALYZE_CONCURRENCY": c.AnalyzeConcurrency, "SPOTIFY_CONCURRENCY": c.SpotifyConcurrency,
	} {
		if v <= 0 {
			p.errs = append(p.errs, fmt.Errorf("%s: must be positive, got %d", name, v))
		}
	}
	return c, errors.Join(p.errs...)
}

type parser struct {
	getenv func(string) string
	errs   []error
}

func (p *parser) str(key, def string) string {
	if v := strings.TrimSpace(p.getenv(key)); v != "" {
		return v
	}
	return def
}

func (p *parser) int(key string, def int) int {
	v := p.str(key, "")
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		p.errs = append(p.errs, fmt.Errorf("%s: %w", key, err))
		return def
	}
	return n
}

func (p *parser) bool(key string, def bool) bool {
	v := p.str(key, "")
	if v == "" {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		p.errs = append(p.errs, fmt.Errorf("%s: %w", key, err))
		return def
	}
	return b
}
