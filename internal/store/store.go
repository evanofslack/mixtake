// Package store implements mix.Store on SQLite. Rows hold the domain types as JSON, keyed by id,
// so the schema only changes when a lookup does.
package store

import (
	"context"
	"database/sql"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite" // registers the "sqlite" driver

	"github.com/evanofslack/mixtake/internal/mix"
)

//go:embed migrations/*.sql
var migrations embed.FS

// chunk is the most ids put in one IN (…) list.
const chunk = 500

// Store is a mix.Store backed by a SQLite file.
type Store struct {
	db *sql.DB
}

var _ mix.Store = (*Store)(nil)

// Open opens or creates the database at path and migrates it to the latest schema.
func Open(path string) (*Store, error) {
	q := url.Values{}
	q.Add("_pragma", "journal_mode(WAL)")
	q.Add("_pragma", "busy_timeout(5000)")
	q.Add("_pragma", "foreign_keys(1)")
	q.Add("_pragma", "synchronous(NORMAL)")
	db, err := sql.Open("sqlite", "file:"+path+"?"+q.Encode())
	if err != nil {
		return nil, err
	}
	if err := migrate(context.Background(), db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate %s: %w", path, err)
	}
	return &Store{db: db}, nil
}

// Close closes the database.
func (s *Store) Close() error { return s.db.Close() }

// migrate applies every migrations/NNN_*.sql newer than the recorded schema version, each in its
// own transaction.
func migrate(ctx context.Context, db *sql.DB) error {
	if _, err := db.ExecContext(ctx,
		`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)`); err != nil {
		return err
	}
	var current int
	if err := db.QueryRowContext(ctx,
		`SELECT COALESCE(MAX(version), 0) FROM schema_version`).Scan(&current); err != nil {
		return err
	}
	names, err := fs.Glob(migrations, "migrations/*.sql")
	if err != nil {
		return err
	}
	sort.Strings(names)
	for _, name := range names {
		base := strings.TrimPrefix(name, "migrations/")
		num, _, _ := strings.Cut(base, "_")
		version, err := strconv.Atoi(num)
		if err != nil {
			return fmt.Errorf("%s: bad version prefix", base)
		}
		if version <= current {
			continue
		}
		body, err := migrations.ReadFile(name)
		if err != nil {
			return err
		}
		if err := inTx(ctx, db, func(tx *sql.Tx) error {
			if _, err := tx.ExecContext(ctx, string(body)); err != nil {
				return fmt.Errorf("%s: %w", base, err)
			}
			_, err := tx.ExecContext(ctx, `INSERT INTO schema_version (version) VALUES (?)`, version)
			return err
		}); err != nil {
			return err
		}
	}
	return nil
}

func inTx(ctx context.Context, db *sql.DB, fn func(*sql.Tx) error) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

func now() string { return time.Now().UTC().Format(time.RFC3339Nano) }

// Tracks returns the stored tracks among ids. PreviewURL is never stored, so it is empty.
func (s *Store) Tracks(ctx context.Context, ids []string) (map[string]mix.Track, error) {
	out := make(map[string]mix.Track, len(ids))
	err := s.lookup(ctx, `SELECT id, json FROM tracks WHERE id IN (%s)`, nil, ids,
		func(id string, raw []byte) error {
			var t mix.Track
			if err := json.Unmarshal(raw, &t); err != nil {
				return fmt.Errorf("track %s: %w", id, err)
			}
			out[id] = t
			return nil
		})
	return out, err
}

// PutTracks inserts or replaces tracks.
func (s *Store) PutTracks(ctx context.Context, ts []mix.Track) error {
	if len(ts) == 0 {
		return nil
	}
	return inTx(ctx, s.db, func(tx *sql.Tx) error {
		stmt, err := tx.PrepareContext(ctx, `INSERT INTO tracks (id, json, updated_at) VALUES (?, ?, ?)
			ON CONFLICT (id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`)
		if err != nil {
			return err
		}
		defer stmt.Close()
		at := now()
		for _, t := range ts {
			raw, err := json.Marshal(t)
			if err != nil {
				return err
			}
			if _, err := stmt.ExecContext(ctx, t.ID, raw, at); err != nil {
				return fmt.Errorf("put track %s: %w", t.ID, err)
			}
		}
		return nil
	})
}

// Features returns stored features for ids computed with modelVersion.
func (s *Store) Features(ctx context.Context, ids []string, modelVersion string) (map[string]mix.Features, error) {
	out := make(map[string]mix.Features, len(ids))
	err := s.lookup(ctx,
		`SELECT track_id, json FROM features WHERE model_version = ? AND track_id IN (%s)`,
		[]any{modelVersion}, ids,
		func(id string, raw []byte) error {
			var f mix.Features
			if err := json.Unmarshal(raw, &f); err != nil {
				return fmt.Errorf("features %s: %w", id, err)
			}
			out[id] = f
			return nil
		})
	return out, err
}

// PutFeatures inserts or replaces one track's features. The track must already be stored.
func (s *Store) PutFeatures(ctx context.Context, trackID, modelVersion string, f mix.Features) error {
	raw, err := json.Marshal(f)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO features (track_id, model_version, json, analyzed_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT (track_id, model_version) DO UPDATE SET json = excluded.json,
			analyzed_at = excluded.analyzed_at`,
		trackID, modelVersion, raw, now())
	if err != nil {
		return fmt.Errorf("put features %s: %w", trackID, err)
	}
	return nil
}

// Mix returns a stored mix, or mix.ErrNotFound.
func (s *Store) Mix(ctx context.Context, id string) (mix.Mix, error) {
	var raw []byte
	err := s.db.QueryRowContext(ctx, `SELECT json FROM mixes WHERE id = ?`, id).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return mix.Mix{}, fmt.Errorf("mix %s: %w", id, mix.ErrNotFound)
	}
	if err != nil {
		return mix.Mix{}, err
	}
	var m mix.Mix
	if err := json.Unmarshal(raw, &m); err != nil {
		return mix.Mix{}, fmt.Errorf("mix %s: %w", id, err)
	}
	return m, nil
}

// PutMix inserts or replaces a mix.
func (s *Store) PutMix(ctx context.Context, m mix.Mix) error {
	raw, err := json.Marshal(m)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO mixes (id, json, created_at) VALUES (?, ?, ?)
		ON CONFLICT (id) DO UPDATE SET json = excluded.json`,
		m.ID, raw, m.CreatedAt.UTC().Format(time.RFC3339Nano))
	return err
}

// lookup runs query once per chunk of ids, with the chunk's placeholders substituted for %s
// after the leading args, and calls row for each (id, json) result.
func (s *Store) lookup(ctx context.Context, query string, lead []any, ids []string,
	row func(id string, raw []byte) error) error {
	for start := 0; start < len(ids); start += chunk {
		part := ids[start:min(start+chunk, len(ids))]
		args := append(append(make([]any, 0, len(lead)+len(part)), lead...), anys(part)...)
		marks := strings.TrimSuffix(strings.Repeat("?,", len(part)), ",")
		rows, err := s.db.QueryContext(ctx, fmt.Sprintf(query, marks), args...)
		if err != nil {
			return err
		}
		for rows.Next() {
			var (
				id  string
				raw []byte
			)
			if err := rows.Scan(&id, &raw); err != nil {
				rows.Close()
				return err
			}
			if err := row(id, raw); err != nil {
				rows.Close()
				return err
			}
		}
		err = rows.Close()
		if err == nil {
			err = rows.Err()
		}
		if err != nil {
			return err
		}
	}
	return nil
}

func anys(ss []string) []any {
	out := make([]any, len(ss))
	for i, s := range ss {
		out[i] = s
	}
	return out
}
