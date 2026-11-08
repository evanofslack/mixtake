// Command mixtake serves the mixtake API and web app.
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
	"github.com/evanofslack/mixtake/web"
)

func main() {
	if err := run(); err != nil {
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

	an, err := newAnalyzer(ctx, cfg.AnalyzerURL)
	if err != nil {
		return fmt.Errorf("analyzer: %w", err)
	}
	_ = an // TODO: hand to the job runner once it exists

	static := web.FS()
	srv := server.New(server.Deps{Log: log, Static: static})

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

	log.Info("starting", "port", cfg.Port, "metrics_port", cfg.MetricsPort,
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
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	var shutdownErr error
	for _, s := range servers {
		shutdownErr = errors.Join(shutdownErr, s.Shutdown(shutdownCtx))
	}
	return shutdownErr
}

// newAnalyzer returns the Essentia sidecar client when url is set, waiting for it to be ready.
func newAnalyzer(ctx context.Context, url string) (mix.Analyzer, error) {
	if url == "" {
		// TODO: return the fake analyzer (internal/analyzer/fake.go) once it lands on main.
		return nil, nil
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
