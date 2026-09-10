# WebTikZ — AI Skill

> **Version:** 0.2.0 — **Phase 2 (Language Core)** complete — 2026-09-11
> **Bundle:** `dist/webtikz.min.js` ~21.8 KB gz (Phase 2), IIFE `WebTikZ` / ESM `webtikz.mjs`
> **Source:** `src/lexer/index.ts:1`, `src/parser/index.ts:1`, `src/core/evaluator.ts:1`, `src/color/index.ts:1`, `src/math/index.ts:1`, `src/keys/index.ts:1`, `src/render/canvas.ts:1`
> **Tests:** 212 pass (Phase 1: 30 + Phase 2: 151 + specific 5 + core 26) — `npm test` green, `tsc --noEmit` clean

This SKILL is **incremental**. Each WebTikZ phase appends a new section without rewriting previous ones. AIs MUST read the highest `Phase` header they need and MUST NOT hallucinate features from later phases. Current ceiling: **Phase 2**. Anything tagged Phase 3+ is *not yet implemented* and will error or be ignored.

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
| 3 Nodes & text | TODO | < ? | TextEngine, nodes, anchors, positioning |
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
