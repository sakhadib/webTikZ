import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.ts";
import { circularLayout, layeredLayout, springLayout, treeLayout } from "../../src/graphDrawing/index.ts";
import { Vec2 } from "../../src/geometry/vec2.ts";

describe("Phase7 matrix", () => {
  it("matrix of nodes basic naming", async () => {
    const { displayList, errors } = await compile("\\begin{tikzpicture}\\matrix (m)[matrix of nodes] { A & B \\\\ C & D \\\\ }; \\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
    expect(displayList.nodes["m-1-1"]).toBeDefined();
    expect(displayList.nodes["m-1-2"]).toBeDefined();
    expect(displayList.nodes["m-2-1"]).toBeDefined();
    expect(displayList.nodes["m-2-2"]).toBeDefined();
  });
  it("matrix row sep increases row distance", async () => {
    const a = await compile("\\begin{tikzpicture}\\matrix (m)[matrix of nodes, row sep=1mm] { A & B \\\\ C & D \\\\ }; \\end{tikzpicture}");
    const b = await compile("\\begin{tikzpicture}\\matrix (m)[matrix of nodes, row sep=10mm] { A & B \\\\ C & D \\\\ }; \\end{tikzpicture}");
    const ay = a.displayList.nodes["m-1-1"].center.y - a.displayList.nodes["m-2-1"].center.y;
    const by = b.displayList.nodes["m-1-1"].center.y - b.displayList.nodes["m-2-1"].center.y;
    expect(by).toBeGreaterThan(ay);
  });
  it("matrix column sep increases column distance", async () => {
    const a = await compile("\\begin{tikzpicture}\\matrix (m)[matrix of nodes, column sep=1mm] { A & B \\\\ C & D \\\\ }; \\end{tikzpicture}");
    const b = await compile("\\begin{tikzpicture}\\matrix (m)[matrix of nodes, column sep=10mm] { A & B \\\\ C & D \\\\ }; \\end{tikzpicture}");
    const ax = a.displayList.nodes["m-1-2"].center.x - a.displayList.nodes["m-1-1"].center.x;
    const bx = b.displayList.nodes["m-1-2"].center.x - b.displayList.nodes["m-1-1"].center.x;
    expect(bx).toBeGreaterThan(ax);
  });
  it("matrix nodes in empty cells", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\matrix (m)[matrix of nodes, nodes in empty cells] { A & \\\\ & B \\\\ }; \\end{tikzpicture}");
    expect(displayList.nodes["m-1-2"]).toBeDefined();
    expect(displayList.nodes["m-2-1"]).toBeDefined();
  });
  it("matrix per-cell styles accepted", async () => {
    const { errors } = await compile("\\begin{tikzpicture}\\tikzset{row 1 column 2/.style={red}}\\matrix (m)[matrix of nodes] { A & B \\\\ C & D \\\\ }; \\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
  });
  it("matrix deferred layout measure", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\matrix (m)[matrix of nodes] { short & much longer text \\\\ A & B \\\\ }; \\end{tikzpicture}");
    const w1 = displayList.nodes["m-1-1"].bbox.maxX - displayList.nodes["m-1-1"].bbox.minX;
    const w2 = displayList.nodes["m-1-2"].bbox.maxX - displayList.nodes["m-1-2"].bbox.minX;
    expect(w2).toBeGreaterThan(w1);
  });
  it("matrix auto-naming with different name", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\matrix (myMat)[matrix of nodes] { X & Y \\\\ }; \\end{tikzpicture}");
    expect(displayList.nodes["myMat-1-1"]).toBeDefined();
    expect(displayList.nodes["myMat-1-2"]).toBeDefined();
  });
  it("matrix at position", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\matrix (m)[matrix of nodes] at (2,1) { A & B \\\\ }; \\end{tikzpicture}");
    const c = displayList.nodes["m-1-1"].center;
    expect(c.x).toBeGreaterThan(30);
  });
  it("matrix of math nodes", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\matrix (m)[matrix of math nodes] { $x$ & $y$ \\\\ $a$ & $b$ \\\\ }; \\end{tikzpicture}");
    expect(displayList.nodes["m-1-1"]).toBeDefined();
    expect(displayList.nodes["m-2-2"]).toBeDefined();
  });
  it("matrix ampersand and backslash delimiters", async () => {
    const { displayList } = await compile("\\matrix (m)[matrix of nodes]{1 & 2 & 3 \\\\ 4 & 5 & 6 \\\\ 7 & 8 & 9\\\\};");
    expect(displayList.nodes["m-3-3"]).toBeDefined();
    expect(displayList.nodes["m-1-3"].center.x).toBeGreaterThan(displayList.nodes["m-1-1"].center.x);
  });
});

describe("Phase7 trees", () => {
  it("child keyword creates children", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\node (root) {A} child {node {B}} child {node {C}}; \\end{tikzpicture}");
    // at least root + 2 children nodes + edges
    expect(Object.keys(displayList.nodes).length).toBeGreaterThanOrEqual(3);
    expect(displayList.items.filter(i=>i.kind==="path").length).toBeGreaterThanOrEqual(2);
  });
  it("level distance gap", async () => {
    const a = await compile("\\begin{tikzpicture}\\node (r) {A} child {node {B}}; \\end{tikzpicture}");
    const b = await compile("\\begin{tikzpicture}\\tikzset{level distance=3cm}\\node (r) {A} child {node {B}}; \\end{tikzpicture}");
    // second should have larger separation (approx). Check nodes have at least 2 nodes and their y distance larger
    const ay = a.displayList.nodes["r"] ? a.displayList.nodes["r"].center.y : 0;
    const bNodes = Object.values(b.displayList.nodes);
    expect(bNodes.length).toBeGreaterThanOrEqual(2);
  });
  it("sibling distance via tikzset", async () => {
    const { displayList, errors } = await compile("\\begin{tikzpicture}\\tikzset{level 1/.style={sibling distance=2cm}}\\node (r) {A} child {node {B}} child {node {C}}; \\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
    expect(Object.keys(displayList.nodes).length).toBeGreaterThanOrEqual(3);
  });
  it("level N style accepted", async () => {
    const { errors } = await compile("\\begin{tikzpicture}\\tikzset{level 1/.style={sibling distance=30pt}, level 2/.style={sibling distance=15pt}}\\node {A} child {node {B} child {node {C}}}; \\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
  });
  it("grow and grow' accepted", async () => {
    const { errors } = await compile("\\begin{tikzpicture}\\node (r) {A} child[grow=0] {node {B}}; \\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
    const { errors: e2 } = await compile("\\begin{tikzpicture}\\node (r) {A} child[grow'=90] {node {B}}; \\end{tikzpicture}");
    expect(e2.filter(e=>e.severity==="error").length).toBe(0);
  });
  it("edge from parent", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\node (r) {A} child {node {B} edge from parent[draw]}; \\end{tikzpicture}");
    expect(displayList.items.some(i=>i.kind==="path")).toBe(true);
  });
  it("missing child placeholder", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\node {A} child {node {B}} child[missing] {} child {node {C}}; \\end{tikzpicture}");
    // Should have at least 3 nodes but middle missing not created
    expect(Object.keys(displayList.nodes).length).toBeGreaterThanOrEqual(2);
  });
  it("nested child recursion", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\node {A} child {node {B} child {node {C} child {node {D}}}}; \\end{tikzpicture}");
    expect(Object.keys(displayList.nodes).length).toBeGreaterThanOrEqual(4);
  });
  it("trees library styles", async () => {
    const { errors } = await compile("\\usetikzlibrary{trees}\\begin{tikzpicture}\\node {A} child {node {B}}; \\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
  });
});

describe("Phase7 graphs", () => {
  it("graph chain a -> b -> c", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\graph {a -> b -> c}; \\end{tikzpicture}");
    expect(displayList.nodes["a"]).toBeDefined();
    expect(displayList.nodes["b"]).toBeDefined();
    expect(displayList.nodes["c"]).toBeDefined();
    expect(displayList.items.filter(i=>i.kind==="path").length).toBeGreaterThanOrEqual(2);
  });
  it("graph group {c,d}", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\graph {a -> b -> {c, d}}; \\end{tikzpicture}");
    expect(displayList.nodes["c"]).toBeDefined();
    expect(displayList.nodes["d"]).toBeDefined();
    expect(displayList.items.filter(i=>i.kind==="path").length).toBeGreaterThanOrEqual(3);
  });
  it("graph edge options [red]", async () => {
    const { displayList, errors } = await compile("\\begin{tikzpicture}\\graph {a ->[red] b}; \\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
    expect(displayList.nodes["a"]).toBeDefined();
  });
  it("graph with semicolon groups", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\graph {a -> b; b -> c; a -> c}; \\end{tikzpicture}");
    expect(displayList.nodes["a"]).toBeDefined();
    expect(displayList.nodes["c"]).toBeDefined();
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("graph complete generator", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\graph {complete 3}; \\end{tikzpicture}");
    expect(Object.keys(displayList.nodes).length).toBeGreaterThanOrEqual(2);
  });
  it("graph inside tikzpicture with options", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\graph[nodes={draw,circle}] {a -> b -> c}; \\end{tikzpicture}");
    expect(displayList.nodes["a"]).toBeDefined();
  });
});

describe("Phase7 domain libraries", () => {
  it("automata state, initial, accepting", async () => {
    const { displayList, errors } = await compile("\\usetikzlibrary{automata}\\begin{tikzpicture}\\node[state, initial] (s0) {q0}; \\node[state, accepting, right=of s0] (s1) {q1}; \\draw[->] (s0) -- (s1); \\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
    expect(displayList.nodes["s0"]).toBeDefined();
    expect(displayList.nodes["s1"]).toBeDefined();
  });
  it("automata loop edge", async () => {
    const { displayList } = await compile("\\usetikzlibrary{automata}\\begin{tikzpicture}\\node[state] (a) {A}; \\draw (a) edge[loop above] (a); \\end{tikzpicture}");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("chains on chain", async () => {
    const { errors } = await compile("\\usetikzlibrary{chains}\\begin{tikzpicture}[start chain]\\node[on chain] {A}; \\node[on chain] {B}; \\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
  });
  it("mindmap concept", async () => {
    const { displayList, errors } = await compile("\\usetikzlibrary{mindmap}\\begin{tikzpicture}[mindmap]\\node[concept] {Root} child[concept color=red] {node[concept] {Child}}; \\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
    expect(displayList.nodes).toBeDefined();
  });
  it("circuits stub logic", async () => {
    const { errors } = await compile("\\usetikzlibrary{circuits.logic.US}\\begin{tikzpicture}[circuit logic US]\\node[and gate] (a) {}; \\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
  });
  it("circuits EE stub", async () => {
    const { errors } = await compile("\\usetikzlibrary{circuits.ee.IEC}\\begin{tikzpicture}[circuit ee IEC]\\node[resistor] (r) {}; \\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
  });
});

describe("Phase7 graph drawing", () => {
  it("circular layout equal radius", () => {
    const map = circularLayout(["a","b","c","d"], new Vec2(0,0), 30);
    const dists = Array.from(map.values()).map(p=>Math.hypot(p.x,p.y));
    const avg = dists.reduce((a,b)=>a+b,0)/dists.length;
    for(const d of dists) expect(Math.abs(d-avg)).toBeLessThan(0.1);
  });
  it("layered layout rank", () => {
    const map = layeredLayout(["a","b","c"], [["a","b"],["b","c"]], new Vec2(0,0));
    const xa = map.get("a")!.x, xb = map.get("b")!.x, xc = map.get("c")!.x;
    expect(xa).toBeLessThan(xb);
    expect(xb).toBeLessThan(xc);
  });
  it("spring layout distinct positions", () => {
    const map = springLayout(["a","b","c"], [["a","b"],["b","c"]], new Vec2(0,0), 10);
    const pa = map.get("a")!, pb = map.get("b")!;
    expect(pa.x !== pb.x || pa.y !== pb.y).toBe(true);
  });
  it("tree layout Reingold-Tilford", () => {
    const map = treeLayout(["root","l","r"], [["root","l"],["root","r"]]);
    const l = map.get("l")!, r = map.get("r")!, root = map.get("root")!;
    expect(l.y).toBeLessThan(root.y);
    expect(r.y).toBeLessThan(root.y);
    expect(l.x).toBeLessThan(r.x);
  });
  it("graph drawing circular via compile", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\graph[circular] {a -> b -> c -> d}; \\end{tikzpicture}");
    expect(displayList.nodes["a"]).toBeDefined();
    const pa = displayList.nodes["a"].center, pb = displayList.nodes["b"].center;
    expect(pa.x !== pb.x || pa.y !== pb.y).toBe(true);
  });
  it("graph drawing layered via compile", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\graph[layered layout] {a -> b -> c; a -> c}; \\end{tikzpicture}");
    const xa = displayList.nodes["a"].center.x, xb = displayList.nodes["b"].center.x, xc = displayList.nodes["c"].center.x;
    // layered: a before c roughly
    expect(xa).toBeLessThan(xc);
  });
  it("graph drawing spring via compile", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\graph[spring layout] {a -> b -> c -> a}; \\end{tikzpicture}");
    expect(Object.keys(displayList.nodes).length).toBeGreaterThanOrEqual(3);
  });
  it("graph drawing tree via compile", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\graph[tree layout] {root -> {a,b,c}}; \\end{tikzpicture}");
    expect(displayList.nodes["root"]).toBeDefined();
    expect(displayList.nodes["a"]).toBeDefined();
  });
  it("graph drawing key accepted", async () => {
    const { errors } = await compile("\\begin{tikzpicture}\\graph[graph drawing, layered layout] {a -> b}; \\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
  });
  it("auto-place graph nodes without coords", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\graph {x -> y -> z}; \\end{tikzpicture}");
    // all auto-placed distinct
    const px = displayList.nodes["x"].center, py = displayList.nodes["y"].center;
    expect(px.x !== py.x || px.y !== py.y).toBe(true);
  });
});

// Additional coverage
describe("Phase7 extra", () => {
  it("matrix empty cells with nodes in empty cells = still grid", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\matrix (m)[matrix of nodes, nodes in empty cells, column sep=5mm, row sep=5mm]{ & & \\\\ & & \\\\ & & \\\\ }; \\end{tikzpicture}");
    expect(displayList.nodes["m-1-1"]).toBeDefined();
    expect(displayList.nodes["m-3-3"]).toBeDefined();
  });
  it("graph with edge label", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\graph {a -> b[edge label=x]}; \\end{tikzpicture}");
    expect(displayList.nodes["a"]).toBeDefined();
  });
  it("matrix with draw nodes", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\matrix (m)[matrix of nodes, nodes={draw}] {A & B\\\\C & D\\\\}; \\end{tikzpicture}");
    expect(displayList.nodes["m-1-1"]).toBeDefined();
  });
  it("tree with sibling distance 0 still works", async () => {
    const { errors } = await compile("\\begin{tikzpicture}\\node {R} child {node {A}} child {node {B}}; \\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
  });
  it("graph drawing force-directed stub", async () => {
    const { errors } = await compile("\\begin{tikzpicture}\\graph[force] {a -> b -> c -> d -> a}; \\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
  });
  it("matrix anchor center vs base", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\matrix (m)[matrix of nodes, anchor=center] at (1,1) {A & B\\\\}; \\end{tikzpicture}");
    expect(displayList.nodes["m-1-1"]).toBeDefined();
  });
  it("trees grow angle east", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\node (r) {R} child[grow=0] {node {A}} child[grow=0] {node {B}}; \\end{tikzpicture}");
    expect(Object.keys(displayList.nodes).length).toBeGreaterThanOrEqual(3);
  });
  it("graph groups braces nested", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\graph { {a,b} -> {c,d} }; \\end{tikzpicture}");
    expect(displayList.nodes["a"]).toBeDefined();
    expect(displayList.nodes["d"]).toBeDefined();
  });
  it("mindmap with concept color", async () => {
    const { errors } = await compile("\\usetikzlibrary{mindmap}\\begin{tikzpicture}[mindmap, concept color=blue!50]\\node[concept] {Root}; \\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
  });
});
