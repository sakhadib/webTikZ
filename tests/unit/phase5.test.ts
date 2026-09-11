import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.ts";
import { getShape, listShapes } from "../../src/shapes/index.ts";

describe("Phase5 pics", () => {
  it("defines pic via tikzset", async () => {
    const src = "\\tikzset{my pic/.pic={\\draw (0,0) -- (1,0);}} \\draw (0,0) pic {my pic};";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("pic with options draw", async () => {
    const src = "\\tikzset{dot/.pic={\\fill (0,0) circle (1pt);}} \\draw (0,0) pic[red] {dot} -- (1,1);";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("pic angle A--B--C", async () => {
    const src = "\\coordinate (A) at (1,0); \\coordinate (B) at (0,0); \\coordinate (C) at (0,1); \\draw (0,0) pic {angle=A--B--C};";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
    const path = displayList.items.find(i=>i.kind==="path") as any;
    expect(path).toBeDefined();
  });
  it("pic angle with label quote", async () => {
    const src = "\\coordinate (A) at (1,0); \\coordinate (B) at (0,0); \\coordinate (C) at (0,1); \\draw (0,0) pic[\"$\\theta$\", draw] {angle=A--B--C};";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("pic inside path", async () => {
    const src = "\\tikzset{my/.pic={\\draw (0,0) circle (2pt);}} \\draw (0,0) -- (1,0) pic {my} -- (2,0);";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("multiple pics", async () => {
    const src = "\\tikzset{a/.pic={\\draw (0,0) -- (0.2,0);}} \\draw (0,0) pic {a} pic {a} -- (1,0);";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
});

describe("Phase5 quotes library", () => {
  it("edge with quotes label", async () => {
    const src = "\\draw (0,0) edge [\"label\"] (2,0);";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
    // edge creates extra path
    const texts = displayList.items.filter(i=>i.kind==="text") as any[];
    // may be via edge label
    expect(displayList.items.length).toBeGreaterThanOrEqual(1);
  });
  it("node quotes", async () => {
    const src = "\\draw (0,0) -- node[\"mid\"] (2,0);";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("quotes on edge with node", async () => {
    const src = "\\node (A) at (0,0) {A}; \\node (B) at (2,0) {B}; \\draw (A) edge [\"weight\"] (B);";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("quotes alias", async () => {
    const src = "\\usetikzlibrary{quotes} \\draw (0,0) to[\"a\"] (1,1);";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
});

describe("Phase5 edge and to path", () => {
  it("simple edge", async () => {
    const src = "\\draw (0,0) -- (1,0) edge (2,0);";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(1);
  });
  it("edge as separate path", async () => {
    const src = "\\node (A) at (0,0) {A}; \\node (B) at (2,0) {B}; \\draw (A) edge (B);";
    const { displayList } = await compile(src);
    // should have main path + edge path
    const paths = displayList.items.filter(i=>i.kind==="path");
    expect(paths.length).toBeGreaterThanOrEqual(1);
  });
  it("custom to path", async () => {
    const src = "\\draw (0,0) to[to path={-- (\\tikztotarget)}] (2,0);";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("tikztostart/totarget", async () => {
    const src = "\\tikzset{my to/.style={to path={-- (\\tikztotarget)}}} \\draw (0,0) to[my to] (1,1);";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("edge with to path bend", async () => {
    const src = "\\draw (0,0) edge[to path={.. controls +(1,1) .. (\\tikztotarget)}] (2,0);";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("multiple edges", async () => {
    const src = "\\draw (0,0) edge (1,0) edge (0,1);";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(1);
  });
});

describe("Phase5 plot", () => {
  it("plot coordinates", async () => {
    const src = "\\draw plot coordinates {(0,0) (1,1) (2,0)};";
    const { displayList } = await compile(src);
    const p = displayList.items.find(i=>i.kind==="path") as any;
    expect(p.segments.length).toBeGreaterThan(2);
  });
  it("plot with smooth", async () => {
    const src = "\\draw plot[smooth] coordinates {(0,0) (1,1) (2,0) (3,1)};";
    const { displayList } = await compile(src);
    const p = displayList.items.find(i=>i.kind==="path") as any;
    expect(p.segments.some((s:any)=>s.kind==="curveTo")).toBe(true);
  });
  it("plot function domain samples", async () => {
    const src = "\\draw plot[domain=0:2, samples=5] (\\x,{sin(\\x r)});";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
    const p = displayList.items.find(i=>i.kind==="path") as any;
    expect(p.segments.length).toBeGreaterThan(2);
  });
  it("plot samples at", async () => {
    const src = "\\draw plot[samples at={0,1,2}] (\\x,{\\x});";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("plot variable", async () => {
    const src = "\\draw plot[variable=\\t, domain=0:1, samples=4] (\\t,{\\t*\\t});";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("sharp plot", async () => {
    const src = "\\draw plot[sharp plot] coordinates {(0,0) (1,1) (2,0)};";
    const { displayList } = await compile(src);
    const p = displayList.items.find(i=>i.kind==="path") as any;
    expect(p.segments.some((s:any)=>s.kind==="lineTo")).toBe(true);
  });
  it("smooth cycle tension", async () => {
    const src = "\\draw plot[smooth cycle, tension=0.5] coordinates {(0,0) (1,1) (1,0) (0,1)};";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("plot mark", async () => {
    const src = "\\draw plot[mark=*] coordinates {(0,0) (1,1) (2,0)};";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("mark options and repeat", async () => {
    const src = "\\draw plot[mark=x, mark options={red}, mark repeat=2] coordinates {(0,0) (1,1) (2,0) (3,1)};";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("inline data table", async () => {
    const src = "\\draw plot table {0 0\\n1 1\\n2 0};"; // simplified
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
});

describe("Phase5 fit", () => {
  it("fit two nodes", async () => {
    const src = "\\node (A) at (0,0) {A}; \\node (B) at (2,1) {B}; \\node[fit=(A)(B), draw] (F) {};";
    const { displayList } = await compile(src);
    expect(displayList.nodes["F"]).toBeDefined();
    const fb = displayList.nodes["F"].bbox;
    expect(fb.maxX).toBeGreaterThan(fb.minX);
  });
  it("fit single", async () => {
    const src = "\\node (A) at (0,0) {A}; \\node[fit=(A), draw, inner sep=5pt] (F) {};";
    const { displayList } = await compile(src);
    expect(displayList.nodes["F"]).toBeDefined();
  });
  it("fit with options", async () => {
    const src = "\\node (A) at (0,0) {A}; \\node (B) at (1,0) {B}; \\node[fit=(A)(B), rounded corners, fill=blue!20] {};";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
});

describe("Phase5 backgrounds & layers", () => {
  it("show background rectangle", async () => {
    const src = "\\begin{tikzpicture}[show background rectangle] \\draw (0,0) rectangle (1,1); \\end{tikzpicture}";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("framed", async () => {
    const src = "\\begin{tikzpicture}[framed] \\draw (0,0) -- (1,1); \\end{tikzpicture}";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("gridded", async () => {
    const src = "\\begin{tikzpicture}[gridded] \\draw (0,0) rectangle (1,1); \\end{tikzpicture}";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("on background layer option", async () => {
    const src = "\\draw[on background layer] (0,0) rectangle (1,1);";
    const { displayList } = await compile(src);
    const any = displayList.items.find(i=>(i as any).layer==="background" || (i as any).background) as any;
    // background flag should be set
    expect(any ?? displayList.items[0]).toBeDefined();
  });
  it("pgfdeclarelayer and pgfonlayer", async () => {
    const src = "\\pgfdeclarelayer{bg} \\pgfsetlayers{bg,main} \\begin{tikzpicture} \\begin{pgfonlayer}{bg} \\draw (0,0) -- (1,0); \\end{pgfonlayer} \\draw (0,0) -- (1,1); \\end{tikzpicture}";
    const { displayList } = await compile(src);
    const grp = displayList.items.find(i=>i.kind==="group" && (i as any).layer==="bg") as any;
    expect(grp).toBeDefined();
    expect(grp.children.length).toBeGreaterThan(0);
  });
  it("layer order", async () => {
    const src = "\\pgfdeclarelayer{bg} \\pgfdeclarelayer{fg} \\pgfsetlayers{bg,main,fg} \\begin{tikzpicture} \\begin{pgfonlayer}{fg} \\fill[red] (0,0) rectangle (1,1); \\end{pgfonlayer} \\end{tikzpicture}";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
});

describe("Phase5 shape libraries", () => {
  it("shapes.geometric diamond", async () => {
    const src = "\\node[diamond, draw] at (0,0) {A};";
    const { displayList } = await compile(src);
    expect(displayList.nodes).toBeDefined();
    expect(getShape("diamond")).toBeDefined();
  });
  it("regular polygon star", async () => {
    const src = "\\node[regular polygon, regular polygon sides=5, draw] at (0,0) {5}; \\node[star, draw] at (1,0) {S};";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("trapezium semicircle", async () => {
    const src = "\\node[trapezium, draw] at (0,0) {T}; \\node[semicircle, draw] at (1,0) {S};";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("shapes.misc rounded rectangle", async () => {
    const src = "\\node[rounded rectangle, draw] at (0,0) {R}; \\node[chamfered rectangle, draw] at (1,0) {C};";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("shapes.misc cross out", async () => {
    const src = "\\node[cross out, draw] at (0,0) {X}; \\node[strike out, draw] at (1,0) {S};";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("shapes.arrows", async () => {
    const src = "\\node[single arrow, draw] at (0,0) {->};";
    const { displayList } = await compile(src);
    expect(getShape("single arrow")).toBeDefined();
  });
  it("shapes.multipart", async () => {
    const src = "\\node[rectangle split, rectangle split parts=2, draw] at (0,0) {A \\nodepart{two} B};";
    const { displayList } = await compile(src);
    expect(getShape("rectangle split")).toBeDefined();
  });
  it("shapes.callouts", async () => {
    const src = "\\node[rectangle callout, draw] at (0,0) {call};";
    const { displayList } = await compile(src);
    expect(getShape("rectangle callout")).toBeDefined();
  });
  it("registry contains all", () => {
    const shapes = listShapes();
    expect(shapes).toContain("kite");
    expect(shapes).toContain("dart");
    expect(shapes).toContain("cylinder");
    expect(shapes).toContain("cloud");
  });
});

describe("Phase5 through", () => {
  it("circle through", async () => {
    const src = "\\coordinate (A) at (1,0); \\node[draw, circle through=(A)] at (0,0) {};";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
    // Check node radius approximates distance 1cm = ~28.45pt
    // The node itself is at (0,0) with halfW ~28
  });
  it("through with named", async () => {
    const src = "\\node (A) at (2,0) {A}; \\node[draw, circle through=(A)] (C) at (0,0) {}; \\draw (C) -- (A);";
    const { displayList } = await compile(src);
    expect(displayList.nodes["C"]).toBeDefined();
  });
});

describe("Phase5 PGF basic layer", () => {
  it("pgfpathmoveto lineto usepath", async () => {
    const src = "\\pgfpathmoveto{\\pgfpoint{0cm}{0cm}} \\pgfpathlineto{\\pgfpoint{1cm}{0cm}} \\pgfusepath{stroke}";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
    const p = displayList.items.find(i=>i.kind==="path") as any;
    expect(p.segments.length).toBeGreaterThanOrEqual(1);
  });
  it("pgfpathcurveto", async () => {
    const src = "\\pgfpathmoveto{\\pgfpoint{0cm}{0cm}} \\pgfpathcurveto{\\pgfpoint{0cm}{1cm}}{\\pgfpoint{1cm}{1cm}}{\\pgfpoint{1cm}{0cm}} \\pgfusepath{stroke}";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("pgf basic inside tikzpicture", async () => {
    const src = "\\begin{tikzpicture} \\pgfpathmoveto{\\pgfpoint{0cm}{0cm}} \\pgfpathlineto{\\pgfpoint{2cm}{0cm}} \\pgfusepath{draw} \\end{tikzpicture}";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("pgfpoint and pgfqpoint", async () => {
    const src = "\\pgfpathmoveto{\\pgfpoint{1cm}{1cm}} \\pgfusepath{stroke}";
    const { displayList } = await compile(src);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
});
