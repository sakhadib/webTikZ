#!/usr/bin/env bash
set -euo pipefail
# Usage: docker run --rm -v $PWD/.reference:/out webtikz-ref
# Renders every tests/corpus/*.tex (or .reference/src/*.tex) to PNG at 150 DPI.

SRC_DIR="/work/src"
OUT_DIR="/out"
DPI="${DPI:-150}"

if [ ! -d "$SRC_DIR" ]; then
  echo "No /work/src — mount corpus there"
  exit 0
fi

mkdir -p "$OUT_DIR"

for tex in "$SRC_DIR"/*.tex; do
  [ -e "$tex" ] || continue
  base=$(basename "$tex" .tex)
  echo "Rendering $base ..."
  tmpdir=$(mktemp -d)
  cp "$tex" "$tmpdir/input.tex"
  # Wrap in standalone if not already
  if ! grep -q "standalone" "$tmpdir/input.tex"; then
    cat > "$tmpdir/wrapped.tex" <<'WRAP'
\documentclass[tikz,border=2pt]{standalone}
\begin{document}
WRAP
    cat "$tmpdir/input.tex" >> "$tmpdir/wrapped.tex"
    echo '\end{document}' >> "$tmpdir/wrapped.tex"
    mv "$tmpdir/wrapped.tex" "$tmpdir/input.tex"
  fi
  (cd "$tmpdir" && pdflatex -interaction=nonstopmode input.tex >/dev/null 2>&1 || true)
  if [ -f "$tmpdir/input.pdf" ]; then
    pdftocairo -png -r "$DPI" "$tmpdir/input.pdf" "$OUT_DIR/$base"
    # pdftocairo produces $base-1.png for single page
    if [ -f "$OUT_DIR/${base}-1.png" ]; then mv "$OUT_DIR/${base}-1.png" "$OUT_DIR/${base}.png"; fi
    echo " -> $OUT_DIR/$base.png"
  else
    echo "Failed: $base" >&2
  fi
  rm -rf "$tmpdir"
done
