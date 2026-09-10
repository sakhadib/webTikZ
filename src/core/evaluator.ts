import { Vec2 } from "../geometry/vec2.ts";
import { BBox } from "../geometry/bbox.ts";
import { Affine } from "../geometry/affine.ts";
import { toPt, PT_PER_CM, PT_PER_MM, PT_PER_IN } from "../geometry/units.ts";
import { KAPPA } from "../geometry/bezier.ts";
import type { DisplayList, DisplayItem, PathSegment, StrokeStyle, FillStyle } from "../render/displayList.ts";
import { computePathBBox, DEFAULT_STROKE, DEFAULT_FILL } from "../render/displayList.ts";
import { BASE_COLORS, resolveColor, LINE_WIDTH_PRESETS, resolveDash, HELP_LINES, defineColor, colorLet } from "../color/index.ts";
import { evalMath } from "../math/index.ts";
import { getKeySystem, handleTikzSet } from "../keys/index.ts";
import type { ParseResult, Coordinate, PathOp, Option, Picture, ForeachStatement } from "../parser/index.ts";
import { parse as parseSnippet } from "../parser/index.ts";

export interface EvalOptions { scale?: number; }
export interface EvalError { message: string; line: number; column: number; pos: number; severity: "error" | "warning"; codeFrame?: string; }

export function evaluate(parsed: ParseResult, _opts: EvalOptions = {}): { displayList: DisplayList; errors: EvalError[] } {
  const errors: EvalError[] = parsed.errors.map(e => ({ ...e, severity: "error" as const }));
  const items: DisplayItem[] = [];
  let overall = new BBox();
  const nodes: Record<string, { center: Vec2; bbox: BBox }> = {};

  const named = new Map<string, Vec2>();
  const macros = new Map<string, string>();
  // Fresh KeySystem per compile to avoid cross-test pollution, but preserve base styles
  // For now, we keep singleton but ensure every picture styles from previous compiles don't leak
  // We snapshot and restore after evaluate
  const ks = getKeySystem();
  const ksSnapshot = new Map((ks as any).styles as Map<string, string[]>);
  const snapshotStore = new Map((ks as any).store as Map<string, any>);

  for (const pic of parsed.pictures) {
    // Apply picture-level options (transforms) — every picture styles are applied at path level via withEveryStyles, not here
    const picTransform = applyTransforms(Affine.IDENTITY, pic.options, errors, named, macros);
    const picRes = evaluatePicture(pic, named, macros, picTransform, Affine.IDENTITY, errors);
    for (const it of picRes.items) {
      items.push(it);
      if (it.kind === "path") overall.addBBox(computePathBBox(it.segments, it.stroke?.widthPt ?? 0));
      else if (it.kind === "group") {
        // For groups, compute bbox as union of children
        let gb = new BBox();
        const collect = (g: DisplayItem) => {
          if (g.kind === "path") gb.addBBox(computePathBBox(g.segments, g.stroke?.widthPt ?? 0));
          else if (g.kind === "group") (g as any).children.forEach(collect);
        };
        (it as any).children.forEach(collect);
        overall.addBBox(gb);
        if ((it as any).clipPath) {
          // clipPath itself contributes to bbox? In TikZ clip affects bbox unless overlay
        }
      }
    }
    Object.assign(nodes, picRes.nodes);
  }

  if (items.length === 0 && parsed.tokens.length > 0 && parsed.pictures.length === 0) {
    // keep empty
  }

  for (const [k, v] of named) {
    if (!nodes[k]) nodes[k] = { center: v, bbox: BBox.fromPoints([v]) };
  }

  if (overall.isEmpty && items.length === 0) {
    // keep empty
  }

  // Restore KeySystem to snapshot to avoid cross-compile pollution (for tests)
  try {
    (ks as any).styles = ksSnapshot;
    (ks as any).store = snapshotStore;
  } catch {}

  return { displayList: { items, bbox: overall, nodes }, errors };
}

function evaluatePicture(
  pic: Picture,
  globalNamed: Map<string, Vec2>,
  globalMacros: Map<string, string>,
  parentTransform: Affine,
  parentCanvasTransform: Affine,
  errors: EvalError[],
): { items: DisplayItem[]; nodes: Record<string, { center: Vec2; bbox: BBox }> } {
  const items: DisplayItem[] = [];
  const nodes: Record<string, { center: Vec2; bbox: BBox }> = {};
  const localNamed = new Map(globalNamed);
  const localMacros = new Map(globalMacros);
  // Transform stacks
  let curTransform = parentTransform;
  let curCanvasTransform = parentCanvasTransform;
  const ks = getKeySystem();

  // Helper to evaluate a single body item with current transforms
  const evalBodyItem = (stmt: import("../parser/index.ts").PictureBodyItem, transform: Affine, canvasTransform: Affine) => {
    if (stmt.kind === "coordinate") {
      const atRaw = stmt.at ? resolveCoord(stmt.at, localNamed, errors, new Vec2(0, 0), transform, localMacros) : new Vec2(0, 0);
      if (atRaw) {
        // Apply transform? Named coordinates are stored in transformed space
        const at = atRaw; // already transformed via resolveCoord
        localNamed.set(stmt.name, at);
        globalNamed.set(stmt.name, at);
        nodes[stmt.name] = { center: at, bbox: BBox.fromPoints([at]) };
      }
    } else if (stmt.kind === "path") {
      // Expand options via keys including every picture/path
      const expandedOpts = ks.withEveryStyles(stmt.options, "path");
      // Separate transform options from style options
      const { transform: newTransform, canvasTransform: newCanvasTransform, remainingOpts } = extractTransforms(transform, canvasTransform, expandedOpts, errors, localNamed, localMacros);
      const res = evaluatePath({ ...stmt, options: remainingOpts }, localNamed, localMacros, newTransform, newCanvasTransform, errors);
      if (res) {
        items.push(res.item);
        for (const ex of res.extra) items.push(ex);
      }
    } else if (stmt.kind === "scope") {
      // Scope: new transform from scope options, and recursive body
      const expandedScopeOpts = ks.withEveryStyles(stmt.options, "scope");
      const { transform: scopeTransform, canvasTransform: scopeCanvasTransform, remainingOpts: _rem } = extractTransforms(transform, canvasTransform, expandedScopeOpts, errors, localNamed, localMacros);
      void _rem;
      // Also handle that scope may have its own style expansions for its children via inheritance — we pass transforms
      // Evaluate scope body with new transforms
      const scopeItems: DisplayItem[] = [];
      const scopeNodes: Record<string, { center: Vec2; bbox: BBox }> = {};
      // Temporarily swap cur transforms for scope body evaluation
      const prevTransform = curTransform;
      const prevCanvas = curCanvasTransform;
      curTransform = scopeTransform;
      curCanvasTransform = scopeCanvasTransform;
      for (const inner of stmt.body) {
        if (inner.kind === "scope") {
          // Nested scope — recurse via evalBodyItem with updated transforms
          evalBodyItem(inner, curTransform, curCanvasTransform);
        } else {
          // For other items, we need to evaluate with scope transform
          // We inline similar logic but with scope's transform
          if (inner.kind === "coordinate") {
            const at = inner.at ? resolveCoord(inner.at, localNamed, errors, new Vec2(0, 0), curTransform, localMacros) : new Vec2(0, 0);
            if (at) {
              localNamed.set(inner.name, at);
              globalNamed.set(inner.name, at);
              nodes[inner.name] = { center: at, bbox: BBox.fromPoints([at]) };
              scopeNodes[inner.name] = { center: at, bbox: BBox.fromPoints([at]) };
            }
          } else if (inner.kind === "path") {
            const expOpts = ks.withEveryStyles(inner.options, "path");
            const { transform: nt, canvasTransform: nct, remainingOpts } = extractTransforms(curTransform, curCanvasTransform, expOpts, errors, localNamed, localMacros);
            const res = evaluatePath({ ...inner, options: remainingOpts }, localNamed, localMacros, nt, nct, errors);
            if (res) { scopeItems.push(res.item); for (const ex of res.extra) scopeItems.push(ex); }
          } else if (inner.kind === "tikzset") {
            const { handleTikzSet } = require("../keys/index.ts");
            handleTikzSet(inner.arg, inner.loc);
          } else if (inner.kind === "definecolor") {
            defineColor(inner.name, inner.model, inner.value);
          } else if (inner.kind === "colorlet") {
            colorLet(inner.name, inner.value);
          } else if (inner.kind === "def") {
            localMacros.set(inner.name, inner.body);
            globalMacros.set(inner.name, inner.body);
          } else if (inner.kind === "let") {
            const val = localMacros.get(inner.value) ?? inner.value;
            localMacros.set(inner.name, val);
            globalMacros.set(inner.name, val);
          } else if (inner.kind === "pgfmathsetmacro") {
            const isTrunc = inner.expr.endsWith("|trunc");
            const expr = isTrunc ? inner.expr.slice(0, -6) : inner.expr;
            const val = evalMath(expr, { vars: localNamed as any, macros: localMacros });
            const numStr = isTrunc ? String(Math.trunc(val)) : String(val);
            const varName = inner.name.replace(/^\\/, "");
            // Store both with backslash and without
            localMacros.set("\\" + varName, numStr);
            localMacros.set(varName, numStr);
            globalMacros.set("\\" + varName, numStr);
            globalMacros.set(varName, numStr);
          } else if (inner.kind === "foreach") {
            const foreachItems = evaluateForeach(inner, localNamed, localMacros, curTransform, curCanvasTransform, errors);
            for (const fi of foreachItems) scopeItems.push(fi);
          }
        }
      }
      // Restore
      curTransform = prevTransform;
      curCanvasTransform = prevCanvas;
      // If scope had clip option, wrap its items in a group with clipPath
      const hasClip = stmt.options.some(o => o.key.toLowerCase() === "clip" || o.raw.toLowerCase() === "clip");
      if (hasClip && scopeItems.length > 0) {
        // Use first path's segments as clip path? In TikZ, \begin{scope}[clip] then path defines clip
        // For simplicity, if scope has clip, we treat its first path as clipPath and remaining as content
        // Simpler: wrap all scope items in a group with clipPath of the first item's segments
        // For now, just wrap without clip (since we don't have separate clip path)
        // We'll create a group
        const group: DisplayItem = { kind: "group", children: scopeItems, opacity: 1, clipPath: undefined };
        // Try to extract clip path from first item if it was a path intended as clip
        // In TikZ, clip is often \clip (0,0) rectangle (1,1); inside scope, but our scope clip option means all content clipped to scope's path?
        // For Phase2, we handle both: if scope has clip option and contains a path, use that path as clip
        items.push(group);
      } else {
        // Push scope items directly (flatten) — or as group without clip for transform isolation
        // For transform isolation, we already applied transform via coordinate transform, so flatten is fine
        for (const si of scopeItems) items.push(si);
        Object.assign(nodes, scopeNodes);
      }
    } else if (stmt.kind === "tikzset") {
      handleTikzSet(stmt.arg, stmt.loc);
    } else if (stmt.kind === "definecolor") {
      defineColor(stmt.name, stmt.model, stmt.value);
    } else if (stmt.kind === "colorlet") {
      colorLet(stmt.name, stmt.value);
    } else if (stmt.kind === "def") {
      localMacros.set(stmt.name, stmt.body);
      globalMacros.set(stmt.name, stmt.body);
    } else if (stmt.kind === "let") {
      const val = localMacros.get(stmt.value) ?? stmt.value;
      localMacros.set(stmt.name, val);
      globalMacros.set(stmt.name, val);
    } else if (stmt.kind === "pgfmathsetmacro") {
      const isTrunc = stmt.expr.endsWith("|trunc");
      const expr = isTrunc ? stmt.expr.slice(0, -6) : stmt.expr;
      const val = evalMath(expr, { vars: localNamed as any, macros: localMacros });
      const numStr = isTrunc ? String(Math.trunc(val)) : String(val);
      const varName = stmt.name.replace(/^\\/, "");
      localMacros.set("\\" + varName, numStr);
      localMacros.set(varName, numStr);
      globalMacros.set("\\" + varName, numStr);
      globalMacros.set(varName, numStr);
    } else if (stmt.kind === "foreach") {
      const foreachItems = evaluateForeach(stmt, localNamed, localMacros, transform, canvasTransform, errors);
      for (const fi of foreachItems) items.push(fi);
    }
  };

  for (const stmt of pic.body) {
    evalBodyItem(stmt, curTransform, curCanvasTransform);
  }

  return { items, nodes };
}

// ---- Transforms helpers Phase 2 ----
function applyTransforms(base: Affine, options: Option[], errors: EvalError[], _named: Map<string, Vec2>, macros: Map<string, string>): Affine {
  let tr = base;
  for (const opt of options) {
    const k = opt.key.trim().toLowerCase();
    const v = (opt.value ?? "").trim();
    try {
      if (k === "shift" && v) {
        // shift={(1,2)} or shift={(1cm,2cm)} — value may be like "(1,2)"
        const coord = parseCoordFromString(v, macros);
        if (coord) tr = tr.multiply(Affine.translation(coord.x, coord.y));
      } else if (k === "xshift" && v) {
        const dx = evaluateDimensionString(v, macros);
        tr = tr.multiply(Affine.translation(dx, 0));
      } else if (k === "yshift" && v) {
        const dy = evaluateDimensionString(v, macros);
        tr = tr.multiply(Affine.translation(0, dy));
      } else if (k === "scale" && v) {
        const s = evalMath(v, { macros });
        tr = tr.multiply(Affine.scaling(s));
      } else if (k === "xscale" && v) {
        const sx = evalMath(v, { macros });
        tr = tr.multiply(Affine.scaling(sx, 1));
      } else if (k === "yscale" && v) {
        const sy = evalMath(v, { macros });
        tr = tr.multiply(Affine.scaling(1, sy));
      } else if (k === "rotate" && v) {
        const ang = evalMath(v, { macros });
        tr = tr.multiply(Affine.rotation(ang));
      } else if (k === "rotate around" && v) {
        // value like "{45:(1,1)}" or "45:(1,1)"
        const m = v.match(/\{?\s*([^:]+)\s*:\s*\(?\s*([^,]+)\s*,\s*([^\)]+)\s*\)?\s*\}?/);
        if (m) {
          const ang = evalMath(m[1].trim(), { macros });
          const cx = evaluateDimensionString(m[2].trim(), macros);
          const cy = evaluateDimensionString(m[3].trim(), macros);
          tr = tr.multiply(Affine.translation(cx, cy)).multiply(Affine.rotation(ang)).multiply(Affine.translation(-cx, -cy));
        } else {
          const ang = evalMath(v, { macros });
          tr = tr.multiply(Affine.rotation(ang));
        }
      } else if ((k === "xslant" || k === "yslant") && v) {
        const s = evalMath(v, { macros });
        if (k === "xslant") tr = tr.multiply(new Affine(1, 0, s, 1, 0, 0));
        else tr = tr.multiply(new Affine(1, s, 0, 1, 0, 0));
      } else if (k === "cm" && v) {
        // cm={a,b,c,d,e,f}
        const nums = v.replace(/[{}]/g, "").split(",").map(s => evalMath(s.trim(), { macros }));
        if (nums.length === 6 && nums.every(n => !isNaN(n))) {
          const [a, b, c, d, e, f] = nums;
          tr = tr.multiply(new Affine(a, b, c, d, e, f));
        }
      } else if (k === "x" && v) {
        // x={(1cm,0)} defines x vector — for Phase2, treat as scaling/rotation of x basis
        // Simplify: if v is like "(1cm,0)", parse as Vec2 and set scaling accordingly
        const vec = parseCoordFromString(v, macros);
        if (vec) {
          // x vector length affects x scaling: we can incorporate as scaling + shear?
          // For now, apply scaling by vec length / PT_PER_CM
          const len = Math.hypot(vec.x, vec.y);
          const scale = len / PT_PER_CM;
          tr = tr.multiply(Affine.scaling(scale, 1));
        }
      } else if (k === "y" && v) {
        const vec = parseCoordFromString(v, macros);
        if (vec) {
          const len = Math.hypot(vec.x, vec.y);
          const scale = len / PT_PER_CM;
          tr = tr.multiply(Affine.scaling(1, scale));
        }
      }
    } catch (e) {
      errors.push({ message: `Transform ${k}: ${String((e as Error).message)}`, line: opt.loc.line, column: opt.loc.column, pos: opt.loc.pos, severity: "warning" });
    }
  }
  return tr;
}

function extractTransforms(
  base: Affine,
  canvasBase: Affine,
  options: Option[],
  errors: EvalError[],
  named: Map<string, Vec2>,
  macros: Map<string, string>,
): { transform: Affine; canvasTransform: Affine; remainingOpts: Option[] } {
  const transformKeys = new Set(["shift", "xshift", "yshift", "scale", "xscale", "yscale", "rotate", "rotate around", "xslant", "yslant", "cm", "x", "y", "transform canvas"]);
  const remaining: Option[] = [];
  let t = base;
  let ct = canvasBase;
  for (const o of options) {
    const k = o.key.trim().toLowerCase();
    if (transformKeys.has(k)) {
      // Separate canvas transform
      if (k === "transform canvas") {
        // value may be like "{scale=2}" — parse inner options
        const inner = (o.value ?? "").replace(/^\{/, "").replace(/\}$/, "");
        // Simple: if inner contains scale/rotate etc, apply to canvasTransform
        // For now, treat transform canvas as same as normal but on canvasTransform
        const dummyOpts: Option[] = [{ raw: inner, key: inner.split("=")[0]?.trim() ?? inner, value: inner.split("=")[1]?.trim(), loc: o.loc }];
        ct = applyTransforms(ct, dummyOpts, errors, named, macros);
      } else {
        t = applyTransforms(t, [o], errors, named, macros);
      }
    } else {
      remaining.push(o);
    }
  }
  return { transform: t, canvasTransform: ct, remainingOpts: remaining };
}

function parseCoordFromString(s: string, macros: Map<string, string>): Vec2 | null {
  let str = s.trim();
  // Substitute macros like \x
  for (const [k, v] of macros.entries()) {
    const key = k.replace(/^\\/, "");
    str = str.replace(new RegExp("\\\\" + key + "\\b", "g"), v);
    str = str.replace(new RegExp("\\b" + key + "\\b", "g"), v);
  }
  // Remove outer braces/parens
  str = str.replace(/^\{/, "").replace(/\}$/, "").trim();
  str = str.replace(/^\(/, "").replace(/\)$/, "").trim();
  if (str.includes(",")) {
    const parts = str.split(",").map(p => p.trim());
    try {
      const x = evaluateDimensionString(parts[0], macros);
      const y = evaluateDimensionString(parts[1] ?? "0", macros);
      return new Vec2(x, y);
    } catch { return null; }
  }
  try {
    const x = evaluateDimensionString(str, macros);
    return new Vec2(x, 0);
  } catch { return null; }
}

function evaluateDimensionString(s: string, macros: Map<string, string>): number {
  let str = s.trim();
  // Replace macros
  for (const [k, v] of macros.entries()) {
    const key = k.replace(/^\\/, "");
    str = str.replace(new RegExp("\\\\" + key + "\\b", "g"), v);
  }
  const hasExplicitUnit = /[0-9]\s*(pt|bp|mm|cm|in|pc|em|ex|px)\b/i.test(str);
  // If str is wrapped in {} evaluate as math
  if (str.startsWith("{") && str.endsWith("}")) {
    const res = evalMath(str, { macros });
    // If original had no explicit unit, treat as unitless cm
    if (!hasExplicitUnit) return res * PT_PER_CM;
    return res;
  }
  // If str contains math operators or functions, evaluate via evalMath
  if (/[+\-*/^()]/.test(str) || /sin|cos|tan|sqrt|veclen|atan2|min|max|ifthenelse|pi|e|mod|rand/i.test(str)) {
    try {
      const res = evalMath(str, { macros });
      if (!hasExplicitUnit) {
        // Check if eval result came from pure numbers (no unit) — treat as cm if no unit in original
        // If original had no unit letters at all (except function names), treat as cm
        // We already checked hasExplicitUnit, so if false, convert
        return res * PT_PER_CM;
      }
      return res;
    } catch {}
  }
  // Fallback to dimension parser (handles unitless -> cm)
  return parseDimension(str);
}

// ---- Foreach helpers Phase 2 ----
function expandForeachList(list: string): string[][] {
  // list like "1,2,...,5" or "1/2, 3/4" — returns array of entries each as string[] per var
  // Step 1: split by commas at depth 0
  const entries: string[] = [];
  let buf = ""; let depth = 0;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (ch === "{" || ch === "(" ) depth++;
    else if (ch === "}" || ch === ")" ) depth--;
    if (ch === "," && depth === 0) { entries.push(buf.trim()); buf = ""; }
    else buf += ch;
  }
  if (buf.trim()) entries.push(buf.trim());
  // Handle ... ranges
  const out: string[] = [];
  let i = 0;
  while (i < entries.length) {
    const cur = entries[i];
    if (cur === "..." || cur === "\\dots" || cur.includes("...")) {
      // This entry is the dots marker — need previous two values and next value to generate range
      // For "1,2,...,5": entries = ["1","2","...","5"] => when we hit "...", prev1=1, prev2=2, next=5 => step=1
      // For "1,...,5": entries = ["1","...","5"] => step=1
      // For "1,3,...,11": entries = ["1","3","...","11"] => step=2
      const next = entries[i + 1];
      if (!next) { i++; continue; }
      // Determine step
      let step = 1;
      let startVal = 0;
      if (out.length >= 2) {
        const a = parseFloat(out[out.length - 2]);
        const b = parseFloat(out[out.length - 1]);
        if (!isNaN(a) && !isNaN(b)) step = b - a;
        startVal = b;
      } else if (out.length === 1) {
        const a = parseFloat(out[out.length - 1]);
        const b = parseFloat(next);
        if (!isNaN(a) && !isNaN(b)) {
          // If only one prev, step is 1 or -1 based on direction
          step = a < b ? 1 : -1;
          startVal = a;
        }
      }
      const endVal = parseFloat(next);
      if (!isNaN(startVal) && !isNaN(endVal)) {
        let curVal = startVal + step;
        // Avoid infinite
        let iter = 0;
        while (step > 0 ? curVal < endVal : curVal > endVal) {
          out.push(String(curVal));
          curVal += step;
          if (++iter > 10000) break;
        }
        out.push(next);
      } else {
        out.push(next);
      }
      i += 2;
    } else if (cur.includes("...")) {
      // Handle "1,...,5" where ... is attached like "1,...,5" split incorrectly?
      // This would be entries with "..." inside string
      // For simplicity, skip
      i++;
    } else {
      out.push(cur);
      i++;
    }
  }
  // Now out is flat list of entries like ["1","2","3","4","5"]
  // For multiple vars, each entry may be "1/2"
  return out.map(e => e.split("/").map(s => s.trim()));
}

function evaluateForeach(
  stmt: ForeachStatement,
  named: Map<string, Vec2>,
  macros: Map<string, string>,
  transform: Affine,
  canvasTransform: Affine,
  errors: EvalError[],
): DisplayItem[] {
  const ks = getKeySystem();
  const items: DisplayItem[] = [];
  // Parse options for evaluate/count/remember
  const optMap = new Map<string, string>();
  if (stmt.options) {
    // split by commas respecting braces
    const parts = stmt.options.split(",").map(s => s.trim()).filter(Boolean);
    for (const p of parts) {
      const eq = p.indexOf("=");
      if (eq !== -1) optMap.set(p.slice(0, eq).trim().toLowerCase(), p.slice(eq + 1).trim());
      else optMap.set(p.trim().toLowerCase(), "true");
    }
  }
  const countVar = (() => {
    for (const [k, v] of optMap.entries()) if (k.startsWith("count")) return v.replace(/^\\/, "");
    return null;
  })();
  const rememberEntries: { varName: string; asName: string; initial: string }[] = [];
  for (const [k, v] of optMap.entries()) {
    if (k.startsWith("remember")) {
      // remember=\x as \prev initially 0
      // v is like "\x as \prev initially 0"
      const m = v.match(/(\\\w+)\s+as\s+(\\\w+)(?:\s+initially\s+(.+))?/i);
      if (m) rememberEntries.push({ varName: m[1].replace(/^\\/, ""), asName: m[2].replace(/^\\/, ""), initial: m[3]?.trim() ?? "0" });
    }
  }
  const evaluateEntries: { target: string; expr: string }[] = [];
  for (const [k, v] of optMap.entries()) {
    if (k.startsWith("evaluate")) {
      // evaluate=\x as \y using \x*2
      const m = v.match(/(\\\w+)\s+as\s+(\\\w+)\s+using\s+(.+)/i);
      if (m) evaluateEntries.push({ target: m[2].replace(/^\\/, ""), expr: m[3] });
      else {
        // evaluate=\x using \x*2  (same var)
        const m2 = v.match(/(\\\w+)\s+using\s+(.+)/i);
        if (m2) evaluateEntries.push({ target: m2[1].replace(/^\\/, ""), expr: m2[2] });
      }
    }
  }
  const expanded = expandForeachList(stmt.list);
  // vars are like ["\\x"] or ["\\x","\\y"]
  const varNames = stmt.vars.map(v => v.replace(/^\\/, ""));
  // remember state
  const rememberState = new Map<string, string>();
  for (const r of rememberEntries) rememberState.set(r.asName, r.initial);

  let count = 0;
  for (const entry of expanded) {
    count++;
    // Build per-iteration macro map
    const iterMacros = new Map(macros);
    // Assign vars
    for (let vi = 0; vi < varNames.length; vi++) {
      const val = entry[vi] ?? entry[0];
      iterMacros.set(varNames[vi], val);
      iterMacros.set("\\" + varNames[vi], val);
    }
    // count
    if (countVar) {
      iterMacros.set(countVar, String(count));
      iterMacros.set("\\" + countVar, String(count));
    }
    // evaluate
    for (const ev of evaluateEntries) {
      try {
        const res = evalMath(ev.expr, { macros: iterMacros });
        iterMacros.set(ev.target, String(res));
        iterMacros.set("\\" + ev.target, String(res));
      } catch {}
    }
    // remember: need to set asName to previous value before updating
    // For this iteration, the "remember" variable holds previous iteration's var
    // So set it now from rememberState, then after iteration update rememberState to current var
    for (const r of rememberEntries) {
      const curVal = iterMacros.get(r.varName) ?? "";
      iterMacros.set(r.asName, rememberState.get(r.asName) ?? r.initial);
      iterMacros.set("\\" + r.asName, rememberState.get(r.asName) ?? r.initial);
      // update for next iter
      rememberState.set(r.asName, curVal);
    }

    // Parse body: stmt.body is raw string like "\draw (\x,0) -- (\x,1);"
    // Substitute macros in body before parsing
    // For simplicity, we do string replacement for each macro in iterMacros
    let bodyStr = stmt.body;
    if (!bodyStr) {
      // For foreach inside path, body may be empty and list expansion should generate path ops directly?
      // Not handled here
      continue;
    }
    // Replace macros: longest first to avoid partial
    const sortedKeys = Array.from(iterMacros.keys()).sort((a, b) => b.length - a.length);
    for (const k of sortedKeys) {
      const v = iterMacros.get(k)!;
      // Replace \key and key
      const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Replace backslash version
      bodyStr = bodyStr.replace(new RegExp("\\\\" + k.replace(/^\\/, "") + "\\b", "g"), v);
      // Also replace bare var if it appears as word? For safety, replace ${k}
    }
    // Also need to handle parse=true: if option parse=true, then \x should be re-parsed? Already done via string replacement

    // Parse bodyStr as snippet
    const sub = parseSnippet(bodyStr);
    for (const pic of sub.pictures) {
      for (const inner of pic.body) {
        // inner may be path etc — evaluate it with current transforms and iterMacros
        if (inner.kind === "path") {
          const expOpts = ks.expandOptions(inner.options);
          const { transform: nt, canvasTransform: nct, remainingOpts } = extractTransforms(transform, canvasTransform, expOpts, errors, named, iterMacros);
          const res = evaluatePath({ ...inner, options: remainingOpts }, named, iterMacros, nt, nct, errors);
          if (res) { items.push(res.item); for (const ex of res.extra) items.push(ex); }
        } else if (inner.kind === "scope") {
          // Evaluate scope with iterMacros
          // For simplicity, create a temporary picture evaluation
          const tmpPic = { kind: "picture" as const, options: [], body: [inner], loc: inner.loc };
          const subRes = evaluatePicture(tmpPic, named, iterMacros, transform, canvasTransform, errors);
          for (const si of subRes.items) items.push(si);
        } else if (inner.kind === "foreach") {
          // Nested foreach
          const nested = evaluateForeach(inner as any, named, iterMacros, transform, canvasTransform, errors);
          for (const ni of nested) items.push(ni);
        } else if (inner.kind === "coordinate") {
          const at = inner.at ? resolveCoord(inner.at, named, errors, new Vec2(0, 0), transform, iterMacros) : new Vec2(0, 0);
          if (at) {
            named.set(inner.name, at);
            // nodes not needed for foreach items, but could track
          }
        }
      }
    }
  }
  return items;
}

function evaluatePath(
  stmt: import("../parser/index.ts").PathStatement,
  named: Map<string, Vec2>,
  macros: Map<string, string>,
  transform: Affine,
  _canvasTransform: Affine,
  errors: EvalError[],
): { item: DisplayItem; extra: DisplayItem[] } | null {
  // For Phase2, style expansion via keys already done by caller, but also handle remaining Phase2 stroke options here via resolveOptions
  const style = resolveOptions(stmt.options, stmt.action, errors);
  const segments: PathSegment[] = [];
  let current = new Vec2(0, 0);
  let startOfPath: Vec2 | null = null;
  let hasMove = false;
  let lastMove: Vec2 | null = null;
  // Track rounded corners state — if present, we will post-process segments via applyRoundedCorners
  let roundedRadius: number | null = null;
  for (const o of stmt.options) {
    const k = o.key.trim().toLowerCase();
    if (k === "rounded corners" && !o.value) roundedRadius = 4; // default 4pt in TikZ
    else if (k === "rounded corners" && o.value) {
      try { roundedRadius = evaluateDimensionString(o.value, macros); } catch { roundedRadius = 4; }
    }
  }

  function resolveCoordFull(c: Coordinate, cur: Vec2): Vec2 | null {
    const v = resolveCoord(c, named, errors, cur, transform, macros);
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
    } else if (op.kind === "orthV") {
      const pt = resolveCoordFull(op.coord, current);
      if (!pt) continue;
      // |- : vertical then horizontal: (current.x, pt.y) then pt
      const mid = new Vec2(current.x, pt.y);
      segments.push({ kind: "lineTo", to: mid });
      segments.push({ kind: "lineTo", to: pt });
      current = pt;
    } else if (op.kind === "orthH") {
      const pt = resolveCoordFull(op.coord, current);
      if (!pt) continue;
      // -| : horizontal then vertical: (pt.x, current.y) then pt
      const mid = new Vec2(pt.x, current.y);
      segments.push({ kind: "lineTo", to: mid });
      segments.push({ kind: "lineTo", to: pt });
      current = pt;
    } else if (op.kind === "controls") {
      const c1 = resolveCoordFull(op.cp1, current);
      const c2 = op.cp2 ? resolveCoordFull(op.cp2, current) : c1;
      const to = resolveCoordFull(op.to, current);
      if (!c1 || !c2 || !to) continue;
      // For bezier, we already have current as start point; we need to ensure we have move if not
      if (!hasMove) {
        segments.push({ kind: "moveTo", to: current });
        hasMove = true;
        startOfPath = current;
      }
      segments.push({ kind: "curveTo", cp1: c1, cp2: c2!, to });
      current = to;
    } else if (op.kind === "arc") {
      if (!hasMove) { errors.push({ message: "arc without start", line: op.loc.line, column: op.loc.column, pos: op.loc.pos, severity: "error" }); continue; }
      // Determine radii and angles
      let startA = op.startAngle ? evalMath(op.startAngle, { macros }) : 0;
      let endA = op.endAngle ? evalMath(op.endAngle, { macros }) : 90;
      if (op.deltaAngle) {
        const delta = evalMath(op.deltaAngle, { macros });
        endA = startA + delta;
      }
      let rx = 1 * PT_PER_CM, ry = 1 * PT_PER_CM;
      if (op.radius) try { rx = evaluateDimensionString(op.radius, macros); ry = rx; } catch {}
      else if (op.xRadius) try { rx = evaluateDimensionString(op.xRadius, macros); } catch {}
      if (op.yRadius) try { ry = evaluateDimensionString(op.yRadius, macros); } catch {}
      else if (op.xRadius && !op.yRadius) ry = rx;
      // TikZ arc: start point is current; center is at current - vector(startA)*r
      // Compute center so that arc starts at current
      const startRad = (startA * Math.PI) / 180;
      const center = new Vec2(current.x - rx * Math.cos(startRad), current.y - ry * Math.sin(startRad));
      const segs = arcSegments(center, rx, ry, startA, endA);
      for (const s of segs) segments.push(s);
      // Update current to arc end point
      const endRad = (endA * Math.PI) / 180;
      current = new Vec2(center.x + rx * Math.cos(endRad), center.y + ry * Math.sin(endRad));
    } else if (op.kind === "ellipse") {
      if (!hasMove) { errors.push({ message: "ellipse without center", line: op.loc.line, column: op.loc.column, pos: op.loc.pos, severity: "error" }); continue; }
      const center = current;
      let rx = 1 * PT_PER_CM, ry = 0.5 * PT_PER_CM;
      try { rx = evaluateDimensionString(op.xRadius, macros); } catch {}
      try { ry = evaluateDimensionString(op.yRadius, macros); } catch {}
      const segs = ellipseSegments(center, rx, ry);
      for (const s of segs) segments.push(s);
      current = center;
    } else if (op.kind === "parabola") {
      const to = resolveCoordFull(op.to, current);
      if (!to) continue;
      if (!hasMove) { segments.push({ kind: "moveTo", to: current }); hasMove = true; startOfPath = current; }
      // Parabola from current to `to`, with bend point
      let bend: Vec2 | null = null;
      if (op.bend) bend = resolveCoordFull(op.bend, current);
      // If bend provided, split into two parabolas? For simplicity, if bend, use bend as control
      // Parabola is quadratic bezier; approximate with cubic: use bend as control
      if (bend) {
        // Two segments: current -> bend and bend -> to
        // Use quadratic to cubic conversion: for parabola y = a(x-h)^2 + k
        // Simplify: use curveTo with control at bend
        const mid = bend;
        // First half: current to bend
        const c1 = current.lerp(mid, 2/3);
        const c2 = mid;
        segments.push({ kind: "curveTo", cp1: c1, cp2: c2, to: mid });
        const c3 = mid;
        const c4 = mid.lerp(to, 1/3);
        segments.push({ kind: "curveTo", cp1: c3, cp2: c4, to });
      } else {
        // No bend: parabola bend at current? Use mid with y = max
        // Approximate with single cubic where control is midpoint lifted
        const mx = (current.x + to.x) / 2;
        const my = Math.max(current.y, to.y) + Math.abs(to.x - current.x) * 0.25;
        const cp = new Vec2(mx, my);
        segments.push({ kind: "curveTo", cp1: current.lerp(cp, 0.5), cp2: cp.lerp(to, 0.5), to });
      }
      current = to;
    } else if (op.kind === "sin") {
      const to = resolveCoordFull(op.to, current);
      if (!to) continue;
      // sin from current to `to`: y = sin(x) scaled
      // For simplicity, create a cubic that mimics sin
      const cp1 = new Vec2(current.x + (to.x - current.x) * 0.25, current.y);
      const cp2 = new Vec2(current.x + (to.x - current.x) * 0.75, to.y);
      segments.push({ kind: "curveTo", cp1, cp2, to });
      current = to;
    } else if (op.kind === "cos") {
      const to = resolveCoordFull(op.to, current);
      if (!to) continue;
      const cp1 = new Vec2(current.x + (to.x - current.x) * 0.25, current.y);
      const cp2 = new Vec2(current.x + (to.x - current.x) * 0.75, to.y);
      segments.push({ kind: "curveTo", cp1, cp2, to });
      current = to;
    } else if (op.kind === "to") {
      const to = resolveCoordFull(op.to, current);
      if (!to) continue;
      // Parse to options: bend left/right, out/in, looseness
      let bendAngle: number | null = null;
      let looseness = 1;
      let outAngle: number | null = null;
      let inAngle: number | null = null;
      let isRelative = false;
      for (const o of op.options) {
        const k = o.key.trim().toLowerCase();
        const v = (o.value ?? "").trim();
        if (k === "bend left" && !v) bendAngle = 30;
        else if (k === "bend left" && v) bendAngle = evalMath(v, { macros });
        else if (k === "bend right" && !v) bendAngle = -30;
        else if (k === "bend right" && v) bendAngle = -evalMath(v, { macros });
        else if (k === "looseness" && v) looseness = evalMath(v, { macros });
        else if (k === "out" && v) outAngle = evalMath(v, { macros });
        else if (k === "in" && v) inAngle = evalMath(v, { macros });
        else if (k === "relative" && v) isRelative = v.toLowerCase() === "true";
      }
      if (bendAngle !== null || outAngle !== null || inAngle !== null) {
        // Create a single cubic with bend
        const dx = to.x - current.x, dy = to.y - current.y;
        const dist = Math.hypot(dx, dy);
        const mid = new Vec2((current.x + to.x) / 2, (current.y + to.y) / 2);
        let angle = bendAngle ?? 0;
        if (outAngle !== null) angle = outAngle; // simplified
        const offset = (dist * 0.3 * looseness) * Math.sin((angle * Math.PI) / 180);
        // Compute perpendicular direction
        const perp = new Vec2(-dy, dx).norm().scale(offset);
        const cp = mid.add(perp);
        // For single bend, use cp as both controls (quadratic to cubic approx)
        segments.push({ kind: "curveTo", cp1: current.lerp(cp, 0.5), cp2: cp.lerp(to, 0.5), to });
      } else {
        segments.push({ kind: "lineTo", to });
      }
      current = to;
    } else if (op.kind === "cycle") {
      segments.push({ kind: "close" });
      if (startOfPath) current = startOfPath;
    }
  }

  // Apply rounded corners post-processing if needed
  let finalSegments = segments;
  if (roundedRadius !== null && roundedRadius > 0) {
    finalSegments = applyRoundedCorners(segments, roundedRadius);
  }

  if (finalSegments.length === 0) return null;

  const stroke = style.stroke;
  const fill = style.fill;
  const isClosed = finalSegments.some(s => s.kind === "close");
  // Handle clip: if action is clip or option clip present, create clip group
  const hasClip = stmt.action === "clip" || stmt.options.some(o => o.key.toLowerCase() === "clip");
  if (hasClip) {
    const clipPath = finalSegments.filter(s => s.kind !== "close" || true); // keep all
    const group: DisplayItem = { kind: "group", children: [], opacity: 1, clipPath };
    // For \clip, the path itself is not drawn, just clip
    return { item: group, extra: [] };
  }
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

  const item: DisplayItem = { kind: "path", segments: finalSegments, stroke: finalStroke, fill: finalFill, isClosed };

  // Arrow heads as extra filled triangles
  const extra: DisplayItem[] = [];
  if (style.arrowEnd && finalSegments.length >= 2) {
    const head = createArrowHead(finalSegments, false);
    if (head) extra.push(head);
  }
  if (style.arrowStart && finalSegments.length >= 2) {
    const head = createArrowHead(finalSegments, true);
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

    // Phase2: corners and strokes
    if (key === "line cap") {
      const v = (val ?? "").toLowerCase();
      if (["round", "butt", "rect", "square"].includes(v)) {
        ensureStroke().cap = v === "rect" || v === "square" ? "square" as any : v as any;
      }
      continue;
    }
    if (key === "line join") {
      const v = (val ?? "").toLowerCase();
      if (["miter", "round", "bevel"].includes(v)) ensureStroke().join = v as any;
      continue;
    }
    if (key === "miter limit" && val) {
      const n = parseFloat(val);
      if (!isNaN(n)) ensureStroke().miterLimit = n;
      continue;
    }
    if ((key === "dash phase" || key === "dash expand off") && val) {
      try { ensureStroke().dashPhasePt = evaluateDimensionString(val, new Map()); } catch {}
      continue;
    }
    if (key === "double" && !val) {
      // double: draw double line — for Phase2 we approximate by doubling width and setting inner white
      // Actual implementation uses two passes; here we just increase width slightly to hint
      const s = ensureStroke();
      (s as any)._double = true;
      continue;
    }
    if (key === "double distance" && val) {
      const d = evaluateDimensionString(val, new Map()) ?? 1;
      const s = ensureStroke();
      (s as any)._doubleDistance = d;
      continue;
    }
    if (key === "rounded corners" && !val) {
      // handled via segment post-processing in evaluatePath; mark via stroke prop
      ensureStroke().join = "round" as any;
      ensureStroke().cap = "round" as any;
      // Also store flag
      (ensureStroke() as any)._rounded = 4;
      continue;
    }
    if (key === "rounded corners" && val) {
      try {
        const r = evaluateDimensionString(val, new Map());
        (ensureStroke() as any)._rounded = r;
        ensureStroke().join = "round" as any;
      } catch {}
      continue;
    }
    if (key === "sharp corners") {
      (ensureStroke() as any)._rounded = null;
      continue;
    }

    // Phase2: Fill rules and opacity
    if (key === "even odd rule" || key === "evenoddrule") {
      ensureFill().rule = "evenodd";
      continue;
    }
    if (key === "nonzero rule") {
      ensureFill().rule = "nonzero";
      continue;
    }
    if (key === "opacity" && val) {
      const o = parseFloat(val);
      if (!isNaN(o)) { ensureStroke().opacity = o; ensureFill().opacity = o; }
      continue;
    }
    if (key === "draw opacity" && val) {
      const o = parseFloat(val);
      if (!isNaN(o)) ensureStroke().opacity = o;
      continue;
    }
    if (key === "fill opacity" && val) {
      const o = parseFloat(val);
      if (!isNaN(o)) ensureFill().opacity = o;
      continue;
    }
    if (key === "fill rule" && val) {
      const v = val.toLowerCase();
      if (v.includes("even")) ensureFill().rule = "evenodd";
      else ensureFill().rule = "nonzero";
      continue;
    }
    if (key === "text" && val) {
      // text= color for nodes — not needed for paths, but handle as fill/stroke for future
      const hex = resolveColor(val);
      if (hex) ensureFill().color = hex;
      continue;
    }
    // clip option handled at path level (creates clip group) — not here
    if (key === "clip" || key === "use as bounding box" || key === "overlay") {
      // Mark via fill/stroke special? Handled in evaluatePath
      continue;
    }

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
// Coordinate resolution — Phase2: handles transforms, macros, pgfmath, units

function resolveCoord(
  c: Coordinate,
  named: Map<string, Vec2>,
  errors: EvalError[],
  current: Vec2,
  transform: Affine = Affine.IDENTITY,
  macros: Map<string, string> = new Map(),
): Vec2 | null {
  let base: Vec2 | null = null;
  if (c.kind === "cartesian") {
    try {
      const x = evaluateDimensionString(c.x, macros);
      const y = evaluateDimensionString(c.y, macros);
      base = new Vec2(x, y);
    } catch (e) { errors.push({ message: String((e as Error).message), line: c.loc.line, column: c.loc.column, pos: c.loc.pos, severity: "warning" }); return null; }
  } else if (c.kind === "polar") {
    try {
      const angleDeg = evalMath(c.angle, { macros });
      const r = evaluateDimensionString(c.radius, macros);
      if (isNaN(angleDeg)) throw new Error(`Bad polar angle ${c.angle}`);
      const rad = (angleDeg * Math.PI) / 180;
      base = new Vec2(r * Math.cos(rad), r * Math.sin(rad));
    } catch (e) { errors.push({ message: String((e as Error).message), line: c.loc.line, column: c.loc.column, pos: c.loc.pos, severity: "warning" }); return null; }
  } else if (c.kind === "named") {
    const found = named.get(c.name);
    if (!found) {
      // Try to see if named is actually a math expression like "veclen(1,2)" — not a coordinate
      // For Phase2, try to evaluate as math if it looks like function
      if (/[()]/.test(c.name) || /[+\-*/]/.test(c.name)) {
        try {
          const v = evalMath(c.name, { macros });
          base = new Vec2(v, 0);
        } catch {
          errors.push({ message: `Unknown named coordinate '${c.name}'`, line: c.loc.line, column: c.loc.column, pos: c.loc.pos, severity: "warning" });
          base = new Vec2(0, 0);
        }
      } else {
        errors.push({ message: `Unknown named coordinate '${c.name}'`, line: c.loc.line, column: c.loc.column, pos: c.loc.pos, severity: "warning" });
        base = new Vec2(0, 0);
      }
    } else {
      base = found;
    }
  }
  if (!base) return null;
  let pt: Vec2;
  if (c.relative === "plus" || c.relative === "plusplus") {
    pt = current.add(base);
  } else {
    pt = base;
  }
  // Apply coordinate transform (not canvas transform)
  return transform.apply(pt);
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

function arcSegments(center: Vec2, rx: number, ry: number, startDeg: number, endDeg: number): PathSegment[] {
  const startRad = (startDeg * Math.PI) / 180;
  const endRad = (endDeg * Math.PI) / 180;
  let delta = endRad - startRad;
  // Normalize delta to [-2pi, 2pi] and handle wrap
  if (delta > Math.PI) { /* large arc? keep as is */ }
  if (delta < -Math.PI) { /* keep */ }
  // For Phase2, handle delta; if delta > 360, clamp
  // Split arc into max 90deg segments for cubic approx
  const segs: PathSegment[] = [];
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const step = delta / steps;
  let prev = new Vec2(center.x + rx * Math.cos(startRad), center.y + ry * Math.sin(startRad));
  // First segment should start with moveTo if this is a standalone arc (caller will have moveTo already? For arc op, current point is start of arc? In TikZ, arc starts at current point, which should be at start angle)
  // For our usage, arcSegments is called after we have current point; we generate curves from current to end
  // So we assume current is already at start point; we just need curves
  // But if current is not at start, we need to lineTo start?
  // We'll generate moveTo to start if needed outside; here just curves
  let angle = startRad;
  // If this is first arc segment, we should ensure we start from previous point; but we will generate curves starting from prev
  // Actually we will generate segments that include moveTo? For arc op, we already have a move at center? No, arc's current is at previous point which is start of arc.
  // The center is current (previous point) ??? In TikZ, arc center is at current point plus something? Wait: In TikZ, `\draw (0,0) arc [radius=1, start angle=0, end angle=90]` draws an arc starting at (0,0) (which is at angle 0 on the circle centered at (0,0)? Actually arc with center at current? Let's assume center is current plus offset? For simplicity, treat arc as centered at current.
  // But more accurate: arc's start point is current, and arc sweeps from start angle to end angle around a center that is at current + vector? However PGF's arc with start angle and end angle and radius draws arc with center at current plus something.
  // For Phase2, we simplify: arc centered at current, from startA to endA.
  for (let s = 0; s < steps; s++) {
    const a0 = angle;
    const a1 = angle + step;
    const p0 = new Vec2(center.x + rx * Math.cos(a0), center.y + ry * Math.sin(a0));
    const p1 = new Vec2(center.x + rx * Math.cos(a1), center.y + ry * Math.sin(a1));
    // Use standard cubic approximation for ellipse arc segment
    // For circle, KAPPA factor for 90deg is 0.5523, for smaller angles scale
    const half = step / 2;
    const k = (4 / 3) * Math.tan(half / 2);
    // For ellipse, need to scale
    const cp1 = new Vec2(p0.x - rx * Math.sin(a0) * k, p0.y + ry * Math.cos(a0) * k);
    const cp2 = new Vec2(p1.x + rx * Math.sin(a1) * k, p1.y - ry * Math.cos(a1) * k);
    // Actually for ellipse, need to adjust for rx,ry scaling: the above uses rx,ry incorrectly? For ellipse, the tangent scaling should be rx,ry separately
    // Correct: cp1 = p0 + (-rx*sin(a0)*k, ry*cos(a0)*k)
    // cp2 = p1 - (-rx*sin(a1)*k, ry*cos(a1)*k) ??? Let's use that
    const cp1e = new Vec2(p0.x - rx * Math.sin(a0) * k, p0.y + ry * Math.cos(a0) * k);
    const cp2e = new Vec2(p1.x + rx * Math.sin(a1) * k, p1.y - ry * Math.cos(a1) * k);
    if (s === 0) {
      // For first segment, we should not add moveTo; caller will have current at p0? But to ensure continuity, we lineTo p0 if needed?
      // If current is not at p0, we need to move? For arc, current should be at p0, so we just add curve
    }
    segs.push({ kind: "curveTo", cp1: cp1e, cp2: cp2e, to: p1 });
    angle = a1;
  }
  return segs;
}

function ellipseSegments(center: Vec2, rx: number, ry: number): PathSegment[] {
  const k = KAPPA;
  const e = center.add(new Vec2(rx, 0));
  const n = center.add(new Vec2(0, ry));
  const w = center.add(new Vec2(-rx, 0));
  const s = center.add(new Vec2(0, -ry));
  const kx = k * rx, ky = k * ry;
  return [
    { kind: "moveTo", to: e },
    { kind: "curveTo", cp1: e.add(new Vec2(0, ky)), cp2: n.add(new Vec2(kx, 0)), to: n },
    { kind: "curveTo", cp1: n.add(new Vec2(-kx, 0)), cp2: w.add(new Vec2(0, ky)), to: w },
    { kind: "curveTo", cp1: w.add(new Vec2(0, -ky)), cp2: s.add(new Vec2(-kx, 0)), to: s },
    { kind: "curveTo", cp1: s.add(new Vec2(kx, 0)), cp2: e.add(new Vec2(0, -ky)), to: e },
    { kind: "close" },
  ];
}

function applyRoundedCorners(segments: PathSegment[], radius: number): PathSegment[] {
  if (radius <= 0 || segments.length < 2) return segments;
  // Simplified: for each corner where two lineTo meet, inset by radius and add curve
  // For Phase2, we do minimal: replace sharp corners with a small curve if segments are lineTo-lineTo
  const out: PathSegment[] = [];
  for (let i = 0; i < segments.length; i++) {
    const cur = segments[i];
    if (cur.kind === "lineTo" && i > 0 && i < segments.length - 1) {
      const prev = segments[i - 1];
      const next = segments[i + 1];
      if ((prev.kind === "lineTo" || prev.kind === "moveTo") && (next.kind === "lineTo" || next.kind === "close")) {
        // Approximate rounded corner by inserting a curve
        // For simplicity, just keep line but will be rendered with join=round which already does rounded appearance via canvas lineJoin
        // So we don't need to modify geometry; the canvas stroke join will handle it
      }
    }
    out.push(cur);
  }
  return out;
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
