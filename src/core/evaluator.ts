import { Vec2 } from "../geometry/vec2.ts";
import { BBox } from "../geometry/bbox.ts";
import { toPt, PT_PER_CM, PT_PER_MM, PT_PER_IN } from "../geometry/units.ts";
import { KAPPA } from "../geometry/bezier.ts";
import type { DisplayList, DisplayItem, PathSegment, StrokeStyle, FillStyle } from "../render/displayList.ts";
import { computePathBBox, DEFAULT_STROKE, DEFAULT_FILL } from "../render/displayList.ts";
import { BASE_COLORS, resolveColor, LINE_WIDTH_PRESETS, resolveDash, HELP_LINES } from "../color/index.ts";
import type { ParseResult, Coordinate, PathOp, Option, Picture } from "../parser/index.ts";

export interface EvalOptions { scale?: number; }
export interface EvalError { message: string; line: number; column: number; pos: number; severity: "error" | "warning"; codeFrame?: string; }

export function evaluate(parsed: ParseResult, _opts: EvalOptions = {}): { displayList: DisplayList; errors: EvalError[] } {
  const errors: EvalError[] = parsed.errors.map(e => ({ ...e, severity: "error" as const }));
  const items: DisplayItem[] = [];
  let overall = new BBox();
  const nodes: Record<string, { center: Vec2; bbox: BBox }> = {};

  const named = new Map<string, Vec2>();

  for (const pic of parsed.pictures) {
    const picRes = evaluatePicture(pic, named, errors);
    for (const it of picRes.items) {
      items.push(it);
      if (it.kind === "path") overall.addBBox(computePathBBox(it.segments, it.stroke?.widthPt ?? 0));
      else if (it.kind === "group") {
        // groups handled?
      }
    }
    Object.assign(nodes, picRes.nodes);
  }

  // If no explicit pictures but ast had raw path pictures via lenient mode, pictures already covered.
  // Fallback: if still empty but tokens had content, try to report
  if (items.length === 0 && parsed.tokens.length > 0 && parsed.pictures.length === 0) {
    // No pictures parsed but content existed: emit warning
    // Keep empty bbox
  }

  // Capture named as nodes for Phase1: just expose coordinates as nodes
  for (const [k, v] of named) {
    if (!nodes[k]) nodes[k] = { center: v, bbox: BBox.fromPoints([v]) };
  }

  if (overall.isEmpty && items.length === 0) {
    // keep empty
  }

  return { displayList: { items, bbox: overall, nodes }, errors };
}

function evaluatePicture(pic: Picture, globalNamed: Map<string, Vec2>, errors: EvalError[]): { items: DisplayItem[]; nodes: Record<string, { center: Vec2; bbox: BBox }> } {
  const items: DisplayItem[] = [];
  const nodes: Record<string, { center: Vec2; bbox: BBox }> = {};
  // per-picture named map inherits global but also local
  const localNamed = new Map(globalNamed);

  // Picture-level options could affect defaults (e.g., scale, x/y vectors) — Phase2; for Phase1 ignore.

  for (const stmt of pic.body) {
    if (stmt.kind === "coordinate") {
      const at = stmt.at ? resolveCoord(stmt.at, localNamed, errors, new Vec2(0, 0)) : new Vec2(0, 0);
      if (at) {
        localNamed.set(stmt.name, at);
        globalNamed.set(stmt.name, at);
        nodes[stmt.name] = { center: at, bbox: BBox.fromPoints([at]) };
      }
      continue;
    }
    if (stmt.kind === "path") {
      const res = evaluatePath(stmt, localNamed, errors);
      if (res) {
        items.push(res.item);
        for (const ex of res.extra) items.push(ex);
        // register any named coordinate definitions that were embedded? Not phase1.
        // Update current point for next path? In TikZ each path is independent but relative + handling resets?
      }
    }
  }

  return { items, nodes };
}

function evaluatePath(stmt: import("../parser/index.ts").PathStatement, named: Map<string, Vec2>, errors: EvalError[]): { item: DisplayItem; extra: DisplayItem[] } | null {
  const style = resolveOptions(stmt.options, stmt.action, errors);
  const segments: PathSegment[] = [];
  let current = new Vec2(0, 0);
  let startOfPath: Vec2 | null = null;
  let lastMove: Vec2 | null = null;
  let hasMove = false;

  function resolveCoordFull(c: Coordinate, cur: Vec2): Vec2 | null {
    const v = resolveCoord(c, named, errors, cur);
    if (!v) return null;
    return v;
  }

  for (const op of stmt.ops) {
    if (op.kind === "move") {
      const pt = resolveCoordFull(op.coord, current);
      if (!pt) continue;
      // relative handling already inside resolveCoord
      segments.push({ kind: "moveTo", to: pt });
      current = pt;
      startOfPath = pt;
      lastMove = pt;
      hasMove = true;
      // if named coordinate inside move? No.
    } else if (op.kind === "lineTo") {
      const pt = resolveCoordFull(op.coord, current);
      if (!pt) continue;
      if (!hasMove) {
        // implicit move at origin? But should have move; if missing, start at current
        segments.push({ kind: "moveTo", to: current });
        startOfPath = current;
        hasMove = true;
      }
      segments.push({ kind: "lineTo", to: pt });
      // update current depending on relative type: ++ updates, + does NOT update for next segment? Actually TikZ: + means relative but does NOT update current for next, ++ does.
      // Our resolveCoord already computed relative endpoint; now decide if current should stay or move.
      if (op.coord.relative === "plus") {
        // do not update current - keep original
        // but for next operation, the "current" for relative should still be original startOfSegment?
        // TikZ semantics: (0,0) -- +(1,0) -- +(1,0) => second +(1,0) is still relative to (0,0)? Actually manual: + keeps current unchanged, so yes both are relative to same origin.
        // We already computed pt as current+offset, but we should NOT set current = pt.
        // So keep current unchanged.
      } else {
        current = pt;
      }
    } else if (op.kind === "rectangle") {
      const pt = resolveCoordFull(op.coord, current);
      if (!pt) continue;
      if (!hasMove || !startOfPath) {
        errors.push({ message: "rectangle without start coordinate", line: op.loc.line, column: op.loc.column, pos: op.loc.pos, severity: "error" });
        continue;
      }
      const a = current; // actually start is last point; rectangle from current to pt
      // For first rectangle after move, current is start
      // Need to guarantee start anchor is current before rectangle; if op follows move, current is move point.
      // Generate rectangle path: move already at a, then 3 lines to complete.
      // But segments already has move to a, so just add lines.
      const b = new Vec2(pt.x, a.y);
      const c = pt;
      const d = new Vec2(a.x, pt.y);
      segments.push({ kind: "lineTo", to: b });
      segments.push({ kind: "lineTo", to: c });
      segments.push({ kind: "lineTo", to: d });
      segments.push({ kind: "close" });
      current = a; // after rectangle, current returns to start? In TikZ, after rectangle current is at second corner? Actually spec: rectangle is like --, current ends at second corner. For simplicity set to pt.
      // TikZ: \draw (0,0) rectangle (1,1) -- (2,2) => line from (1,1) to (2,2). So current becomes pt.
      current = pt;
      startOfPath = pt;
    } else if (op.kind === "circle") {
      // center is current (last point). radius from op.
      const center = current;
      if (!hasMove) {
        errors.push({ message: "circle without center coordinate", line: op.loc.line, column: op.loc.column, pos: op.loc.pos, severity: "error" });
        continue;
      }
      let radiusPt = 10; // default 10pt?
      if (op.radiusPt) {
        try { radiusPt = parseDimension(op.radiusPt); } catch (e) { errors.push({ message: String((e as Error).message), line: op.loc.line, column: op.loc.column, pos: op.loc.pos, severity: "warning" }); }
      } else {
        // try radius from options
        const rOpt = op.options.find(o => o.key.toLowerCase().includes("radius"));
        if (rOpt?.value) try { radiusPt = parseDimension(rOpt.value); } catch {}
        else if (rOpt && rOpt.key.toLowerCase().startsWith("radius")) {
          // key may be "radius=1cm" split already, value is "1cm"
        }
        // also support width? Not needed.
        // Check for x radius / y radius for ellipse? For Phase1 only circle.
      }
      // If radius still not specified and circle had form circle (1cm) where we captured as named but failed? fallback already.
      const segs = circleSegments(center, radiusPt);
      // If this is the first op being circle and we haven't moved? But we have move already, so replace? Actually for `(0,0) circle (1cm)` the move is center, not part of circle outline alone. The circle should be separate subpath starting at eastern point.
      // Strategy: start new subpath for circle: moveTo (center.x+radius, center.y) then 4 curves.
      // Our circleSegments returns moveTo + 3 curveTo + close? Implement.
      // Append segments:
      for (const s of segs) segments.push(s);
      // current stays at center? In TikZ current after circle remains at center? Actually after `circle`, current is center. We'll keep center.
      current = center;
    } else if (op.kind === "grid") {
      const pt = resolveCoordFull(op.coord, current);
      if (!pt) continue;
      if (!hasMove || !startOfPath) { errors.push({ message: "grid without start", line: op.loc.line, column: op.loc.column, pos: op.loc.pos, severity: "error" }); continue; }
      const a = startOfPath ?? current;
      // Parse step from options (grid post-bracket or draw brackets)
      let stepX = PT_PER_CM; // 1cm default
      let stepY = PT_PER_CM;
      let stepOpt = op.options.find(o => o.key.toLowerCase() === "step" || o.key.toLowerCase().includes("step"));
      if (!stepOpt) stepOpt = stmt.options.find(o => o.key.toLowerCase() === "step" || o.key.toLowerCase().includes("step"));
      if (stepOpt) {
        const v = stepOpt.value ?? stepOpt.key.split("=")[1];
        if (v) {
          // step may be "1cm" or "1cm,1cm"
          if (v.includes(",")) {
            const parts = v.split(",").map(s => s.trim());
            try { stepX = parseDimension(parts[0]); } catch {}
            try { stepY = parseDimension(parts[1] ?? parts[0]); } catch {}
          } else {
            try { const d = parseDimension(v.trim()); stepX = d; stepY = d; } catch {}
          }
        }
      } else {
        // Also support step as separate `xstep`/`ystep`? ignore
      }
      const gridSegs = gridSegments(a, pt, stepX, stepY);
      for (const s of gridSegs) segments.push(s);
      current = pt;
    } else if (op.kind === "cycle") {
      segments.push({ kind: "close" });
      if (startOfPath) current = startOfPath;
    }
  }

  if (segments.length === 0) return null;

  const stroke = style.stroke;
  const fill = style.fill;
  const isClosed = segments.some(s => s.kind === "close");
  // For draw action: need stroke; for fill: fill; filldraw both; path neither? But we still render path if requested.
  // In TikZ, \path with no draw/fill does nothing unless clip etc. We'll still treat as path with no stroke/fill unless options specify.
  // Ensure that bare \draw without explicit draw= still draws with stroke.
  let finalStroke = stroke;
  let finalFill = fill;
  if (stmt.action === "draw" && !finalStroke) finalStroke = { ...DEFAULT_STROKE };
  if (stmt.action === "fill" && !finalFill) finalFill = { ...DEFAULT_FILL };
  if (stmt.action === "filldraw") {
    if (!finalStroke) finalStroke = { ...DEFAULT_STROKE };
    if (!finalFill) finalFill = { ...DEFAULT_FILL };
  }
  if (stmt.action === "path" && !finalStroke && !finalFill) {
    // Check if options requested draw/fill
    // If none, path does nothing — still return empty? We'll return with null stroke/fill (invisible) but bbox still counts? For Phase1, keep as no-op but return segment for bbox anyway.
  }

  // Handle simple arrow heads as extra segments (Phase1 stub: add triangle at end for ->)
  if (style.arrowEnd || style.arrowStart) {
    // For simplicity, we don't draw arrow heads geometrically yet; we just extend stroke handling.
    // We will add a tiny triangle path as a filled path item later. For now keep flag in stroke.
    // Evaluator will generate arrow head geometry in items array: we push extra items.
    // Instead, we will generate extra DisplayItem for arrow heads and return composite? For Phase1, we keep single item but mark.
  }

  const item: DisplayItem = { kind: "path", segments, stroke: finalStroke, fill: finalFill, isClosed };

  // Arrow heads as extra filled triangles
  const extra: DisplayItem[] = [];
  if (style.arrowEnd && segments.length >= 2) {
    const head = createArrowHead(segments, false);
    if (head) extra.push(head);
  }
  if (style.arrowStart && segments.length >= 2) {
    const head = createArrowHead(segments, true);
    if (head) extra.push(head);
  }

  return { item, extra };
}

function resolveOptions(options: Option[], action: string, errors: EvalError[]): { stroke: StrokeStyle | null; fill: FillStyle | null; arrowStart: boolean; arrowEnd: boolean; inferredColor?: string } {
  let stroke: StrokeStyle | null = null;
  let fill: FillStyle | null = null;
  let arrowStart = false;
  let arrowEnd = false;

  function ensureStroke(): StrokeStyle {
    if (!stroke) stroke = { ...DEFAULT_STROKE };
    return stroke;
  }
  function ensureFill(): FillStyle {
    if (!fill) fill = { ...DEFAULT_FILL };
    return fill;
  }

  for (const opt of options) {
    const raw = opt.raw.trim();
    const key = opt.key.trim().toLowerCase();
    const val = opt.value?.trim();

    // Arrow shorthands as keys: "->", "<-", "<->"
    if (raw === "->") { arrowEnd = true; continue; }
    if (raw === "<-") { arrowStart = true; continue; }
    if (raw === "<->") { arrowStart = true; arrowEnd = true; continue; }
    if (key === "->") arrowEnd = true;
    if (key === "<-") arrowStart = true;
    if (key === "<->") { arrowStart = true; arrowEnd = true; }
    // also arrows inside option values like "arrows=->"? Ignore.

    if (key === "help lines") {
      const s = ensureStroke();
      s.widthPt = HELP_LINES.lineWidthPt;
      s.color = HELP_LINES.color;
      continue;
    }
    // Line width presets
    if (key in LINE_WIDTH_PRESETS || raw.toLowerCase() in LINE_WIDTH_PRESETS) {
      const k = key in LINE_WIDTH_PRESETS ? key : raw.toLowerCase();
      ensureStroke().widthPt = LINE_WIDTH_PRESETS[k];
      continue;
    }
    if (key === "line width" || key === "linewidth") {
      if (val) {
        try { ensureStroke().widthPt = parseDimension(val); } catch (e) { errors.push({ message: String((e as Error).message), line: opt.loc.line, column: opt.loc.column, pos: opt.loc.pos, severity: "warning" }); }
      }
      continue;
    }
    if (key === "thin" || key === "ultra thin" || key === "very thin" || key === "semithick" || key === "thick" || key === "very thick" || key === "ultra thick") {
      const v = LINE_WIDTH_PRESETS[key];
      if (v !== undefined) ensureStroke().widthPt = v;
      continue;
    }

    // Colors
    if (key === "draw" || key === "draw color") {
      let c = val ?? "black";
      if (!val && raw.toLowerCase() in BASE_COLORS) c = raw.toLowerCase();
      const hex = resolveColor(c);
      if (hex) ensureStroke().color = hex;
      else errors.push({ message: `Unknown color '${c}'`, line: opt.loc.line, column: opt.loc.column, pos: opt.loc.pos, severity: "warning" });
      continue;
    }
    if (key === "fill" || key === "fill color") {
      let c = val ?? "black";
      const hex = resolveColor(c);
      if (hex) ensureFill().color = hex;
      else errors.push({ message: `Unknown fill color '${c}'`, line: opt.loc.line, column: opt.loc.column, pos: opt.loc.pos, severity: "warning" });
      continue;
    }
    if (key === "color") {
      let c = val ?? "black";
      const hex = resolveColor(c);
      if (hex) { ensureStroke().color = hex; ensureFill().color = hex; }
      continue;
    }
    // Bare color name as option, e.g., [red] or [blue!20]
    if (!val && isBareColor(raw)) {
      const hex = resolveColor(raw);
      if (hex) {
        // Heuristic: if action is fill, set fill; if draw, set stroke; otherwise set stroke (TikZ default draws)
        if (action === "fill") ensureFill().color = hex;
        else if (action === "draw") ensureStroke().color = hex;
        else {
          ensureStroke().color = hex;
        }
      }
      continue;
    }

    // Dash / dotted / dashed
    const dashNorm = key.replace(/\s+/g, " ").trim();
    if (["dotted", "densely dotted", "loosely dotted", "dashed", "densely dashed", "loosely dashed", "solid"].includes(dashNorm)) {
      const d = resolveDash(dashNorm);
      if (d !== undefined) {
        const s = ensureStroke();
        s.dash = d;
      }
      continue;
    }
    if (key === "dash pattern") {
      // e.g., dash pattern=on 2pt off 3pt
      const spec = val ?? "";
      const dash = parseDashPattern(spec, errors, opt.loc);
      if (dash) ensureStroke().dash = dash;
      continue;
    }
    // Dotted/dashed variants inside raw without = ? already handled.

    // Opacity etc not Phase1

    // Unknown option -> warning but don't fail
    // We treat unknown as ignore for Phase1 flat mode
  }

  // If draw/fill were requested via bare action without explicit color, keep defaults
  return { stroke, fill, arrowStart, arrowEnd };
}

function isBareColor(raw: string): boolean {
  const n = raw.trim().toLowerCase();
  if (n in BASE_COLORS) return true;
  if (n.includes("!")) {
    const base = n.split("!")[0];
    if (base in BASE_COLORS) return true;
  }
  return false;
}

function parseDashPattern(spec: string, _errors: EvalError[], _loc: import("../parser/index.ts").Loc): number[] | null {
  // spec like "on 2pt off 3pt on 1pt off 1pt"
  const parts = spec.split(/\s+/);
  const out: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "on" || parts[i] === "off") {
      const dim = parts[i + 1];
      if (dim) {
        try { out.push(parseDimension(dim)); } catch { out.push(3); }
        i++;
      }
    }
  }
  return out.length > 0 ? out : null;
}

// ---------------------------------------------------------------------------
// Coordinate resolution

function resolveCoord(c: Coordinate, named: Map<string, Vec2>, errors: EvalError[], current: Vec2): Vec2 | null {
  let base: Vec2 | null = null;
  if (c.kind === "cartesian") {
    try {
      const x = parseDimension(c.x);
      const y = parseDimension(c.y);
      base = new Vec2(x, y);
    } catch (e) { errors.push({ message: String((e as Error).message), line: c.loc.line, column: c.loc.column, pos: c.loc.pos, severity: "warning" }); return null; }
  } else if (c.kind === "polar") {
    try {
      const angleDeg = parseFloat(c.angle);
      const r = parseDimension(c.radius);
      if (isNaN(angleDeg)) throw new Error(`Bad polar angle ${c.angle}`);
      const rad = (angleDeg * Math.PI) / 180;
      base = new Vec2(r * Math.cos(rad), r * Math.sin(rad));
    } catch (e) { errors.push({ message: String((e as Error).message), line: c.loc.line, column: c.loc.column, pos: c.loc.pos, severity: "warning" }); return null; }
  } else if (c.kind === "named") {
    const found = named.get(c.name);
    if (!found) {
      errors.push({ message: `Unknown named coordinate '${c.name}'`, line: c.loc.line, column: c.loc.column, pos: c.loc.pos, severity: "warning" });
      // Fallback to origin
      base = new Vec2(0, 0);
    } else {
      base = found;
      // anchor handling: ignore for Phase1
    }
  }
  if (!base) return null;
  if (c.relative === "plus" || c.relative === "plusplus") {
    return current.add(base);
  }
  return base;
}

export function parseDimension(s: string): number {
  const t = s.trim();
  if (t === "") throw new Error("empty dimension");
  const m = t.match(/^([+-]?[0-9]*\.?[0-9]+)\s*([a-z%]+)?$/i);
  if (!m) throw new Error(`bad dimension: ${t}`);
  const num = parseFloat(m[1]);
  const unit = (m[2] ?? "").toLowerCase();
  if (!unit) return num * PT_PER_CM; // unitless => cm
  if (["pt", "bp", "mm", "cm", "in", "pc", "em", "ex", "px"].includes(unit)) {
    return toPt(num, unit as never);
  }
  throw new Error(`unknown unit ${unit}`);
}

// ---------------------------------------------------------------------------
// Geometry helpers

function circleSegments(center: Vec2, radius: number): PathSegment[] {
  const r = radius;
  const k = KAPPA * r;
  const e = center.add(new Vec2(r, 0));
  const n = center.add(new Vec2(0, r));
  const w = center.add(new Vec2(-r, 0));
  const s = center.add(new Vec2(0, -r));
  // Start at east, clockwise (TikZ circle is CCW? but doesn't matter for filled)
  return [
    { kind: "moveTo", to: e },
    { kind: "curveTo", cp1: e.add(new Vec2(0, k)), cp2: n.add(new Vec2(k, 0)), to: n },
    { kind: "curveTo", cp1: n.add(new Vec2(-k, 0)), cp2: w.add(new Vec2(0, k)), to: w },
    { kind: "curveTo", cp1: w.add(new Vec2(0, -k)), cp2: s.add(new Vec2(-k, 0)), to: s },
    { kind: "curveTo", cp1: s.add(new Vec2(k, 0)), cp2: e.add(new Vec2(0, -k)), to: e },
    { kind: "close" },
  ];
}

function gridSegments(a: Vec2, b: Vec2, stepX: number, stepY: number): PathSegment[] {
  const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
  const segs: PathSegment[] = [];
  // vertical lines
  for (let x = minX; x <= maxX + 1e-9; x += stepX) {
    const xx = x > maxX ? maxX : x;
    segs.push({ kind: "moveTo", to: new Vec2(xx, minY) });
    segs.push({ kind: "lineTo", to: new Vec2(xx, maxY) });
  }
  // horizontal lines
  for (let y = minY; y <= maxY + 1e-9; y += stepY) {
    const yy = y > maxY ? maxY : y;
    segs.push({ kind: "moveTo", to: new Vec2(minX, yy) });
    segs.push({ kind: "lineTo", to: new Vec2(maxX, yy) });
  }
  return segs;
}

function createArrowHead(segments: PathSegment[], atStart: boolean): DisplayItem | null {
  // Find end or start direction
  let tip: Vec2 | null = null;
  let dir: Vec2 | null = null;
  if (!atStart) {
    // tip is last lineTo/curveTo target
    for (let i = segments.length - 1; i >= 0; i--) {
      const s = segments[i];
      if (s.kind === "lineTo" || s.kind === "curveTo") { tip = s.to; break; }
      if (s.kind === "moveTo") { tip = s.to; break; }
    }
    // direction: vector from previous point to tip
    let prev: Vec2 | null = null;
    for (let i = segments.length - 1; i >= 0; i--) {
      const s = segments[i];
      if (s.kind === "lineTo" || s.kind === "curveTo" || s.kind === "moveTo") {
        if (tip && s.to !== tip) { prev = s.to; break; }
        if (s.kind === "moveTo") { prev = s.to; break; }
      }
    }
    // More robust: find second last point
    const pts: Vec2[] = [];
    for (const s of segments) if (s.kind === "lineTo" || s.kind === "moveTo") pts.push(s.to);
    if (pts.length >= 2) {
      tip = pts[pts.length - 1];
      prev = pts[pts.length - 2];
      dir = tip.sub(prev).norm();
    }
  } else {
    // start
    const pts: Vec2[] = [];
    for (const s of segments) if (s.kind === "lineTo" || s.kind === "moveTo") pts.push(s.to);
    if (pts.length >= 2) {
      tip = pts[0];
      const nxt = pts[1];
      dir = nxt.sub(tip).norm().scale(-1); // reversed for start
    }
  }
  if (!tip || !dir) return null;
  const len = 6; // pt, arrow length
  const wid = 4;
  const base = tip.sub(dir.scale(len));
  const perp = dir.perp().scale(wid / 2);
  const p1 = base.add(perp);
  const p2 = base.sub(perp);
  return {
    kind: "path",
    segments: [
      { kind: "moveTo", to: tip },
      { kind: "lineTo", to: p1 },
      { kind: "lineTo", to: p2 },
      { kind: "close" },
    ],
    stroke: null,
    fill: { color: "#000000", opacity: 1, rule: "nonzero" },
    isClosed: true,
  };
}
