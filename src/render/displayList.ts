import { BBox } from "../geometry/bbox.ts";
import { Vec2 } from "../geometry/vec2.ts";

export type PathSegment =
  | { kind: "moveTo"; to: Vec2 }
  | { kind: "lineTo"; to: Vec2 }
  | { kind: "curveTo"; cp1: Vec2; cp2: Vec2; to: Vec2 }
  | { kind: "close" };

export interface StrokeStyle {
  color: string; // css color
  widthPt: number;
  cap: "butt" | "round" | "square";
  join: "miter" | "round" | "bevel";
  miterLimit: number;
  dash: number[] | null; // in pt, null = solid
  dashPhasePt: number;
  opacity: number;
}

export interface FillStyle {
  color: string;
  opacity: number;
  rule: "nonzero" | "evenodd";
}

export interface GradientFill {
  kind: "linear" | "radial";
  colors: { offset: number; color: string }[];
  angleDeg?: number; // for linear
  innerColor?: string;
  outerColor?: string;
}
export interface PatternFill {
  kind: "pattern";
  name: string; // e.g., "north east lines"
  color: string;
  background?: string;
}

export interface DisplayPath {
  kind: "path";
  segments: PathSegment[];
  stroke: StrokeStyle | null;
  fill: FillStyle | null;
  gradient?: GradientFill | null;
  pattern?: PatternFill | null;
  // how path was closed/traced for bounding-box expansion (stroke width)
  isClosed: boolean;
  // bbox flags
  useAsBoundingBox?: boolean;
  overlay?: boolean;
}

export interface DisplayText {
  kind: "text";
  text: string;
  at: Vec2; // baseline origin in pt
  font: string; // css font string
  color: string;
  align: "left" | "center" | "right";
  baseline: "alphabetic" | "middle" | "top" | "bottom";
  // measured box for bbox (optional, filled by text engine)
  widthPt?: number;
  heightPt?: number;
}

export interface DisplayGroup {
  kind: "group";
  children: DisplayItem[];
  opacity: number;
  clipPath?: PathSegment[]; // if present, clip to this path
}

export type DisplayItem = DisplayPath | DisplayText | DisplayGroup;

export interface DisplayList {
  items: DisplayItem[];
  bbox: BBox; // in pt, precomputed
  /** Named nodes for hit-testing / interaction (Phase 10) */
  nodes: Record<string, { center: Vec2; bbox: BBox }>;
}

export const DEFAULT_STROKE: StrokeStyle = {
  color: "#000000",
  widthPt: 0.4,
  cap: "butt",
  join: "miter",
  miterLimit: 10,
  dash: null,
  dashPhasePt: 0,
  opacity: 1,
};

export const DEFAULT_FILL: FillStyle = {
  color: "#000000",
  opacity: 1,
  rule: "nonzero",
};

export const pathBBox = computePathBBox;
export function computePathBBox(segments: PathSegment[], strokeWidthPt = 0): BBox {
  const b = new BBox();
  let cur = new Vec2(0, 0);
  let start = new Vec2(0, 0);
  let hasPoint = false;
  for (const s of segments) {
    if (s.kind === "moveTo") {
      cur = s.to;
      start = cur;
      b.addPoint(cur);
      hasPoint = true;
    } else if (s.kind === "lineTo") {
      b.addPoint(s.to);
      cur = s.to;
      hasPoint = true;
    } else if (s.kind === "curveTo") {
      b.addPoint(s.cp1);
      b.addPoint(s.cp2);
      b.addPoint(s.to);
      cur = s.to;
      hasPoint = true;
    } else if (s.kind === "close") {
      cur = start;
    }
  }
  if (!hasPoint) return b;
  if (strokeWidthPt > 0) b.expand(strokeWidthPt / 2);
  return b;
}
