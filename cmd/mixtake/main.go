// Command mixtake serves the mixtake API and web app. `mixtake healthcheck` exits 0 when the
// server on PORT answers /api/health, for the Docker HEALTHCHECK in an image without a shell.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/evanofslack/mixtake/internal/analyzer"
	"github.com/evanofslack/mixtake/internal/config"
	"github.com/evanofslack/mixtake/internal/logging"
	"github.com/evanofslack/mixtake/internal/metrics"
	"github.com/evanofslack/mixtake/internal/mix"
	"github.com/evanofslack/mixtake/internal/server"
	"github.com/evanofslack/mixtake/internal/spotify"
	"github.com/evanofslack/mixtake/internal/store"
	"github.com/evanofslack/mixtake/web"
)

func main() {
	cmd := run
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		cmd = healthcheck
	}
	if err := cmd(); err != nil {
		fmt.Fprintln(os.Stderr, "mixtake:", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}
	log := logging.New(os.Stderr, cfg.LogFormat, cfg.LogLevel)
	slog.SetDefault(log)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	m := metrics.New()

	st, err := store.Open(cfg.DBPath)
	if err != nil {
		return fmt.Errorf("store: %w", err)
	}
	defer func() {
		if err := st.Close(); err != nil {
			log.Error("closing store", "error", err)
		}
	}()

	an, err := newAnalyzer(ctx, cfg.AnalyzerURL)
	if err != nil {
		return fmt.Errorf("analyzer: %w", err)
	}

	// Jobs run under their own context: cancelling it on shutdown stops them and closes every SSE
	// stream, so the HTTP servers can drain. Defers run in reverse: cancel, wait, then close the store.
	jobsCtx, cancelJobs := context.WithCancel(context.Background())
	runner := mix.NewRunner(jobsCtx, spotify.New(m), an, st, m, mix.RunnerConfig{
		MaxPasteTracks:     cfg.MaxPasteTracks,
		SpotifyConcurrency: cfg.SpotifyConcurrency,
		AnalyzeConcurrency: cfg.AnalyzeConcurrency,
	})
	defer runner.Wait()
	defer cancelJobs()

	static := web.FS()
	srv := server.New(server.Deps{
		Log:    log,
		Static: static,
		Runner: runner,
		Limits: server.Limits{
			RateLimit:       cfg.RateLimit,
			GlobalRateLimit: cfg.GlobalRateLimit,
			TrustProxy:      cfg.TrustProxy,
			ClientIPHeader:  cfg.ClientIPHeader,
		},
	})

	servers := []*http.Server{{
		Addr:    net.JoinHostPort("", strconv.Itoa(cfg.Port)),
		Handler: srv.Handler(),
		// no write timeout: SSE responses stay open while a mix is analysed
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}}
	if cfg.MetricsPort != 0 {
		servers = append(servers, &http.Server{
			Addr:              net.JoinHostPort("", strconv.Itoa(cfg.MetricsPort)),
			Handler:           m.Handler(),
			ReadHeaderTimeout: 10 * time.Second,
		})
	}

	log.Info("starting", "port", cfg.Port, "metrics_port", cfg.MetricsPort, "db", cfg.DBPath,
		"web", static != nil, "analyzer", orDefault(cfg.AnalyzerURL, "fake"))

	errs := make(chan error, len(servers))
	for _, s := range servers {
		go func() {
			if err := s.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
				errs <- fmt.Errorf("listen %s: %w", s.Addr, err)
			}
		}()
	}

	select {
	case err := <-errs:
		return err
	case <-ctx.Done():
	}
	log.Info("shutting down")
	cancelJobs()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	var shutdownErr error
	for _, s := range servers {
		shutdownErr = errors.Join(shutdownErr, s.Shutdown(shutdownCtx))
	}
	return shutdownErr
}

// healthcheck checks that the server on this host's PORT is up.
func healthcheck() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}
	c := http.Client{Timeout: 3 * time.Second}
	resp, err := c.Get("http://" + net.JoinHostPort("127.0.0.1", strconv.Itoa(cfg.Port)) + "/api/health")
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("health: %s", resp.Status)
	}
	return nil
}

// newAnalyzer returns the Essentia sidecar client when url is set, waiting for it to be ready.
func newAnalyzer(ctx context.Context, url string) (mix.Analyzer, error) {
	if url == "" {
		// deterministic features, with a small delay so the UI can watch results stream in
		return analyzer.Fake{Delay: 150 * time.Millisecond}, nil
	}
	c, err := analyzer.NewClient(ctx, url, nil)
	if err != nil {
		return nil, err
	}
	slog.InfoContext(ctx, "analyzer ready", "url", url, "model_version", c.ModelVersion())
	return c, nil
}

func orDefault(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}
