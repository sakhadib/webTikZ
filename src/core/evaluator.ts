import { Vec2 } from "../geometry/vec2.ts";
import { BBox } from "../geometry/bbox.ts";
import { toPt, PT_PER_CM } from "../geometry/units.ts";
import type { DisplayList, DisplayItem } from "../render/displayList.ts";
import { computePathBBox, DEFAULT_STROKE } from "../render/displayList.ts";
import type { ParseResult } from "../parser/index.ts";

export interface EvalOptions {
  scale?: number;
}

export interface EvalError { message: string; line: number; column: number; severity: "error" | "warning"; }

/**
 * Phase 0 evaluator: turns AST into DisplayList.
 * Currently handles: \draw (x,y) -- (x,y); with cm units (default TikZ x/y =1cm).
 * Coordinates without units are multiplied by 1cm (PT_PER_CM).
 * This is enough for the Phase 0 exit: \draw (0,0) -- (1,1);
 */
export function evaluate(parsed: ParseResult, opts: EvalOptions = {}): { displayList: DisplayList; errors: EvalError[] } {
  void opts;
  const errors: EvalError[] = [...parsed.errors.map(e => ({ ...e, severity: "error" as const }))];
  const items: DisplayItem[] = [];
  let bbox = new BBox();

  // Walk AST
  for (const node of parsed.ast) {
    if (node.kind === "picture") {
      for (const child of node.body) handleDraw(child);
    } else if (node.kind === "draw") {
      handleDraw(node);
    }
  }

  // If no ast but raw source contained no picture env, try regex fallback on original tokens?
  // Already handled.

  if (items.length === 0 && parsed.tokens.length > 0) {
    // Fallback: scan tokens for (num,num) -- (num,num) pattern directly for robustness in Phase 0
    const pts = extractPointsFromTokens(parsed.tokens);
    if (pts.length >= 2) {
      const segs = [{ kind: "moveTo" as const, to: pts[0] }, { kind: "lineTo" as const, to: pts[1] }];
      for (let k = 2; k < pts.length; k++) segs.push({ kind: "lineTo" as const, to: pts[k] });
      const stroke = { ...DEFAULT_STROKE };
      const item: DisplayItem = { kind: "path", segments: segs, stroke, fill: null, isClosed: false };
      items.push(item);
      bbox = computePathBBox(segs, stroke.widthPt);
    }
  } else {
    // bbox already computed per item
  }

  // compute overall bbox
  if (items.length > 0 && bbox.isEmpty) {
    // recompute from items
    const acc = new BBox();
    for (const it of items) if (it.kind === "path") acc.addBBox(computePathBBox(it.segments, it.stroke?.widthPt ?? 0));
    bbox = acc;
  }

  if (bbox.isEmpty && items.length === 0) {
    // empty picture -> empty bbox; keep empty (canvas will use default 10pt)
  }

  return { displayList: { items, bbox, nodes: {} }, errors };

  function handleDraw(node: { kind: string; path?: { text: string }[]; loc?: unknown }): void {
    const raw = node.path?.map(p => p.text).join(" ") ?? "";
    const pts = parseCoordsFromText(raw);
    if (pts.length < 2 && raw.includes("--")) {
      // still try token fallback
    }
    if (pts.length >= 2) {
      const segments: import("../render/displayList.ts").PathSegment[] = [{ kind: "moveTo" as const, to: pts[0] }];
      for (let k = 1; k < pts.length; k++) segments.push({ kind: "lineTo" as const, to: pts[k] });
      const stroke = { ...DEFAULT_STROKE };
      const item: DisplayItem = { kind: "path", segments, stroke, fill: null, isClosed: false };
      items.push(item);
      const b = computePathBBox(segments, stroke.widthPt);
      bbox.addBBox(b);
    } else if (pts.length === 1) {
      // single point degenerate
    }
  }
}

function parseCoordsFromText(text: string): Vec2[] {
  const pts: Vec2[] = [];
  // match ( x , y ) or ( x : y ) polar? only cartesian for now
  // x,y may have units e.g. 1cm, 2pt, 0.5
  const re = /\(\s*([^,)]+)\s*,\s*([^)]+)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const xStr = m[1].trim();
    const yStr = m[2].trim();
    try {
      const xPt = parseDimension(xStr);
      const yPt = parseDimension(yStr);
      pts.push(new Vec2(xPt, yPt));
    } catch {
      // ignore parse errors, will be reported as warning
    }
  }
  return pts;
}

function extractPointsFromTokens(tokens: { kind: string; text: string }[]): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind === "lparen") {
      // collect until rparen, look for comma
      let inner = "";
      let j = i + 1;
      while (j < tokens.length && tokens[j].kind !== "rparen") { inner += tokens[j].text + " "; j++; }
      // inner like "0 , 0" or "0,0" or "1cm , 1"
      const parts = inner.split(",").map(s => s.trim()).filter(Boolean);
      if (parts.length === 2) {
        try {
          const xPt = parseDimension(parts[0].replace(/\s+/g, ""));
          const yPt = parseDimension(parts[1].replace(/\s+/g, ""));
          pts.push(new Vec2(xPt, yPt));
        } catch { /* ignore */ }
      }
    }
  }
  return pts;
}

function parseDimension(s: string): number {
  const t = s.trim();
  if (t === "") throw new Error("empty dimension");
  // number + unit?
  const mm = t.match(/^([+-]?[0-9]*\.?[0-9]+)\s*([a-z%]+)?$/i);
  if (!mm) throw new Error(`bad dimension: ${t}`);
  const num = parseFloat(mm[1]);
  const unit = (mm[2] ?? "").toLowerCase();
  if (!unit) return num * PT_PER_CM; // unitless => cm (TikZ default x/y =1cm)
  // normalize
  if (unit === "pt" || unit === "bp" || unit === "mm" || unit === "cm" || unit === "in" || unit === "pc" || unit === "em" || unit === "ex" || unit === "px") {
    return toPt(num, unit as never);
  }
  throw new Error(`unknown unit ${unit}`);
}
