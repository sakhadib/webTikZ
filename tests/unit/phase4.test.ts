import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.ts";
import { cubicLength, pointAtT } from "../../src/geometry/bezier.ts";
import { Vec2 } from "../../src/geometry/vec2.ts";
import { totalLength, pointAtFraction } from "../../src/geometry/path.ts";
import { getArrowTip } from "../../src/arrows/index.ts";
import { intersectSegments } from "../../src/geometry/intersections.ts";

describe("Phase4 geometry", () => {
  it("arcLength cubic", () => {
    const c = { p0: new Vec2(0,0), p1: new Vec2(1,0), p2: new Vec2(1,1), p3: new Vec2(0,1) };
    const len = cubicLength(c);
    expect(len).toBeGreaterThan(1);
  });
  it("pointAtT", () => {
    const c = { p0: new Vec2(0,0), p1: new Vec2(0,0), p2: new Vec2(10,0), p3: new Vec2(10,0) };
    const p = pointAtT(c, 0.5);
    expect(p.x).toBeGreaterThan(0);
  });
  it("path length", () => {
    const segs = [{kind:"moveTo",to:new Vec2(0,0)}, {kind:"lineTo",to:new Vec2(10,0)}] as any;
    expect(totalLength(segs)).toBeCloseTo(10,1);
  });
  it("pointAtFraction", () => {
    const segs = [{kind:"moveTo",to:new Vec2(0,0)}, {kind:"lineTo",to:new Vec2(10,0)}] as any;
    const r=pointAtFraction(segs,0.5);
    expect(r.point.x).toBeCloseTo(5,0.5);
    expect(r.tangent.x).toBeCloseTo(1,0.5);
  });
});

describe("Phase4 calc library", () => {
  it("calc addition", async () => {
    const { displayList } = await compile("\\coordinate (A) at (0,0); \\draw ($(A)+(1,1)$) -- (2,2);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("calc interpolation", async () => {
    const { displayList } = await compile("\\coordinate (A) at (0,0); \\coordinate (B) at (2,0); \\draw ($(A)!.5!(B)$) -- (0,1);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("calc distance", async () => {
    const { displayList } = await compile("\\coordinate (A) at (0,0); \\coordinate (B) at (2,0); \\draw ($(A)!1cm!(B)$) -- (0,1);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("calc projection", async () => {
    const { displayList } = await compile("\\coordinate (A) at (0,0); \\coordinate (B) at (2,0); \\coordinate (C) at (1,1); \\draw ($(A)!(C)!(B)$) -- (0,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("calc rotation modifier", async () => {
    const { displayList } = await compile("\\coordinate (A) at (0,0); \\coordinate (B) at (1,0); \\draw ($(A)!.5!30:(B)$) -- (2,2);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("calc scalar multiplication", async () => {
    const { displayList } = await compile("\\coordinate (A) at (1,0); \\draw ($(2*(A))$) -- (2,2);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("calc let p", async () => {
    const { displayList } = await compile("\\coordinate (A) at (1,1); \\draw let \\p1=(A) in (0,0) -- (\\x1,\\y1);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("calc let n", async () => {
    const { displayList } = await compile("\\draw let \\p1=(1,0), \\n1={2} in (0,0) -- (\\n1,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
});

describe("Phase4 perpendicular", () => {
  it("A |- B", async () => {
    const { displayList } = await compile("\\coordinate (A) at (0,0); \\coordinate (B) at (1,2); \\draw (A |- B) -- (0,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("A -| B", async () => {
    const { displayList } = await compile("\\coordinate (A) at (0,0); \\coordinate (B) at (1,2); \\draw (A -| B) -- (0,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
});

describe("Phase4 intersections", () => {
  it("line line intersection", async () => {
    const src="\\path[name path=A] (0,0) -- (2,2); \\path[name path=B] (0,2) -- (2,0); \\path[name intersections={of=A and B, by={X}}]; \\draw (X) circle (1pt);";
    const { displayList } = await compile(src);
    expect(displayList.nodes["X"]).toBeDefined();
    expect(displayList.nodes["X"].center.x).toBeCloseTo(28.45, 0);
  });
  it("by two points", async () => {
    const src="\\path[name path=A] (0,0) -- (2,0); \\path[name path=B] (0,1) -- (2,1); \\path[name intersections={of=A and B, by={P,Q}}];";
    const { displayList } = await compile(src);
    // parallel -> no intersection, still no error
    expect(displayList.items).toBeDefined();
  });
  it("total", async () => {
    const src="\\path[name path=A] (0,0) -- (2,2); \\path[name path=B] (0,2) -- (2,0); \\path[name intersections={of=A and B, total=\\t}];";
    const { displayList } = await compile(src);
    expect(displayList.items).toBeDefined();
  });
  it("sort by", async () => {
    const src="\\path[name path=A] (0,0) -- (3,0); \\path[name path=B] (1,-1) -- (1,1); \\path[name intersections={of=A and B, by={I}, sort by=I}];";
    const { displayList } = await compile(src);
    expect(displayList.nodes["I"]).toBeDefined();
  });
  it("bezier intersection helper", () => {
    const a = [{kind:"moveTo",to:new Vec2(0,0)},{kind:"lineTo",to:new Vec2(10,10)}] as any;
    const b = [{kind:"moveTo",to:new Vec2(0,10)},{kind:"lineTo",to:new Vec2(10,0)}] as any;
    const pts=intersectSegments(a,b);
    expect(pts.length).toBe(1);
    expect(pts[0].x).toBeCloseTo(5,0.5);
  });
});

describe("Phase4 arrows.meta", () => {
  it("registry has Stealth", () => { expect(getArrowTip("Stealth")).toBeDefined(); });
  it("registry has Latex", () => { expect(getArrowTip("Latex")).toBeDefined(); });
  it("registry has Circle", () => { expect(getArrowTip("Circle")).toBeDefined(); });
  it("registry has Kite", () => { expect(getArrowTip("Kite")).toBeDefined(); });
  it("single tip", async () => {
    const { displayList } = await compile("\\draw[-Stealth] (0,0) -- (1,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
    const path=displayList.items.find(i=>i.kind==="path") as any;
    expect(path).toBeDefined();
  });
  it("multiple tips >>", async () => {
    const { displayList } = await compile("\\draw[->>] (0,0) -- (1,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("|<->|", async () => {
    const { displayList } = await compile("\\draw[|<->|] (0,0) -- (1,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("shorten <", async () => {
    const { displayList } = await compile("\\draw[shorten <=2pt] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("shorten >", async () => {
    const { displayList } = await compile("\\draw[shorten >=2pt] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("open, round, scale", async () => {
    const { displayList } = await compile("\\draw[-{Stealth[open, round, scale=1.5]}] (0,0) -- (1,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("legacy latex", async () => {
    const { displayList } = await compile("\\draw[-latex] (0,0) -- (1,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
});

describe("Phase4 shading", () => {
  it("left right color", async () => {
    const { displayList } = await compile("\\shade[left color=red, right color=blue] (0,0) rectangle (1,1);");
    const p=displayList.items.find(i=>i.kind==="path") as any;
    expect(p.gradient).toBeDefined();
    expect(p.gradient.kind).toBe("linear");
  });
  it("inner outer color", async () => {
    const { displayList } = await compile("\\shade[inner color=red, outer color=blue] (0,0) circle (0.5cm);");
    const p=displayList.items.find(i=>i.kind==="path") as any;
    expect(p.gradient).toBeDefined();
    expect(p.gradient.kind).toBe("radial");
  });
  it("ball color", async () => {
    const { displayList } = await compile("\\shade[ball color=red] (0,0) circle (0.5cm);");
    const p=displayList.items.find(i=>i.kind==="path") as any;
    expect(p.gradient).toBeDefined();
  });
  it("shading angle", async () => {
    const { displayList } = await compile("\\shade[left color=red, right color=blue, shading angle=45] (0,0) rectangle (1,1);");
    const p=displayList.items.find(i=>i.kind==="path") as any;
    expect(p.gradient.angleDeg).toBe(45);
  });
  it("\\shadedraw", async () => {
    const { displayList } = await compile("\\shadedraw[left color=red, right color=blue] (0,0) rectangle (1,1);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
});

describe("Phase4 patterns", () => {
  it("north east lines", async () => {
    const { displayList } = await compile("\\fill[pattern=north east lines] (0,0) rectangle (1,1);");
    const p=displayList.items.find(i=>i.kind==="path") as any;
    expect(p.pattern).toBeDefined();
  });
  it("crosshatch", async () => {
    const { displayList } = await compile("\\fill[pattern=crosshatch] (0,0) rectangle (1,1);");
    expect((displayList.items[0] as any).pattern).toBeDefined();
  });
  it("dots", async () => {
    const { displayList } = await compile("\\fill[pattern=dots] (0,0) rectangle (1,1);");
    expect((displayList.items[0] as any).pattern).toBeDefined();
  });
  it("bricks", async () => {
    const { displayList } = await compile("\\fill[pattern=bricks] (0,0) rectangle (1,1);");
    expect((displayList.items[0] as any).pattern).toBeDefined();
  });
  it("checkerboard", async () => {
    const { displayList } = await compile("\\fill[pattern=checkerboard] (0,0) rectangle (1,1);");
    expect((displayList.items[0] as any).pattern).toBeDefined();
  });
  it("pattern color", async () => {
    const { displayList } = await compile("\\fill[pattern=north east lines, pattern color=red] (0,0) rectangle (1,1);");
    expect((displayList.items[0] as any).pattern.color).toBeDefined();
  });
});

describe("Phase4 bbox control", () => {
  it("use as bounding box", async () => {
    const { displayList } = await compile("\\draw[use as bounding box] (0,0) rectangle (1,1); \\draw (5,5) -- (6,6);");
    const anyP=displayList.items.find(i=> (i as any).useAsBoundingBox) as any;
    expect(anyP).toBeDefined();
  });
  it("overlay", async () => {
    const { displayList } = await compile("\\draw (0,0) rectangle (1,1); \\draw[overlay] (5,5) rectangle (6,6);");
    const ov=displayList.items.find(i=> (i as any).overlay) as any;
    expect(ov).toBeDefined();
  });
  it("trim left/right", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}[trim left=0pt, trim right=28pt] \\draw (0,0) rectangle (2,1); \\end{tikzpicture}");
    expect((displayList as any).trimLeft).toBeDefined();
  });
  it("current bounding box", async () => {
    const { displayList } = await compile("\\draw (0,0) rectangle (1,1); \\draw (current bounding box.center) -- (0,0);");
    expect(displayList.nodes["current bounding box.center"]).toBeDefined();
  });
  it("baseline", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}[baseline=0pt] \\draw (0,0) -- (1,0); \\end{tikzpicture}");
    expect((displayList as any).baseline).toBeDefined();
  });
});
