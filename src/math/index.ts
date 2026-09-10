/**
 * Phase 2 pgfmath — expression parser with units, degrees trig, and common functions.
 * No eval() used.
 */
import { toPt } from "../geometry/units.ts";

export interface MathContext {
  vars?: Map<string, number> | Record<string, number>;
  macros?: Map<string, string>;
  randSeed?: number;
}

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

function toNumberMap(m?: Map<string, number> | Record<string, number>): Map<string, number> {
  if (!m) return new Map();
  if (m instanceof Map) return m;
  return new Map(Object.entries(m));
}

// Token types for math
type Tok =
  | { kind: "num"; value: number; raw: string }
  | { kind: "ident"; name: string }
  | { kind: "op"; op: string }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" }
  | { kind: "eof" };

function tokenizeMath(expr: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }
    // number with optional unit — e.g., 2cm, 3.5pt, -0.2in (but negative handled as op)
    if (/[0-9.]/.test(ch) || (ch === "." && /[0-9]/.test(expr[i + 1] ?? ""))) {
      let j = i;
      while (j < expr.length && /[0-9]/.test(expr[j])) j++;
      if (j < expr.length && expr[j] === ".") { j++; while (j < expr.length && /[0-9]/.test(expr[j])) j++; }
      // unit letters
      let k = j;
      while (k < expr.length && /[a-zA-Z%]/.test(expr[k])) k++;
      const raw = expr.slice(i, k);
      const numPart = expr.slice(i, j);
      const unit = expr.slice(j, k);
      let val = parseFloat(numPart);
      if (unit) {
        try { val = toPt(val, unit as any); } catch { /* keep as is if unknown unit */ }
      }
      out.push({ kind: "num", value: val, raw });
      i = k;
      continue;
    }
    // ident (including backslash) — e.g., sin, atan2, ifthenelse, \x, pi
    if (/[a-zA-Z\\@]/.test(ch)) {
      let j = i;
      if (expr[j] === "\\") j++;
      while (j < expr.length && /[a-zA-Z0-9_@]/.test(expr[j])) j++;
      const name = expr.slice(i, j).replace(/^\\/, "").toLowerCase();
      out.push({ kind: "ident", name });
      i = j;
      continue;
    }
    // multi-char ops: >=, <=, ==, !=
    if (expr.startsWith(">=", i) || expr.startsWith("<=", i) || expr.startsWith("==", i) || expr.startsWith("!=", i)) {
      out.push({ kind: "op", op: expr.slice(i, i + 2) });
      i += 2;
      continue;
    }
    if ("+-*/^><=!".includes(ch)) {
      // handle ! as not? but we treat != already; single ! is op
      out.push({ kind: "op", op: ch });
      i++;
      continue;
    }
    if (ch === "(") { out.push({ kind: "lparen" }); i++; continue; }
    if (ch === ")") { out.push({ kind: "rparen" }); i++; continue; }
    if (ch === ",") { out.push({ kind: "comma" }); i++; continue; }
    // fallback char
    out.push({ kind: "op", op: ch });
    i++;
  }
  out.push({ kind: "eof" });
  return out;
}

export function evalMath(expr: string, ctx: MathContext = {}): number {
  // Preprocess: handle TeX braces { } that wrap expressions — strip outer braces
  let e = expr.trim();
  if (e.startsWith("{") && e.endsWith("}")) {
    // Only strip if balanced
    let depth = 0; let balanced = true;
    for (let idx = 0; idx < e.length; idx++) {
      if (e[idx] === "{") depth++;
      else if (e[idx] === "}") { depth--; if (depth === 0 && idx !== e.length - 1) { balanced = false; break; } }
    }
    if (balanced) e = e.slice(1, -1);
  }
  // Replace macros vars like \x with values if present
  // Also handle dimensions already converted
  const varMap = toNumberMap(ctx.vars);
  // Add macros as vars if they are numeric
  if (ctx.macros) {
    for (const [k, v] of ctx.macros.entries()) {
      const name = k.replace(/^\\/, "").toLowerCase();
      const num = parseFloat(v);
      if (!isNaN(num) && String(num) === v.trim()) varMap.set(name, num);
      else {
        // Try to evaluate macro body as math
        try { varMap.set(name, evalMath(v, { vars: varMap })); } catch {}
      }
    }
  }
  const toks = tokenizeMath(e);
  let pos = 0;
  const peek = () => toks[pos];
  const consume = () => toks[pos++];
  const expect = (kind: Tok["kind"]) => {
    const t = peek();
    if (t.kind !== kind) throw new Error(`Expected ${kind} got ${t.kind} at ${pos}`);
    return consume();
  };

  // Recursive descent with precedence:
  // expr := comparison (lowest)
  // comparison := add ( (== != > < >= <=) add )*
  // add := mul ( (+|-) mul )*
  // mul := pow ( (*|/) pow )*
  // pow := unary ( ^ unary )*
  // unary := (-|!) unary | primary
  // primary := num | ident | ident '(' args ')' | '(' expr ')'

  function parseExpr(): number {
    return parseComparison();
  }
  function parseComparison(): number {
    let left = parseAdd();
    while (true) {
      const t = peek();
      if (t.kind === "op" && ["==", "!=", ">", "<", ">=", "<="].includes(t.op)) {
        const op = (consume() as { op: string }).op;
        const right = parseAdd();
        switch (op) {
          case "==": left = left === right ? 1 : 0; break;
          case "!=": left = left !== right ? 1 : 0; break;
          case ">": left = left > right ? 1 : 0; break;
          case "<": left = left < right ? 1 : 0; break;
          case ">=": left = left >= right ? 1 : 0; break;
          case "<=": left = left <= right ? 1 : 0; break;
        }
      } else break;
    }
    return left;
  }
  function parseAdd(): number {
    let left = parseMul();
    while (true) {
      const t = peek();
      if (t.kind === "op" && (t.op === "+" || t.op === "-")) {
        const op = (consume() as any).op;
        const right = parseMul();
        left = op === "+" ? left + right : left - right;
      } else break;
    }
    return left;
  }
  function parseMul(): number {
    let left = parsePow();
    while (true) {
      const t = peek();
      if (t.kind === "op" && (t.op === "*" || t.op === "/")) {
        const op = (consume() as any).op;
        const right = parsePow();
        left = op === "*" ? left * right : left / right;
      } else break;
    }
    return left;
  }
  function parsePow(): number {
    let left = parseUnary();
    const t = peek();
    if (t.kind === "op" && t.op === "^") {
      consume();
      const right = parseUnary();
      left = Math.pow(left, right);
    }
    return left;
  }
  function parseUnary(): number {
    const t = peek();
    if (t.kind === "op" && t.op === "-") {
      consume();
      return -parseUnary();
    }
    if (t.kind === "op" && t.op === "+") {
      consume();
      return parseUnary();
    }
    if (t.kind === "op" && t.op === "!") {
      consume();
      const v = parseUnary();
      return v ? 0 : 1;
    }
    return parsePrimary();
  }
  function parsePrimary(): number {
    const t = peek();
    if (t.kind === "num") {
      consume();
      return (t as any).value;
    }
    if (t.kind === "ident") {
      const name = (t as any).name;
      // Check if it's a function call
      const next = toks[pos + 1];
      if (next && next.kind === "lparen") {
        // function
        consume(); // ident
        consume(); // (
        const args: number[] = [];
        if (peek().kind !== "rparen") {
          args.push(parseExpr());
          while (peek().kind === "comma") {
            consume();
            args.push(parseExpr());
          }
        }
        expect("rparen");
        return callFunc(name, args);
      } else {
        // variable or constant
        consume();
        if (CONSTANTS[name] !== undefined) return CONSTANTS[name];
        if (varMap.has(name)) return varMap.get(name)!;
        // Try without lower? already
        // Unknown ident -> 0? Or throw? For TikZ, unknown macro may be 0
        // Return 0 to allow graceful
        return 0;
      }
    }
    if (t.kind === "lparen") {
      consume();
      const v = parseExpr();
      expect("rparen");
      return v;
    }
    throw new Error(`Unexpected token ${t.kind} at ${pos}`);
  }

  function callFunc(name: string, args: number[]): number {
    switch (name) {
      case "sin": return Math.sin((args[0] * Math.PI) / 180);
      case "cos": return Math.cos((args[0] * Math.PI) / 180);
      case "tan": return Math.tan((args[0] * Math.PI) / 180);
      case "asin": return (Math.asin(args[0]) * 180) / Math.PI;
      case "acos": return (Math.acos(args[0]) * 180) / Math.PI;
      case "atan": return (Math.atan(args[0]) * 180) / Math.PI;
      case "atan2": return (Math.atan2(args[0], args[1]) * 180) / Math.PI;
      case "sqrt": return Math.sqrt(args[0]);
      case "exp": return Math.exp(args[0]);
      case "ln": return Math.log(args[0]);
      case "log10": return Math.log10(args[0]);
      case "pow": return Math.pow(args[0], args[1]);
      case "mod": return args[0] % args[1];
      case "abs": return Math.abs(args[0]);
      case "round": return Math.round(args[0]);
      case "floor": return Math.floor(args[0]);
      case "ceil": return Math.ceil(args[0]);
      case "min": return Math.min(...args);
      case "max": return Math.max(...args);
      case "veclen": return Math.hypot(args[0], args[1]);
      case "ifthenelse": return args[0] ? args[1] : args[2];
      case "not": return args[0] ? 0 : 1;
      case "and": return args[0] && args[1] ? 1 : 0;
      case "or": return args[0] || args[1] ? 1 : 0;
      case "equal": return args[0] === args[1] ? 1 : 0;
      case "greater": return args[0] > args[1] ? 1 : 0;
      case "less": return args[0] < args[1] ? 1 : 0;
      case "rnd": return Math.random();
      case "rand": return Math.random() * 2 - 1;
      case "pi": return Math.PI;
      case "e": return Math.E;
      case "factorial": {
        let n = Math.floor(args[0]); let r = 1; for (let k = 2; k <= n; k++) r *= k; return r;
      }
      default:
        // Unknown function -> 0
        return 0;
    }
  }

  const result = parseExpr();
  if (peek().kind !== "eof") {
    // Allow trailing
  }
  return result;
}

/** Helper for \pgfmathsetmacro: evaluate and store */
export function pgfMathSetMacro(name: string, expr: string, ctx: MathContext): number {
  const val = evalMath(expr, ctx);
  return val;
}
