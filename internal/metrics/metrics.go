// Package metrics defines mixtake's prometheus metrics. Keep this list to things worth alerting
// on; see docs/plan.md.
package metrics

import (
	"net/http"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Metrics holds every collector. Pass it to the packages that record them.
type Metrics struct {
	registry *prometheus.Registry

	// SpotifyRequests counts embed and preview fetches. kind: playlist, album, track, preview.
	// result: ok, not_found, private, parse_error (the page format changed), error.
	SpotifyRequests *prometheus.CounterVec
	// AnalyzerDuration times one track's analysis, including the upload to the sidecar.
	AnalyzerDuration prometheus.Histogram
	// AnalyzerQueueDepth is how many tracks are waiting for an analyzer slot.
	AnalyzerQueueDepth prometheus.Gauge
	// FeatureCache counts feature lookups. result: hit, miss.
	FeatureCache *prometheus.CounterVec
	// Jobs counts finished mix jobs. result: done, partial, failed.
	Jobs *prometheus.CounterVec
	// AnalogdbRequests counts analogdb calls. result: ok, error.
	AnalogdbRequests *prometheus.CounterVec
	// LLMRequests counts calls for cover ideas. result: ok, error. Failures fall back to the
	// canned scenes silently, so this is the only sign the LLM is down or misconfigured.
	LLMRequests *prometheus.CounterVec
}

// New registers every collector on a fresh registry, plus the Go runtime and process collectors.
func New() *Metrics {
	m := &Metrics{
		registry: prometheus.NewRegistry(),
		SpotifyRequests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "mixtake_spotify_requests_total",
			Help: "Spotify embed and preview requests, by kind and result.",
		}, []string{"kind", "result"}),
		AnalyzerDuration: prometheus.NewHistogram(prometheus.HistogramOpts{
			Name:    "mixtake_analyzer_duration_seconds",
			Help:    "Time to analyse one track.",
			Buckets: []float64{0.25, 0.5, 1, 2, 4, 8, 16, 32},
		}),
		AnalyzerQueueDepth: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "mixtake_analyzer_queue_depth",
			Help: "Tracks waiting for an analyzer slot.",
		}),
		FeatureCache: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "mixtake_feature_cache_total",
			Help: "Feature cache lookups, by result.",
		}, []string{"result"}),
		Jobs: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "mixtake_jobs_total",
			Help: "Finished mix jobs, by result.",
		}, []string{"result"}),
		AnalogdbRequests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "mixtake_analogdb_requests_total",
			Help: "analogdb requests, by result.",
		}, []string{"result"}),
		LLMRequests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "mixtake_llm_requests_total",
			Help: "LLM requests for cover ideas, by result.",
		}, []string{"result"}),
	}
	m.registry.MustRegister(
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
		m.SpotifyRequests, m.AnalyzerDuration, m.AnalyzerQueueDepth,
		m.FeatureCache, m.Jobs, m.AnalogdbRequests, m.LLMRequests,
	)
	return m
}

// Handler serves the metrics in the prometheus text format.
func (m *Metrics) Handler() http.Handler {
	return promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{})
}
