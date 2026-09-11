import { Vec2 } from "../geometry/vec2.ts";
import type { PathSegment, DisplayItem } from "../render/displayList.ts";
import { totalLength, pointAtDistance, pointAtFraction } from "../geometry/path.ts";
import { approximateArcLength } from "../geometry/bezier.ts";
import { segmentsToCubics } from "../geometry/path.ts";

// ---- Decoration Automaton modeled on PGF ----

export interface DecorationState {
  name: string;
  width: number; // pt, input segment length consumed
  nextState: string;
  autoEndOnLength?: boolean;
  autoCornerOnLength?: boolean;
}

export interface DecorationAutomatonDef {
  name: string;
  states: DecorationState[];
  initialState: string;
  persistentPrecomputation?: Record<string, unknown>;
}

export class DecorationAutomaton {
  states: Map<string, DecorationState>;
  current: string;
  remaining: number;
  persistent: Map<string, unknown>;
  constructor(public def: DecorationAutomatonDef) {
    this.states = new Map(def.states.map(s => [s.name, s]));
    this.current = def.initialState;
    this.remaining = this.states.get(def.initialState)?.width ?? 0;
    this.persistent = new Map(Object.entries(def.persistentPrecomputation ?? {}));
  }
  getState(): DecorationState | undefined { return this.states.get(this.current); }
  advance(consumed: number): void {
    this.remaining -= consumed;
    while (this.remaining <= 1e-9) {
      const cur = this.getState();
      if (!cur) break;
      const nxt = cur.nextState;
      this.current = nxt;
      const ns = this.states.get(nxt);
      if (!ns) break;
      this.remaining += ns.width;
      if (cur.autoEndOnLength && this.remaining <= 0) break;
    }
  }
  reset(): void {
    this.current = this.def.initialState;
    this.remaining = this.states.get(this.current)?.width ?? 0;
  }
}

// Common options pre/post raise mirror etc
export interface DecorationCommon {
  amplitude: number;
  segmentLength: number;
  preLength: number;
  postLength: number;
  raise: number;
  mirror: boolean;
  aspect: number; // for brace
  // transform ignored
}

export function defaultCommon(): DecorationCommon {
  return { amplitude: 3, segmentLength: 10, preLength: 0, postLength: 0, raise: 0, mirror: false, aspect: 0.5 };
}

export interface DecorationResult {
  segments: PathSegment[];
  extra: DisplayItem[];
}

export type DecorationGenerator = (segments: PathSegment[], opts: DecorationCommon, raw: Map<string,string>) => DecorationResult;

const registry = new Map<string, DecorationGenerator>();

export function registerDecoration(name: string, gen: DecorationGenerator): void {
  registry.set(name.toLowerCase(), gen);
}
export function getDecoration(name: string): DecorationGenerator | undefined {
  return registry.get(name.toLowerCase());
}
export function listDecorations(): string[] { return Array.from(registry.keys()); }

// helper: point + normal
function pointNormal(segs: PathSegment[], dist: number): { point: Vec2; tangent: Vec2; normal: Vec2 } {
  const { point, tangent } = pointAtDistance(segs, dist);
  const n = tangent.perp().norm();
  return { point, tangent, normal: n };
}
function makePathFromPoints(pts: Vec2[]): PathSegment[] {
  if (pts.length === 0) return [];
  const segs: PathSegment[] = [{ kind: "moveTo", to: pts[0] }];
  for (let i = 1; i < pts.length; i++) segs.push({ kind: "lineTo", to: pts[i] });
  return segs;
}
function applyRaiseMirror(pts: Vec2[], segs: PathSegment[], dists: number[], opts: DecorationCommon): Vec2[] {
  if (opts.raise === 0) return pts;
  return pts.map((p, i) => {
    const { normal } = pointNormal(segs, dists[i]);
    return p.add(normal.scale(opts.raise));
  });
}

// ---- Helpers for dense sine ------
function sineOffset(segs: PathSegment[], opts: DecorationCommon, factor = 1): DecorationResult {
  const tot = totalLength(segs);
  const start = opts.preLength;
  const end = tot - opts.postLength;
  if (end <= start) return { segments: segs, extra: [] };
  const amp = opts.mirror ? -opts.amplitude * factor : opts.amplitude * factor;
  const segLen = opts.segmentLength || 10;
  const steps = Math.max(40, Math.ceil((end - start) / 2));
  const pts: Vec2[] = [];
  const dists: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const d = start + (i / steps) * (end - start);
    const { point, normal } = pointNormal(segs, d);
    const off = Math.sin((2 * Math.PI * (d - start)) / segLen) * amp;
    pts.push(point.add(normal.scale(off)));
    dists.push(d);
  }
  const raised = applyRaiseMirror(pts, segs, dists, opts);
  return { segments: makePathFromPoints(raised), extra: [] };
}

// pathmorphing generators
registerDecoration("zigzag", (segs, opts) => {
  const tot = totalLength(segs);
  const start = opts.preLength, end = tot - opts.postLength;
  const segLen = opts.segmentLength || 10;
  const amp = opts.mirror ? -opts.amplitude : opts.amplitude;
  // automaton example
  const automaton = new DecorationAutomaton({
    name: "zigzag",
    initialState: "up",
    states: [
      { name: "up", width: segLen / 2, nextState: "down", autoCornerOnLength: true },
      { name: "down", width: segLen / 2, nextState: "up", autoEndOnLength: true },
    ],
    persistentPrecomputation: { amplitude: amp, segmentLength: segLen },
  });
  void automaton;
  const pts: Vec2[] = [];
  const dists: number[] = [];
  const startPt = pointAtDistance(segs, start).point;
  pts.push(startPt); dists.push(start);
  let d = start + segLen / 2;
  let toggle = 1;
  while (d < end - 1e-6) {
    const { point, normal } = pointNormal(segs, d);
    pts.push(point.add(normal.scale(toggle * amp)));
    dists.push(d);
    toggle *= -1;
    d += segLen / 2;
  }
  const endPt = pointAtDistance(segs, end).point;
  pts.push(endPt); dists.push(end);
  const raised = applyRaiseMirror(pts, segs, dists, opts);
  // if raise applied twice? applyRaiseMirror already offsets again; we pushed already with amp but not raise. So second offset will double for raise case, correct.
  // Actually pts currently include amp offset already; applyRaise adds extra raise offset.
  // For non-raise, applyRaise returns same.
  // But our pts already include start/end without amp; raise will shift them too via applyRaise.
  // For toggle points, raise will double-count if we already added raise? No, we added only amp. So additional raise is correct.
  // But applyRaise recomputes normal for each dist and adds raise; so final points = amp offset + raise offset.
  // That's desired.
  return { segments: makePathFromPoints(raised), extra: [] };
});

registerDecoration("saw", (segs, opts) => {
  const tot = totalLength(segs);
  const segLen = opts.segmentLength || 10;
  const amp = opts.mirror ? -opts.amplitude : opts.amplitude;
  const pts: Vec2[] = []; const dists: number[] = [];
  let d = opts.preLength;
  pts.push(pointAtDistance(segs, d).point); dists.push(d);
  d += segLen / 2;
  while (d < tot - opts.postLength) {
    const { point, normal } = pointNormal(segs, d);
    pts.push(point.add(normal.scale(amp)));
    dists.push(d);
    const base = pointAtDistance(segs, d + segLen / 2).point;
    pts.push(base); dists.push(d + segLen / 2);
    d += segLen;
  }
  const raised = applyRaiseMirror(pts, segs, dists, opts);
  return { segments: makePathFromPoints(raised), extra: [] };
});

registerDecoration("straight zigzag", (segs, opts) => {
  const g = getDecoration("zigzag")!;
  return g(segs, opts, new Map());
});

registerDecoration("snake", (segs, opts) => sineOffset(segs, opts, 1));
registerDecoration("bumps", (segs, opts) => {
  const tot = totalLength(segs);
  const segLen = opts.segmentLength || 12;
  const amp = opts.mirror ? -opts.amplitude : opts.amplitude;
  const pts: Vec2[] = []; const dists: number[] = [];
  let d = opts.preLength;
  let prev = pointAtDistance(segs, d).point;
  pts.push(prev); dists.push(d);
  while (d + segLen <= tot - opts.postLength + 1e-6) {
    const midD = d + segLen / 2;
    const { point: midPt, normal } = pointNormal(segs, midD);
    const top = midPt.add(normal.scale(amp));
    // arc approximation via two lines (semi-circle)
    pts.push(top); dists.push(midD);
    const nextD = d + segLen;
    const nextPt = pointAtDistance(segs, nextD).point;
    pts.push(nextPt); dists.push(nextD);
    d = nextD;
  }
  const raised = applyRaiseMirror(pts, segs, dists, opts);
  // convert to curve segments for bumps (use curveTo for smoother)
  const segsOut: PathSegment[] = [{ kind: "moveTo", to: raised[0] }];
  for (let i = 1; i < raised.length; i++) {
    if (i % 2 === 1 && i + 1 < raised.length) {
      // bump top via curve
      const cp1 = raised[i - 1].lerp(raised[i], 0.5);
      const cp2 = raised[i].lerp(raised[i + 1], 0.5);
      segsOut.push({ kind: "curveTo", cp1, cp2, to: raised[i + 1] } as any);
      i++;
    } else {
      segsOut.push({ kind: "lineTo", to: raised[i] });
    }
  }
  return { segments: segsOut, extra: [] };
});

registerDecoration("coil", (segs, opts) => {
  const tot = totalLength(segs);
  const segLen = opts.segmentLength || 8;
  const amp = opts.mirror ? -opts.amplitude : opts.amplitude;
  const steps = Math.max(60, Math.ceil((tot - opts.preLength - opts.postLength) / 2));
  const pts: Vec2[] = []; const dists: number[] = [];
  const start = opts.preLength, end = tot - opts.postLength;
  for (let i = 0; i <= steps; i++) {
    const d = start + (i / steps) * (end - start);
    const { point, normal } = pointNormal(segs, d);
    const phase = (2 * Math.PI * (d - start)) / segLen;
    const off = Math.sin(phase) * amp;
    // coil has also slight longitudinal offset but ignore
    const off2 = Math.cos(phase) * amp * 0.3;
    const t = pointAtDistance(segs, d).tangent;
    pts.push(point.add(normal.scale(off)).add(t.scale(off2)));
    dists.push(d);
  }
  const raised = applyRaiseMirror(pts, segs, dists, opts);
  return { segments: makePathFromPoints(raised), extra: [] };
});
registerDecoration("random steps", (segs, opts) => {
  const tot = totalLength(segs);
  const segLen = opts.segmentLength || 10;
  const amp = Math.abs(opts.amplitude);
  let seed = 1;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
  const pts: Vec2[] = []; const dists: number[] = [];
  let d = opts.preLength;
  let last = pointAtDistance(segs, d).point;
  pts.push(last); dists.push(d);
  while (d + segLen <= tot - opts.postLength) {
    const nd = d + segLen;
    const { point } = pointNormal(segs, nd);
    const { normal } = pointNormal(segs, (d + nd) / 2);
    const off = (rnd() - 0.5) * 2 * amp * (opts.mirror ? -1 : 1);
    pts.push(point.add(normal.scale(off)));
    dists.push(nd);
    d = nd;
  }
  const raised = applyRaiseMirror(pts, segs, dists, opts);
  return { segments: makePathFromPoints(raised), extra: [] };
});
registerDecoration("bent", (segs, opts) => {
  // slight perpendicular bend per segment
  const tot = totalLength(segs);
  const segLen = opts.segmentLength || 20;
  const amp = (opts.mirror ? -opts.amplitude : opts.amplitude) * 0.5;
  const pts: Vec2[] = []; const dists: number[] = [];
  let d = opts.preLength;
  pts.push(pointAtDistance(segs, d).point); dists.push(d);
  while (d + segLen <= tot - opts.postLength) {
    const mid = d + segLen / 2;
    const { point, normal } = pointNormal(segs, mid);
    pts.push(point.add(normal.scale(amp)));
    dists.push(mid);
    const nd = d + segLen;
    pts.push(pointAtDistance(segs, nd).point); dists.push(nd);
    d = nd;
  }
  const raised = applyRaiseMirror(pts, segs, dists, opts);
  // produce curves
  const out: PathSegment[] = [{ kind: "moveTo", to: raised[0] }];
  for (let i = 1; i < raised.length; i += 2) {
    const mid = raised[i];
    const end = raised[i + 1];
    if (!end) break;
    const cp1 = raised[i - 1].lerp(mid, 0.5);
    const cp2 = mid.lerp(end, 0.5);
    out.push({ kind: "curveTo", cp1, cp2, to: end } as any);
  }
  return { segments: out, extra: [] };
});

// ---- pathreplacing ----

registerDecoration("brace", (segs, opts, raw) => {
  const tot = totalLength(segs);
  const amp = opts.amplitude || 6;
  const aspect = opts.aspect ?? (raw.get("aspect") ? parseFloat(raw.get("aspect")!) : 0.5);
  const mirrorMul = opts.mirror ? -1 : 1;
  const start = pointAtDistance(segs, opts.preLength).point;
  const end = pointAtDistance(segs, tot - opts.postLength).point;
  const midDist = opts.preLength + (tot - opts.preLength - opts.postLength) * aspect;
  const midInfo = pointNormal(segs, midDist);
  const { normal } = midInfo;
  const tip = midInfo.point.add(normal.scale(amp * mirrorMul));
  // extra raise
  const raiseOff = normal.scale(opts.raise);
  const s = start.add(raiseOff);
  const e = end.add(raiseOff);
  const t = tip.add(raiseOff);
  // Build brace polyline: s -> s+normal*amp/2 -> mid-tip -> e+normal*amp/2 -> e with curves
  const n = normal.scale(amp * mirrorMul * 0.5);
  const p1 = s.add(n);
  const p2 = e.add(n);
  const segsOut: PathSegment[] = [{ kind: "moveTo", to: s }];
  // simple brace shape using lines + curves
  segsOut.push({ kind: "lineTo", to: p1 });
  segsOut.push({ kind: "lineTo", to: t });
  segsOut.push({ kind: "lineTo", to: p2 });
  segsOut.push({ kind: "lineTo", to: e });
  return { segments: segsOut, extra: [] };
});
registerDecoration("border", (segs, opts) => {
  // border: offset copy with amplitude as distance, optionally angled?
  const amp = opts.amplitude || 3;
  const mirrorMul = opts.mirror ? -1 : 1;
  const tot = totalLength(segs);
  const steps = 40;
  const pts: Vec2[] = []; const dists: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const d = opts.preLength + (i / steps) * (tot - opts.preLength - opts.postLength);
    const { point, normal } = pointNormal(segs, d);
    const off = mirrorMul * amp;
    pts.push(point.add(normal.scale(off + opts.raise)));
    dists.push(d);
  }
  return { segments: makePathFromPoints(pts), extra: [{ kind: "path", segments: segs, stroke: null, fill: null, isClosed: false } as any] };
});
registerDecoration("waves", (segs, opts) => sineOffset(segs, { ...opts, amplitude: opts.amplitude || 3 }, 1));
registerDecoration("expanding waves", (segs, opts) => {
  const tot = totalLength(segs);
  const start = opts.preLength, end = tot - opts.postLength;
  const segLen = opts.segmentLength || 12;
  const steps = 80;
  const pts: Vec2[] = []; const dists: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const d = start + (i / steps) * (end - start);
    const frac = (d - start) / Math.max(1, end - start);
    const amp = (opts.mirror ? -opts.amplitude : opts.amplitude) * (0.2 + 0.8 * frac);
    const { point, normal } = pointNormal(segs, d);
    const off = Math.sin((2 * Math.PI * (d - start)) / segLen) * amp;
    pts.push(point.add(normal.scale(off + opts.raise)));
    dists.push(d);
  }
  return { segments: makePathFromPoints(pts), extra: [] };
});
registerDecoration("ticks", (segs, opts) => {
  const tot = totalLength(segs);
  const segLen = opts.segmentLength || 10;
  const amp = opts.amplitude || 4;
  const extra: DisplayItem[] = [];
  let d = opts.preLength;
  while (d <= tot - opts.postLength + 1e-6) {
    const { point, normal } = pointNormal(segs, d);
    const a = point.add(normal.scale(amp / 2 + opts.raise));
    const b = point.sub(normal.scale(amp / 2 - opts.raise));
    // For mirror, flip
    const mul = opts.mirror ? -1 : 1;
    const aa = point.add(normal.scale(mul * amp / 2 + opts.raise));
    const bb = point.add(normal.scale(mul * -amp / 2 + opts.raise));
    extra.push({ kind: "path", segments: [{ kind: "moveTo", to: aa }, { kind: "lineTo", to: bb }], stroke: { color: "#000", widthPt: 0.4, cap: "butt", join: "miter", miterLimit: 10, dash: null, dashPhasePt: 0, opacity: 1 }, fill: null, isClosed: false } as any);
    void a; void b;
    d += segLen;
  }
  // keep original path as main?
  return { segments: segs, extra };
});
registerDecoration("show path construction", (segs) => {
  // draw original plus markers at vertices
  const extra: DisplayItem[] = [];
  let cur = new Vec2(0, 0);
  let start = new Vec2(0, 0);
  for (const s of segs) {
    if (s.kind === "moveTo") { cur = s.to; start = cur; extra.push(markerAt(cur)); }
    else if (s.kind === "lineTo") { cur = s.to; extra.push(markerAt(cur)); }
    else if (s.kind === "curveTo") { extra.push(markerAt(s.cp1)); extra.push(markerAt(s.cp2)); cur = s.to; extra.push(markerAt(cur)); }
    else if (s.kind === "close") { cur = start; }
  }
  function markerAt(p: Vec2): DisplayItem {
    const r = 1.5;
    return { kind: "path", segments: [{ kind: "moveTo", to: p.add(new Vec2(r, 0)) }, { kind: "lineTo", to: p.add(new Vec2(-r, 0)) }, { kind: "moveTo", to: p.add(new Vec2(0, r)) }, { kind: "lineTo", to: p.add(new Vec2(0, -r)) }], stroke: { color: "#ff0000", widthPt: 0.4, cap: "butt", join: "miter", miterLimit: 10, dash: null, dashPhasePt: 0, opacity: 1 }, fill: null, isClosed: false } as any;
  }
  return { segments: segs, extra };
});

// ---- markings ----
registerDecoration("markings", (segs, opts, raw) => {
  const tot = totalLength(segs);
  const extra: DisplayItem[] = [];
  // parse marks from raw string stored under _rawDecoration
  const rawStr = raw.get("_raw") ?? "";
  // mark=at position 0.5 with {\arrow{>}} etc.
  const markRe = /mark\s*=\s*at\s+position\s+([0-9.]+)\s+with\s*\{([^}]*)\}/gi;
  let m: RegExpExecArray | null;
  while ((m = markRe.exec(rawStr)) !== null) {
    const pos = parseFloat(m[1]);
    const code = m[2];
    const dist = pos <= 1 ? pos * tot : pos; // if <=1 treat as fraction
    const { point, tangent } = pointAtDistance(segs, dist + opts.preLength);
    const p = point.add(pointNormal(segs, dist).normal.scale(opts.raise) as any);
    extra.push(makeArrowMark(p, tangent, code, opts.mirror));
  }
  // between positions ... step ... with
  const betweenRe = /mark\s*=\s*between\s+positions\s+([0-9.]+)\s+and\s+([0-9.]+)\s+step\s+([0-9.]+)\s+with\s*\{([^}]*)\}/gi;
  while ((m = betweenRe.exec(rawStr)) !== null) {
    const a = parseFloat(m[1]), b = parseFloat(m[2]), step = parseFloat(m[3]);
    const code = m[4];
    let pos = a;
    while (pos <= b + 1e-9) {
      const dist = pos * tot;
      const { point, tangent } = pointAtDistance(segs, dist);
      extra.push(makeArrowMark(point.add(pointNormal(segs, dist).normal.scale(opts.raise)), tangent, code, opts.mirror));
      pos += step;
    }
  }
  // arrows along paths shortcut: if raw contains "arrow"
  if (extra.length === 0 && rawStr.toLowerCase().includes("arrow")) {
    // place arrow at middle if no explicit mark
    const { point, tangent } = pointAtDistance(segs, tot / 2);
    extra.push(makeArrowMark(point, tangent, rawStr, opts.mirror));
  }
  return { segments: segs, extra };
});
function makeArrowMark(at: Vec2, tangent: Vec2, code: string, mirror: boolean): DisplayItem {
  const isReversed = mirror || code.toLowerCase().includes("reversed");
  const dir = isReversed ? tangent.scale(-1) : tangent;
  const len = 6, wid = 3;
  const perp = dir.perp().norm().scale(wid);
  const tip = at.add(dir.norm().scale(len / 2));
  const base = at.sub(dir.norm().scale(len / 2));
  const p1 = base.add(perp);
  const p2 = base.sub(perp);
  const segs: PathSegment[] = [{ kind: "moveTo", to: tip }, { kind: "lineTo", to: p1 }, { kind: "lineTo", to: p2 }, { kind: "close" }];
  return { kind: "path", segments: segs, stroke: null, fill: { color: "#000", opacity: 1, rule: "nonzero" }, isClosed: true } as any;
}

// ---- shapes, text, footprints, fractals ----

registerDecoration("shapes", (segs, opts) => {
  const tot = totalLength(segs);
  const step = opts.segmentLength || 15;
  const extra: DisplayItem[] = [];
  let d = opts.preLength;
  while (d <= tot - opts.postLength) {
    const { point } = pointNormal(segs, d);
    const p = point.add(pointNormal(segs, d).normal.scale(opts.raise));
    // small diamond
    const r = opts.amplitude || 3;
    const segs2: PathSegment[] = [{ kind: "moveTo", to: p.add(new Vec2(0, r)) }, { kind: "lineTo", to: p.add(new Vec2(r, 0)) }, { kind: "lineTo", to: p.add(new Vec2(0, -r)) }, { kind: "lineTo", to: p.add(new Vec2(-r, 0)) }, { kind: "close" }];
    extra.push({ kind: "path", segments: segs2, stroke: { color: "#000", widthPt: 0.4, cap: "butt", join: "miter", miterLimit: 10, dash: null, dashPhasePt: 0, opacity: 1 }, fill: { color: "#888", opacity: 1, rule: "nonzero" }, isClosed: true } as any);
    d += step;
  }
  return { segments: segs, extra };
});

registerDecoration("text", (segs, opts, raw) => {
  const txt = raw.get("text") ?? raw.get("text along path") ?? "Text along path";
  const tot = totalLength(segs);
  const extra: DisplayItem[] = [];
  const n = txt.length || 10;
  for (let i = 0; i < n; i++) {
    const frac = n === 1 ? 0.5 : i / (n - 1);
    const dist = opts.preLength + frac * (tot - opts.preLength - opts.postLength);
    const { point } = pointAtDistance(segs, dist);
    const p = point.add(pointNormal(segs, dist).normal.scale(opts.raise));
    extra.push({ kind: "text", text: txt[i], at: p, font: "8pt sans-serif", color: "#000", align: "center", baseline: "middle" } as any);
  }
  return { segments: segs, extra };
});
registerDecoration("text along path", (segs, opts, raw) => {
  const g = getDecoration("text")!;
  return g(segs, opts, raw);
});

registerDecoration("footprints", (segs, opts) => {
  const tot = totalLength(segs);
  const step = opts.segmentLength || 12;
  const extra: DisplayItem[] = [];
  let d = opts.preLength;
  let toggle = 1;
  while (d <= tot - opts.postLength) {
    const { point, tangent, normal } = pointNormal(segs, d);
    const off = normal.scale(toggle * ((opts.amplitude || 3) + opts.raise));
    const p = point.add(off);
    // small ellipse foot
    const segs2: PathSegment[] = [{ kind: "moveTo", to: p.add(new Vec2(2, 1)) }, { kind: "lineTo", to: p.add(new Vec2(-2, 1)) }, { kind: "lineTo", to: p.add(new Vec2(-2, -1)) }, { kind: "lineTo", to: p.add(new Vec2(2, -1)) }, { kind: "close" }];
    extra.push({ kind: "path", segments: segs2, stroke: null, fill: { color: "#444", opacity: 1, rule: "nonzero" }, isClosed: true } as any);
    void tangent;
    toggle *= -1;
    d += step;
  }
  return { segments: segs, extra };
});

function kochSegments(segs: PathSegment[], depth: number): PathSegment[] {
  // only handles straight segments for fractals; approximate by converting to points then subdividing lines
  const pts: Vec2[] = [];
  // sample path as polyline
  const tot = totalLength(segs);
  const n = 20;
  for (let i = 0; i <= n; i++) pts.push(pointAtFraction(segs, i / n).point);
  let poly = pts;
  for (let dep = 0; dep < depth; dep++) {
    const next: Vec2[] = [];
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i], b = poly[i + 1];
      const v = b.sub(a);
      const p1 = a.add(v.scale(1 / 3));
      const p3 = a.add(v.scale(2 / 3));
      const mid = p1.add(v.scale(1 / 3).rotate(Math.PI / 3));
      next.push(a, p1, mid, p3);
    }
    next.push(poly[poly.length - 1]);
    poly = next;
  }
  return makePathFromPoints(poly);
}
registerDecoration("koch curve", (segs) => ({ segments: kochSegments(segs, 2), extra: [] }));
registerDecoration("koch snowflake", (segs) => ({ segments: kochSegments(segs, 2), extra: [] }));
registerDecoration("cantor set", (segs) => {
  // cantor: show gaps
  const tot = totalLength(segs);
  const pts: Vec2[] = [];
  for (let i = 0; i < 9; i++) {
    const f1 = i / 9, f2 = (i + 0.66) / 9;
    if (i % 3 === 1) continue;
    pts.push(pointAtFraction(segs, f1).point);
    pts.push(pointAtFraction(segs, f2).point);
  }
  const out: PathSegment[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    out.push({ kind: "moveTo", to: pts[i] });
    out.push({ kind: "lineTo", to: pts[i + 1] });
  }
  void tot;
  return { segments: out, extra: [] };
});

// alias fractals
registerDecoration("fractals", (segs) => ({ segments: kochSegments(segs, 1), extra: [] }));

