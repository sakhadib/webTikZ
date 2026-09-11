import { Vec2 } from "../geometry/vec2.ts";
import { BBox } from "../geometry/bbox.ts";

export interface ShapeDef {
  name: string;
  // compute bounding box given center, width, height, innerSep, outerSep, etc.
  computeBBox(center: Vec2, halfW: number, halfH: number, outerSep: number): BBox;
  borderPoint(center: Vec2, halfW: number, halfH: number, outerSep: number, dir: Vec2): Vec2;
  anchorPoint(center: Vec2, halfW: number, halfH: number, anchor: string, fontDepth?: number): Vec2;
}

function rectBBox(center: Vec2, halfW: number, halfH: number, outer: number): BBox {
  return new BBox(center.x - halfW - outer, center.y - halfH - outer, center.x + halfW + outer, center.y + halfH + outer);
}
function rectBorder(center: Vec2, halfW: number, halfH: number, outer: number, dir: Vec2): Vec2 {
  const w = halfW + outer, h = halfH + outer;
  if (dir.x === 0 && dir.y === 0) return center;
  // Ray from center in dir direction to rectangle edge
  const dx = dir.x, dy = dir.y;
  let t = Infinity;
  if (dx !== 0) t = Math.min(t, w / Math.abs(dx));
  if (dy !== 0) t = Math.min(t, h / Math.abs(dy));
  // Need scale such that point = center + dir * t; but dir not normalized? Use normalized dir for calc
  const nd = dir.norm();
  let scale = Infinity;
  if (nd.x !== 0) scale = Math.min(scale, w / Math.abs(nd.x));
  if (nd.y !== 0) scale = Math.min(scale, h / Math.abs(nd.y));
  return center.add(nd.scale(scale));
}
function rectAnchor(center: Vec2, halfW: number, halfH: number, a: string): Vec2 {
  const w = halfW, h = halfH;
  const l = a.toLowerCase();
  if (l === "center") return center;
  if (l === "north") return center.add(new Vec2(0, h));
  if (l === "south") return center.add(new Vec2(0, -h));
  if (l === "east") return center.add(new Vec2(w, 0));
  if (l === "west") return center.add(new Vec2(-w, 0));
  if (l === "north east" || l === "northeast" || l === "north-east") return center.add(new Vec2(w, h));
  if (l === "north west" || l === "northwest") return center.add(new Vec2(-w, h));
  if (l === "south east" || l === "southeast") return center.add(new Vec2(w, -h));
  if (l === "south west" || l === "southwest") return center.add(new Vec2(-w, -h));
  if (l === "base") return center; // simplified
  if (l === "mid") return center;
  if (l === "text") return center;
  // angle anchor numeric e.g., "30" handled outside
  return center;
}

function circleBBox(center: Vec2, halfW: number, halfH: number, outer: number): BBox {
  const r = Math.max(halfW, halfH) + outer;
  return new BBox(center.x - r, center.y - r, center.x + r, center.y + r);
}
function circleBorder(center: Vec2, halfW: number, halfH: number, outer: number, dir: Vec2): Vec2 {
  const r = Math.max(halfW, halfH) + outer;
  if (dir.len() === 0) return center.add(new Vec2(r, 0));
  const nd = dir.norm().scale(r);
  return center.add(nd);
}
function ellipseBorder(center: Vec2, halfW: number, halfH: number, outer: number, dir: Vec2): Vec2 {
  const rx = halfW + outer, ry = halfH + outer;
  if (dir.len() === 0) return center.add(new Vec2(rx, 0));
  const nd = dir.norm();
  // ellipse border: point = center + (rx*cos, ry*sin) scaled by dir angle
  const ang = Math.atan2(nd.y * rx, nd.x * ry);
  // Actually param: x= rx*cos(t), y= ry*sin(t) where t = atan2(ry*dir? Let's compute intersection of ray with ellipse
  // Solve: (t*cos)^2/(rx^2)+(t*sin)^2/(ry^2)=1 => t = 1/ sqrt((cos^2/rx^2)+(sin^2/ry^2))? With nd normalized.
  // Simpler: compute scale factor
  const cos = nd.x, sin = nd.y;
  const denom = (cos*cos)/(rx*rx) + (sin*sin)/(ry*ry);
  const scale = 1 / Math.sqrt(denom);
  return center.add(new Vec2(cos*scale, sin*scale));
}

const rectangleDef: ShapeDef = {
  name: "rectangle",
  computeBBox: rectBBox,
  borderPoint: rectBorder,
  anchorPoint: rectAnchor,
};
const circleDef: ShapeDef = {
  name: "circle",
  computeBBox: circleBBox,
  borderPoint: circleBorder,
  anchorPoint: (c, hw, hh, a) => {
    if (["center","north","south","east","west","north east","north west","south east","south west"].includes(a.toLowerCase())) {
      const r = Math.max(hw, hh);
      if (a.toLowerCase() === "center") return c;
      if (a.toLowerCase() === "north") return c.add(new Vec2(0, r));
      if (a.toLowerCase() === "south") return c.add(new Vec2(0, -r));
      if (a.toLowerCase() === "east") return c.add(new Vec2(r, 0));
      if (a.toLowerCase() === "west") return c.add(new Vec2(-r, 0));
      if (a.toLowerCase().includes("north") && a.toLowerCase().includes("east")) return c.add(new Vec2(r*Math.SQRT1_2, r*Math.SQRT1_2));
      if (a.toLowerCase().includes("north") && a.toLowerCase().includes("west")) return c.add(new Vec2(-r*Math.SQRT1_2, r*Math.SQRT1_2));
      if (a.toLowerCase().includes("south") && a.toLowerCase().includes("east")) return c.add(new Vec2(r*Math.SQRT1_2, -r*Math.SQRT1_2));
      if (a.toLowerCase().includes("south") && a.toLowerCase().includes("west")) return c.add(new Vec2(-r*Math.SQRT1_2, -r*Math.SQRT1_2));
      return c;
    }
    // angle anchor
    const deg = parseFloat(a);
    if (!isNaN(deg)) {
      const rad = deg*Math.PI/180;
      const r = Math.max(hw, hh);
      return c.add(new Vec2(r*Math.cos(rad), r*Math.sin(rad)));
    }
    return c;
  },
};
const ellipseDef: ShapeDef = {
  name: "ellipse",
  computeBBox: (c, hw, hh, outer) => new BBox(c.x - hw - outer, c.y - hh - outer, c.x + hw + outer, c.y + hh + outer),
  borderPoint: ellipseBorder,
  anchorPoint: (c, hw, hh, a) => {
    const l = a.toLowerCase();
    if (l === "center") return c;
    if (l === "north") return c.add(new Vec2(0, hh));
    if (l === "south") return c.add(new Vec2(0, -hh));
    if (l === "east") return c.add(new Vec2(hw, 0));
    if (l === "west") return c.add(new Vec2(-hw, 0));
    const deg = parseFloat(a);
    if (!isNaN(deg)) {
      const rad = deg*Math.PI/180;
      // point on ellipse at angle deg (param angle)
      return c.add(new Vec2(hw*Math.cos(rad), hh*Math.sin(rad)));
    }
    return rectAnchor(c, hw, hh, a);
  },
};
const coordinateDef: ShapeDef = {
  name: "coordinate",
  computeBBox: (c) => BBox.fromPoints([c]),
  borderPoint: (c) => c,
  anchorPoint: (c) => c,
};

const REGISTRY = new Map<string, ShapeDef>([
  ["rectangle", rectangleDef],
  ["circle", circleDef],
  ["ellipse", ellipseDef],
  ["coordinate", coordinateDef],
]);

export function getShape(name: string): ShapeDef {
  return REGISTRY.get(name.toLowerCase()) ?? rectangleDef;
}
export function registerShape(def: ShapeDef) { REGISTRY.set(def.name.toLowerCase(), def); }
export function listShapes(): string[] { return Array.from(REGISTRY.keys()); }
