import { Vec2 } from "../geometry/vec2.ts";
import { BBox } from "../geometry/bbox.ts";
import { getShape } from "../shapes/index.ts";
import type { FontSpec, TextBox } from "../text/index.ts";
import { PT_PER_CM } from "../geometry/units.ts";

export interface NodeOptions {
  shape: string;
  draw: boolean;
  fill: string | null;
  drawColor: string | null;
  lineWidthPt: number;
  innerSepPt: number;
  outerSepPt: number;
  minimumWidthPt?: number;
  minimumHeightPt?: number;
  minimumSizePt?: number;
  textWidthPt?: number;
  align: string; // left|center|right|justify
  anchor: string; // e.g., "center", "north", etc. placement anchor
  rotate: number;
  transformShape: boolean;
  font: FontSpec;
  at?: Vec2;
  name?: string;
  text: string;
  isCoordinate: boolean;
}

export interface NodeEntry {
  name?: string;
  center: Vec2;
  bbox: BBox;
  shape: string;
  halfW: number;
  halfH: number;
  outerSep: number;
  innerSep: number;
  rotation: number;
  transformShape: boolean;
  textBox: TextBox;
  font: FontSpec;
  text: string;
  anchor: string;
}

export function resolveNodeBBox(entry: NodeEntry): BBox {
  const shape = getShape(entry.shape);
  return shape.computeBBox(entry.center, entry.halfW, entry.halfH, entry.outerSep);
}

export function getAnchor(entry: NodeEntry, anchor: string): Vec2 {
  const shape = getShape(entry.shape);
  // numeric angle like "30"
  if (/^-?[0-9.]+$/.test(anchor.trim())) {
    const deg = parseFloat(anchor);
    // shape-specific angle anchor
    if (entry.shape === "circle" || entry.shape === "ellipse") return shape.anchorPoint(entry.center, entry.halfW, entry.halfH, anchor);
    // rectangle angle: intersect ray
    const rad = deg * Math.PI/180;
    const dir = new Vec2(Math.cos(rad), Math.sin(rad));
    return shape.borderPoint(entry.center, entry.halfW, entry.halfH, 0, dir);
  }
  if (anchor.includes(".")) {
    const a = anchor.split(".").pop()!;
    return shape.anchorPoint(entry.center, entry.halfW, entry.halfH, a);
  }
  return shape.anchorPoint(entry.center, entry.halfW, entry.halfH, anchor);
}

export function getBorderPoint(entry: NodeEntry, to: Vec2): Vec2 {
  const shape = getShape(entry.shape);
  const dir = to.sub(entry.center);
  return shape.borderPoint(entry.center, entry.halfW, entry.halfH, entry.outerSep, dir);
}

// positioning helper: computes new center based on positioning string e.g., "right=2cm of a"
export function parsePositioning(value: string, thisEntry: NodeEntry, targetEntry: NodeEntry, nodeDistancePt: number): Vec2 {
  // value like "1cm" or "2cm of a.east" — actually full positioning is in key like "right=of a" value is "of a" or "1cm of a"
  // Caller will give raw value
  return targetEntry.center; // placeholder implemented in evaluator more fully
}

export function computeNodeDimensions(textBox: TextBox, opts: NodeOptions): { halfW: number; halfH: number } {
  const inner = opts.innerSepPt;
  // text box includes height+depth; width is text width
  let w = textBox.width + 2*inner;
  let h = textBox.height + textBox.depth + 2*inner;
  if (opts.textWidthPt) w = opts.textWidthPt + 2*inner;
  if (opts.minimumWidthPt !== undefined) w = Math.max(w, opts.minimumWidthPt);
  if (opts.minimumHeightPt !== undefined) h = Math.max(h, opts.minimumHeightPt);
  if (opts.minimumSizePt !== undefined) { w = Math.max(w, opts.minimumSizePt); h = Math.max(h, opts.minimumSizePt); }
  // circle: enforce square
  if (opts.shape === "circle") {
    const m = Math.max(w, h);
    w = m; h = m;
  }
  // for coordinate, zero size irrespective of text
  if (opts.isCoordinate) { w = 0; h = 0; }
  return { halfW: w/2, halfH: h/2 };
}

export function defaultNodeOptions(): NodeOptions {
  return {
    shape: "rectangle",
    draw: false,
    fill: null,
    drawColor: null,
    lineWidthPt: 0.4,
    innerSepPt: 0.333 * PT_PER_CM, // 0.333em approx? TikZ default inner sep 0.3333em = ~3.33pt
    outerSepPt: 0.5, // pt? TikZ outer sep 0.5pt
    align: "center",
    anchor: "center",
    rotate: 0,
    transformShape: false,
    font: { family: "Latin Modern Roman, serif", sizePt: 10, weight: "normal", style: "normal" },
    text: "",
    isCoordinate: false,
  };
}
