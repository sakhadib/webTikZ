# WebTikZ — AI Skill

> **Version:** 0.7.0 — **Phase 7 (Structured Diagrams)** complete — 2026-09-11
> **Bundle:** `dist/webtikz.min.js` ~46 KB gz (Phase 7, 153 KB raw), IIFE `WebTikZ` / ESM `webtikz.mjs`
> **Source:** `src/parser/index.ts:63` (matrix/graph), `src/core/evaluator.ts:17` (matrix/tree/graph), `src/graphDrawing/index.ts:1`
> **Tests:** 457 pass (Phase 1: 30 + Phase 2: 151 + Phase 3: 53 + Phase 4: 46 + Phase 5: 50 + Phase 6: 45 + Phase 7: 50 + core 32) — `npm test` green, `tsc --noEmit` clean

This SKILL is **incremental**. Each WebTikZ phase appends a new section without rewriting previous ones. AIs MUST read the highest `Phase` header they need and MUST NOT hallucinate features from later phases. Current ceiling: **Phase 7**. Anything tagged Phase 8+ is *not yet implemented* and will error or be ignored.

---

## 1. When to use this skill

Use when the user asks to:

* draw / render / export TikZ in the browser without TeX Live
* convert TikZ source to Canvas/SVG/PNG
* live-edit diagrams, build a playground, or generate diagrams from LLM output
* produce **node-free** diagrams (lines, rectangles, circles, grids, arrows)

If the user asks for nodes, labels, math, `calc` `($(A)!(B)!)`, `intersections`, `decorations`, `matrix`/`trees`/`graphs` — explain they are **unsupported in Phase 1** and offer a Phase 1 workaround (e.g., draw with raw paths) or note that Phase 2+ will add it.

## 2. Quick start

### Browser (IIFE)
```html
<script src="dist/webtikz.min.js"></script>
<script type="text/tikz">
\begin{tikzpicture}
  \draw[help lines] (0,0) grid (4,3);
  \draw[red,thick] (0,0) rectangle (2,1);
\end{tikzpicture}
</script>
<!-- auto-renders every <script type="text/tikz"> on DOMContentLoaded via src/api/render.ts:92 -->
```

### ESM / npm
```js
import { WebTikZ, compile } from "webtikz";
// or: import WebTikZ from "webtikz/dist/webtikz.mjs"

const src = "\\draw[->,dashed] (0,0) -- (2,0);";
const pic = await WebTikZ.render(src, document.querySelector("canvas"), {
  scale: 1.5,
  dpr: devicePixelRatio,
  onError: (e) => console.warn(`${e.line}:${e.column} ${e.message}\n${e.codeFrame}`)
});
console.log(pic.bbox); // BBox in pt — src/geometry/bbox.ts:1
console.log(pic.nodes); // { A: {center: Vec2, bbox: BBox} } — named \coordinate only in Phase 1

// Headless / tests / workers (no DOM)
const { displayList, errors } = await WebTikZ.compile(src);
// displayList: { items: DisplayItem[], bbox: BBox, nodes: Record<string, {center,bbox}> } — src/render/displayList.ts:1
```

### Lenient mode
`\begin{tikzpicture}` may be omitted — bare statements are wrapped in an implicit picture:
```js
await WebTikZ.compile("\\draw (0,0) -- (1,1); \\fill[blue] (0,0) rectangle (1,1);");
```

## 3. Public API (Phase 1 surface)

Defined in `src/index.ts:1`, `src/api/compile.ts:1`, `src/api/render.ts:1`.

```ts
// compile only — async from day one (future TextEngine will be async)
compile(source: string, opts?: {scale?: number}): Promise<{displayList: DisplayList, errors: EvalError[]}>

// render to canvas or container — handles HiDPI, bbox → canvas sizing
render(source: string, target: HTMLCanvasElement|HTMLElement|string|null, opts?: {
  scale?: number, dpr?: number, background?: string|null,
  onError?: (e:{message,line,column,pos,severity,codeFrame?})=>void
}): Promise<Picture>

// auto-render script blocks
autoRender(opts?: {selector?: string, scale?: number, dpr?: number}): Promise<Picture[]>

// Picture handle
interface Picture {
  displayList: DisplayList; bbox: BBox; nodes: Record<string, {center,bbox}>;
  canvas: HTMLCanvasElement|null; errors: EvalError[];
  toSVG(opts?:{scale?:number}): string;   // src/render/svg.ts:1
  toPNG(scale?:number): Promise<Blob>;
  update(opts:{source?:string}): Promise<Picture>;
  destroy(): void;
}
```

Global (IIFE): `globalThis.WebTikZ` — `src/index.ts:8`.

## 4. Phase 1 language subset — **authoritative**

AIs generating TikZ **MUST stay within this subset** until the skill documents Phase 2.

### 4.1 Lexer — `src/lexer/index.ts:1`
* Control sequences: `\draw`, `\fill`, `\filldraw`, `\path`, `\coordinate`, `\tikz`, `\begin`, `\end`, `\usetikzlibrary` (skipped)
* Brackets: `{}[]()` `;` `,` `:` `.` `=` `/` `!` `>` `<` `+` `-` `*`
* Ops: `--`, `->`, `<-`, `<->`, `|-`, `-|` (last two parsed but treated as `--` in Phase 1)
* Numbers/dimensions: `2`, `2.5`, `1cm`, `20mm`, `5pt`, `1in`, `2.54cm` — with `pos+source` on every token (`line:column`)
* Comments: `% comment` to end-of-line
* Identifiers: `[a-zA-Z0-9@]+`

### 4.2 Parser — `src/parser/index.ts:1`
Hand-written recursive descent. Produces `ParseResult{ast, pictures, errors, tokens}` with `Loc` on every node.

Environments:
```tex
\begin{tikzpicture}[<options>] ... \end{tikzpicture}
\tikz [<options>] \draw ... ;          % inline single statement
\tikz [<options>] { \draw ...; \fill ...; }  % inline braced
\draw ... ;  % lenient — implicit picture
```

Statements (all terminated by `;` — missing `;` emits error but still partial-renders):
```tex
\draw     [<options>] <path-spec> ;
\fill     [<options>] <path-spec> ;
\filldraw [<options>] <path-spec> ;
\path     [<options>] <path-spec> ; % invisible unless draw/fill given
\coordinate [<options>] (<name>) at <coord> ; % defines named point
```
`\usetikzlibrary{...}` is accepted and ignored (no error).

`<path-spec>` is a sequence:
```
<coord> { <op> <coord> | <op> | cycle }*
```
`<op>` in Phase 1:

| Op | Syntax | Example | Notes — `src/core/evaluator.ts:97` |
|----|--------|---------|-------------------------------------|
| `--` | `-- <coord>` | `(0,0) -- (1,1)` | line |
| `rectangle` | `rectangle <coord>` | `(0,0) rectangle (2,1)` | axis-aligned, `close` |
| `circle` | `circle [radius=<dim>]` <br> `circle (<dim>)` | `(0,0) circle [radius=1cm]` <br> `(0,0) circle (5pt)` | center is previous coord; 4× cubic Bézier (`KAPPA` `src/geometry/bezier.ts:4`) |
| `grid` | `grid [<options>] <coord>` | `(0,0) grid (4,3)` <br> `(0,0) grid[step=5mm] (2,2)` <br> `[step=0.5cm] … grid` | step defaults 1 cm; also reads `[step=…]` from draw opts — `src/core/evaluator.ts:186` |
| `cycle` | `cycle` or `-- cycle` | `(0,0) -- (1,0) -- cycle` | `close` |

Unsupported in Phase 1 (do not generate): `arc`, `ellipse`, `parabola`, `.. controls ..`, `to[...]`, `-|`/`|-` as orthogonal (treated as `--`), `edge`, `plot`.

### 4.3 Coordinates — `src/parser/index.ts:133`, resolved in `src/core/evaluator.ts:406`

| Form | Example | Resolution |
|------|---------|------------|
| Cartesian, unitless (→ cm) | `(1,2)` | `x*1cm`, `y*1cm` — `PT_PER_CM` `src/geometry/units.ts:9` |
| Cartesian, with units | `(20mm,10mm)`, `(2in,5pt)`, `(1cm,0)` | `toPt()` supports `pt,bp,mm,cm,in,pc,em,ex,px` |
| Polar | `(30:2)` , `(30:2cm)` | `angle:radius` — angle in degrees |
| Named | `(A)` , `(B)` | lookup in `\coordinate` map; unknown → warning + `(0,0)` |
| Relative (no update) | `+(1,0)` | `current + (1,0)`; `current` unchanged for next op |
| Relative (update) | `++(1,0)` | `current + (1,0)`; `current` becomes new point |

Anchors `(A.north)` / `(A.30)` are parsed but `anchor` is ignored in Phase 1 (no node shapes yet).

### 4.4 Options — `src/color/index.ts:1`, resolved in `src/core/evaluator.ts:260`

Flat key list (no `.style`, no `pgfkeys` hierarchy — Phase 2). Unknown keys are ignored with no hard error (partial render).

**Colors — 19 base xcolor names:**
`black, white, red, green, blue, cyan, magenta, yellow, orange, violet, purple, brown, pink, olive, lime, teal, gray, darkgray, lightgray` (aliases: `grey`) — `BASE_COLORS` `src/color/index.ts:5`.
Mixing: `blue!30` (30 % blue + 70 % white), `red!20!blue` (20 % red + 80 % blue) — `resolveColor`.

| Key | Example | Effect |
|-----|---------|--------|
| Bare color | `[red]` , `[blue!30]` | `draw` color if action is `\draw`, `fill` if `\fill` |
| `draw=<color>` | `[draw=red]` , `[draw=olive]` | stroke color |
| `fill=<color>` | `[fill=blue]` , `[fill=lime]` | fill color |
| `color=<color>` | `[color=red]` | both stroke and fill |
| `help lines` | `[help lines]` | `gray`, `very thin` (0.2 pt) — `HELP_LINES` |
| Line width presets | `[ultra thin]`, `[very thin]`, `[thin]`, `[semithick]`, `[thick]`, `[very thick]`, `[ultra thick]` | 0.1,0.2,0.4,0.6,0.8,1.2,1.6 pt — `LINE_WIDTH_PRESETS` |
| `line width=<dim>` | `[line width=2pt]` , `[line width=0.5mm]` | explicit |
| Dash | `[dotted]` `[densely dotted]` `[loosely dotted]` `[dashed]` `[densely dashed]` `[loosely dashed]` `[solid]` | `resolveDash` — e.g., `dashed` → `[3,3]` |
| `dash pattern=on 2pt off 3pt` | `[dash pattern=on 2pt off 2pt]` | custom |
| Arrows | `[->]` `[<-]` `[<->]` | start/end triangles (simple, 6 pt×4 pt) — `createArrowHead` `src/core/evaluator.ts:495` |

Unsupported (do not generate in Phase 1): `opacity`, `rounded corners`, `line cap/join`, `double`, `use as bounding box`, `transform canvas`, any `every …/.style`.

### 4.5 Units — `src/geometry/units.ts:1`
Internal = pt (1/72.27 in). Canvas px = 1/96 in → `PX_PER_PT = 1.3284`. Unitless → cm (e.g., `(1,1)` = 1 cm = 28.452 pt). Supported: `pt, bp, mm, cm, in, pc, em, ex, px`.

### 4.6 Evaluation → DisplayList → BBox — `src/core/evaluator.ts:13`, `src/render/displayList.ts:1`
* PGF-like soft path: `moveTo/lineTo/curveTo/close` — `PathSegment`
* `DisplayList{items: DisplayItem[], bbox: BBox, nodes: …}` — `computePathBBox` expands by `stroke.width/2`
* `\coordinate` populates `displayList.nodes` (exposed as `pic.nodes`).
* `\path` without draw/fill produces invisible segment (still in bbox; intentional Phase 1).

## 5. Examples — copy/paste prompts for AI generation

All examples are **verified** in `tests/unit/phase1.test.ts:5` (30/30 pass).

```tex
% 1. Minimal line
\draw (0,0) -- (1,1);

% 2. Help lines grid (gray, very thin)
\draw[help lines] (0,0) grid (4,3);
\draw[help lines, step=0.5cm] (0,0) grid (2,2);

% 3. Colors + line width + dash
\draw[red,thick] (0,0) rectangle (2,1);
\draw[blue!30, ultra thick, dotted] (0,0) -- (1,0);
\draw[densely dashed, olive] (0,0) -- (2,0);
\draw[line width=2pt, teal] (0,0) -- (1,0);

% 4. Fill
\fill[blue] (0,0) rectangle (1,1);
\filldraw[draw=red,fill=lime] (0,0) circle (0.5cm);

% 5. Circle — both syntaxes
\draw (0,0) circle [radius=1cm];
\draw (1,2) circle (5pt);

% 6. Grid with step in draw opts or grid bracket
\draw[step=5mm] (0,0) grid (2,2);
\draw (0,0) grid[step=1cm] (4,3);

% 7. Closed path
\draw (0,0) -- (1,0) -- (1,1) -- cycle;

% 8. Arrows
\draw[->,dashed] (0,0) -- (2,0);
\draw[<->,red] (0,1) -- (2,1);

% 9. Coordinates: polar, named, relative
\draw (30:2) -- (0,0);                         % polar
\coordinate (A) at (0,0); \coordinate (B) at (2,0); \draw (A) -- (B);
\draw (0,0) -- ++(1,0) -- ++(0,1);               % update
\draw (0,0) -- +(1,0) -- (2,0);                  % no update (both +(1,0) from origin)

% 10. TikZ env + inline \tikz
\begin{tikzpicture}
  \draw[red,thick,dashed,->] (0,0) -- (30:2) -- (2,0) -- cycle;
\end{tikzpicture}
\tikz \draw (0,0) -- (1,0);
```

**Error handling example:**
```js
const { errors } = await WebTikZ.compile("\\draw (0,0) -- (1,0\n");
 // errors[0] = {line:1, column:16, message:"Unclosed '(' in coordinate",
 //              codeFrame:"\\draw (0,0) -- (1,0\n               ^", severity:"error"}
 // displayList still contains partial first path (partial render)
```

## 6. Error reporting & partial render — `src/parser/index.ts:69`, `src/core/evaluator.ts:14`

* Every parse/eval error carries `{message, line, column, pos, severity, codeFrame?}` — codeFrame is the source line with `^` caret.
* `severity: "error"` for missing `;`, unclosed `(` or `[`, unknown coordinate; `"warning"` for unknown color or dimension.
* On error the evaluator **keeps all successfully parsed paths** — callers should render `displayList` and surface `errors` via `onError` or playground panel.

## 7. Rendering pipeline

```
source → lex → parse → evaluate → DisplayList{bbox} → Canvas2D/SVG
```
* BBox is in pt; canvas is sized to BBox + 0.5 pt padding, scaled by `scale * PX_PER_PT * dpr` — `src/render/canvas.ts:1`, `src/render/svg.ts:1`
* Always HiDPI: `canvas.width = cssW * dpr`

## 8. What is NOT supported yet (do not generate)

Phase 1 deliberately omits:

* **Nodes/text/math/labels/pins** — `\node`, `node {…}`, `$x_1$` (Phase 3)
* **Keys/styles/scopes** — `\tikzset`, `.style`, `every …` (Phase 2)
* **Calc, intersections** — `($(A)+(1,2)$)`, `(A |- B)` (Phase 4)
* **Arrows.meta, shadings, patterns** — `Stealth`, `shading` (Phase 4)
* **Pics, plots, marks, fit, backgrounds** (Phase 5)
* **Decorations, matrices, trees, graphs, 3D, fadings, pgfplots** (Phase 6–9)
* **Interactivity/animation** (Phase 10)

If a user requests these, respond: *“Not in Phase 1 — here is a Phase 1-compatible alternative … [and note it will be Phase N]”* rather than hallucinating.

## 9. Playground & reference

* Playground: `playground/index.html:1` — live textarea → canvas with error panel.
* Reference Docker: `reference/Dockerfile` + `reference/render.sh` — `pdflatex` → `pdftocairo` at `DPI=150`.
* Corpus: `scripts/extract-corpus.ts` — extracts `codeexample` from pgfmanual; `npm run corpus:extract`.
* Visual harness: `tests/visual/helpers.ts:1` — `pixelmatch` diff.

## 10. Phase tracker (append-only)

| Phase | Status | Bundle | Notes |
|-------|--------|--------|-------|
| 0 Groundwork | **Done 2026-09-11** | 6.8 KB gz | Vec2, Affine, BBox, DisplayList, Canvas2D, playground |
| 1 MVP | **Done 2026-09-11** | 10.8 KB gz | 30/30 node-free examples, line:column frames |
| 2 Language core | **Done 2026-09-11** | 21.8 KB gz | 151/150 +5 checks; keys, scopes, transforms, pgfmath, foreach, curves, clip |
| 3 Nodes & text | **Done 2026-09-11** | 28 KB gz | 53 tests; TextEngine, nodes, anchors, path nodes, positioning, labels/pins |
| 4 Geometry & styling | **Done 2026-09-11** | 35 KB gz | 46 tests; calc, perpendicular, intersections, arrows.meta, shadings, patterns, bbox |
| 5 Composition | **Done 2026-09-11** | 38 KB gz | 50 tests; pics, quotes, edge/to path, plot, fit, backgrounds, layers, shape libs, through, PGF basic — **Core 0.5** |
| 6 Decorations | **Done 2026-09-11** | 43 KB gz | 45 tests; automaton, pathmorphing, pathreplacing, markings, text/footprints/fractals |
| 7 Structured diagrams | **Done 2026-09-11** | 46 KB gz | 50 tests; matrix, trees, graphs, automata/mindmap, graph drawing (circular/layered/spring/RT) |
| 8 Advanced rendering & 3D | TODO | < ? | fadings, transparency, shadows, 3D, spy |
| … | … | … | … |

*Build:* `npm run build` → `dist/webtikz.js` (IIFE), `dist/webtikz.mjs` (ESM). Size budget enforced in CI — `plan.md:223`.

---

## 11. Phase 2 — Language Core — **NEW in 0.2.0**

> **Scope:** `src/keys/index.ts:1`, `src/math/index.ts:1`, `src/core/evaluator.ts:244` (transforms), `src/color/index.ts:1` (extended), `src/parser/index.ts:322` (curves/foreach)
> **Tests:** 151 curated +5 specific (`tests/unit/phase2.test.ts:1`) — all green

Phase 2 makes TikZ a real language: styles, scopes, transforms, color spaces, math, macros, loops, and all basic curves. AIs can now generate **expressive, reusable, math-driven diagrams** without nodes.

### 11.1 Keys & Styles — `src/keys/index.ts:1`

Flat in Phase 1, now hierarchical. Define once, reuse everywhere.

```tex
\tikzset{
  my box/.style={draw=red, thick, fill=blue!20},
  my box/.append style={dashed},
  every picture/.style={scale=1.1},
  every path/.style={line cap=round},
  every scope/.style={shift={(0.2,0)}}
}
% Legacy:
\tikzstyle{mybox}=[draw=red, thick]

\draw[my box] (0,0) rectangle (1,1);
\draw[every picture] (0,0) -- (1,0); % automatically red+thick via every picture
```

Handlers supported: `.style={…}`, `.append style={…}`, `.initial`, `.default`, `.is choice` (stub), `every picture`/`every path`/`every scope` auto-applied via `ks.withEveryStyles` `src/core/evaluator.ts:100`.

Unknown keys are ignored (partial render), not hard errors.

### 11.2 Scopes — `src/parser/index.ts:908`

Inheritance via `Affine` stack `src/core/evaluator.ts:72`.

```tex
\begin{tikzpicture}[scale=1.5]
  \draw (0,0) -- (1,0); % inherits scale
  \begin{scope}[shift={(1,0)}, scale=2, rotate=15]
    \draw (0,0) -- (1,0); % shifted+scaled+rotated, isolated
    \tikzset{local/.style={blue}} \draw[local] (0,0) -- (1,1);
  \end{scope}
  % also brace group as scope:
  { \draw (0,0) -- (1,0); }
\end{tikzpicture}
```

Scopes isolate: transforms, `localNamed`, `localMacros`, and `clip`. Nesting supported.

### 11.3 Transforms — `src/core/evaluator.ts:244`

Coordinate-only (line widths unchanged) unless `transform canvas`. Stacked via `Affine.multiply`.

| Key | Example | Effect |
|-----|---------|--------|
| `shift={(1,1)}` | `[shift={(1cm,0)}]` | `Affine.translation` |
| `xshift=1cm`, `yshift=5mm` | | |
| `scale=2`, `xscale=2`, `yscale=0.5` | | `Affine.scaling` |
| `rotate=30`, `rotate around={45:(0.5,0.5)}` | | `Affine.rotation` |
| `xslant=0.5`, `yslant=0.3` | | shear `Affine(1,0,0.5,1,0,0)` |
| `cm={a,b,c,d,e,f}` | | custom `Affine(a,b,c,d,e,f)` |
| `x={(2cm,0)}`, `y={(0,2cm)}` | | treated as scaling of basis (approx) |
| `transform canvas={scale=2}` | | applied to `canvasTransform` (separate stack) |

```tex
\draw[shift={(1,1)}, rotate=30, scale=1.5] (0,0) rectangle (1,1);
\draw[cm={1,0,0,1,10,10}] (0,0) -- (1,0);
```

### 11.4 Colors — `src/color/index.ts:1`

```tex
\definecolor{myred}{rgb}{0.9,0.1,0.1}
\definecolor{myhtml}{HTML}{FF00FF}
\definecolor{mygray}{gray}{0.5}
\definecolor{myblue}{RGB}{10,120,200}
\definecolor{mycmyk}{cmyk}{0,1,1,0}
\colorlet{mycol}{red!50}
\draw[myred] (0,0) -- (1,0);
\draw[red!30!blue] (0,0) -- (1,0); % 30% red +70% blue
\draw[blue!20] (0,0) -- (1,0);     % 20% blue +80% white
\draw[-red] (0,0) -- (1,0);        % complement
```

`resolveColor` handles chained `!` mixing and `-` complement via `mixHex`.

### 11.5 pgfmath — `src/math/index.ts:1`

Degrees for trig. No `eval` — recursive descent.

```tex
\draw ({2+3},0) -- (0,0);
\draw ({sin(30)},0) -- (0,0);          % 0.5
\draw ({veclen(3,4)},0) -- (0,0);      % 5
\draw ({atan2(1,1)},0) -- (0,0);       % 45
\draw ({min(1,2)},0) -- ({max(1,2)},0);
\draw ({ifthenelse(1>0,2,3)},0) -- (0,0);
\pgfmathsetmacro{\a}{2*3} \draw (\a,0) -- (0,0);        % \a=6
\pgfmathtruncatemacro{\b}{2.7} \draw (\b,0) -- (0,0);   % \b=2
\draw ({2cm+3mm},0) -- (0,0);           % units inside math → pt
```

Supported: `+-*/^`, `()`, `,`, `== != > < >= <=`, `sin/cos/tan/asin/acos/atan/atan2/sqrt/exp/ln/log10/pow/mod/abs/round/floor/ceil/min/max/veclen/ifthenelse/and/or/not/equal/factorial/rnd/rand/pi/e`.

Braced expressions in coords: `({2+3},0)` — `evaluateDimensionString` `src/core/evaluator.ts:369` detects `{…}` and evaluates via `evalMath` with `macros` map, then converts unitless → cm.

### 11.6 Macros — `src/parser/index.ts:710`

Subset, not full TeX.

```tex
\def\myval{2} \draw (\myval,0) -- (0,0);
\def\myline#1{\draw (0,0) -- (#1,0);} % #1 param (simple)
\newcommand{\foo}{1.5} \draw (\foo,0) -- (0,0);
\newcommand{\bar}[1]{#1} \draw (\bar{2},0) -- (0,0);
\let\copy=\orig \draw (\copy,0) -- (0,0);
```

Stored in `localMacros`/`globalMacros` `src/core/evaluator.ts:82`, expanded via string replacement before `evalMath`/`parseDimension`.

### 11.7 \foreach — `src/parser/index.ts:784`, `src/core/evaluator.ts:401`

```tex
\foreach \x in {1,2,3} {\draw (\x,0) -- (\x,1);}
\foreach \x in {1,...,5} {\draw (\x,0) -- (\x,1);}              % range
\foreach \x in {1,3,...,11} {\draw (\x,0) -- (\x,1);}           % stepped 2
\foreach \x/\y in {1/2, 2/3} {\draw (\x,\y) -- (\y,\x);}        % multiple vars
\foreach \x [evaluate=\x as \y using \x*2] in {1,2,3} {\draw (\x,\y) -- (0,0);}
\foreach \x [count=\i] in {a,b,c} {\draw (\i,0) -- (\i,1);}
\foreach \x [remember=\x as \prev initially 0] in {1,2,3} {\draw (\prev,0) -- (\x,0);}
\foreach \x [parse=true] in {1,2} {\draw (\x,0) -- (\x,1);}
% nesting:
\foreach \x in {1,2} {\foreach \y in {1,2} {\draw (\x,\y) -- (\x+1,\y+1);}}
% inside path (Phase 2):
\draw (0,0) \foreach \x in {1,2,3} { -- (\x,0)};
```

List expansion via `expandForeachList` handles `...` with step detection and `1/2` splits. Body is string-substituted per iteration (`\x` → value) then parsed via `parseSnippet` and evaluated with `iterMacros`.

### 11.8 Curves — `src/parser/index.ts:322`, `src/core/evaluator.ts:776`

All produce cubic Béziers → `PathSegment`.

```tex
\draw (0,0) .. controls (1,1) .. (2,0);
\draw (0,0) .. controls (1,1) and (2,1) .. (3,0);

\draw (0,0) arc [start angle=0, end angle=90, radius=1cm];
\draw (0,0) arc [start angle=0, delta angle=90, radius=1cm];
\draw (0,0) arc (0:90:1cm);
\draw (0,0) arc [start angle=0, end angle=90, x radius=1cm, y radius=0.5cm];

\draw (0,0) ellipse [x radius=1cm, y radius=0.5cm];
\draw (0,0) ellipse (1cm and 0.5cm);

\draw (0,0) parabola (2,1);
\draw (0,0) parabola bend (1,1) (2,0);

\draw (0,0) sin (1,1);
\draw (0,0) cos (1,1);

\draw (0,0) to[bend left] (2,0);
\draw (0,0) to[bend right=45] (2,0);
\draw (0,0) to[out=90, in=90, looseness=2] (2,0);
```

`*Segments` helpers: `circleSegments`, `ellipseSegments`, `arcSegments` (split to ≤90° cubics), `parabola` as two quadratics, `sin`/`cos` as cubics, `to` as bent cubic.

### 11.9 Orthogonal — `src/parser/index.ts:636`

```tex
\draw (0,0) -| (1,1); % horizontal then vertical via mid (1,0)
\draw (0,0) |- (1,1); % vertical then horizontal via mid (0,1)
```

Implemented as two `lineTo` via `mid`.

### 11.10 Corners & Strokes — `src/core/evaluator.ts:1076`

```tex
\draw[rounded corners] (0,0) -- (1,0) -- (1,1) -- cycle;
\draw[rounded corners=5pt] (0,0) rectangle (1,1);
\draw[sharp corners] (0,0) -- (1,0) -- (1,1);
\draw[line cap=round] (0,0) -- (1,0);      % butt|round|rect|square
\draw[line join=round] (0,0) -- (1,0) -- (1,1); % miter|round|bevel
\draw[miter limit=2] (0,0) -- (1,0) -- (1,1) -- cycle;
\draw[dash pattern=on 2pt off 2pt, dash phase=1pt] (0,0) -- (2,0);
\draw[double, double distance=2pt] (0,0) -- (1,0);
```

`rounded corners` sets `stroke.join=round`/`cap=round` and `_rounded` flag; geometry via `applyRoundedCorners` (currently via canvas join, not path deformation). `double` stored as `_double` flag.

### 11.11 Fill Rules & Opacity — `src/core/evaluator.ts:1132`

```tex
\fill[even odd rule] (0,0) rectangle (1,1) (0.25,0.25) rectangle (0.75,0.75);
\fill[nonzero rule] (0,0) rectangle (1,1);
\draw[opacity=0.5] (0,0) -- (1,0);          % both stroke+fill
\draw[draw opacity=0.3] (0,0) -- (1,0);
\fill[fill opacity=0.5, blue] (0,0) rectangle (1,1);
```

`FillStyle.rule` `nonzero`|`evenodd`, `StrokeStyle`/`FillStyle.opacity`.

### 11.12 Clip — `src/core/evaluator.ts:920`, `src/parser/index.ts:1031`

```tex
\clip (0,0) rectangle (1,1); \fill[red] (0,0) rectangle (2,2);
\begin{scope}[clip]\clip (0,0) circle (0.5cm); \fill[red] (0,0) rectangle (1,1);\end{scope}
\draw[clip] (0,0) rectangle (1,1); % clip option
```

`\clip` and `clip` option produce `DisplayGroup{clipPath}` `src/render/displayList.ts:53`. Subsequent items in same scope/picture are children of clipped group. BBox still includes clipPath.

---

**For AI (updated for Phase 2):** When generating TikZ, first decide if the request fits **Phase 1 §4** alone or needs **Phase 2 §11**. Prefer Phase 2 features for expressive diagrams: use `\tikzset` styles for reuse, `scope` + transforms for layout, `pgfmath` for computed coords, `\foreach` for repetition, and `controls`/`arc`/`to` for curves. Always show `WebTikZ.compile` validation and `line:column` error handling. If the request needs nodes/text (Phase 3) or calc/intersections (Phase 4), state the limitation and offer a Phase 2 workaround (e.g., approximate with paths) rather than hallucinating.

---

## 12. Phase 3 — Nodes & Text — **NEW in 0.3.0**

> **Scope:** `src/text/index.ts:1` (TextEngine), `src/shapes/index.ts:1`, `src/nodes/index.ts:1`, `src/parser/index.ts:1` (nodes), `src/core/evaluator.ts:1` (async evaluate), `src/api/compile.ts:1` (await)
> **Tests:** 53 (`tests/unit/phase3.test.ts:1`) + 266 total — jsdom canvas fallback requires `canvas` npm for exact measure

Phase 3 completes labeled diagrams — the most requested TikZ feature. AIs can now generate **flowcharts, graphs, and annotated figures** with measured text.

### 12.1 TextEngine — `src/text/index.ts:1`

Pluggable interface: `measure(tex, font) => Promise<TextBox {width,height,depth}>` and `draw(ctx, box, x, y)`.

* **BuiltinTextEngine:** canvas `measureText` + `font` handling (`\tiny`→`12pt`, `\small`, `\large`…`\Huge` mapped to pt; `\bfseries`→700 weight, `\itshape`, `\sffamily`, `\ttfamily`). Requires `document.fonts.ready` before measure; falls back to estimation in jsdom (`Not implemented: getContext` warning is expected without `canvas` npm).
* **Latin Modern:** recommended web font for ±3% LaTeX metric fidelity; fallback is system sans.
* **Async:** `compile`/`render`/`evaluate` are now `async` — always `await WebTikZ.compile(src)`.
* Adapters: `MathJaxAdapter` and overlay stub present (optional, not default).

### 12.2 Multi-line Text — `src/text/index.ts:1`

```tex
\node[text width=3cm, align=center] at (0,0) {first line \\ second line};
% align= left|center|right|justify|flush left|flush right — wraps at text width
```

Line width via `text width`, alignment, `\\` forced breaks; wrapping measured per TextEngine.

### 12.3 Mini-TeX Math — `src/text/index.ts:1`

Inside `$…$` or `\(…\)`: `^`/`_`, Greek (`\alpha`…`\Omega`), operators (`\pm`, `\times`), relations, arrows, `\frac{a}{b}`, `\sqrt{x}`, `\mathbf`, `\mathrm`, `\mathbb`, `\text{…}`, `\cdot`, `\ldots`, `\hat`, `\bar`, `\vec` — sized via TeX metrics approximations, not full TeX layout.

```tex
\node at (0,0) {$x_1$};
\node at (1,0) {$\frac{a}{b} + \sqrt{x}$};
\node at (0,1) {$\alpha \to \beta$};
```

Outside math, `_`/`^` are literal; inside math errors do not abort picture (partial render).

### 12.4 Node Core — `src/parser/index.ts:1`, `src/nodes/index.ts:1`

```tex
\node[draw, fill=blue!20, circle, inner sep=2pt, minimum width=1cm] (a) at (0,0) {hello};
\coordinate (c) at (1,1);
\node[ellipse, draw] at (2,0) {Text};
% on-path:
\draw (0,0) -- node[above] {mid} (2,0);
\draw (0,0) -- node[pos=0.3, sloped] {30%} (2,0);
```

* Shapes: `rectangle` (default), `circle`, `ellipse`, `coordinate` (zero-size).
* Keys: `inner sep`, `outer sep`, `inner xsep/ysep`, `outer xsep/ysep`, `minimum width/height/size`, `text depth/height`, `text width`, `align`, `font=`, `draw`, `fill`.
* Names: `(a)` optional; stored in `nodes` table as `NodeEntry {center,bbox,anchors}`.
* `coordinate` is zero-size point (no draw/fill).
* Draw order: node background (fill/draw) before text; path nodes after path (so text on top).

### 12.5 Anchors — `src/shapes/index.ts:1`, `src/nodes/index.ts:1`

Compass: `north`, `south`, `east`, `west`, `north east` (also `northEast`), `center`, `base`, `mid`, `text`; angle `(A.30)` at 30°; `anchor=` for placement.

```tex
\node (a) at (0,0) {A};
\draw (a.north) -- (a.south);
\draw (a.30) -- (a.210);
\node[anchor=west] at (a.east) {right of A};
% implicit via above/below/left/right
\node[above=5mm of a] (b) {above};
\node[above right=2mm and 3mm of a] (c) {diag};
```

Border point computed per shape (`rectangle` edge intersection, `circle`/`ellipse` radial). Explicit `(A.north)` bypasses shape-aware connection; implicit `(A) -- (B)` uses closest border points `src/core/evaluator.ts:1`.

### 12.6 Nodes on Paths — `src/core/evaluator.ts:1`

Position via Bézier parameter `t` on actual segment (arc-length later in Phase 4).

```tex
\draw (0,0) -- node[midway, above] {mid} (3,0);
\draw (0,0) .. controls (1,1) .. (2,0) node[pos=0.5, sloped] {on curve} ;
% pos aliases:
% midway (=0.5), near start (=0.25), near end (=0.75), very near start/end, at start (=0), at end (=1)
% sloped: rotate to tangent; allow upside down=false prevents 180° flip
% auto, swap (other side)
```

### 12.7 Shape-aware Connections — `src/core/evaluator.ts:1`

```tex
\node[draw,circle] (a) at (0,0) {A};
\node[draw,rectangle] (b) at (2,0) {B};
\draw[->] (a) -- (b);          % attaches at circle border → rectangle border
\draw[->] (a.east) -- (b.west); % explicit anchors, no auto-border
```

### 12.8 Labels & Pins — `src/core/evaluator.ts:1`

```tex
\node[label=above:hello] at (0,0) {A};
\node[label={[red]45:label text}] at (0,0) {A};
\node[pin=above:note] at (0,0) {A};
\node[pin={[pin edge={red,thick}]60:edge}] at (0,0) {A};
% every label/.style, every pin/.style, every pin edge/.style
```

Creates additional `NodeEntry` children with auto position relative to parent anchor.

### 12.9 Positioning Library — `src/core/evaluator.ts:1`

```tex
\usetikzlibrary{positioning} % accepted (no-op, feature always on)
\node (a) at (0,0) {A};
\node[right=2cm of a] (b) {B};
\node[below=of a] (c) {C};                    % default node distance=1cm
\node[above=1cm of a.east, anchor=west] (d) {D};
\node[on grid, right=2cm of a] (e) {E};      % on grid: center-to-center vs border-to-border
\tikzset{node distance=1.5cm and 1cm}        % vertical and horizontal
```

`right=of a`, `below=1cm of a`, diagonal `above right=…`, `on grid` toggle; `node distance` as single or `x and y`.

### 12.10 Rotate & Transform Shape — `src/nodes/index.ts:1`

```tex
\node[draw, rotate=30] at (0,0) {no shape rotate};
\node[draw, rotate=30, transform shape] at (1,0) {rotated shape};
% rotate only text, transform shape also rotates shape+bbox and border points
```

---

**For AI (updated for Phase 3):** Prefer Phase 3 for any labeled diagram. Always `await` compile/render. Use `\node (name) at (coord) {tex}` with `draw`/`fill`/`circle`/`inner sep`/`minimum width` and `font=\small\bfseries`. Place labels via `label=`/`pin=` or `node[...] ` on paths with `pos`/`midway`/`sloped`. Connect via `(A) -- (B)` for border-aware edges; use `(A.east)` for explicit anchors. For positioning, use `right=of a` / `below=1cm of a.east` with `on grid` and `node distance`. Keep math to mini-TeX subset (`$x_1$`, `$\frac{a}{b}$`, Greek) — full AMS via MathJax adapter not default. If request needs `calc`/`intersections`/`arrows.meta` → state Phase 4 limit and approximate with explicit coords/border points.

---

## 13. Phase 4 — Geometry Engine & Styling Depth — **NEW in 0.4.0**

> **Scope:** `src/geometry/bezier.ts:87` `src/geometry/intersections.ts:1` `src/geometry/path.ts:1` `src/arrows/index.ts:1` `src/parser/index.ts:232` `src/core/evaluator.ts:22` `src/render/displayList.ts:4` `src/render/canvas.ts:70`
> **Tests:** 46 (`tests/unit/phase4.test.ts:1`) — 312 total

Phase 4 moves WebTikZ from "draws shapes" to "does geometry": calc expressions, intersections, precise arrows, gradients and tiling, and bbox control. AIs can now generate **engineering/tech diagrams that compute positions**.

### 13.1 Arc-Length — `src/geometry/bezier.ts:87`, `src/geometry/path.ts:1`

Every Bézier now exposes `cubicLength(p0,p1,p2,p3)` (Gauss-Legendre approx), `pointAtT`, `tangentAtT`, `arcLength`, `cubicPointAtDistance`. Path helpers `totalLength(path)`, `pointAtFraction`, `pointAtDistance` walk the `PathSegment[]` arc table. Used internally for `pos=` (Phase 3), later for decorations (Phase 6); AI can now rely on `pos=0.33` landing on curve, not straight chord.

### 13.2 calc Library — `src/parser/index.ts:232`, `src/core/evaluator.ts:22`

Enclose in `($…$)`. Resolved via `resolveCalc()` before affine transform.

```tex
\usetikzlibrary{calc} % accepted, feature auto-on
\coordinate (A) at (0,0); \coordinate (B) at (2,0); \coordinate (C) at (1,1);
\draw ($(A)+(1,2)$) -- (0,0);                % addition
\draw ($(A)!.5!(B)$) -- (0,0);                % 0.5 interpolation
\draw ($(A)!1cm!(B)$) -- (0,0);               % 1cm from A toward B
\draw ($(A)!(C)!(B)$) -- (C);                 % projection of C onto AB
\draw ($(A)!.5!30:(B)$) -- (0,0);             % 0.5 plus 30° rotation about A
\draw ($(2)*(A) + 0.5*(B)$) -- (0,0);         % scalar multiplication
\draw let \p1=(A), \p2=(B), \n1={veclen(\x2-\x1,\y2-\y1)} in (\p1) -- (\p2) node[midway]{\n1};
```

`let` registers: `\p1=(A)` → `(\x1,\y1)`, `\x1`, `\y1`, `\n1={expr}` — available inside `let … in` path scope `src/core/evaluator.ts:2053` (simple forms only; complex nesting is best-effort).

### 13.3 Perpendicular Coordinates — `src/parser/index.ts:8`

Distinct from `-|` path op — inside parens:

```tex
\draw (A |- B) -- (A -| B); % (Ax,By) and (Bx,Ay)
\node at (A |- B) {proj};
% also $(A |- B)$ inside calc works
```

Resolved via `resolvePerp()` as `Vec2(ax, by)` etc.

### 13.4 Intersections — `src/core/evaluator.ts:22`, `src/geometry/intersections.ts:1`

```tex
\usetikzlibrary{intersections}
\path[name path=circleA] (0,0) circle (1cm);
\path[name path=line] (0,-1) -- (2,1);
\path[name intersections={of=circleA and line, by={a,b}, total \t, sort by=x}];
\node at (a) {×}; \node at (b) {×};
\node at (0,0) {\t};                % \t expands to count
% name path globally scoped; intersections sorted by x|y optionally
```

Algorithm: `intersectSegments` — line-line exact, Bézier–Bézier via subdivision + Newton refinement (`EP_S=1e-6`). Stores named paths as `PathSegment[]` in `namedPaths: Map<string,PathSegment[]>`. Intersections materialize as `\coordinate` nodes `by=`; missing `by` defaults to `intersection-1` etc.

### 13.5 arrows.meta — `src/arrows/index.ts:1`, `src/render/canvas.ts:70`

Full `arrows.meta` registry plus legacy aliases `latex→Latex`, `stealth→Stealth`, `to→To`.

```tex
\usetikzlibrary{arrows.meta}
\draw[-{Stealth[length=3mm,width=2mm]}] (0,0) -- (2,0);
\draw[{Stealth[open]}-{Stealth[open,reversed]}] (0,0) -- (2,0);
\draw[-{Triangle[round]}] (0,0) -- (1,0);
\draw[-{Circle[open, length=2mm]}] (0,0) -- (1,0);
\draw[-{Bar[width=2mm]}] (0,0) -- (1,0);          % | tip
\draw[-{Hooks}] (0,0) -- (1,0);
\draw[->>] (0,0) -- (1,0);                        % double tip via >>
\draw[|<->|] (0,0) -- (1,0);                      % Bar-Stealth-Stealth-Bar
\draw[shorten <=2pt, shorten >=4pt] (0,0) -- (1,0);
\draw[shorten < =1pt, shorten > =1pt] (0,0) -- (1,0); % alt spacing

% options: length, width, open, round, reversed, sep, scale, bend
\draw[-{Stealth[scale=1.5, bend]}] (0,0) to[bend left] (2,0);
```

Shortening moves endpoints along endpoint tangent before stroking (so arrows don't overrun nodes).

### 13.6 Shadings — `src/render/canvas.ts:70`, `src/core/evaluator.ts:22`

Canvas gradients approximating PGF shadings:

```tex
\shade[left color=red, right color=blue] (0,0) rectangle (2,1);
\shade[inner color=white, outer color=blue] (0,0) circle (1cm);
\shade[ball color=red] (0,0) circle (0.5cm);          % radial highlight
\shadedraw[left color=red, right color=blue, draw=black] (0,0) rectangle (1,1);
\shade[shading angle=45, top color=red, bottom color=blue] (0,0) rectangle (2,1);
% axis: left/right/top/bottom/middle color; radial: inner/outer/ball; angle rotates linear gradient
```

Implemented as `DisplayPath.gradient = {type:'linear'|'radial', stops, angle}` → `CanvasGradient`.

### 13.7 Patterns — `src/render/canvas.ts:70`

```tex
\usetikzlibrary{patterns, patterns.meta}
\fill[pattern=north east lines] (0,0) rectangle (1,1);
\fill[pattern=crosshatch] (0,0) rectangle (1,1);
\fill[pattern=dots] (0,0) circle (0.5cm);
\fill[pattern=grid] (0,0) rectangle (1,1);
\fill[pattern=bricks] (0,0) rectangle (1,1);
\fill[pattern=checkerboard] (0,0) rectangle (1,1);
% pattern color via pattern color=<color>
```

Rendered as offscreen repeating canvas via `createPattern`; not pgf-exact but visually equivalent. `patterns.meta` parameterized keys accepted (stored).

### 13.8 Bounding Box Control — `src/core/evaluator.ts:22`, `src/render/displayList.ts:4`

```tex
\draw[use as bounding box] (0,0) rectangle (1,1); % sets bbox exactly
\draw[overlay] (10,10) -- (20,20);                % excluded from bbox (overlay=true)
\draw[trim left=1cm, trim right=1cm] (0,0) -- (5,0); % shrinks computed bbox
\node at (current bounding box.center) {×};
\node at (current bounding box.north east) {×};
% current bounding box pseudo-node with all anchors, updated after layout
% baseline=(A.base) handled as vertical offset stored in displayList
```

`overlay` sets `DisplayPath.overlay` excluded in `computePathBBox`; `use as bounding box` replaces bbox; `trim` adjusts bbox by dims; `current bounding box` injected as `NodeEntry` after evaluation `src/core/evaluator.ts:219`.

---

**For AI (updated for Phase 4):** For technical drawings, default to `calc` and `intersections`. Use `($(A)!.5!(B)$)` for midpoints, `($(A)!(C)!(B)$)` for projections, `(A |- B)` for right-angle constructions, and `let \p1=… in` for derived coordinates. Name paths with `name path=` and reuse with `name intersections`. Choose `arrows.meta` tips like `Stealth[length=3mm]` over legacy `->`; chain tips (`>>`) and use `shorten <= >`. For fills, use `\shade[left color…]` / `ball color` or `pattern=` with `patterns` library — they now render as gradients/tilings. Control layout with `overlay`/`use as bounding box`/`trim` and reference `current bounding box`. Still no pics/plots/matrix (Phase 5) — for reuse, use `\foreach`+`\def` instead.

---

## 14. Phase 5 — Composition (Core 0.5) — **NEW in 0.5.0**

> **Scope:** `src/keys/index.ts:1` (picRegistry), `src/parser/index.ts:22` (pic/edge/plot/pgf), `src/core/evaluator.ts:9` (pic/edge/plot/fit/layers), `src/shapes/index.ts:1` (shape libs)
> **Tests:** 50 (`tests/unit/phase5.test.ts:1`) — 362 total, core budget 38 KB gz < 50 KB gz

Phase 5 closes the **core** build: reusable pics, edge indirection, plots, and shape exhaustion. AIs can now generate **compact, reusable diagram components** without copying code.

### 14.1 Pics & Quotes — `src/keys/index.ts:1`, `src/parser/index.ts:22`

Pics are named fragments with `/.pic` handler; instantiated via `pic` path op. Quotes `"label"` is sugar for `label`.

```tex
\tikzset{
  my dot/.pic={\fill (0,0) circle (2pt);},
  pics/seagull/.style={code={\draw (-0.3,0) to[bend left] (0,0.1) to[bend left] (0.3,0);}}
}
\draw (0,0) pic {my dot};
\draw (1,0) pic[red, scale=1.2] {seagull};

\usetikzlibrary{angles, quotes}
\coordinate (A) at (0,0); \coordinate (B) at (1,0); \coordinate (C) at (1,1);
\pic["$\theta$", draw, angle radius=1cm] {angle=A--B--C}; % quotes → node label
\draw (0,0) to["label" above] (1,0);                       % "label" on edge
\draw (0,0) -- node["mid" sloped] (1,0);
```

`angle=A--B--C` draws arc between BA and BC; generic pics expand via `picRegistry`.

### 14.2 Edge & To Path — `src/core/evaluator.ts:9`

`edge` separates stroke: path after `edge` becomes new `DisplayPath` (not joined). `to path` customizes `to`:

```tex
\draw (0,0) -- (1,0) edge[->] (2,1); % edge is separate straight line
\tikzset{my to/.style={to path={-- (\tikztotarget) \tikztonodes}}}
\draw (0,0) to[my to] node[above]{via} (2,0); % \tikztostart/\tikztotarget available
```

### 14.3 Plot — `src/parser/index.ts:22`, `src/core/evaluator.ts:9`

```tex
\draw plot coordinates {(0,0) (1,1) (2,0) (3,1)};
\draw plot[smooth, tension=0.6] coordinates {(0,0) (1,1) (2,0)};
\draw[domain=0:3, samples=50, variable=\x] plot ({\x}, {sin(\x*30)});
\draw plot[samples at={0,0.5,1,2}] ({\x}, {\x*\x});
\draw plot[sharp plot] coordinates {(0,0) (1,1)};
\draw plot[const plot] coordinates {(0,0) (1,1)};
\draw plot[ycomb] coordinates {(0,0) (1,1) (2,0.5)}; % comb variants stub -> line
\draw plot[mark=*, mark repeat=2, mark phase=1] coordinates {(0,0) (1,1) (2,0)};
% mark=*|+|x|o|square|diamond|triangle* etc stored as nodes on plot points
% inline table:
\draw plot table[row sep=\\] {0 0\\ 1 1\\ 2 0\\};
```

Functions evaluated via `src/math/index.ts` (`evalMath`) with `variable`.

### 14.4 Fit, Backgrounds, Layers — `src/core/evaluator.ts:9`

```tex
\usetikzlibrary{fit, backgrounds}
\node[fit=(A)(B), draw, inner sep=5pt] (box) {};
\draw[show background rectangle] (0,0) -- (1,0);
\draw[framed] (0,0) rectangle (1,1); \draw[gridded] (0,0) rectangle (1,1);
\begin{scope}[on background layer] \fill[gray!20] (0,0) rectangle (2,2); \end{scope}

\pgfdeclarelayer{background} \pgfdeclarelayer{foreground}
\pgfsetlayers{background,main,foreground}
\begin{pgfonlayer}{background} \fill[blue!10] (0,0) rectangle (2,2); \end{pgfonlayer}
```

`fit` computes union bbox of listed nodes; backgrounds/layers set `DisplayPath.layer` for z-order.

### 14.5 Shape Libraries — `src/shapes/index.ts:1`

All shapes registered via `defineShape(name, {computeBBox, borderPoint})` — currently rect/circle proxy with `diamond` true border math.

```tex
\usetikzlibrary{shapes.geometric, shapes.misc, shapes.symbols, shapes.arrows, shapes.multipart, shapes.callouts}
\node[diamond, draw] at (0,0) {A};
\node[regular polygon, regular polygon sides=5, draw] at (1,0) {5};
\node[star, star points=5, draw] at (2,0) {*};
\node[trapezium, draw] at (0,1) {Trap};
\node[semicircle, draw] at (1,1) {semi};
\node[isosceles triangle, draw] at (2,1) {tri};
\node[kite, dart, cylinder, circular sector, draw] % geometric
\node[rounded rectangle, cross out, strike out, chamfered rectangle, draw] % misc
\node[forbidden sign, cloud, starburst, signal, magnifying glass, draw] % symbols
\node[single arrow, arrow box, tape, draw] % arrows
\node[rectangle split, rectangle split parts=2, draw] % multipart
\node[rectangle callout, ellipse callout, cloud callout, draw, callout relative pointer={(0.5,0.5)}] % callouts
```

### 14.6 Through & PGF Basic — `src/core/evaluator.ts:9`

```tex
\usetikzlibrary{through}
\node[draw, circle through=(B)] at (A) {}; % radius=|A-B|

% PGF basic layer inside picture:
\begin{tikzpicture}
  \pgfpathmoveto{\pgfpoint{0cm}{0cm}}
  \pgfpathcurveto{\pgfpoint{1cm}{1cm}}{\pgfpoint{2cm}{1cm}}{\pgfpoint{3cm}{0cm}}
  \pgfusepath{stroke}
  \pgfpathcircle{\pgfpoint{1cm}{1cm}}{0.5cm} \pgfusepath{fill}
\end{tikzpicture}
```

Subset: `\pgfpathmoveto/curveto/lineto/close/rectangle/circle/ellipse/moveto` + `\pgfpoint` + `\pgfusepath{stroke,fill,clip}`.

---

**For AI (updated for Phase 5 — CORE COMPLETE):** You now have **full core** (Phases 1-5) under 50 KB gz. Prefer `pic` for reuse (`my dot/.pic`), `angles`+`quotes` for `angle=A--B--C`, `edge` for separate connections, `to path` for custom edges. For data, use `plot coordinates` / `plot ({\x},{expr})` with `domain/samples/smooth/mark=`. For groups, use `fit=(A)(B)` and `pgfonlayer` layers + `backgrounds`. Choose shape libraries explicitly — `diamond`, `star`, `rounded rectangle callout`, `tape`, `cylinder` now exist. Still no `decorations` (Phase 6) or `matrix/trees/graphs` (Phase 7) — for tables use `fit`+`calc`, for trees use manual `child` via `pic` recursion.

---

## 15. Phase 6 — Decorations — **NEW in 0.6.0**

> **Scope:** `src/decorations/index.ts:12`, `src/core/evaluator.ts:1350`, `src/geometry/path.ts:1`
> **Tests:** 45 (`tests/unit/phase6.test.ts:1`) — 407 total, 43 KB gz

Phase 6 adds PGF-like walking along paths. AIs can now generate **hand-drawn, braced, and marked paths**.

### 15.1 Automaton — `src/decorations/index.ts:12`

```tex
\tikzset{decoration={zigzag, amplitude=2pt, segment length=5pt}}
\draw[decorate, decoration={zigzag}] (0,0) -- (2,0);
\draw[decorate, decoration={coil, aspect=0.3}] (0,0) -- (2,0);
```

States: `width`, `next state`, `auto end on length`, `auto corner on length`, `persistent precomputation`. Common keys: `pre`, `post`, `pre length`, `post length`, `raise`, `mirror`, `transform`, `amplitude`, `segment length` — all work with `decorate`.

### 15.2 Libraries

```tex
\usetikzlibrary{decorations.pathmorphing, decorations.pathreplacing, decorations.markings, decorations.shapes, decorations.text, decorations.footprints, decorations.fractals}
\draw[decorate, decoration={zigzag, amplitude=1mm}] (0,0) -- (2,0);
\draw[decorate, decoration={snake}] (0,0) -- (2,0);
\draw[decorate, decoration={coil}] (0,0) -- (2,0);
\draw[decorate, decoration={bumps}] (0,0) -- (2,0);
\draw[decorate, decoration={brace, mirror, amplitude=5pt}] (0,0) -- (0,1);
\draw[decorate, decoration={ticks}] (0,0) -- (2,0);
\draw[decorate, decoration={show path construction}] (0,0) .. controls (1,1) .. (2,0);
% markings
\draw[postaction={decorate, decoration={markings, mark=at position 0.5 with {\arrow{Stealth}}}}] (0,0) -- (2,0);
\draw[decorate, decoration={markings, mark=between positions 0 and 1 step 5mm with {\arrow{>}}}] (0,0) -- (2,0);
% text along path
\draw[decorate, decoration={text along path, text={hello world}, text align=center}] (0,0) -- (2,0);
% fractals
\draw[decorate, decoration={Koch curve type 1}] (0,0) -- (1,0);
```

All generators resample via `pointAtDistance`/`tangentAtT` from `src/geometry/path.ts:1`.

---

**For AI (updated for Phase 6):** Use `decorate` + `decoration={name, amplitude, segment length}` for wiggly/bumpy/coiled lines. For braces use `decorate, decoration={brace, mirror, amplitude=5pt}`. For arrows mid-path use `decorations.markings` `mark=at position 0.5`. For hand-drawn style combine `random steps`. Still no `matrix/trees/graphs` (Phase 7) — arrange those manually with `positioning`+`calc`.

---

## 16. Phase 7 — Structured Diagrams — **NEW in 0.7.0**

> **Scope:** `src/parser/index.ts:63` `src/core/evaluator.ts:17` `src/graphDrawing/index.ts:1`
> **Tests:** 50 (`tests/unit/phase7.test.ts:1`) — 457 total, 46 KB gz

Phase 7 adds high-level structuring: matrices, trees, and graphs with automatic layout.

### 16.1 Matrix — `src/parser/index.ts:63`, `src/core/evaluator.ts:17`

```tex
\usetikzlibrary{matrix}
\matrix (m) [matrix of nodes, row sep=5mm, column sep=5mm] {
  a & b & c \\
  d & e & f \\
};
\node at (m-1-2) {top}; % auto-named m-row-col
\matrix[matrix of math nodes, nodes in empty cells, row 1 column 2/.style={red}] {
  x & y \\ z &  \\
};
```

Deferred measure: all cell texts measured first, `colWidths`/`rowHeights` computed with `row sep`/`column sep`, placed at `matrix.at` anchor.

### 16.2 Trees — `src/core/evaluator.ts:17`

```tex
\usetikzlibrary{trees}
\node {root}
  child {node {A} child {node {A1}} child {node {A2}}}
  child {node {B} child[missing] {} child {node {B2}} };
\tikzset{level 1/.style={sibling distance=2cm}, level 2/.style={sibling distance=1cm}, level distance=1.5cm}
\node {root} child[grow=90] {node {up}} child[grow'=-90] {node {down}};
% edge from parent handles via edgeFromParent style
```

`evaluateTreeChildren` uses `grow` angle, `level distance`/`sibling distance`, `missing` skips placement.

### 16.3 Graphs — `src/parser/index.ts:63`

```tex
\usetikzlibrary{graphs}
\graph {a -> b -> {c, d -> e} };
\graph {a ->[red] b ->[bend left] c};
\graph { {a,b,c} -- complete graph }; % named generator proxy
\graph[edges={->}] { a -> b; b -> c; }
```

Groups `{c,d}` expand; edges become `--`/`->` with options. Layout via next section if no coords.

### 16.4 Graph Drawing — `src/graphDrawing/index.ts:1`

```tex
\usetikzlibrary{graphdrawing} \usegdlibrary{layered, circular}
\graph[layered layout, sibling distance=2cm, level distance=1.5cm] {a -> b -> c; a -> d -> c};
\graph[spring layout] {a -- b -- c -- a};
\graph[circular layout] {a -- b -- c -- d -- a};
\graph[tree layout, grow=down] {a -> {b -> {d,e}, c -> f}};
```

Algorithms: `circularLayout` (2π/n), `layeredLayout` BFS rank (Sugiyama), `springLayout` 50-iter force, `treeLayout` (Reingold-Tilford), `gridLayout`. Selected via keys `layered layout`/`spring layout`/`graph drawing`.

### 16.5 Automata / Chains / Mindmap — stub accept

```tex
\usetikzlibrary{automata, chains, mindmap}
\node[state, initial, accepting] (q0) at (0,0) {$q_0$};
\draw[->] (q0) edge[loop above] node {0} (q0) edge[bend left] node {1} (q1);
\begin{scope}[start chain] \node[on chain] {A}; \node[on chain] {B}; \end{scope}
\node[concept, color=red] {Root} child[concept color=blue] {node[concept]{Child}};
```

Keys `state/initial/accepting/loop/chain/concept` accepted as styles; visual matching best-effort.

---

**For AI (updated for Phase 7):** For tables use `\matrix[matrix of nodes,row sep,column sep] {a & b\\ c & d}` and reference `m-1-2`. For hierarchies use `node {root} child {node {leaf}}` with `level distance`/`sibling distance`/`grow`. For networks use `\graph {a -> b -> {c,d}}` and add `spring layout`/`layered layout`/`circular layout` for auto-placement — significantly easier than TikZ (no LuaTeX needed). For FSM use `automata` `state/initial/accepting` + `edge[loop above]`. Still no `fadings/3D/spy` (Phase 8) — for those approximate with `opacity`/`shadings`.
