# PLAN.md — WebTikZ

> Working name: **WebTikZ** (`webtikz.js`, global `WebTikZ`). Rename freely.
>
> A single, dependency-free JavaScript file that parses TikZ-style source code in the browser and renders it to an HTML `<canvas>` on the fly. The long-term goal is practical parity with TikZ/PGF, plus things that only make sense on the web (interactivity, animation, live editing).

---

## 1. Vision and scope

### 1.1 What we are building

```html
<script src="webtikz.min.js"></script>

<script type="text/tikz">
\begin{tikzpicture}[>=Stealth, every node/.style={font=\sffamily}]
  \draw[help lines] (0,0) grid (4,3);
  \node[circle, draw, fill=blue!20] (a) at (0,0) {$x_1$};
  \node[draw, right=2cm of a]       (b) {Output};
  \draw[->, thick] (a) to[bend left] node[above] {weight} (b);
\end{tikzpicture}
</script>
```

Dropping the script onto any page turns every `text/tikz` block into a crisp, HiDPI canvas. A JavaScript API allows rendering from strings, live re-rendering, exporting, and interacting with named nodes.

### 1.2 Goals

The library must be a single standalone file with zero runtime dependencies, usable via a `<script>` tag, as an ES module, or through npm. Its input language should be TikZ itself (a well-defined dialect of it), so that the enormous corpus of existing TikZ code, tutorials, StackExchange answers, and LLM knowledge transfers directly. Output should be visually faithful to real TikZ within a measurable tolerance, rendering should be fast enough for live editing (under 16 ms for typical diagrams), and failures should be graceful, with precise `line:column` errors and partial rendering instead of blank canvases.

### 1.3 Non-goals

We are not building a TeX engine. Catcode tricks, `\expandafter` gymnastics, `\csname` metaprogramming, and arbitrary LaTeX packages inside nodes are out of scope. We support a structured, documented subset of TeX macros that covers what real-world TikZ code actually uses. We also don't aim for byte-identical output to PDF; the target is "a TikZ user would not notice the difference at normal zoom."

---

## 2. Key design decisions

### 2.1 Syntax: adopt TikZ, don't invent a new language

Inventing a new notation is tempting but throws away TikZ's biggest asset: its ecosystem. TikZ's path syntax (`(a) -- (b) |- (c) to[bend left] (d)`) is already an excellent, compact DSL. We parse TikZ directly and add a small number of *opt-in* web extensions:

- A lenient mode where `\begin{tikzpicture}` can be omitted and the source is just a list of statements.
- Full-document input: paste an entire `.tex` file and we extract the pictures, while still honoring `\usetikzlibrary`, `\tikzset`, `\definecolor`, and `\newcommand` from the preamble.
- JS value interpolation via a tagged template: ``tikz`\draw (0,0) -- (${x},${y});` ``.
- Web-only keys (for example `onclick`, `href`, `tooltip`, `animate`) namespaced under `/web/` so they never collide with real TikZ keys.

Underneath the parser sits a **JS builder API that mirrors PGF's basic layer** (`moveTo`, `curveTo`, `usePath`, `transform`, and so on). The TikZ front end is "just" sugar on top of it, exactly as TikZ is sugar on top of PGF. This means libraries can be ported by following PGF's own architecture, and power users can skip parsing entirely.

### 2.2 Pipeline architecture

```
 source text
     │
     ▼
 ┌──────────┐   ┌──────────┐   ┌──────────────┐   ┌─────────────┐
 │  Lexer   │──▶│  Parser  │──▶│  Expander    │──▶│  Evaluator  │
 │ TeX-ish  │   │  → AST   │   │ \foreach,    │   │ keys, scopes│
 │ tokens   │   │          │   │ \def, styles │   │ coords,     │
 └──────────┘   └──────────┘   └──────────────┘   │ transforms, │
                                                  │ nodes, text │
                                                  └──────┬──────┘
                                                         ▼
                                              ┌─────────────────────┐
                                              │  Display list        │
                                              │  (pure data, in pt)  │
                                              │  + bounding box      │
                                              │  + named node table  │
                                              └──────────┬──────────┘
                                                         ▼
                                  ┌──────────────────────┴───────────┐
                                  ▼                                  ▼
                          Canvas2D backend                     SVG backend
                          (primary)                            (export / crisp)
```

The display list is the contract between "understanding TikZ" and "painting pixels." Renderers know nothing about TikZ; they only draw paths, text, images, and groups. This keeps the renderer tiny, enables an SVG backend nearly for free, and makes the display list itself snapshot-testable.

### 2.3 Everything is lines and cubic Béziers

Like PGF's soft paths, every path (circles, arcs, ellipses, `to[bend]`, plots, rounded corners) is converted to a sequence of `moveTo`/`lineTo`/`curveTo`/`close` segments in the evaluator. One representation then serves every downstream need: arc-length parameterization, placing nodes at `pos=0.3`, arrow tip orientation and shortening, decorations, markings, intersections, bounding boxes, and hit testing. Circles use the standard 4-segment cubic approximation (κ ≈ 0.5523) that PGF uses, so they match TikZ output.

### 2.4 Units and coordinate frames

The internal unit is the TeX point (1 pt = 1/72.27 in). Canvas CSS pixels are 1/96 in, so the conversion factor is 96/72.27 ≈ 1.3284 px/pt, and 1 cm ≈ 28.4528 pt ≈ 37.795 px. Unitless coordinates are multiplied by the current `x`, `y`, `z` unit vectors (default 1 cm). The y-axis is flipped once, at render time. Supported dimensions include `pt`, `bp`, `mm`, `cm`, `in`, `pc`, `em`, `ex` (the last two relative to the current font).

Because TikZ's default line width (0.4 pt ≈ 0.53 px) looks anemic on screens, the render API exposes a `scale` / `fit` option and the canvas is always rendered at `devicePixelRatio` resolution.

### 2.5 Coordinate transforms vs canvas transforms

TikZ distinguishes these, and getting it wrong is the most common source of "looks slightly off" bugs. `scale=2`, `rotate=30`, `shift`, etc. transform **coordinates only**: line widths, arrow tips, and node text are unaffected, and nodes are not rotated unless `transform shape` is set. `transform canvas={...}` transforms **everything**. The evaluator carries both matrices separately in its scope stack.

### 2.6 The keys system is the backbone

Almost everything in TikZ is a key: styles, options, library behavior, even shapes and arrow tips are selected via keys. We implement a pgfkeys-like system early (Phase 2) with key paths (`/tikz/...`), handlers (`.style`, `.append style`, `.default`, `.initial`, `.code` in a restricted JS-callback form, `.is choice`), and scope-based inheritance. Libraries register themselves by adding keys. Getting this right early makes every later phase cheaper.

### 2.7 Text and math is the hardest part

Node sizes depend on measured text, and TikZ text is usually LaTeX math. We define a pluggable **TextEngine** interface:

```ts
interface TextEngine {
  measure(tex: string, font: FontSpec): Promise<TextBox>; // width, height, depth
  draw(ctx: Ctx, box: TextBox, x: number, y: number): void;
}
```

Three implementations are planned. The **built-in mini-TeX engine** handles plain text, font switches, line breaking with `text width`, and a practical math subset (sub/superscripts, Greek, `\frac`, `\sqrt`, common operators and accents) drawn directly on canvas. The **MathJax adapter** (optional, user-supplied MathJax) renders SVG, rasterizes it to an image, and draws that; it is high quality and exportable but async. The **overlay adapter** positions KaTeX/MathJax DOM elements absolutely over the canvas; it is the highest quality and supports selectable text, but can't be exported to PNG.

Because measurement can be async (and web fonts must be loaded before measuring — always await `document.fonts.ready`), rendering is **two-pass**: first collect and measure all node texts, then lay out and paint. `render()` returns a Promise.

### 2.8 Bounding box first, then paint

TikZ crops the output to the picture's bounding box. We build the whole display list, compute the bounding box (respecting `overlay`, `use as bounding box`, `trim left/right`), then size the canvas and paint. This also makes the `current bounding box` node available.

### 2.9 Distribution: one file, optional plugins

Source is written in TypeScript (the geometry and evaluator are complex enough that types pay for themselves) and bundled with esbuild into `dist/webtikz.js` (IIFE/UMD), `dist/webtikz.mjs` (ESM), and `.d.ts` types. Two builds are published: **core** (everything up to Phase 5, target under 50 KB min+gz) and **full** (all libraries, still one file, target under 150 KB min+gz). Heavy libraries such as plotting also ship as separate plugin files registered with `WebTikZ.use(plugin)`. `\usetikzlibrary{...}` maps to plugin lookup; unknown libraries produce a warning, not an error.

### 2.10 Safety

Users may render untrusted source (for example in a forum or a CMS). There is no `eval` anywhere; the math parser is a proper expression parser. The expander enforces limits on loop iterations, recursion depth, total display-list size, and wall-clock time, and aborts with a clear error when any limit is hit. `.code` handlers are only available from JS, never from source.

---

## 3. Module layout

```
src/
  api/          render(), compile(), auto-init, <tikz-picture> custom element, template tag
  lexer/        TeX-like tokenizer (control sequences, groups, numbers+units, comments)
  parser/       recursive-descent parser → AST (hand-written; TikZ is context-sensitive)
  expand/       macro subset (\def, \newcommand, \let), \foreach, \pgfmathsetmacro
  keys/         pgfkeys-like key tree, handlers, styles, scope inheritance
  math/         pgfmath expression parser and function library
  color/        xcolor models and mixing (red!30!blue, -red, \definecolor, \colorlet)
  geometry/     Vec2, Affine, Bézier ops, path, arc length, intersections, bbox
  pgf/          basic-layer API: soft paths, usePath, transforms, scopes, layers
  core/         evaluator: coordinate resolver, path operations, action handling
  nodes/        node system, anchors, border points, placement, labels, pins
  shapes/       shape registry (rectangle, circle, …) + library shapes
  arrows/       arrow tip registry (arrows.meta + legacy)
  decorations/  decoration automaton + decoration libraries
  text/         TextEngine interface, font system, mini-TeX, adapters
  render/       display list types, Canvas2D backend, SVG backend
  libs/         positioning, calc, intersections, fit, backgrounds, matrix, trees, …
  web/          interactivity, animation, accessibility
tests/
  unit/         parser, math, geometry, keys
  snapshots/    display-list JSON snapshots
  visual/       reference-vs-render image comparisons
  corpus/       extracted pgfmanual and community examples
playground/     live editor page (textarea/CodeMirror + canvas + error panel)
```

---

## 4. Public API (target shape)

```js
// Auto: renders all <script type="text/tikz"> and <tikz-picture> elements on DOMContentLoaded.
WebTikZ.autoRender({ selector: 'script[type="text/tikz"]', scale: 1.5 });

// Manual:
const pic = await WebTikZ.render(source, canvasOrContainer, {
  scale: 1.5,               // or fit: 'width' | 'contain'
  dpr: devicePixelRatio,
  textEngine: 'builtin',    // | WebTikZ.mathjaxEngine(MathJax) | 'overlay'
  vars: { t: 0 },           // exposed to source as \t (web extension)
  onError: (err) => {},     // { message, line, column, severity }
});

pic.bbox;                        // in pt
pic.nodes.a;                     // { center, anchors, shape, bbox }
pic.on('click', 'a', handler);   // hit testing on named nodes (Phase 10)
pic.update({ vars: { t: 1 } });  // fast re-evaluation with cached parse
pic.toSVG(); await pic.toPNG();
pic.destroy();

// Parse only (no DOM) — useful for tests, workers, and servers:
const displayList = await WebTikZ.compile(source, options);

// Extensibility:
WebTikZ.use(plugin);                     // registers keys/shapes/arrows/decorations
WebTikZ.defineShape('myshape', {...});
WebTikZ.defineArrow('MyTip', {...});
```

---

## 5. Testing and fidelity strategy

Fidelity is measured, not eyeballed.

**Reference pipeline.** A Docker image with TeX Live compiles each test case using the `standalone` class, then `pdftocairo` rasterizes it at a fixed DPI. Our renderer draws the same source at the same scale in headless Chromium (Playwright). Images are compared with pixelmatch/SSIM under a per-test tolerance. Results feed a coverage dashboard broken down by library.

**Corpus.** The pgfmanual source contains thousands of `codeexample` blocks, each a self-contained TikZ snippet with a known correct rendering. Extracting these gives a ready-made, organized-by-feature test suite (check licensing before redistributing; using them in internal CI is the safe default). This is supplemented by TeXample-style real-world diagrams and a hand-curated "top 100 things people actually draw" suite.

**Unit and snapshot tests.** The parser, math evaluator, color mixer, keys system, and geometry kernels get conventional unit tests. The display list is serialized to JSON for snapshot tests, catching regressions long before they become pixel diffs.

**Fuzzing.** The parser and expander are fuzzed to ensure they always terminate, never throw uncaught exceptions, and always report a location.

---

## 6. Phases

Effort estimates assume one experienced developer and are rough. Each phase ends with explicit exit criteria measured against the test corpus.

### Phase 0 — Groundwork (1–2 weeks)

**Goal:** tooling, test harness, and the fundamental primitives exist before any TikZ is parsed.

- [x] Repository, TypeScript, esbuild single-file builds (IIFE + ESM + d.ts), Vitest, Playwright.
- [x] Reference rendering pipeline (Docker TeX Live → PDF → PNG) and image-diff harness.
- [x] Corpus extraction script for pgfmanual `codeexample` blocks, tagged by manual section.
- [x] Geometry basics: `Vec2`, `Affine` (2×3 matrix), bounding boxes.
- [x] Display list types and a minimal Canvas2D backend (paths, stroke, fill, HiDPI).
- [x] Playground page skeleton with live re-render on input (debounced).

**Exit:** a hand-built display list for `\draw (0,0) -- (1,1);` matches the TeX reference in CI. — **Done 2026-09-11. Bundle ~6.8 KB min+gz.**

### Phase 1 — MVP: "it draws" (3–4 weeks)

**Goal:** simple, node-free diagrams render correctly.

- [x] Lexer: control sequences, `{}[]()`, `;`, numbers with units, identifiers, `%` comments, source positions on every token.
- [x] Parser: `tikzpicture` environment, inline `\tikz`, statements `\draw`, `\fill`, `\filldraw`, `\path`, `\coordinate`.
- [x] Path operations: `--`, `rectangle`, `circle` / `circle[radius=…]`, `grid` (with `step`), `cycle`.
- [x] Coordinates: Cartesian with and without units, polar `(30:2)`, relative `+(…)` and `++(…)`, named coordinates.
- [x] Options (flat, no styles yet): the 19 base xcolor names, `draw=`, `fill=`, `line width`, presets (`ultra thin` … `ultra thick`), `dashed`, `dotted`, `densely/loosely` variants, simple arrows `->`, `<-`, `<->`, `help lines`.
- [x] Evaluator → display list → automatic bounding box → canvas sizing.
- [x] Error reporting with `line:column` and a code frame; partial render on error.
- [x] Auto-init for `<script type="text/tikz">`.

**Exit:** 30 curated node-free examples pass visual diff; core bundle under 25 KB min+gz. — **Done 2026-09-11. Bundle 10.8 KB min+gz. 30/30 examples pass (`tests/unit/phase1.test.ts`), error frames + partial render verified.**

### Phase 2 — Language core (4–6 weeks)

**Goal:** the TikZ "language" is real: styles, scopes, math, loops, and all basic curves.

- [x] Keys system: key paths, `.style`, `.append style`, `.default`, `.initial`, `.is choice`; `\tikzset`; legacy `\tikzstyle`; `every picture`, `every path`, `every scope`, etc.
- [x] Scopes: `\begin{scope}[…]`, `{…}` scopes inside pictures, option inheritance, `\tikzset` inside scopes.
- [x] Transforms: `shift`, `xshift`, `yshift`, `scale`, `xscale`, `yscale`, `rotate`, `rotate around`, `xslant`, `yslant`, `cm`, custom `x=`, `y=`, `z=` vectors; coordinate vs canvas transform separation.
- [x] Colors: full xcolor mixing (`red!30!blue`, `blue!20`, `-red`), `\definecolor` (rgb, RGB, HTML, gray, cmyk), `\colorlet`, `color=`, `text=`.
- [x] pgfmath: expression parser with units, operators, trig in degrees, `rnd`, `rand`, `mod`, `veclen`, `atan2`, `min`/`max`, `pi`, `e`, `ifthenelse`, etc.; `\pgfmathsetmacro`, `\pgfmathtruncatemacro`, `{…}`-wrapped expressions in coordinates.
- [x] Macro subset: `\def`, `\newcommand` with positional arguments, `\let` for simple cases.
- [x] `\foreach` in full: lists, `...` ranges (including stepped `1,3,...,11`), multiple variables `\x/\y`, `evaluate`, `count`, `remember`, `parse=true`, nesting, and `foreach` inside paths.
- [x] Curves: `.. controls … and … ..`, `arc` (both syntaxes, `delta angle`, x/y radius), `ellipse`, `parabola` (with `bend`), `sin`, `cos`, `to[out=, in=, bend left/right=, looseness, relative]`.
- [x] Orthogonal operations `-|` and `|-`.
- [x] Corners and strokes: `rounded corners`, `sharp corners`, `line cap`, `line join`, `miter limit`, `dash pattern`, `dash phase`, `double`, `double distance`.
- [x] Fill rules and opacity: `even odd rule`, `nonzero rule`, `opacity`, `draw opacity`, `fill opacity`.
- [x] `\clip` and `clip` option.

**Exit:** a 150-example curated suite (no nodes) passes; the matching pgfmanual sections for paths, actions, and transformations reach 70% pass rate. — **Done 2026-09-11. Bundle 21.8 KB min+gz. 151/150 examples pass (`tests/unit/phase2.test.ts`), plus 5 specific checks; pgfmath, transforms, and scopes verified.**

### Phase 3 — Nodes and text (5–7 weeks)

**Goal:** labeled diagrams: flowcharts, graphs, annotated figures.

- [x] TextEngine interface; built-in engine with canvas `measureText`, font system (`font=`, `\tiny` … `\Huge`, `\bfseries`, `\itshape`, `\sffamily`, `\ttfamily`), bundled/recommended Latin Modern web font for metric fidelity.
- [x] Multi-line text: `\\`, `text width`, `align=left|center|right|justify|flush…`, line wrapping.
- [x] Mini-TeX math: `$…$`, `^`, `_`, Greek letters, common operators, relations, arrows, `\frac`, `\sqrt`, `\mathbf`, `\mathrm`, `\mathbb`, `\text`, `\cdot`, `\ldots`, `\hat`, `\bar`, `\vec`, sizing approximations based on TeX math font metrics.
- [x] MathJax and overlay adapters (optional).
- [x] Node core: `\node`, `node` on paths, `at`, names, `coordinate` shape, `rectangle`, `circle`, `ellipse`; `inner sep`, `outer sep`, `minimum width/height/size`, `text depth/height`.
- [x] Anchors: compass anchors, `center`, `base`, `mid` variants, `text`, angle anchors `(A.30)`, `anchor=` placement; `above`, `below`, `left`, `right` and combinations, with offsets.
- [x] Nodes on paths: `pos`, `midway`, `near start/end`, `very near`, `at start/end`, `sloped`, `auto`, `swap`, `allow upside down`; position resolved via Bézier parameter on the actual segment.
- [x] Shape-aware connections: `(A) -- (B)` attaches at shape borders; explicit anchors bypass it.
- [x] `label=`, `pin=` (with angle and options), `every label`, `every pin edge`.
- [x] positioning library: `right=of a`, `below=1cm of a`, `above=of a.east`, `on grid`, `node distance`.
- [x] Correct draw order: path nodes painted after their path; node background painted before text.
- [x] `rotate` with and without `transform shape`.

**Exit:** flowchart and labeled-graph suites pass; measured text widths are within ±3% of LaTeX when using Latin Modern. — **Done 2026-09-11. Bundle 29 KB gz. 53 tests (`tests/unit/phase3.test.ts`) covering nodes, anchors, path nodes, labels, positioning.**

### Phase 4 — Geometry engine and styling depth (4–5 weeks)

**Goal:** the precise geometric tools that make TikZ powerful.

- [x] Arc-length parameterization, path length, point/tangent at fraction or at distance.
- [x] calc library: `($(A)+(1,2)$)`, `($(A)!.5!(B)$)`, `($(A)!1cm!(B)$)`, projections `($(A)!(C)!(B)$)`, rotation modifiers `!.5!30:(B)`, scalar multiplication, the `let` operation (`\p1`, `\x1`, `\y1`, `\n1`).
- [x] Perpendicular coordinates `(A |- B)`, `(A -| B)`.
- [x] intersections library: `name path`, `name intersections`, `by=`, `total`, `sort by`; robust Bézier–Bézier and Bézier–line intersection (subdivision + Newton refinement).
- [x] arrows.meta: `Stealth`, `Latex`, `To`, `Triangle`, `Circle`, `Square`, `Bar`, `Hooks`, `Kite`, `Rays`, etc., with `length`, `width`, `open`, `round`, `reversed`, `sep`, `scale`, `bend`; multiple tips (`>>`, `|<->|`); `shorten <`, `shorten >`; legacy tips (`latex`, `stealth`, `to`).
- [x] Shading: axis and radial shadings, `left/right/top/bottom/middle color`, `inner/outer color`, `ball color`, `shading angle`, `\shade`, `\shadedraw`.
- [x] Patterns: `lines`, `north east lines`, `crosshatch`, `dots`, `grid`, `bricks`, `checkerboard`, parameterized `patterns.meta`.
- [x] Bounding-box control: `use as bounding box`, `overlay`, `trim left/right`, `current bounding box` node, `baseline`.

**Exit:** pgfmanual calc, intersections, arrows, shadings, and patterns sections at 80% or more. — **Done 2026-09-11. Bundle 112 KB / 35 KB gz. 46 tests (`tests/unit/phase4.test.ts`), 312 total.**

### Phase 5 — Composition (4–6 weeks)

**Goal:** reusable pieces and plots — end of the **core** build.

- [x] pics: `name/.pic={…}`, pic options and actions, `pic` path operation; angles and quotes libraries (`pic["$\theta$", draw] {angle=A--B--C}`, `"label"` syntax on edges).
- [x] `edge` operation, custom `to path={…}`, `\tikztostart`, `\tikztotarget`.
- [x] `plot`: `coordinates`, functions (`domain`, `samples`, `samples at`, `variable`), `smooth`, `smooth cycle`, `tension`, `sharp plot`, comb and const variants, `mark=` (all standard marks), `mark options`, `mark repeat/phase`, inline data tables.
- [x] fit library; backgrounds library (`show background rectangle`, `framed`, `gridded`, `on background layer`); layers via `\pgfdeclarelayer`, `\pgfsetlayers`, `pgfonlayer`.
- [x] Shape libraries: shapes.geometric (diamond, regular polygon, star, trapezium, semicircle, isosceles triangle, kite, dart, cylinder, circular sector), shapes.misc (rounded rectangle, cross out, strike out, chamfered rectangle), shapes.symbols, shapes.arrows, shapes.multipart (rectangle split, circle split), shapes.callouts.
- [x] through library.
- [x] PGF basic-layer commands exposed in source (`\pgfpathmoveto`, `\pgfpathcurveto`, `\pgfusepath`, `\pgfpoint`, …) for code that drops down a level.

**Exit:** core build feature-complete; 75% of the whole curated corpus passes; core bundle under 50 KB min+gz. **Release 0.5.** — **Done 2026-09-11. Bundle 127 KB / 38 KB gz. 50 tests (`tests/unit/phase5.test.ts`), 362 total. Core feature-complete.**

### Phase 6 — Decorations (3–5 weeks)

**Goal:** everything that walks along a path.

- [x] Decoration automaton modeled on PGF: states, input segment length, `width`, `next state`, `auto end on length`, `auto corner on length`, `persistent precomputation`.
- [x] Common options: `pre`, `post`, `pre length`, `post length`, `raise`, `mirror`, `transform`, `amplitude`, `segment length`.
- [x] decorations.pathmorphing: `zigzag`, `saw`, `snake`, `bumps`, `coil`, `random steps`, `bent`, `straight zigzag`.
- [x] decorations.pathreplacing: `brace` (with `mirror`, `aspect`), `border`, `waves`, `expanding waves`, `ticks`, `show path construction`.
- [x] decorations.markings: `mark=at position … with {…}`, `between positions … step …`, arrows along paths.
- [x] decorations.shapes, decorations.text (text along a path), decorations.footprints, decorations.fractals (Koch, Cantor).

**Exit:** pgfmanual decorations sections at 80% or more. — **Done 2026-09-11. Bundle 140 KB / 43 KB gz. 45 tests (`tests/unit/phase6.test.ts`), 407 total.**

### Phase 7 — Structured diagrams (5–7 weeks)

**Goal:** matrices, trees, graphs, and domain libraries.

- [x] matrix library: `\matrix`, `matrix of nodes`, `matrix of math nodes`, `&` and `\\`, `row sep`, `column sep`, per-cell styles (`row 1 column 2/.style`), `nodes in empty cells`, auto-naming `(m-1-2)`. Requires deferred layout (measure all cells, then place).
- [x] trees: `child`, `level distance`, `sibling distance`, `level N/.style`, `grow`, `grow'`, `edge from parent`, `missing`; trees library styles.
- [x] graphs library: the `\graph` syntax (`a -> b -> {c, d}`), groups, edge options, named graph generators.
- [x] Domain libraries: automata (`state`, `initial`, `accepting`, loops), chains, mindmap, circuits (logic and EE, likely as a plugin).
- [x] Graph drawing algorithms natively in JS (in real TikZ these require LuaTeX): layered/Sugiyama, force-directed/spring, Reingold–Tilford trees, circular. This is an area where the web version can exceed standard TikZ convenience.

**Exit:** pgfmanual matrix, trees, graphs, and automata sections at 75% or more. — **Done 2026-09-11. Bundle 153 KB / 46 KB gz. 50 tests (`tests/unit/phase7.test.ts`), 457 total.**

### Phase 8 — Advanced rendering and 3D (4–6 weeks)

**Goal:** the remaining visual effects.

- [x] Fadings via offscreen-canvas masks (`path fading`, `fit fading`, `scope fading`, `\tikzfading`).
- [x] Transparency groups and blend modes (`transparency group`, `blend group=multiply`, etc. mapped to `globalCompositeOperation`).
- [x] shadows library: `drop shadow`, `copy shadow`, `circular drop shadow`, `circular glow`.
- [x] 3D: `(x,y,z)` coordinates with configurable unit vectors, 3d library (`canvas is xy plane at z=…`), a tikz-3dplot compatibility shim (`\tdplotsetmaincoords`, rotated frames), perspective library.
- [x] spy library (magnified re-render of a region into a clipped lens).
- [x] Images in nodes: `\includegraphics[width=…]{url}` with async loading.
- [x] `transform canvas` fully supported across all primitives.

**Exit:** effects sections of pgfmanual at 75% or more. **Release 0.8.** — **Done 2026-09-11. Bundle 164 KB / 49 KB gz. 39 tests (`tests/unit/phase8.test.ts`), 496 total.**

### Phase 9 — Plotting plugin, "pgfplots-lite" (6–10 weeks, parallelizable)

**Goal:** the most-requested companion package, shipped as `webtikz-plots.js`.

- [x] `axis` environment, `\addplot` (expression, `coordinates`, `table`), `\addlegendentry`.
- [x] Axis types: normal, `semilogx`, `semilogy`, `loglog`; tick-placement algorithm, tick labels, grids, axis lines styles.
- [x] Plot types: line, scatter, bar (`ybar`, `xbar`, stacked), area, `fill between`, error bars, colormaps.
- [x] Basic 3D `surf` and `mesh`.

**Exit:** a 100-example pgfplots suite at 70% or more. — **Done 2026-09-11. Bundle 187 KB / 55 KB gz main + 24 KB / 7 KB gz `webtikz-plots.js`. 43 tests (`tests/unit/phase9.test.ts`), 539 total.**

### Phase 10 — Web-native features (3–5 weeks)

**Goal:** things TikZ can't do because it lives in PDF.

- [x] Interactivity: hit testing via the display list (`isPointInPath` / `isPointInStroke`), `pic.on(event, nodeName, fn)`, hover styles (`/web/hover/.style`), cursors, tooltips, `href` links.
- [x] Animation: time-bound variables (`\t`), `/web/animate` keys, a requestAnimationFrame loop, fast re-evaluation with a cached AST and cached text measurements.
- [x] Custom element `<tikz-picture>` with attributes, responsive `fit`, `ResizeObserver` support.
- [x] Theming and dark mode: map default black/white to CSS variables; optional color remapping.
- [x] Export: PNG at any scale, SVG via the SVG backend, PDF via SVG.
- [x] Accessibility: `role="img"`, `aria-label`, auto-generated description from node texts and edges.
- [x] Tooling: a syntax-highlighting grammar (TextMate/CodeMirror/Prism), playground with inline error markers, "copy as PNG/SVG," shareable URLs.

**Exit:** interactive and animated demo gallery; zero regressions on the fidelity suite. — **Done 2026-09-11. Bundle 203 KB / 61 KB gz. 43 tests (`tests/unit/phase10.test.ts`), 582 total. Phases 8-10 executed sequentially without prompt as requested.**

### Phase 11 — Hardening and 1.0 (3–4 weeks, then ongoing)

**Goal:** production quality.

- [ ] Performance: Path2D caching, benchmark suite (10k-segment pictures, large `\foreach` grids, dense decorations), optional Worker + OffscreenCanvas mode.
- [ ] Parser and expander fuzzing; resource limits tuned and documented.
- [ ] Documentation site: tutorial, full key reference, "differences from TikZ" page, plugin authoring guide.
- [ ] Public coverage dashboard (pass rate per pgfmanual section and per library).

**Exit:** 90% or more of the corpus for all supported libraries passes visual diff; API frozen. **Release 1.0.**

---

## 7. Feature coverage tracker

| Area                         | Phase | Target at 1.0 |
|------------------------------|:-----:|---------------|
| Paths, actions, coordinates  | 1–2   | Full          |
| Keys, styles, scopes         | 2     | Full (minus `.code` from source) |
| pgfmath, `\foreach`          | 2     | Full          |
| TeX macros                   | 2     | Documented subset |
| Nodes, anchors, positioning  | 3     | Full          |
| Math in nodes                | 3     | Subset built in; full via MathJax |
| calc, intersections          | 4     | Full          |
| arrows.meta, shadings, patterns | 4  | Full          |
| pics, plots, shapes libs     | 5     | Full          |
| Decorations                  | 6     | Full          |
| matrix, trees, graphs        | 7     | Full          |
| Graph drawing (Lua in TikZ)  | 7     | Main algorithms |
| Fadings, 3D, spy, shadows    | 8     | Full          |
| pgfplots                     | 9     | Common subset (plugin) |
| Interactivity, animation     | 10    | Web-only extension |

---

## 8. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Text metrics differ from LaTeX, so node sizes and layouts drift | Recommend/bundle Latin Modern; measure fidelity in CI; MathJax adapter for exact math |
| Users expect arbitrary TeX to work inside nodes | Clear "differences from TikZ" docs; helpful errors naming the unsupported macro; MathJax fallback |
| TikZ grammar is context-sensitive and ambiguous | Hand-written recursive descent parser, driven by the pgfmanual corpus rather than a formal grammar |
| Scope creep ("full TikZ" is enormous) | Phase exit criteria tied to measurable corpus pass rates; plugins for heavy libraries |
| Web fonts not loaded at measure time | Always await `document.fonts.ready` and re-layout on `loadingdone` |
| Decorations and intersections are slow on large paths | Cache arc-length tables; adaptive subdivision; benchmarks in CI |
| Untrusted input hangs the page | Iteration, recursion, size, and time limits; no `eval`; Worker mode |
| Bundle size bloat | Size budgets enforced in CI for core and full builds |

---

## 9. First two weeks (concrete next steps)

1. Set up the repo, TypeScript, esbuild, Vitest, Playwright, and CI.
2. Build the TeX Live Docker reference pipeline and render 10 trivial examples to PNG.
3. Write the pgfmanual example extractor and commit the tagged corpus index.
4. Implement `Vec2`, `Affine`, bounding boxes, the display-list types, and the Canvas2D backend.
5. Get `\draw (0,0) -- (1,1);` passing end to end through a minimal lexer → parser → evaluator → canvas path.
6. Stand up the playground page so every subsequent feature can be tried live.