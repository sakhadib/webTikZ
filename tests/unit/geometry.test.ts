import { describe, it, expect } from "vitest";
import { Vec2, Affine, BBox } from "../../src/geometry/index.ts";

describe("Vec2", () => {
  it("add/sub/scale/len", () => {
    expect(new Vec2(1,2).add(new Vec2(3,4))).toEqual(new Vec2(4,6));
    expect(new Vec2(5,5).sub(new Vec2(2,3))).toEqual(new Vec2(3,2));
    expect(new Vec2(2,3).scale(2)).toEqual(new Vec2(4,6));
    expect(new Vec2(3,4).len()).toBeCloseTo(5);
  });
  it("norm & angle", () => {
    expect(new Vec2(1,0).norm()).toEqual(new Vec2(1,0));
    expect(Vec2.ZERO.norm()).toEqual(Vec2.ZERO);
  });
});

describe("Affine", () => {
  it("identity", () => {
    const p = new Vec2(3,7);
    expect(Affine.IDENTITY.apply(p)).toEqual(p);
  });
  it("translation & scaling", () => {
    expect(Affine.translation(2,3).apply(new Vec2(0,0))).toEqual(new Vec2(2,3));
    expect(Affine.scaling(2).apply(new Vec2(3,4))).toEqual(new Vec2(6,8));
  });
  it("invert", () => {
    const m = Affine.translation(5, -2).multiply(Affine.rotation(30));
    const inv = m.invert();
    const p = new Vec2(10,20);
    expect(inv.apply(m.apply(p)).x).toBeCloseTo(p.x, 6);
    expect(inv.apply(m.apply(p)).y).toBeCloseTo(p.y, 6);
  });
});

describe("BBox", () => {
  it("empty then addPoint", () => {
    const b = new BBox();
    expect(b.isEmpty).toBe(true);
    b.addPoint(new Vec2(0,0));
    b.addPoint(new Vec2(10,5));
    expect(b.width).toBe(10);
    expect(b.height).toBe(5);
    expect(b.center).toEqual(new Vec2(5,2.5));
  });
  it("expand/union", () => {
    const a = BBox.fromRect(0,0,10,10);
    const b = BBox.fromRect(5,5,10,10);
    expect(a.union(b).width).toBe(15);
    expect(a.expand(1).width).toBe(12);
  });
});
