/**
 * Phase 2 keys system — pgfkeys-like, minimal but functional.
 * Supports: /tikz/*, .style, .append style, .default, .initial, .is choice (stub), .code (restricted to JS callbacks, not from TeX)
 * Also handles \tikzset and legacy \tikzstyle, and every picture/path/scope auto-styles.
 *
 * Usage:
 *   const ks = getKeySystem();
 *   ks.defineStyle("my style", "red, thick");
 *   ks.expandOptions([{raw:"my style", key:"my style"}]) -> [{key:"red"}, {key:"thick"}] etc.
 */
import type { Option } from "../parser/index.ts";

export interface KeyDef {
  path: string; // normalized, e.g. "/tikz/draw" or "my style"
  style?: string; // raw style body for .style
  append?: string[];
  initial?: string;
  defaultValue?: string;
  isChoice?: boolean;
  choices?: Set<string>;
  code?: (value: string) => void;
}

function normalizeKey(raw: string): string {
  let k = raw.trim();
  // strip leading /tikz/ or /pgf/ if present, keep as is for lookup fallback
  // For Phase 2 we store both normalized without leading slash and with /tikz/
  if (k.startsWith("/tikz/")) k = k.slice(6);
  if (k.startsWith("/pgf/")) k = k.slice(5);
  return k.toLowerCase();
}

export class KeySystem {
  private store = new Map<string, KeyDef>();
  private styles = new Map<string, string[]>(); // key -> array of raw style bodies

  setInitial(key: string, value: string): void {
    const n = normalizeKey(key);
    const d = this.store.get(n) ?? { path: n };
    d.initial = value;
    this.store.set(n, d);
  }
  setDefault(key: string, value: string): void {
    const n = normalizeKey(key);
    const d = this.store.get(n) ?? { path: n };
    d.defaultValue = value;
    this.store.set(n, d);
  }
  defineStyle(key: string, body: string): void {
    const n = normalizeKey(key);
    // body is like "red, thick" or "{red, thick}" — strip outer braces
    let b = body.trim();
    if (b.startsWith("{") && b.endsWith("}")) b = b.slice(1, -1);
    this.styles.set(n, [b]);
    const d = this.store.get(n) ?? { path: n };
    d.style = b;
    this.store.set(n, d);
  }
  appendStyle(key: string, body: string): void {
    const n = normalizeKey(key);
    let b = body.trim();
    if (b.startsWith("{") && b.endsWith("}")) b = b.slice(1, -1);
    const cur = this.styles.get(n) ?? [];
    cur.push(b);
    this.styles.set(n, cur);
    const d = this.store.get(n) ?? { path: n };
    d.append = cur;
    this.store.set(n, d);
  }
  defineChoice(key: string): void {
    const n = normalizeKey(key);
    const d = this.store.get(n) ?? { path: n };
    d.isChoice = true;
    d.choices = new Set();
    this.store.set(n, d);
  }

  /** Check if key is a known style */
  isStyle(key: string): boolean {
    return this.styles.has(normalizeKey(key));
  }
  getStyle(key: string): string | undefined {
    const parts = this.styles.get(normalizeKey(key));
    if (!parts) return undefined;
    return parts.join(", ");
  }

  /** Expand options, recursively expanding .style keys */
  expandOptions(options: Option[]): Option[] {
    const out: Option[] = [];
    const visited = new Set<string>();
    const expandOne = (opt: Option, depth: number) => {
      if (depth > 10) return; // prevent infinite recursion
      const keyNorm = normalizeKey(opt.key);
      // If opt has no value and key is a style, expand it
      if (!opt.value && this.isStyle(opt.key) && !visited.has(keyNorm)) {
        visited.add(keyNorm);
        const body = this.getStyle(opt.key)!;
        // Parse body into options (simple split by commas respecting braces/brackets)
        const inner = parseStyleBody(body, opt.loc);
        for (const o of inner) expandOne(o, depth + 1);
        visited.delete(keyNorm);
        return;
      }
      // Handle .style handler itself? Already handled at definition time via \tikzset parsing
      // For choice: if isChoice, ignore
      out.push(opt);
    };
    for (const o of options) expandOne(o, 0);
    return out;
  }

  /** Apply every picture/path/scope auto-styles by prepending them */
  withEveryStyles(options: Option[], context: "picture" | "path" | "scope"): Option[] {
    const extras: Option[] = [];
    const keys = [
      "every picture",
      context === "path" ? "every path" : null,
      context === "scope" ? "every scope" : null,
    ].filter(Boolean) as string[];
    for (const k of keys) {
      const body = this.getStyle(k);
      if (body) {
        const inner = parseStyleBody(body, { line: 1, column: 1, pos: 0 });
        extras.push(...inner);
      }
    }
    // Expand extras too
    const expandedExtras = this.expandOptions(extras);
    return [...expandedExtras, ...this.expandOptions(options)];
  }

  clear(): void {
    this.store.clear();
    this.styles.clear();
    // re-seed defaults for every picture etc? empty by default
  }
}

// Singleton
let globalKS: KeySystem | null = null;
export function getKeySystem(): KeySystem {
  if (!globalKS) globalKS = new KeySystem();
  return globalKS;
}
export function resetKeySystem(): void {
  globalKS = new KeySystem();
}

// Helper: parse a style body string into Option[] using same logic as parser's bracket options but on a string
function parseStyleBody(body: string, loc: { line: number; column: number; pos: number }): Option[] {
  // body is like "red, thick, draw=blue" — split by commas at depth 0 (brace/bracket aware)
  const opts: Option[] = [];
  let buf = "";
  let depthBrace = 0, depthBracket = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "{") depthBrace++;
    else if (ch === "}") depthBrace--;
    else if (ch === "[") depthBracket++;
    else if (ch === "]") depthBracket--;
    if (ch === "," && depthBrace === 0 && depthBracket === 0) {
      const raw = buf.trim();
      if (raw) opts.push(toOption(raw, loc));
      buf = "";
    } else {
      buf += ch;
    }
  }
  const last = buf.trim();
  if (last) opts.push(toOption(last, loc));
  return opts;
}
function toOption(raw: string, loc: { line: number; column: number; pos: number }): Option {
  const eq = raw.indexOf("=");
  if (eq !== -1) {
    return { raw, key: raw.slice(0, eq).trim(), value: raw.slice(eq + 1).trim(), loc };
  }
  return { raw, key: raw, value: undefined, loc };
}

/** Handle \tikzset argument — content inside {...} */
export function handleTikzSet(arg: string, loc: { line: number; column: number; pos: number }): void {
  const ks = getKeySystem();
  // arg is like "my style/.style={red, thick}, every picture/.style={scale=2}"
  // Split by commas at depth 0
  let buf = "";
  let depthBrace = 0, depthBracket = 0;
  const entries: string[] = [];
  for (let i = 0; i < arg.length; i++) {
    const ch = arg[i];
    if (ch === "{") depthBrace++;
    else if (ch === "}") depthBrace--;
    else if (ch === "[") depthBracket++;
    else if (ch === "]") depthBracket--;
    if (ch === "," && depthBrace === 0 && depthBracket === 0) {
      entries.push(buf);
      buf = "";
    } else buf += ch;
  }
  if (buf.trim()) entries.push(buf);

  for (const entryRaw of entries) {
    const entry = entryRaw.trim();
    if (!entry) continue;
    // Match handlers: key/.style={body}, key/.append style={body}, key/.initial=val, etc.
    // General: key/.handler=value  or key/.handler
    const handlerMatch = entry.match(/^(.+?)\/\.?([^=]+)(?:=(.*))?$/);
    // But note keys may contain spaces? For Phase 2 we support only simple
    // Instead detect: if entry contains "/.style", "/.append style", etc.
    if (entry.includes("/.style")) {
      // split at /.style
      const idx = entry.indexOf("/.style");
      const key = entry.slice(0, idx).trim();
      let body = "";
      // remaining after /.style
      const rest = entry.slice(idx + "/.style".length).trim();
      if (rest.startsWith("=")) body = rest.slice(1).trim();
      // body may be {…} or value
      if (body.startsWith("{") && body.endsWith("}")) body = body.slice(1, -1);
      ks.defineStyle(key, body);
      continue;
    }
    if (entry.includes("/.append style")) {
      const idx = entry.indexOf("/.append style");
      const key = entry.slice(0, idx).trim();
      const rest = entry.slice(idx + "/.append style".length).trim();
      let body = "";
      if (rest.startsWith("=")) body = rest.slice(1).trim();
      if (body.startsWith("{") && body.endsWith("}")) body = body.slice(1, -1);
      ks.appendStyle(key, body);
      continue;
    }
    if (entry.includes("/.initial")) {
      const idx = entry.indexOf("/.initial");
      const key = entry.slice(0, idx).trim();
      const rest = entry.slice(idx + "/.initial".length).trim();
      let val = "";
      if (rest.startsWith("=")) val = rest.slice(1).trim();
      ks.setInitial(key, val);
      continue;
    }
    if (entry.includes("/.default")) {
      const idx = entry.indexOf("/.default");
      const key = entry.slice(0, idx).trim();
      const rest = entry.slice(idx + "/.default".length).trim();
      let val = "";
      if (rest.startsWith("=")) val = rest.slice(1).trim();
      ks.setDefault(key, val);
      continue;
    }
    if (entry.includes("/.is choice")) {
      const idx = entry.indexOf("/.is choice");
      const key = entry.slice(0, idx).trim();
      ks.defineChoice(key);
      continue;
    }
    // Fallback: treat as plain tikz key assignment that defines a style? No, ignore
    // Could be "every picture/.style={...}" already handled
    // If no handler, it's a style usage? For \tikzset, usually all entries are handler defs, not usages
    // Unknown entry: warn but ignore
  }
}
