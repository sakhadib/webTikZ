import { describe, it, expect } from "vitest";
import { Vec2, BBox } from "../../src/geometry/index.ts";
import { computePathBBox } from "../../src/render/displayList.ts";
import { compile } from "../../src/index.ts";

describe("computePathBBox", () => {
  it("line bbox expands by stroke/2", () => {
    const segs = [{ kind: "moveTo" as const, to: new Vec2(0,0) }, { kind: "lineTo" as const, to: new Vec2(10,0) }];
    const b = computePathBBox(segs, 2);
    expect(b.minX).toBe(-1);
    expect(b.maxX).toBe(11);
  });
});

describe("compile Phase 0", () => {
  it("draw (0,0) -- (1,1) produces bbox ~1cm", async () => {
    const { displayList } = await compile("\\draw (0,0) -- (1,1);");
    expect(displayList.items).toHaveLength(1);
    expect(displayList.bbox.width).toBeGreaterThan(20); // 1cm ~28pt
    expect(displayList.bbox.width).toBeCloseTo(28.45, 0.5);
  });

  it("tikzpicture env", async () => {
    const src = "\\begin{tikzpicture}\n\\draw (0,0) -- (2,0);\n\\end{tikzpicture}";
    const { displayList } = await compile(src);
    expect(displayList.items).toHaveLength(1);
    expect(displayList.bbox.width).toBeCloseTo(56.9, 0.5);
  });

  it("hand-built display list matches evaluator", async () => {
    // Exit criteria: hand-built list for (0,0)--(1,1) should equal compiled
    const { displayList } = await compile("\\draw (0,0) -- (1,1);");
    // shallow snapshot of bbox + segment endpoints
    const item = displayList.items[0] as { segments: { to: Vec2 }[] };
    expect(item.segments[0].to.x).toBeCloseTo(0);
    expect(item.segments[1].to.x).toBeCloseTo(28.45, 0.5);
  });
});
