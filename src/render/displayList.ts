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
  // Phase8: fading / transparency / shadows / canvas
  fading?: string;
  pathFading?: string;
  scopeFading?: string;
  fitFading?: boolean;
  fadingAngle?: number;
  blendMode?: string;
  blendGroup?: string;
  shadow?: any;
  dropShadow?: any;
  copyShadow?: any;
  canvasTransform?: import("../geometry/affine.ts").Affine;
}

export interface DisplayImage {
  kind: "image";
  src: string;
  at: Vec2;
  widthPt?: number;
  heightPt?: number;
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
  canvasTransform?: import("../geometry/affine.ts").Affine;
}

export interface DisplayGroup {
  kind: "group";
  children: DisplayItem[];
  opacity: number;
  clipPath?: PathSegment[]; // if present, clip to this path
  // Phase8
  fading?: string;
  scopeFading?: string;
  pathFading?: string;
  fitFading?: boolean;
  transparencyGroup?: boolean | string;
  blendMode?: string;
  blendGroup?: string;
  shadow?: any;
  spy?: boolean;
  magnification?: number;
  canvasTransform?: import("../geometry/affine.ts").Affine;
}

export type DisplayItem = DisplayPath | DisplayText | DisplayGroup | DisplayImage;

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

/** Hit testing helpers — Phase 10 */
export function pointInBBox(pt: Vec2, bbox: BBox, marginPt = 0): boolean {
  return pt.x >= bbox.minX - marginPt && pt.x <= bbox.maxX + marginPt && pt.y >= bbox.minY - marginPt && pt.y <= bbox.maxY + marginPt;
}
export function hitTestNodes(dl: DisplayList, pt: Vec2, marginPt = 0): string[] {
  const hits: string[] = [];
  for (const [name, entry] of Object.entries(dl.nodes)) {
    if (pointInBBox(pt, entry.bbox, marginPt)) hits.push(name);
  }
  return hits;
}
function flattenSegments(segments: PathSegment[], samplesPerCurve = 10): Vec2[] {
  const pts: Vec2[] = [];
  let cur = new Vec2(0, 0);
  let start = new Vec2(0, 0);
  for (const s of segments) {
    if (s.kind === "moveTo") { cur = s.to; start = cur; pts.push(cur); }
    else if (s.kind === "lineTo") { cur = s.to; pts.push(cur); }
    else if (s.kind === "curveTo") {
      for (let i = 1; i <= samplesPerCurve; i++) {
        const t = i / samplesPerCurve;
        const mt = 1 - t;
        const x = mt*mt*mt*cur.x + 3*mt*mt*t*s.cp1.x + 3*mt*t*t*s.cp2.x + t*t*t*s.to.x;
        const y = mt*mt*mt*cur.y + 3*mt*mt*t*s.cp1.y + 3*mt*t*t*s.cp2.y + t*t*t*s.to.y;
        pts.push(new Vec2(x, y));
      }
      cur = s.to;
    } else if (s.kind === "close") { if (pts.length) pts.push(start); cur = start; }
  }
  return pts;
}
function pointInPolygon(pt: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
export function isPointInPath(segments: PathSegment[], pt: Vec2, rule: "nonzero" | "evenodd" = "nonzero"): boolean {
  if (segments.length === 0) return false;
  // quick bbox reject
  const bbox = computePathBBox(segments, 0);
  if (!pointInBBox(pt, bbox)) return false;
  const poly = flattenSegments(segments, 12);
  if (poly.length < 3) return false;
  return pointInPolygon(pt, poly);
}
function distToSegment(pt: Vec2, a: Vec2, b: Vec2): number {
  const ab = b.sub(a);
  const ap = pt.sub(a);
  const t = Math.max(0, Math.min(1, ap.dot(ab) / (ab.len2() || 1)));
  const proj = a.add(ab.scale(t));
  return pt.sub(proj).len();
}
export function isPointInStroke(segments: PathSegment[], pt: Vec2, widthPt: number, samplesPerCurve = 12): boolean {
  if (segments.length === 0) return false;
  const half = widthPt / 2 + 0.5; // tolerance
  const bbox = computePathBBox(segments, widthPt);
  if (!pointInBBox(pt, bbox)) return false;
  let cur = new Vec2(0, 0);
  let start = new Vec2(0, 0);
  for (const s of segments) {
    if (s.kind === "moveTo") { cur = s.to; start = cur; }
    else if (s.kind === "lineTo") {
      if (distToSegment(pt, cur, s.to) <= half) return true;
      cur = s.to;
    } else if (s.kind === "curveTo") {
      let prev = cur;
      for (let i = 1; i <= samplesPerCurve; i++) {
        const t = i / samplesPerCurve;
        const mt = 1 - t;
        const x = mt*mt*mt*cur.x + 3*mt*mt*t*s.cp1.x + 3*mt*t*t*s.cp2.x + t*t*t*s.to.x;
        const y = mt*mt*mt*cur.y + 3*mt*mt*t*s.cp1.y + 3*mt*t*t*s.cp2.y + t*t*t*s.to.y;
        const curPt = new Vec2(x, y);
        if (distToSegment(pt, prev, curPt) <= half) return true;
        prev = curPt;
      }
      cur = s.to;
    } else if (s.kind === "close") {
      if (distToSegment(pt, cur, start) <= half) return true;
      cur = start;
    }
  }
  return false;
}
export function hitTestDisplayList(dl: DisplayList, pt: Vec2): { nodes: string[]; paths: number[] } {
  const nodes = hitTestNodes(dl, pt);
  const paths: number[] = [];
  dl.items.forEach((item, idx) => {
    if (item.kind === "path") {
      if (isPointInPath(item.segments, pt) || isPointInStroke(item.segments, pt, item.stroke?.widthPt ?? 0.4)) paths.push(idx);
    } else if (item.kind === "group") {
      // shallow check groups
      for (const child of (item as any).children) {
        if (child.kind === "path" && (isPointInPath(child.segments, pt) || isPointInStroke(child.segments, pt, child.stroke?.widthPt ?? 0.4))) { paths.push(idx); break; }
      }
    }
  });
  return { nodes, paths };
}

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
