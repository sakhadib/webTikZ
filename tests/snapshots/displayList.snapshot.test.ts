import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.ts";

describe("display list snapshots (Phase 0)", () => {
  it("draw (0,0) -- (1,1) snapshot", async () => {
    const { displayList } = await compile("\\draw (0,0) -- (1,1);");
    // serialize Vec2 as [x,y] for stable snapshot
    const serial = JSON.stringify(displayList, (k, v) => {
      if (v && typeof v.x === "number" && typeof v.y === "number" && Object.keys(v).length === 2) return [v.x, v.y];
      if (v && typeof v.minX === "number") return { minX: v.minX, minY: v.minY, maxX: v.maxX, maxY: v.maxY };
      return v;
    }, 2);
    expect(serial).toMatchSnapshot();
  });
});
