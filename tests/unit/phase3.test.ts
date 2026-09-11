import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.ts";

const examples: { name: string; src: string }[] = [];
function add(name: string, src: string) { examples.push({ name, src }); }

// Node core
add("node-01 simple", "\\node (a) at (0,0) {Hello};");
add("node-02 circle draw", "\\node[circle,draw] (b) at (1,1) {X};");
add("node-03 rectangle fill", "\\node[draw,fill=blue!20, rectangle] (c) at (0,0) {Box};");
add("node-04 ellipse draw", "\\node[ellipse,draw] at (0,0) {Ell};");
add("node-05 coordinate shape", "\\node[coordinate] (p) at (1,1) {};");
add("node-06 minimum size", "\\node[draw, minimum width=2cm, minimum height=1cm] (m) at (0,0) {big};");
add("node-07 inner outer sep", "\\node[draw, inner sep=5pt, outer sep=2pt] at (0,0) {sep};");
add("node-08 text width align", "\\node[text width=2cm, align=center] at (0,0) {This is a long text that should wrap into multiple lines};");
add("node-09 multiline \\\\", "\\node[draw] at (0,0) {line1 \\\\ line2};");
add("node-10 font tiny bfseries", "\\node[font=\\tiny] at (0,0) {tiny}; \\node[font=\\bfseries] at (1,0) {bold};");
add("node-11 font itshape sffamily", "\\node[font=\\itshape] at (0,0) {it}; \\node[font=\\sffamily] at (1,0) {sf};");
add("node-12 rotate no transform", "\\node[draw, rotate=30] at (0,0) {rot};");
add("node-13 rotate transform shape", "\\node[draw, rotate=30, transform shape] at (0,0) {rot2};");

// Anchors
add("anchor-01 compass", "\\node[draw] (a) at (0,0) {A}; \\draw (a.north) -- (1,1); \\draw (a.south) -- (1,-1);");
add("anchor-02 east west", "\\node[draw] (a) at (0,0) {A}; \\draw (a.east) -- (2,0);");
add("anchor-03 angle 30", "\\node[circle,draw] (a) at (0,0) {A}; \\draw (a.30) -- (2,1);");
add("anchor-04 anchor placement", "\\node[draw, anchor=north west] at (1,1) {NW};");
add("anchor-05 above below", "\\node[draw, above] at (0,0) {above}; \\node[draw, below] at (1,0) {below};");
add("anchor-06 left right", "\\node[draw, left] at (0,0) {L}; \\node[draw, right] at (1,0) {R};");

// Nodes on paths
add("pathnode-01 midway", "\\draw (0,0) -- (2,0) node[midway, above] {mid};");
add("pathnode-02 pos", "\\draw (0,0) -- (2,0) node[pos=0.25] {q};");
add("pathnode-03 near start/end", "\\draw (0,0) -- (2,0) node[near start] {ns} node[near end] {ne};");
add("pathnode-04 very near", "\\draw (0,0) -- (2,0) node[very near start] {vns} node[very near end] {vne};");
add("pathnode-05 at start/end", "\\draw (0,0) -- (2,0) node[at start] {as} node[at end] {ae};");
add("pathnode-06 sloped auto swap", "\\draw (0,0) -- (2,1) node[sloped, above] {s} node[auto] {a} node[swap] {sw};");
add("pathnode-07 with name", "\\draw (0,0) -- node (m) {mid} (2,0);");

// Shape-aware connections
add("connect-01 circle circle", "\\node[circle,draw,minimum size=1cm] (A) at (0,0) {A}; \\node[circle,draw,minimum size=1cm] (B) at (3,0) {B}; \\draw (A) -- (B);");
add("connect-02 rect rect", "\\node[draw] (A) at (0,0) {A}; \\node[draw] (B) at (2,0) {B}; \\draw (A) -- (B);");
add("connect-03 explicit anchor bypass", "\\node[draw] (A) at (0,0) {A}; \\node[draw] (B) at (2,0) {B}; \\draw (A.center) -- (B.center);");
add("connect-04 ellipse", "\\node[ellipse,draw,minimum width=2cm, minimum height=1cm] (A) at (0,0) {A}; \\node[ellipse,draw,minimum width=2cm, minimum height=1cm] (B) at (3,0) {B}; \\draw (A) -- (B);");

// label/pin
add("label-01 simple", "\\node[label=above:Label] (a) at (0,0) {A};");
add("label-02 with angle", "\\node[label=30:Text] (a) at (0,0) {A};");
add("label-03 with options", "\\node[label={[red]above:Red}] (a) at (0,0) {A};");
add("pin-01 simple", "\\node[pin=90:Pin] (a) at (0,0) {A};");
add("pin-02 with angle", "\\node[pin=45:Up] (a) at (0,0) {A};");

// positioning library
add("pos-01 right of", "\\node (a) at (0,0) {A}; \\node[right=of a] (b) {B};");
add("pos-02 below of", "\\node (a) at (0,0) {A}; \\node[below=of a] (b) {B};");
add("pos-03 distance", "\\node (a) at (0,0) {A}; \\node[right=2cm of a] (b) {B};");
add("pos-04 anchor target", "\\node (a) at (0,0) {A}; \\node[below=1cm of a.east] (b) {B};");
add("pos-05 on grid", "\\node (a) at (0,0) {A}; \\node[right=of a, on grid] (b) {B};");
add("pos-06 node distance", "\\begin{tikzpicture}[node distance=2cm] \\node (a) at (0,0) {A}; \\node[right=of a] (b) {B}; \\end{tikzpicture}");

// TextEngine / math
add("text-01 plain", "\\node at (0,0) {Hello world};");
add("text-02 math simple", "\\node at (0,0) {$x_1$};");
add("text-03 math frac", "\\node at (0,0) {$\\frac{1}{2}$};");
add("text-04 math greek", "\\node at (0,0) {$\\alpha + \\beta = \\gamma$};");
add("text-05 math sqrt", "\\node at (0,0) {$\\sqrt{2}$};");

// Draw order & groups
add("order-01 path then node", "\\draw (0,0) -- (2,0) node[pos=0.5, draw, fill=white] {label};");
add("order-02 background text", "\\node[draw, fill=yellow] at (0,0) {Box};");

describe("Phase 3 — Nodes & text suite", () => {
  for (const ex of examples) {
    it(ex.name, async () => {
      const { displayList, errors } = await compile(ex.src);
      const hard = errors.filter(e => e.severity === "error");
      expect(hard.length, `${ex.name} errors: ${hard.map(e=>e.message).join(", ")}`).toBe(0);
      // coordinate shape has zero draw items but valid bbox via node
      if (ex.name.includes("coordinate shape")) {
        expect(Object.keys(displayList.nodes).length).toBeGreaterThan(0);
      } else {
        expect(displayList.items.length).toBeGreaterThan(0);
      }
      expect(displayList.bbox.isEmpty, `${ex.name} bbox empty`).toBe(false);
    });
  }
});

describe("Phase 3 — specific checks", () => {
  it("shape-aware shortens line", async () => {
    const { displayList } = await compile("\\node[circle,draw,minimum size=1cm] (A) at (0,0) {A}; \\node[circle,draw,minimum size=1cm] (B) at (2,0) {B}; \\draw (A) -- (B);");
    const paths = displayList.items.filter(i=>i.kind==="path") as any[];
    const line = paths.find(p=>p.segments.some((s:any)=>s.kind==="lineTo"));
    expect(line).toBeDefined();
    const seg = line.segments.find((s:any)=>s.kind==="moveTo");
    // moveTo should be at border ~14pt, not 0
    expect(seg.to.x).toBeGreaterThan(5);
    expect(seg.to.x).toBeLessThan(20);
  });
  it("positioning right=2cm", async () => {
    const { displayList } = await compile("\\node (a) at (0,0) {A}; \\node[right=2cm of a] (b) {B};");
    const b = displayList.nodes["b"];
    expect(b).toBeDefined();
    // distance from a center to b center should be approx 2cm + half widths (~0.5cm)
    expect(b.center.x).toBeGreaterThan(50); // 2cm =56.9pt
  });
  it("text width creates wrapping bbox", async () => {
    const { displayList } = await compile("\\node[text width=1cm, draw] at (0,0) {This is long};");
    expect(displayList.bbox.width).toBeGreaterThan(20);
  });
  it("node on path at pos", async () => {
    const { displayList } = await compile("\\draw (0,0) -- (2,0) node[pos=0.25] {q};");
    expect(displayList.items.length).toBeGreaterThan(1);
  });
  it("anchor placement", async () => {
    const { displayList } = await compile("\\node[draw, anchor=north west] at (1,1) {X};");
    const n = displayList.nodes[Object.keys(displayList.nodes)[0]];
    expect(n).toBeDefined();
    // north west anchor at (1,1) means center offset
    expect(n.center.x).toBeGreaterThan(20);
  });
});
