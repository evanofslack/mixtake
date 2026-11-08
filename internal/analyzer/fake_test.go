package analyzer

import (
	"context"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestFakeDeterministic(t *testing.T) {
	ctx := context.Background()
	f := Fake{}
	a, err := f.Analyze(ctx, "0VjIjW4GlUZAMYd2vXMi3b", strings.NewReader("audio"))
	if err != nil {
		t.Fatal(err)
	}
	b, _ := f.Analyze(ctx, "0VjIjW4GlUZAMYd2vXMi3b", strings.NewReader("other audio"))
	if !reflect.DeepEqual(a, b) {
		t.Errorf("same id gave different features:\n%+v\n%+v", a, b)
	}
	c, _ := f.Analyze(ctx, "6b5P51m8xx2XA6U7sdNZ5E", strings.NewReader(""))
	if reflect.DeepEqual(a, c) {
		t.Error("different ids gave the same features")
	}
}

func TestFakeRanges(t *testing.T) {
	ctx := context.Background()
	modes := map[string]int{}
	for i := range 200 {
		f, err := Fake{}.Analyze(ctx, string(rune('a'+i%26))+strings.Repeat("x", i), strings.NewReader(""))
		if err != nil {
			t.Fatal(err)
		}
		modes[f.Mode]++
		if f.Tempo < 70 || f.Tempo > 170 {
			t.Errorf("tempo %v out of range", f.Tempo)
		}
		for _, v := range []float64{f.Happy, f.Sad, f.Relaxed, f.Aggressive, f.Party, f.Danceable,
			f.Acoustic, f.Instrumental, f.Valence, f.Arousal} {
			if v < 0 || v > 1 {
				t.Errorf("score %v out of range in %+v", v, f)
			}
		}
		if len(f.Genres) != 3 || f.Genres[0].Score < f.Genres[1].Score || f.Genres[0].Name == f.Genres[1].Name {
			t.Errorf("genres = %+v", f.Genres)
		}
		if f.Key == "" {
			t.Error("empty key")
		}
	}
	if modes["major"] == 0 || modes["minor"] == 0 {
		t.Errorf("modes = %v", modes)
	}
}

func TestFakeDelayCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := (Fake{Delay: time.Hour}).Analyze(ctx, "x", strings.NewReader("")); err == nil {
		t.Error("want context error")
	}
}
