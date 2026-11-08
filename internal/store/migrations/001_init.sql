CREATE TABLE tracks (
    id         TEXT PRIMARY KEY,
    json       TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE features (
    track_id      TEXT NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
    model_version TEXT NOT NULL,
    json          TEXT NOT NULL,
    analyzed_at   TEXT NOT NULL,
    PRIMARY KEY (track_id, model_version)
);

CREATE TABLE mixes (
    id         TEXT PRIMARY KEY,
    json       TEXT NOT NULL,
    created_at TEXT NOT NULL
);
