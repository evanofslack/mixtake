#!/usr/bin/env bash
# Download the Essentia models listed in models.lock into MODELS_DIR and verify their sha256.
# Files that are already present with the right checksum are skipped.
#
#   MODELS_DIR       where to put them (default: <analyzer>/models)
#   MODELS_BASE_URL  where to get them (default: https://essentia.upf.edu/models)
#   MODELS_LAYOUT    "upf" (default): the per-model sub-paths essentia.upf.edu uses;
#                    "flat": every file directly under MODELS_BASE_URL, e.g. a GitHub release's
#                    https://github.com/<owner>/<repo>/releases/download/<tag>
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
lock="$here/models.lock"
dir="${MODELS_DIR:-$here/models}"
base="${MODELS_BASE_URL:-https://essentia.upf.edu/models}"
base="${base%/}"
layout="${MODELS_LAYOUT:-upf}"

sha256() {
    if command -v sha256sum >/dev/null; then
        sha256sum "$1" | cut -d' ' -f1
    else
        shasum -a 256 "$1" | cut -d' ' -f1
    fi
}

# url prints where a model file lives under $base.
url() {
    local file="$1" stem="${1%.*}"
    if [ "$layout" = flat ]; then
        echo "$base/$file"
        return
    fi
    case "$stem" in
        discogs-effnet-*) echo "$base/feature-extractors/discogs-effnet/$file" ;;
        msd-musicnn-*) echo "$base/feature-extractors/musicnn/$file" ;;
        # heads are named <head>-<extractor>-<version>, e.g. mood_sad-discogs-effnet-1
        *) echo "$base/classification-heads/${stem%%-*}/$file" ;;
    esac
}

case "$layout" in
    upf | flat) ;;
    *)
        echo "MODELS_LAYOUT must be upf or flat, got '$layout'" >&2
        exit 2
        ;;
esac

mkdir -p "$dir"
fetched=0
while read -r want file; do
    [ -n "$file" ] || continue
    dest="$dir/$file"
    if [ -f "$dest" ] && [ "$(sha256 "$dest")" = "$want" ]; then
        continue
    fi
    src="$(url "$file")"
    echo "fetching $src"
    # essentia.upf.edu is flaky: retry on any error, with timeouts
    curl -fsSL --retry 5 --retry-all-errors --retry-delay 2 --connect-timeout 10 --max-time 300 \
        -o "$dest.part" "$src"
    got="$(sha256 "$dest.part")"
    if [ "$got" != "$want" ]; then
        rm -f "$dest.part"
        echo "checksum mismatch for $file: want $want, got $got" >&2
        exit 1
    fi
    mv "$dest.part" "$dest"
    fetched=$((fetched + 1))
done <"$lock"

echo "models ok in $dir ($fetched fetched)"
