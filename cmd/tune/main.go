// Command tune runs a Spotify link through the real pipeline (catalog, store, analyzer, analogdb)
// and prints the profile, the scene queries, the target palette and the top cover photos, for
// tuning internal/mix/scenes.json.
//
//	go run ./cmd/tune -link https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO [-vibe "…"]
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"text/tabwriter"

	"github.com/evanofslack/mixtake/internal/analogdb"
	"github.com/evanofslack/mixtake/internal/analyzer"
	"github.com/evanofslack/mixtake/internal/config"
	"github.com/evanofslack/mixtake/internal/metrics"
	"github.com/evanofslack/mixtake/internal/mix"
	"github.com/evanofslack/mixtake/internal/spotify"
	"github.com/evanofslack/mixtake/internal/store"
)

func main() {
	link := flag.String("link", "", "Spotify playlist, album or track link")
	vibe := flag.String("vibe", "", "optional vibe text")
	top := flag.Int("n", 5, "photos to print")
	flag.Parse()
	if *link == "" {
		fmt.Fprintln(os.Stderr, "usage: tune -link <spotify link> [-vibe text] [-n 5]")
		os.Exit(2)
	}
	if err := run(*link, *vibe, *top, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "tune:", err)
		os.Exit(1)
	}
}

func run(link, vibe string, top int, out io.Writer) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn})))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	m := metrics.New()
	st, err := store.Open(cfg.DBPath)
	if err != nil {
		return err
	}
	defer st.Close()
	var an mix.Analyzer = analyzer.Fake{}
	if cfg.AnalyzerURL != "" {
		if an, err = analyzer.NewClient(ctx, cfg.AnalyzerURL, nil); err != nil {
			return err
		}
	}
	runner := mix.NewRunner(ctx, spotify.New(m), an, st, m, mix.RunnerConfig{
		MaxPasteTracks:     cfg.MaxPasteTracks,
		SpotifyConcurrency: cfg.SpotifyConcurrency,
		AnalyzeConcurrency: cfg.AnalyzeConcurrency,
	})
	defer runner.Wait()
	covers := mix.NewCovers(analogdb.New(cfg.AnalogdbURL, "", nil, m), 0)

	created, err := runner.Create(ctx, link, vibe)
	if err != nil {
		return err
	}
	events, unsubscribe, err := runner.Subscribe(ctx, created.ID)
	if err != nil {
		return err
	}
	for ev := range events {
		if c, ok := ev.Data.(mix.Coverage); ok && ev.Name == mix.EventProgress {
			fmt.Fprintf(os.Stderr, "\ranalysing %d/%d", c.Done+c.Failed, c.Total)
		}
	}
	unsubscribe()
	fmt.Fprintln(os.Stderr)
	snap, err := runner.Snapshot(ctx, created.ID)
	if err != nil {
		return err
	}
	if snap.Profile == nil {
		return fmt.Errorf("no tracks analysed (status %s)", snap.Status)
	}
	p, err := covers.Pick(ctx, snap, snap.Mix.Vibe)
	if err != nil {
		return err
	}
	print(out, snap, p, top, orDefault(cfg.AnalyzerURL, "fake"))
	return nil
}

func print(out io.Writer, snap mix.Snapshot, p mix.Pick, top int, analyzerName string) {
	prof, a := snap.Profile, snap.Profile.Averages
	fmt.Fprintf(out, "%s (%s, mix %s, analyzer %s)\n", orDefault(snap.Mix.Source.Name, "pasted tracks"),
		snap.Mix.Source.Kind, snap.Mix.ID, analyzerName)
	fmt.Fprintf(out, "  %s\n", prof.Summary)
	fmt.Fprintf(out, "  mood %.2f  energy %.2f  acoustic %.2f  instrumental %.2f  party %.2f\n",
		a.Mood, a.Energy, a.Acoustic, a.Instrumental, a.Party)
	var genres []string
	for _, g := range prof.Genres[:min(4, len(prof.Genres))] {
		genres = append(genres, fmt.Sprintf("%s %.1f [%s]", g.Name, g.Score,
			orDefault(mix.GenreFamily(g.Name), "-")))
	}
	fmt.Fprintf(out, "  genres: %s\n", strings.Join(genres, ", "))
	fmt.Fprintf(out, "  quadrant: %s\n", p.Quadrant)
	for _, q := range p.Queries {
		fmt.Fprintf(out, "  query %-8s %.1f  %q\n", q.Source, q.Weight, q.Text)
	}
	fmt.Fprintf(out, "  palette: %s\n", strings.Join(p.Palette, " "))
	tw := tabwriter.NewWriter(out, 0, 4, 2, ' ', 0)
	for _, c := range p.Candidates[:min(top, len(p.Candidates))] {
		var url string
		for _, img := range c.Photo.Images {
			if img.Resolution == "high" {
				url = img.URL
			}
		}
		fmt.Fprintf(tw, "  %d\t%.3f\t%s\t%s\n", c.Photo.ID, c.Score, c.Photo.Caption, url)
	}
	tw.Flush()
}

func orDefault(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}
