# WebTikZ

Single-file, dependency-free TikZ parser + Canvas renderer.

> Status: Phase 0 groundwork — see `plan.md`.

## Quick start

```bash
npm install
npm run build        # -> dist/webtikz.js  dist/webtikz.mjs
npm test             # vitest unit + snapshot
npm run test:visual  # playwright image diff (needs reference PNGs)
npm run dev          # playground at http://localhost:5173/playground/
```

### Browser

```html
<script src="dist/webtikz.js"></script>
<script type="text/tikz">
\begin{tikzpicture}
  \draw (0,0) -- (1,1);
\end{tikzpicture}
</script>
```

```js
const pic = await WebTikZ.render("\\draw (0,0) -- (1,1);", canvas, { scale: 1.5 });
console.log(pic.bbox); // in pt
```

## Layout

```
src/
  geometry/   Vec2, Affine, BBox, Bezier
  render/     display list + Canvas2D/SVG backends
  lexer/      tokenizer
  parser/     recursive-descent -> AST
  core/       evaluator
  api/        public WebTikZ API
  ...         (stubs for phases 1-11)
```

## Reference pipeline

```bash
docker build -t webtikz-ref reference/
docker run --rm -v $PWD/.reference:/out webtikz-ref
npm run test:visual
```

## Corpus

```bash
npm run corpus:extract -- --input /path/to/pgfmanual.tex --out .corpus/index.json
```
