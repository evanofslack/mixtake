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
	"image"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"slices"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/evanofslack/mixtake/internal/analogdb"
	"github.com/evanofslack/mixtake/internal/analyzer"
	"github.com/evanofslack/mixtake/internal/config"
	"github.com/evanofslack/mixtake/internal/llm"
	"github.com/evanofslack/mixtake/internal/metrics"
	"github.com/evanofslack/mixtake/internal/mix"
	"github.com/evanofslack/mixtake/internal/spotify"
	"github.com/evanofslack/mixtake/internal/store"
)

func main() {
	link := flag.String("link", "", "Spotify playlist, album or track link")
	vibe := flag.String("vibe", "", "optional vibe text")
	top := flag.Int("n", 5, "photos to print")
	sheet := flag.String("sheet", "", "write a contact sheet JPEG of the picks to this path")
	seed := flag.Int("seed", 0, "shuffle seed; 0 is the usual set")
	brief := flag.Bool("brief", false, "print the brief sent to the LLM")
	flag.Parse()
	if *link == "" {
		fmt.Fprintln(os.Stderr, "usage: tune -link <spotify link> [-vibe text] [-n 5] [-seed 0] [-sheet out.jpg]")
		os.Exit(2)
	}
	if err := run(*link, *vibe, *seed, *top, *sheet, *brief, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "tune:", err)
		os.Exit(1)
	}
}

func run(link, vibe string, seed, top int, sheet string, brief bool, out io.Writer) error {
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
	photos := analogdb.New(cfg.AnalogdbURL, "", nil, m)
	covers := mix.NewCovers(photos, 0)
	museName := "off (set LLM_API_KEY)"
	if cfg.LLMAPIKey != "" {
		prompt := ""
		if cfg.LLMPromptFile != "" {
			b, err := os.ReadFile(cfg.LLMPromptFile)
			if err != nil {
				return fmt.Errorf("LLM_PROMPT_FILE: %w", err)
			}
			prompt = string(b)
		}
		covers.UseMuse(llm.New(cfg.LLMBaseURL, cfg.LLMAPIKey, cfg.LLMModel, nil, m), prompt)
		museName = cfg.LLMModel
		if cfg.LLMPromptFile != "" {
			museName += " with " + cfg.LLMPromptFile
		}
	}

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
	if brief {
		fmt.Fprintf(out, "brief:\n%s\n", mix.Brief(snap, snap.Mix.Vibe))
	}
	p, err := covers.Pick(ctx, snap, snap.Mix.Vibe, seed)
	if err != nil {
		return err
	}
	print(out, snap, p, top, orDefault(cfg.AnalyzerURL, "fake"), museName)
	if sheet == "" {
		return nil
	}
	return writeSheet(ctx, func(ctx context.Context, name string) (image.Image, error) {
		body, _, err := photos.Image(ctx, name)
		if err != nil {
			return nil, err
		}
		defer body.Close()
		img, _, err := image.Decode(body)
		return img, err
	}, p, sheet)
}

func print(out io.Writer, snap mix.Snapshot, p mix.Pick, top int, analyzerName, museName string) {
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
	fmt.Fprintf(out, "  llm: %s\n", museName)
	if p.Ideas != nil {
		fmt.Fprintf(out, "  llm read: %s\n", p.Ideas.Read)
		fmt.Fprintf(out, "  llm ideas (%d):\n", len(p.Ideas.Queries))
		for i, idea := range p.Ideas.Queries {
			fmt.Fprintf(out, "    %2d %-28.28s %q  <- %s\n", i, idea.Angle, idea.Text, idea.From)
		}
	} else if !strings.HasPrefix(museName, "off") {
		fmt.Fprintln(out, "  llm ideas failed; using canned scenes (see warnings above)")
	}
	picked := map[int]int{}
	for _, c := range p.Candidates {
		picked[c.Query]++
	}
	fmt.Fprintln(out, "  queries (usable photos found, photos picked):")
	for i, q := range p.Queries {
		usable := 0
		if i < len(p.Usable) {
			usable = p.Usable[i]
		}
		fmt.Fprintf(out, "  %2d %-8s %-20.20s %.2f  %3d %2d  %q\n", i, q.Lens, q.Source, q.Weight,
			usable, picked[i], q.Text)
	}
	source := "profile"
	if p.Ideas != nil && len(p.Ideas.Palette) >= 3 && slices.Equal(p.Palette, p.Ideas.Palette) {
		source = "llm"
	}
	fmt.Fprintf(out, "  palette (%s): %s\n", source, strings.Join(p.Palette, " "))
	fmt.Fprintf(out, "  %d analogdb requests (cached included) in %s\n", p.Requests,
		p.Elapsed.Round(time.Millisecond))
	tw := tabwriter.NewWriter(out, 0, 4, 2, ' ', 0)
	for _, c := range p.Candidates[:min(top, len(p.Candidates))] {
		var url string
		for _, img := range c.Photo.Images {
			if img.Resolution == "high" {
				url = img.URL
			}
		}
		fmt.Fprintf(tw, "  %d\tq%d\t%.3f\t%s\t%s\n", c.Photo.ID, c.Query, c.Score, c.Photo.Caption, url)
	}
	tw.Flush()
}

func orDefault(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}
