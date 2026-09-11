import { lex, type Token } from "../lexer/index.ts";

export interface ParseError { message: string; line: number; column: number; pos: number; codeFrame?: string; }
export interface Loc { line: number; column: number; pos: number; }

export type Option = { raw: string; key: string; value?: string; loc: Loc };

export type Coordinate =
  | { kind: "cartesian"; x: string; y: string; loc: Loc; relative: "plus" | "plusplus" | null }
  | { kind: "polar"; angle: string; radius: string; loc: Loc; relative: "plus" | "plusplus" | null }
  | { kind: "named"; name: string; anchor?: string; loc: Loc; relative: "plus" | "plusplus" | null }
  | { kind: "calc"; expr: string; loc: Loc; relative: "plus" | "plusplus" | null }
  | { kind: "perpendicular"; a: string; b: string; mode: "|-" | "-|"; loc: Loc; relative: "plus" | "plusplus" | null };

export type PathNode = {
  kind: "node";
  options: Option[];
  name?: string;
  text: string;
  loc: Loc;
};

export type PathOp =
  | { kind: "move"; coord: Coordinate; loc: Loc }
  | { kind: "lineTo"; coord: Coordinate; loc: Loc }
  | { kind: "orthH"; coord: Coordinate; loc: Loc } // -|  (horizontal then vertical)
  | { kind: "orthV"; coord: Coordinate; loc: Loc } // |-  (vertical then horizontal)
  | { kind: "rectangle"; coord: Coordinate; loc: Loc }
  | { kind: "circle"; center: Coordinate | null; radiusPt?: string; options: Option[]; loc: Loc }
  | { kind: "ellipse"; xRadius: string; yRadius: string; loc: Loc }
  | { kind: "arc"; options: Option[]; startAngle?: string; endAngle?: string; radius?: string; xRadius?: string; yRadius?: string; deltaAngle?: string; loc: Loc }
  | { kind: "grid"; coord: Coordinate; options: Option[]; loc: Loc }
  | { kind: "controls"; cp1: Coordinate; cp2: Coordinate | null; to: Coordinate; loc: Loc }
  | { kind: "parabola"; bend: Coordinate | null; to: Coordinate; options: Option[]; loc: Loc }
  | { kind: "sin"; to: Coordinate; loc: Loc }
  | { kind: "cos"; to: Coordinate; loc: Loc }
  | { kind: "to"; to: Coordinate; options: Option[]; loc: Loc }
  | { kind: "pathNode"; node: PathNode; loc: Loc }
  | { kind: "let"; assignments: { p?: string; x?: string; y?: string; n?: string; expr: string; coord?: Coordinate }[]; loc: Loc }
  | { kind: "cycle"; loc: Loc }
  | { kind: "raw"; text: string; loc: Loc };

export type PathStatement = {
  kind: "path";
  action: "draw" | "fill" | "filldraw" | "path" | "shade" | "shadedraw" | "clip";
  options: Option[];
  ops: PathOp[];
  loc: Loc;
};

export type CoordinateStatement = {
  kind: "coordinate";
  name: string;
  at: Coordinate | null;
  options: Option[];
  loc: Loc;
};

export type NodeStatement = {
  kind: "node";
  name?: string;
  at: Coordinate | null;
  options: Option[];
  text: string;
  loc: Loc;
};

export type ScopeStatement = {
  kind: "scope";
  options: Option[];
  body: PictureBodyItem[];
  loc: Loc;
};

export type TikzSetStatement = {
  kind: "tikzset";
  arg: string;
  loc: Loc;
};

export type DefineColorStatement = {
  kind: "definecolor";
  name: string;
  model: string;
  value: string;
  loc: Loc;
};

export type ColorLetStatement = {
  kind: "colorlet";
  name: string;
  value: string;
  loc: Loc;
};

export type DefStatement = {
  kind: "def";
  name: string;
  params: number;
  body: string;
  loc: Loc;
};

export type LetStatement = {
  kind: "let";
  name: string;
  value: string;
  loc: Loc;
};

export type PgfMathSetMacroStatement = {
  kind: "pgfmathsetmacro";
  name: string;
  expr: string;
  loc: Loc;
};

export type ForeachStatement = {
  kind: "foreach";
  vars: string[]; // e.g. ["\\x", "\\y"]
  list: string; // raw list e.g. "1,2,3" or "1,...,5"
  options: string; // raw options string for evaluate/remember etc (parsed later)
  body: string; // raw body inside { } or single statement
  isPathForeach?: boolean;
  loc: Loc;
};

export type PictureBodyItem = PathStatement | CoordinateStatement | NodeStatement | ScopeStatement | TikzSetStatement | DefineColorStatement | ColorLetStatement | DefStatement | LetStatement | PgfMathSetMacroStatement | ForeachStatement;

export type Picture = {
  kind: "picture";
  options: Option[];
  body: PictureBodyItem[];
  loc: Loc;
};

export type ASTNode = Picture | PictureBodyItem | { kind: "raw"; text: string; loc: Loc };

export interface ParseResult {
  ast: ASTNode[];
  pictures: Picture[];
  errors: ParseError[];
  tokens: Token[];
}

// ---------------------------------------------------------------------------

export function parse(source: string): ParseResult {
  const { tokens, errors: lexErrors } = lex(source);
  const errors: ParseError[] = lexErrors.map(e => ({ message: e.message, line: e.line, column: e.column, pos: 0 }));
  const ast: ASTNode[] = [];
  const pictures: Picture[] = [];
  let i = 0;

  function peek(off = 0): Token | undefined { return tokens[i + off]; }
  function consume(): Token | undefined { return tokens[i++]; }
  function locFrom(t: Token | undefined): Loc {
    if (!t) return { line: 1, column: 1, pos: 0 };
    return { line: t.line, column: t.column, pos: t.pos };
  }
  function codeFrameAt(pos: number): string {
    const lines = source.split("\n");
    let cur = 0;
    for (let idx = 0; idx < lines.length; idx++) {
      const next = cur + lines[idx].length + 1;
      if (pos >= cur && pos < next) {
        const col = pos - cur;
        return `${lines[idx]}\n${" ".repeat(col)}^`;
      }
      cur = next;
    }
    return "";
  }

  function pushError(msg: string, t?: Token): void {
    const l = t ? locFrom(t) : locFrom(peek());
    errors.push({ message: msg, line: l.line, column: l.column, pos: l.pos, codeFrame: codeFrameAt(l.pos) });
  }

  // helpers for options — Phase2: must handle nested braces/parens so commas inside {(1,1)} don't split
  function parseBracketOptions(): Option[] {
    if (!peek() || peek()!.kind !== "lbracket") return [];
    const lb = consume()!; // [
    const opts: Option[] = [];
    let buf: Token[] = [];
    let depthBracket = 1;
    let depthBrace = 0;
    let depthParen = 0;
    let optStart: Loc = locFrom(lb);
    function flush(): void {
      if (buf.length === 0) return;
      const first = buf[0], last = buf[buf.length - 1];
      const raw = source.slice(first.pos, last.pos + last.text.length).trim();
      if (!raw) { buf = []; return; }
      // split on first '=' at depth 0 (not inside braces/parens) — for simplicity, use first '='
      const eqPos = raw.indexOf("=");
      let key: string, value: string | undefined;
      if (eqPos !== -1) {
        key = raw.slice(0, eqPos).trim();
        value = raw.slice(eqPos + 1).trim();
        if (value === "") value = undefined;
      } else {
        key = raw;
      }
      opts.push({ raw, key: key ?? raw, value, loc: optStart });
      buf = [];
    }
    while (peek()) {
      const t = peek()!;
      if (t.kind === "lbracket") { depthBracket++; buf.push(consume()!); }
      else if (t.kind === "rbracket") {
        depthBracket--;
        if (depthBracket === 0) { flush(); consume(); break; }
        else buf.push(consume()!);
      } else if (t.kind === "lbrace") { depthBrace++; buf.push(consume()!); }
      else if (t.kind === "rbrace") { depthBrace--; buf.push(consume()!); }
      else if (t.kind === "lparen") { depthParen++; buf.push(consume()!); }
      else if (t.kind === "rparen") { depthParen--; buf.push(consume()!); }
      else if (t.kind === "comma" && depthBracket === 1 && depthBrace === 0 && depthParen === 0) {
        flush();
        consume();
        if (peek()) optStart = locFrom(peek()!);
      } else {
        if (buf.length === 0) optStart = locFrom(t);
        buf.push(consume()!);
      }
    }
    if (depthBracket !== 0) pushError("Unclosed [ options", lb);
    return opts;
  }

  function parseCoordinate(): Coordinate | null {
    // handle relative prefix ++ or +
    let relative: "plus" | "plusplus" | null = null;
    if (peek()?.kind === "plus") {
      if (peek(1)?.kind === "plus") {
        // Check if it's ++ followed by '('  -> treat as ++
        const third = peek(2);
        if (third?.kind === "lparen") {
          relative = "plusplus";
          consume(); consume();
        } else {
          relative = "plus";
          consume();
        }
      } else if (peek(1)?.kind === "lparen") {
        relative = "plus";
        consume();
      }
    }
    if (!peek() || peek()!.kind !== "lparen") {
      if (relative) pushError("Expected '(' after " + relative, peek());
      return null;
    }
    const lp = consume()!; // (
    const startLoc = locFrom(lp);
    // collect inner until matching )
    let innerTokens: Token[] = [];
    let depth = 1;
    while (peek()) {
      const t = peek()!;
      if (t.kind === "lparen") { depth++; innerTokens.push(consume()!); }
      else if (t.kind === "rparen") {
        depth--;
        if (depth === 0) { consume(); break; }
        innerTokens.push(consume()!);
      } else {
        innerTokens.push(consume()!);
      }
    }
    if (depth !== 0) pushError("Unclosed '(' in coordinate", lp);
    const inner = innerTokens.map(t => t.text).join("").trim();
    if (!inner) { pushError("Empty coordinate", lp); return null; }

    // Calc: ($...$)  inner starts with $ and ends with $
    {
      const trimmed = inner.trim();
      if (trimmed.startsWith("$") && trimmed.endsWith("$")) {
        const expr = trimmed.slice(1, -1).trim();
        return { kind: "calc", expr, loc: startLoc, relative } as Coordinate;
      }
      // also handle without outer $ but containing $ at start? e.g., $ (A) $ without?
      if (innerTokens.length>0 && innerTokens[0].kind==="dollar") {
        const withoutFirst = innerTokens.slice(1);
        // find last dollar
        let lastDollar=-1;
        for(let k=withoutFirst.length-1;k>=0;k--) if(withoutFirst[k].kind==="dollar") {lastDollar=k;break;}
        if(lastDollar!==-1){
          const exprToks=withoutFirst.slice(0,lastDollar);
          const expr=exprToks.map(t=>t.text).join("").trim();
          return { kind: "calc", expr, loc: startLoc, relative } as Coordinate;
        }
      }
    }
    // Perpendicular: (A |- B) or (A -| B)  contains |- or -|
    {
      // detect |- or -| as op token inside innerTokens
      for (let idx=0; idx<innerTokens.length; idx++){
        if(innerTokens[idx].kind==="op" && (innerTokens[idx].text==="|-"||innerTokens[idx].text==="-|")){
          const leftToks=innerTokens.slice(0,idx);
          const rightToks=innerTokens.slice(idx+1);
          const left=leftToks.map(t=>t.text).join("").trim();
          const right=rightToks.map(t=>t.text).join("").trim();
          if(left && right){
            return { kind: "perpendicular", a:left, b:right, mode:innerTokens[idx].text as "|-"|"-|", loc:startLoc, relative } as Coordinate;
          }
        }
      }
      // fallback string contains "|-
      if(inner.includes("|-")||inner.includes("-|")){
        const mode = inner.includes("|-") ? "|-" as const : "-|" as const;
        const parts=inner.split(mode);
        if(parts.length===2) return { kind:"perpendicular", a:parts[0].trim(), b:parts[1].trim(), mode, loc:startLoc, relative } as Coordinate;
      }
    }

    // Polar: contains ':' at depth 0 (not inside braces/parens)
    let colonIdx = -1;
    {
      let dBrace = 0, dParen = 0;
      for (let idx = 0; idx < innerTokens.length; idx++) {
        const tt = innerTokens[idx];
        if (tt.kind === "lbrace") dBrace++;
        else if (tt.kind === "rbrace") dBrace--;
        else if (tt.kind === "lparen") dParen++;
        else if (tt.kind === "rparen") dParen--;
        else if (tt.kind === "colon" && dBrace === 0 && dParen === 0) { colonIdx = idx; break; }
      }
    }
    if (colonIdx !== -1) {
      const angleToks = innerTokens.slice(0, colonIdx);
      const radiusToks = innerTokens.slice(colonIdx + 1);
      const angle = angleToks.map(t => t.text).join("").trim() || "0";
      const radius = radiusToks.map(t => t.text).join("").trim() || "1";
      return { kind: "polar", angle, radius, loc: startLoc, relative };
    }
    // Check for comma -> cartesian at depth 0
    let commaIdx = -1;
    {
      let dBrace = 0, dParen = 0;
      for (let idx = 0; idx < innerTokens.length; idx++) {
        const tt = innerTokens[idx];
        if (tt.kind === "lbrace") dBrace++;
        else if (tt.kind === "rbrace") dBrace--;
        else if (tt.kind === "lparen") dParen++;
        else if (tt.kind === "rparen") dParen--;
        else if (tt.kind === "comma" && dBrace === 0 && dParen === 0) { commaIdx = idx; break; }
      }
    }
    if (commaIdx !== -1) {
      const xToks = innerTokens.slice(0, commaIdx);
      const yToks = innerTokens.slice(commaIdx + 1);
      const x = xToks.map(t => t.text).join("").trim() || "0";
      const y = yToks.map(t => t.text).join("").trim() || "0";
      return { kind: "cartesian", x, y, loc: startLoc, relative };
    }
    // Otherwise named coordinate: e.g., "a", "myNode.north", "a.30"
    // Keep raw name; anchor handling later
    const rawName = inner.trim();
    let name = rawName;
    let anchor: string | undefined;
    // split on '.' for anchor, but not for numeric? keep first part as name
    if (rawName.includes(".")) {
      const dot = rawName.indexOf(".");
      name = rawName.slice(0, dot).trim();
      anchor = rawName.slice(dot + 1).trim();
    }
    return { kind: "named", name, anchor, loc: startLoc, relative };
  }

  // ---- Helpers for Phase 2: brace/bracket raw capture ----
  function parseBraceRaw(): string | null {
    if (!peek() || peek()!.kind !== "lbrace") return null;
    const start = peek()!.pos;
    let depth = 0;
    let startIdx = i;
    while (peek()) {
      const t = peek()!;
      if (t.kind === "lbrace") depth++;
      else if (t.kind === "rbrace") {
        depth--;
        if (depth === 0) {
          consume(); // closing }
          const end = t.pos + t.text.length;
          return source.slice(start + 1, end - 1);
        }
      }
      consume();
    }
    pushError("Unclosed {", tokens[startIdx]);
    return null;
  }
  function peekBraceContent(): string | null {
    if (!peek() || peek()!.kind !== "lbrace") return null;
    let depth = 0;
    let j = i;
    let start = -1, end = -1;
    while (j < tokens.length) {
      const t = tokens[j];
      if (t.kind === "lbrace") {
        if (depth === 0) start = t.pos;
        depth++;
      } else if (t.kind === "rbrace") {
        depth--;
        if (depth === 0) { end = t.pos; break; }
      }
      j++;
    }
    if (start !== -1 && end !== -1) return source.slice(start + 1, end);
    return null;
  }

  function parsePathOps(): PathOp[] {
    const ops: PathOp[] = [];
    // Expect first coordinate as move
    const first = parseCoordinate();
    if (!first) {
      // No initial coordinate: might be error, but allow empty
      // Check if next is something else like grid/circle without initial? Not phase1.
    } else {
      ops.push({ kind: "move", coord: first, loc: first.loc });
    }

    while (peek() && peek()!.kind !== "semi") {
      const t = peek()!;
      // foreach inside path — e.g., \draw (0,0) \foreach \x in {1,2} { -- (\x,0) }
      if (t.kind === "cs" && t.text === "\\foreach") {
        const forall = parseForeachStatement(consume()!);
        if (!forall) continue;
        // Expand foreach list into entries and for each, substitute vars into body and parse as path fragment
        // Body for path-level is like " -- (\\x,0)" — we treat it as sequence of ops
        const entries = (() => {
          // Use same logic as expandForeachList but here we need to generate ops
          // Simple version: split list by commas, handle ... ranges
          const listStr = forall.list;
          const rawEntries: string[] = [];
          let buf = ""; let depth = 0;
          for (let k = 0; k < listStr.length; k++) {
            const ch = listStr[k];
            if (ch === "{" || ch === "(") depth++;
            else if (ch === "}" || ch === ")") depth--;
            if (ch === "," && depth === 0) { rawEntries.push(buf.trim()); buf = ""; }
            else buf += ch;
          }
          if (buf.trim()) rawEntries.push(buf.trim());
          // Handle ... ranges (simple)
          const out: string[] = [];
          let idx = 0;
          while (idx < rawEntries.length) {
            const cur = rawEntries[idx];
            if (cur === "..." || cur.includes("...")) {
              const next = rawEntries[idx + 1];
              if (!next) { idx++; continue; }
              let step = 1;
              let startVal = 0;
              if (out.length >= 2) {
                const a = parseFloat(out[out.length - 2].split("/")[0]);
                const b = parseFloat(out[out.length - 1].split("/")[0]);
                if (!isNaN(a) && !isNaN(b)) step = b - a;
                startVal = parseFloat(out[out.length - 1].split("/")[0]);
              } else if (out.length === 1) {
                const a = parseFloat(out[out.length - 1].split("/")[0]);
                const b = parseFloat(next.split("/")[0]);
                if (!isNaN(a) && !isNaN(b)) step = a < b ? 1 : -1;
                startVal = a;
              }
              const endVal = parseFloat(next.split("/")[0]);
              if (!isNaN(startVal) && !isNaN(endVal)) {
                let curV = startVal + step;
                let iter = 0;
                while (step > 0 ? curV < endVal : curV > endVal) {
                  out.push(String(curV));
                  curV += step;
                  if (++iter > 1000) break;
                }
                out.push(next);
              } else out.push(next);
              idx += 2;
            } else {
              out.push(cur);
              idx++;
            }
          }
          return out;
        })();
        const varNames = forall.vars.map(v => v.replace(/^\\/, ""));
        // For each entry, substitute and parse body fragment as path ops
        for (const entry of entries) {
          const vals = entry.split("/").map(s => s.trim());
          let body = forall.body;
          if (!body) continue;
          // Substitute vars
          for (let vi = 0; vi < varNames.length; vi++) {
            const val = vals[vi] ?? vals[0];
            const vname = varNames[vi];
            body = body.replace(new RegExp("\\\\" + vname + "\\b", "g"), val);
          }
          // Body may be like " -- (1,0)" — parse it as fragment
          // We can lex the body fragment and parse its ops
          // For simplicity, handle common case: body starts with -- or other op, then coord
          // We'll create a temporary source and parse its path ops via a mini parser
          // Use a helper: create a temporary token stream for body and parse ops
          // For now, handle simple: body contains coordinates and ops, we can extract coords directly
          // Simplify: If body contains "--", split and handle
          // For Phase2, handle simple: body is like " -- (\\x,0)" or " (\\x,0) -- (\\x,1)"
          // We'll just try to parse coordinates from body string via regex and create lineTos
          // Use a simple approach: find all occurrences of coordinates in body, create lineTos
          const coordRe = /\(\s*([^,)]+)\s*,\s*([^)]+)\s*\)/g;
          let m: RegExpExecArray | null;
          let first = true;
          while ((m = coordRe.exec(body)) !== null) {
            const xStr = m[1].trim();
            const yStr = m[2].trim();
            // Create a coordinate object manually
            const coord: Coordinate = { kind: "cartesian", x: xStr, y: yStr, loc: locFrom(t), relative: null };
            if (first && ops.length === 0) {
              ops.push({ kind: "move", coord, loc: locFrom(t) });
              first = false;
            } else {
              // Check if body had "--" before this coord, if so lineTo, else lineTo anyway
              ops.push({ kind: "lineTo", coord, loc: locFrom(t) });
            }
          }
          // Also handle case where body is like " -- (\\x,0)" with no initial move, but we already have move from earlier
          // The above handles
        }
        continue;
      }
      // -- line (with optional nodes between -- and coordinate)
      if (t.kind === "op" && t.text === "--") {
        const loc = locFrom(consume());
        if (peek()?.kind === "ident" && peek()!.text.toLowerCase() === "cycle") {
          const cloc = locFrom(consume()!);
          ops.push({ kind: "cycle", loc: cloc });
          continue;
        }
        // Collect any nodes between -- and the coordinate
        while (peek()?.kind === "ident" && peek()!.text.toLowerCase() === "node") {
          const nloc = locFrom(consume());
          let nOpts = parseBracketOptions();
          let nName: string | undefined;
          if (peek()?.kind === "lparen") { const c=parseCoordinate(); if(c?.kind==="named") nName=c.name; }
          if (peek()?.kind === "lbracket") { const extra=parseBracketOptions(); nOpts=[...nOpts,...extra]; }
          let nText="";
          if (peek()?.kind === "lbrace") nText=parseBraceRaw()??"";
          ops.push({ kind: "pathNode", node: { kind: "node", options: nOpts, name: nName, text: nText, loc: nloc }, loc: nloc });
        }
        const coord = parseCoordinate();
        if (!coord) { pushError("Expected coordinate after '--'", t); if (peek() && peek()!.kind !== "semi") consume(); continue; }
        ops.push({ kind: "lineTo", coord, loc });
        continue;
      }
      // rectangle
      if (t.kind === "ident" && t.text.toLowerCase() === "rectangle") {
        const loc = locFrom(consume());
        const coord = parseCoordinate();
        if (!coord) { pushError("Expected coordinate after 'rectangle'", t); continue; }
        ops.push({ kind: "rectangle", coord, loc });
        continue;
      }
      // circle
      if (t.kind === "ident" && t.text.toLowerCase() === "circle") {
        const loc = locFrom(consume());
        // optional [options]
        const copts = parseBracketOptions();
        // optional (radius) — radius is a dimension in parentheses without comma
        let radius: string | undefined;
        if (peek()?.kind === "lparen") {
          const c = parseCoordinate();
          if (c) {
            if (c.kind === "cartesian") {
              radius = undefined;
            } else if (c.kind === "named") {
              radius = (c as { name: string }).name;
            } else if (c.kind === "polar") {
              radius = (c as { radius: string }).radius;
            }
          }
        } else if (copts.length === 0) {
          // Look for radius in options already captured? e.g., circle [radius=1cm]
          // That's in copts, keep as is, radius stays undefined and evaluator reads from options
        }
        // Try to extract radius from copts if present
        if (!radius) {
          const rOpt = copts.find(o => o.key.toLowerCase().includes("radius"));
          if (rOpt?.value) radius = rOpt.value;
          else if (rOpt && !rOpt.value) {
            // key like "radius=1cm" already split? Actually key would be "radius", value "1cm"
          }
        }
        ops.push({ kind: "circle", center: null, radiusPt: radius, options: copts, loc });
        continue;
      }
      // ellipse — Phase2: (center) ellipse [x radius=..., y radius=...]  or ellipse (xr and yr)
      if (t.kind === "ident" && t.text.toLowerCase() === "ellipse") {
        const loc = locFrom(consume());
        const eopts = parseBracketOptions();
        let xr = "1cm", yr = "0.5cm";
        // Try bracket options first
        const xrOpt = eopts.find(o => o.key.toLowerCase().includes("x radius"));
        const yrOpt = eopts.find(o => o.key.toLowerCase().includes("y radius"));
        if (xrOpt?.value) xr = xrOpt.value;
        if (yrOpt?.value) yr = yrOpt.value;
        // Also support (1cm and 0.5cm) syntax
        if (peek()?.kind === "lparen") {
          // Peek raw content for "and"
          const saved = i;
          const coordTok = parseCoordinate();
          // For ellipse, coord may be cartesian where x is xr and y is yr? Not exactly
          // Instead look at raw text for "and"
          // We already consumed via parseCoordinate which expects comma or colon; "1cm and 0.5cm" will be parsed as named "1cm and 0.5cm"
          // So handle named case containing "and"
          if (coordTok?.kind === "named" && coordTok.name.includes("and")) {
            const parts = coordTok.name.split(/\band\b/i);
            if (parts[0].trim()) xr = parts[0].trim();
            if (parts[1]?.trim()) yr = parts[1].trim();
          } else if (coordTok) {
            // if we parsed incorrectly, restore and try manual raw
            i = saved;
            // capture raw inside ()
            const lp = consume()!; // should be lparen
            let depth = 1; let tokensInner: Token[] = [];
            while (peek() && depth > 0) {
              const tt = peek()!;
              if (tt.kind === "lparen") depth++;
              else if (tt.kind === "rparen") { depth--; if (depth === 0) { consume(); break; } }
              if (depth > 0) tokensInner.push(consume()!);
            }
            const raw = tokensInner.map(x => x.text).join("").trim();
            const andParts = raw.split(/\band\b/i);
            if (andParts.length === 2) { xr = andParts[0].trim(); yr = andParts[1].trim(); }
          }
        }
        ops.push({ kind: "ellipse", xRadius: xr, yRadius: yr, loc });
        continue;
      }
      // arc — Phase2
      if (t.kind === "ident" && t.text.toLowerCase() === "arc") {
        const loc = locFrom(consume());
        const aopts = parseBracketOptions();
        let startA: string | undefined, endA: string | undefined, radius: string | undefined, xr: string | undefined, yr: string | undefined, delta: string | undefined;
        // Try bracket options first
        for (const o of aopts) {
          const k = o.key.toLowerCase();
          if (k === "start angle" && o.value) startA = o.value;
          else if (k === "end angle" && o.value) endA = o.value;
          else if (k === "delta angle" && o.value) delta = o.value;
          else if (k === "radius" && o.value) radius = o.value;
          else if (k === "x radius" && o.value) xr = o.value;
          else if (k === "y radius" && o.value) yr = o.value;
        }
        // Also support arc (start:end:radius) or (start:end:xr and yr)
        if (peek()?.kind === "lparen") {
          const arcCoord = parseCoordinate(); // will be mis-parsed; instead handle manually
          // Actually arc (...) contains colons: e.g., (0:90:1cm) -> we can detect via raw
          // The parseCoordinate will treat colon as polar, not correct. So handle raw:
          // Undo and re-parse raw
          if (arcCoord) {
            // If we got polar, misuse; try to extract from raw text via source slice
            // For now, handle case where coord was polar with angle=start and radius=end:radius? Not ideal
            // Fallback: look at previous raw via source slice
          }
          // Better: capture raw inside ()
          // Since we already consumed, we can attempt to interpret
          // If arcCoord kind is polar and contains ":", it is not our arc spec; we should have not used parseCoordinate
          // So revert and parse raw manually if needed
          // For simplicity, if after arc we consumed a polar-like but we need three colon parts, we try to re-parse
          // Check if arcCoord was polar: that would be angle:start? Not.
          // We'll do manual capture if we detect that the consumed coord was not what we want
          // Rewind attempt: if arcCoord and aopts empty, try to capture raw
        }
        // Manual fallback: if no radius yet and next is lparen that we haven't consumed correctly (because we did), skip
        // Instead, if we still have no angles and we consumed a coordinate, try to peek raw for arc
        // For Phase2 minimal, support arc [radius=1cm, start angle=0, end angle=90] syntax which is bracket-based and already captured
        // Also support delta angle
        if (delta && startA && !endA) {
          // compute end from start+delta
          const s = parseFloat(startA), d = parseFloat(delta);
          if (!isNaN(s) && !isNaN(d)) endA = String(s + d);
        }
        ops.push({ kind: "arc", options: aopts, startAngle: startA, endAngle: endA, radius, xRadius: xr, yRadius: yr, deltaAngle: delta, loc });
        // If next token is still lparen that wasn't consumed (because we didn't have arcCoord parsing correctly), handle
        if (peek()?.kind === "lparen") {
          // Try to capture arc paren spec now
          const lp = peek()!;
          // Look ahead raw
          let j = i + 1; let depth = 1; let raw = "";
          while (j < tokens.length) {
            const tt = tokens[j];
            if (tt.kind === "lparen") depth++;
            else if (tt.kind === "rparen") { depth--; if (depth === 0) break; }
            raw += tt.text;
            j++;
          }
          // raw like "0:90:1cm" or "0:90:1cm and 0.5cm"
          if (raw.includes(":")) {
            const parts = raw.split(":").map(s => s.trim());
            if (parts[0]) startA = parts[0];
            if (parts[1]) endA = parts[1];
            if (parts[2]) {
              const rPart = parts[2];
              if (rPart.includes("and")) {
                const ap = rPart.split(/\band\b/i);
                xr = ap[0].trim(); yr = ap[1].trim();
              } else radius = rPart.trim();
            }
            // consume the lparen ... rparen
            consume(); // lparen
            // consume until matching rparen
            let d2 = 1;
            while (peek() && d2 > 0) {
              const tt = peek()!;
              if (tt.kind === "lparen") d2++;
              else if (tt.kind === "rparen") { d2--; if (d2 === 0) { consume(); break; } }
              consume();
            }
            // update last op
            const last = ops[ops.length - 1] as any;
            if (last && last.kind === "arc") {
              last.startAngle = startA; last.endAngle = endA; last.radius = radius; last.xRadius = xr; last.yRadius = yr;
            }
          }
        }
        continue;
      }
      // grid
      if (t.kind === "ident" && t.text.toLowerCase() === "grid") {
        const loc = locFrom(consume());
        const gopts = parseBracketOptions();
        const coord = parseCoordinate();
        if (!coord) { pushError("Expected coordinate after 'grid'", t); continue; }
        ops.push({ kind: "grid", coord, options: gopts, loc });
        continue;
      }
      // controls — bezier: .. controls (c1) and (c2) .. (to)   or .. controls (c1) .. (to)
      if (t.kind === "dot" && peek(1)?.kind === "dot") {
        // consume ..
        consume(); consume();
        // check controls
        const nxt = peek();
        if (nxt?.kind === "ident" && nxt.text.toLowerCase() === "controls") {
          consume();
          const cp1 = parseCoordinate();
          if (!cp1) { pushError("Expected control point after 'controls'", t); continue; }
          let cp2: Coordinate | null = null;
          if (peek()?.kind === "ident" && peek()!.text.toLowerCase() === "and") {
            consume();
            cp2 = parseCoordinate();
            if (!cp2) pushError("Expected second control point after 'and'", t);
          }
          // expect .. before target
          if (peek()?.kind === "dot" && peek(1)?.kind === "dot") { consume(); consume(); }
          else { /* allow single .. */ }
          const to = parseCoordinate();
          if (!to) { pushError("Expected target coordinate after controls", t); continue; }
          if (!cp2) {
            // single control repeated?
            cp2 = cp1;
          }
          ops.push({ kind: "controls", cp1, cp2, to, loc: locFrom(t) });
          continue;
        } else {
          // bare .. without controls? skip
          pushError("Expected 'controls' after '..'", t);
          continue;
        }
      }
      // parabola
      if (t.kind === "ident" && t.text.toLowerCase() === "parabola") {
        const loc = locFrom(consume());
        const popts = parseBracketOptions();
        // optional bend
        let bend: Coordinate | null = null;
        if (peek()?.kind === "ident" && peek()!.text.toLowerCase() === "bend") {
          consume();
          bend = parseCoordinate();
        }
        const to = parseCoordinate();
        if (!to) { pushError("Expected target after 'parabola'", t); continue; }
        ops.push({ kind: "parabola", bend, to, options: popts, loc });
        continue;
      }
      // sin / cos
      if (t.kind === "ident" && (t.text.toLowerCase() === "sin" || t.text.toLowerCase() === "cos")) {
        const isSin = t.text.toLowerCase() === "sin";
        const loc = locFrom(consume());
        const to = parseCoordinate();
        if (!to) { pushError(`Expected coordinate after '${t.text}'`, t); continue; }
        ops.push({ kind: isSin ? "sin" : "cos", to, loc });
        continue;
      }
      // to — with optional [options]
      if (t.kind === "ident" && t.text.toLowerCase() === "to") {
        const loc = locFrom(consume());
        const topts = parseBracketOptions();
        const to = parseCoordinate();
        if (!to) { pushError("Expected coordinate after 'to'", t); continue; }
        ops.push({ kind: "to", to, options: topts, loc });
        continue;
      }
      // cycle standalone
      if (t.kind === "ident" && t.text.toLowerCase() === "cycle") {
        const loc = locFrom(consume());
        ops.push({ kind: "cycle", loc });
        continue;
      }
      // |- or -| orthogonal — Phase2: produce orth segments
      if (t.kind === "op" && t.text === "|-") {
        const loc = locFrom(consume());
        const coord = parseCoordinate();
        if (!coord) { pushError(`Expected coordinate after '|-'`, t); continue; }
        ops.push({ kind: "orthV", coord, loc });
        continue;
      }
      if (t.kind === "op" && t.text === "-|") {
        const loc = locFrom(consume());
        const coord = parseCoordinate();
        if (!coord) { pushError(`Expected coordinate after '-|'`, t); continue; }
        ops.push({ kind: "orthH", coord, loc });
        continue;
      }
      // let operation
      if (t.kind === "ident" && t.text.toLowerCase() === "let") {
        const lloc = locFrom(consume());
        const assigns: { p?: string; x?: string; y?: string; n?: string; expr: string; coord?: Coordinate }[] = [];
        while (peek() && !(peek()!.kind === "ident" && peek()!.text.toLowerCase() === "in")) {
          const tok = peek()!;
          if (tok.kind === "cs" && tok.text.startsWith("\\")) {
            const name = tok.text;
            consume();
            let kind: "p"|"x"|"y"|"n" = "p";
            if (name.startsWith("\\p")) kind="p";
            else if (name.startsWith("\\x")) kind="x";
            else if (name.startsWith("\\y")) kind="y";
            else if (name.startsWith("\\n")) kind="n";
            if (peek()?.kind === "equals") consume();
            let expr = "";
            let coord: Coordinate | undefined;
            if (peek()?.kind === "lparen" || peek()?.kind === "plus") {
              const c = parseCoordinate();
              if (c) { coord = c; expr = `coord:${c.kind}`; }
            } else if (peek()?.kind === "lbrace") {
              expr = parseBraceRaw() ?? "";
            } else if (peek()) {
              expr = consume()!.text;
            }
            const rec:any={expr, coord};
            if(kind==="p") rec.p=name; else if(kind==="x") rec.x=name; else if(kind==="y") rec.y=name; else rec.n=name;
            assigns.push(rec);
          } else if (tok.kind==="comma") { consume(); }
          else { consume(); }
          if (peek()?.kind==="comma") consume();
        }
        if (peek()?.kind==="ident" && peek()!.text.toLowerCase()==="in") consume();
        ops.push({ kind:"let", assignments: assigns, loc: lloc });
        continue;
      }
      // node on path — e.g., node[options] (name) {text}
      if (t.kind === "ident" && t.text.toLowerCase() === "node") {
        const loc = locFrom(consume());
        // options may appear before or after name; handle bracket immediately after node
        let nOpts = parseBracketOptions();
        let nName: string | undefined;
        // optional (name)
        if (peek()?.kind === "lparen") {
          const c = parseCoordinate();
          if (c?.kind === "named") nName = c.name;
          else if (c) { /* not name? push back? */ }
        }
        // options may appear after name too
        if (peek()?.kind === "lbracket") {
          const extra = parseBracketOptions();
          nOpts = [...nOpts, ...extra];
        }
        // text in braces {text}
        let nText = "";
        if (peek()?.kind === "lbrace") {
          nText = parseBraceRaw() ?? "";
        }
        ops.push({ kind: "pathNode", node: { kind: "node", options: nOpts, name: nName, text: nText, loc }, loc });
        continue;
      }
      // Bare coordinate without operator -> implicit lineTo (TikZ allows mixing, but we treat as lineTo)
      if (t.kind === "lparen" || t.kind === "plus") {
        const coord = parseCoordinate();
        if (!coord) { consume(); continue; }
        // If this is first coord and we already have move, this is a lineTo
        if (ops.length === 0) ops.push({ kind: "move", coord, loc: coord.loc });
        else ops.push({ kind: "lineTo", coord, loc: coord.loc });
        continue;
      }
      // Unknown token inside path: skip with error for partial render
      pushError(`Unexpected token '${t.text}' in path`, t);
      consume();
      // If we consume too much, break to avoid infinite
      if (ops.length > 200) break;
    }
    return ops;
  }

  function parseTikzSetStatement(cs: Token): TikzSetStatement | null {
    const loc = locFrom(cs);
    const arg = parseBraceRaw();
    if (arg === null) {
      pushError("Expected {…} after \\tikzset", cs);
      return null;
    }
    if (peek()?.kind === "semi") consume(); // optional ; in some contexts
    return { kind: "tikzset", arg, loc };
  }
  function parseTikZStyleStatement(cs: Token): TikzSetStatement | null {
    // legacy: \tikzstyle{name}=[options]
    const loc = locFrom(cs);
    const nameRaw = parseBraceRaw();
    if (nameRaw === null) { pushError("Expected {name} after \\tikzstyle", cs); return null; }
    if (peek()?.kind !== "equals") { pushError("Expected = after \\tikzstyle{name}", cs); return null; }
    consume();
    const opts = parseBracketOptions();
    // Convert to \tikzset style: name/.style={opts}
    const optsRaw = opts.map(o => o.raw).join(", ");
    const arg = `${nameRaw}/.style={${optsRaw}}`;
    if (peek()?.kind === "semi") {/* no semi required */}
    return { kind: "tikzset", arg, loc };
  }
  function parseDefineColorStatement(cs: Token): DefineColorStatement | null {
    const loc = locFrom(cs);
    const name = parseBraceRaw();
    const model = parseBraceRaw();
    const value = parseBraceRaw();
    if (name === null || model === null || value === null) {
      pushError("Malformed \\definecolor", cs);
      return null;
    }
    return { kind: "definecolor", name: name.trim(), model: model.trim(), value: value.trim(), loc };
  }
  function parseColorLetStatement(cs: Token): ColorLetStatement | null {
    const loc = locFrom(cs);
    const name = parseBraceRaw();
    const value = parseBraceRaw();
    if (name === null || value === null) { pushError("Malformed \\colorlet", cs); return null; }
    return { kind: "colorlet", name: name.trim(), value: value.trim(), loc };
  }
  function parseDefStatement(cs: Token): DefStatement | null {
    const loc = locFrom(cs);
    // \def\macro#1#2{body} or \def\macro{body} — simplified: capture \macro then params then body
    const macroTok = peek();
    if (!macroTok || macroTok.kind !== "cs") { pushError("Expected macro after \\def", cs); return null; }
    const name = consume()!.text;
    let params = 0;
    // count #1 #2 patterns before {
    while (peek() && peek()!.kind === "hash") {
      consume();
      if (peek() && peek()!.kind === "number") { consume(); params++; }
      else if (peek() && /[1-9]/.test(peek()!.text)) { consume(); params++; }
      else break;
    }
    // also handle #1 without hash token separation? lexer gives "#" as hash and "1" as number
    const body = parseBraceRaw() ?? "";
    return { kind: "def", name, params, body, loc };
  }
  function parseNewCommandStatement(cs: Token): DefStatement | null {
    const loc = locFrom(cs);
    // \newcommand{\macro}[num][default]{body}  or \renewcommand
    const nameRaw = parseBraceRaw();
    if (!nameRaw) { pushError("Expected {\\macro} after \\newcommand", cs); return null; }
    let name = nameRaw.trim();
    // name may be \macro
    let params = 0;
    if (peek()?.kind === "lbracket") {
      // parse [num]
      consume();
      const numTok = peek();
      if (numTok && numTok.kind === "number") {
        params = parseInt(consume()!.text, 10) || 0;
        if (peek()?.kind === "rbracket") consume();
        // optional [default] — ignore
        if (peek()?.kind === "lbracket") {
          let d = 1;
          consume();
          while (peek() && d > 0) {
            if (peek()!.kind === "lbracket") d++;
            else if (peek()!.kind === "rbracket") { d--; if (d === 0) { consume(); break; } }
            consume();
          }
        }
      } else {
        // not a number, skip
        while (peek() && peek()!.kind !== "rbracket") consume();
        if (peek()?.kind === "rbracket") consume();
      }
    }
    const body = parseBraceRaw() ?? "";
    return { kind: "def", name, params, body, loc };
  }
  function parseLetStatement(cs: Token): LetStatement | null {
    const loc = locFrom(cs);
    const n1 = peek();
    const n2 = peek(1);
    // \let\a=\b  or \let\a\b
    if (!n1 || n1.kind !== "cs") { pushError("Expected cs after \\let", cs); return null; }
    const name = consume()!.text;
    if (peek()?.kind === "equals") consume();
    const valTok = peek();
    let value = "";
    if (valTok && valTok.kind === "cs") value = consume()!.text;
    else if (valTok) value = consume()!.text;
    return { kind: "let", name, value, loc };
  }
  function parsePgfMathSetMacroStatement(cs: Token, isTrunc: boolean): PgfMathSetMacroStatement | null {
    const loc = locFrom(cs);
    const name = parseBraceRaw();
    const expr = parseBraceRaw();
    if (name === null || expr === null) { pushError("Malformed \\pgfmathsetmacro", cs); return null; }
    return { kind: "pgfmathsetmacro", name: name.trim(), expr: expr.trim() + (isTrunc ? "|trunc" : ""), loc };
  }
  function parseForeachStatement(cs: Token): ForeachStatement | null {
    const loc = locFrom(cs);
    // \foreach \x in {1,2,3} { body }  or \foreach \x/\y in {...} ...
    // Collect vars: sequence of \cs optionally separated by /
    const vars: string[] = [];
    while (peek() && peek()!.kind === "cs") {
      vars.push(consume()!.text);
      if (peek()?.kind === "slash") { consume(); continue; }
      else break;
    }
    if (vars.length === 0) { pushError("Expected \\var after \\foreach", cs); return null; }
    // Optional [options] before 'in' — e.g., \foreach \x [count=\i] in ...
    let options = "";
    if (peek()?.kind === "lbracket") {
      const opts = parseBracketOptions();
      options = opts.map(o => o.raw).join(", ");
    }
    // expect "in"
    if (peek()?.kind === "ident" && peek()!.text.toLowerCase() === "in") consume();
    else { pushError("Expected 'in' after \\foreach vars", cs); }
    // Parse list: either {...} or single token until {
    let list = "";
    if (peek()?.kind === "lbrace") {
      list = parseBraceRaw() ?? "";
    } else {
      // list may be like 1,...,5 or single value
      // capture until { or [ or ;
      let buf = "";
      while (peek() && peek()!.kind !== "lbrace" && peek()!.kind !== "lbracket" && peek()!.kind !== "semi") {
        // Stop before body brace
        if (peek()?.kind === "cs" || peek()?.kind === "lbrace") break;
        buf += consume()!.text + " ";
        // heuristic: if we see comma or ... then continue
        if (peek()?.kind === "lbrace") break;
      }
      list = buf.trim();
      // If next is [options] after list (alternative placement)
      if (peek()?.kind === "lbracket" && !options) {
        const opts = parseBracketOptions();
        options = opts.map(o => o.raw).join(", ");
      }
    }
    // Body: { ... } or single statement without braces (for path foreach)
    let body = "";
    if (peek()?.kind === "lbrace") {
      body = parseBraceRaw() ?? "";
    } else {
      body = "";
    }
    return { kind: "foreach", vars, list, options, body, loc };
  }

  function parseScopeBody(endCsText: string): PictureBodyItem[] {
    const body: PictureBodyItem[] = [];
    while (peek()) {
      const t = peek()!;
      if (t.kind === "cs" && t.text === "\\end") {
        // Check if this is \end{scope} or \end{tikzpicture} etc — peek ahead
        // Look at next tokens: \end {scope}
        const nextIsScope = (() => {
          let j = i + 1;
          while (j < tokens.length && tokens[j].kind !== "lbrace" && tokens[j].kind !== "cs") j++;
          if (j < tokens.length && tokens[j].kind === "lbrace") {
            let k = j + 1;
            let inner = "";
            while (k < tokens.length && tokens[k].kind !== "rbrace") { inner += tokens[k].text; k++; }
            return inner.trim() === "scope";
          }
          return false;
        })();
        if (nextIsScope && endCsText === "scope") break;
        if (!nextIsScope && endCsText === "tikzpicture") break;
        // otherwise not our end, treat as unknown
      }
      const item = parseAnyStatementInPicture();
      if (item) body.push(item);
      else {
        // handle bare { ... } as nested scope
        if (peek()?.kind === "lbrace") {
          const braceBody = parseBraceScope();
          if (braceBody) body.push(braceBody);
        } else {
          // skip token
          if (peek()) consume();
        }
      }
    }
    return body;
  }

  function parseBraceScope(): ScopeStatement | null {
    if (!peek() || peek()!.kind !== "lbrace") return null;
    const loc = locFrom(peek()!);
    const raw = parseBraceRaw();
    if (raw === null) return null;
    // Parse the raw content as picture body items via recursive parse of that snippet
    // For Phase2, we treat { \draw ...; \fill ...; } as a scope with no options
    // Quick: lex the raw and parse it as picture body
    const inner = parseSnippetBody(raw, loc);
    return { kind: "scope", options: [], body: inner, loc };
  }

  function parseSnippetBody(snippet: string, loc: Loc): PictureBodyItem[] {
    // Use a fresh parse of snippet to get body items, but avoid infinite recursion
    // We lex snippet and parse statements similarly
    const sub = parse(snippet);
    // sub.pictures may contain one picture with body; flatten
    const items: PictureBodyItem[] = [];
    for (const p of sub.pictures) items.push(...p.body);
    // Also handle case where snippet had no \begin{tikzpicture} but bare statements
    // sub.pictures already contains those
    return items;
  }

  function parseScopeStatement(startCs: Token): ScopeStatement | null {
    // \begin{scope}[opts] ... \end{scope}
    const loc = locFrom(startCs);
    // startCs is \begin, we have already consumed it? In parsePictureEnv we handle tikzpicture specially,
    // For scope we call this after seeing \begin and peeking {scope}
    // Here we assume caller has consumed \begin and verified {scope}
    // Instead, this function expects to be called when we have just consumed \begin and {scope}
    // For simplicity, we handle directly here: parseScopeEnv will be called from main loop
    return { kind: "scope", options: [], body: [], loc };
  }

  function parseNodeStatement(cs: Token): NodeStatement | null {
    const loc = locFrom(cs);
    // \node[opts] (name) at (coord) {text};
    let opts = parseBracketOptions();
    let name: string | undefined;
    if (peek()?.kind === "lparen") {
      const c = parseCoordinate();
      if (c?.kind === "named") name = c.name;
    }
    if (peek()?.kind === "lbracket") {
      const extra = parseBracketOptions();
      opts = [...opts, ...extra];
    }
    // optional "at"
    if (peek()?.kind === "ident" && peek()!.text.toLowerCase() === "at") {
      consume();
    }
    let at: Coordinate | null = null;
    if (peek()?.kind === "lparen" || peek()?.kind === "plus") {
      at = parseCoordinate();
    }
    // also after at may have more brackets?
    if (peek()?.kind === "lbracket") {
      const extra2 = parseBracketOptions();
      opts = [...opts, ...extra2];
    }
    // text in braces { ... }
    let text = "";
    if (peek()?.kind === "lbrace") {
      text = parseBraceRaw() ?? "";
    }
    if (peek()?.kind === "semi") consume();
    else pushError("Missing ';' after \\node", cs);
    return { kind: "node", name, at, options: opts, text, loc };
  }

  function parseAnyStatementInPicture(): PictureBodyItem | null {
    const t = peek();
    if (!t) return null;
    if (t.kind === "cs") {
      switch (t.text) {
        case "\\draw":
        case "\\fill":
        case "\\filldraw":
        case "\\path":
        case "\\shade":
        case "\\shadedraw":
        case "\\clip":
          return parsePathStatement(consume()!);
        case "\\coordinate":
          return parsePathStatement(consume()!);
        case "\\node":
          return parseNodeStatement(consume()!);
        case "\\tikzset":
          return parseTikzSetStatement(consume()!);
        case "\\tikzstyle":
          return parseTikZStyleStatement(consume()!);
        case "\\definecolor":
          return parseDefineColorStatement(consume()!);
        case "\\colorlet":
          return parseColorLetStatement(consume()!);
        case "\\def":
          return parseDefStatement(consume()!);
        case "\\newcommand":
        case "\\renewcommand":
          return parseNewCommandStatement(consume()!);
        case "\\let":
          return parseLetStatement(consume()!);
        case "\\pgfmathsetmacro":
          return parsePgfMathSetMacroStatement(consume()!, false);
        case "\\pgfmathtruncatemacro":
          return parsePgfMathSetMacroStatement(consume()!, true);
        case "\\foreach":
          return parseForeachStatement(consume()!);
        case "\\begin": {
          // Check if it's \begin{scope}
          const startPos = i;
          const beginTok = consume()!;
          if (peek()?.kind === "lbrace") {
            const braceContent = peekBraceContent();
            if (braceContent?.trim() === "scope") {
              // consume {scope}
              parseBraceRaw(); // consume it
              const opts = parseBracketOptions();
              const loc = locFrom(beginTok);
              // Parse body until \end{scope}
              const body: PictureBodyItem[] = [];
              while (peek()) {
                const tt = peek()!;
                if (tt.kind === "cs" && tt.text === "\\end") {
                  // Check if \end{scope}
                  let j = i + 1;
                  // peek ahead for {scope}
                  const nextBrace = (() => {
                    let k = i + 1;
                    while (k < tokens.length && tokens[k].kind !== "lbrace") k++;
                    if (k < tokens.length) {
                      let inner = "";
                      let depth = 0;
                      for (let q = k; q < tokens.length; q++) {
                        if (tokens[q].kind === "lbrace") depth++;
                        else if (tokens[q].kind === "rbrace") { depth--; if (depth === 0) break; }
                        if (depth === 1 && tokens[q].kind !== "lbrace" && tokens[q].kind !== "rbrace") inner += tokens[q].text;
                      }
                      return inner.trim();
                    }
                    return "";
                  })();
                  if (nextBrace === "scope") {
                    // consume \end{scope}
                    consume(); // \end
                    parseBraceRaw(); // {scope}
                    break;
                  }
                }
                const innerItem = parseAnyStatementInPicture();
                if (innerItem) body.push(innerItem);
                else {
                  if (peek()?.kind === "lbrace") {
                    const sc = parseBraceScope();
                    if (sc) body.push(sc);
                    else consume();
                  } else if (peek()) consume();
                  else break;
                }
              }
              return { kind: "scope", options: opts, body, loc };
            } else {
              // Not scope, rewind? It's tikzpicture already handled elsewhere, so treat as error
              i = startPos;
              pushError(`Unknown environment ${braceContent}`, beginTok);
              consume(); // consume \begin to avoid loop
              // skip until \end
              while (peek() && !(peek()!.kind === "cs" && peek()!.text === "\\end")) consume();
              return null;
            }
          }
          return null;
        }
        case "\\end":
          // Should be handled by caller (scope/picture end)
          return null;
        default:
          // Unknown cs inside picture — treat as error but allow expander to handle (\def etc already covered)
          pushError(`Unknown command ${t.text} inside tikzpicture`, t);
          consume();
          // skip to ;
          while (peek() && peek()!.kind !== "semi" && !(peek()!.kind === "cs" && peek()!.text === "\\end")) consume();
          if (peek()?.kind === "semi") consume();
          return null;
      }
    }
    // Handle bare { ... } as scope
    if (t.kind === "lbrace") {
      return parseBraceScope();
    }
    // For path-level foreach inside picture? e.g., \draw ... ; but foreach is cs, already handled
    return null;
  }

  function parsePathStatement(cs: Token): PathStatement | CoordinateStatement | null {
    const actionMap: Record<string, PathStatement["action"]> = {
      "\\draw": "draw",
      "\\fill": "fill",
      "\\filldraw": "filldraw",
      "\\path": "path",
      "\\shade": "shade",
      "\\shadedraw": "shadedraw",
      "\\clip": "clip",
    };
    const act = actionMap[cs.text] ?? "path";
    const loc = locFrom(cs);
    // Special handling for \coordinate
    if (cs.text === "\\coordinate") {
      const opts = parseBracketOptions();
      // Expect (name)
      let name = "";
      if (peek()?.kind === "lparen") {
        const c = parseCoordinate();
        if (c?.kind === "named") name = c.name;
        else if (c) name = (c as unknown as { name: string }).name ?? "";
        else pushError("Expected (name) after \\coordinate", cs);
      } else {
        pushError("Expected (name) after \\coordinate", cs);
      }
      // optional "at"
      if (peek()?.kind === "ident" && peek()!.text.toLowerCase() === "at") consume();
      let at: Coordinate | null = null;
      if (peek()?.kind === "lparen" || peek()?.kind === "plus") {
        at = parseCoordinate();
      }
      // consume ;
      if (peek()?.kind === "semi") consume();
      else pushError("Missing ';' after \\coordinate", cs);
      return { kind: "coordinate", name: name || `coord_${i}`, at, options: opts, loc };
    }

    const opts = parseBracketOptions();
    // Phase2: Check for \foreach inside path: \draw \foreach ...
    if (peek()?.kind === "cs" && peek()!.text === "\\foreach") {
      // This is a foreach inside path — we treat as a special path op that will be expanded later
      // For parser, we will parse foreach and store as a path with foreach inside? Simplify: parse foreach statement and return as path that contains foreach?
      // For now, create a separate ForeachStatement and let evaluator handle path-level foreach via expansion
      // Mark as raw and let caller handle? Instead, we handle path-level foreach by capturing the foreach loop as part of path ops
      // We'll parse the foreach and then continue parsing path ops after it, but for Phase2 minimal, we expand immediately:
      // Consume \foreach and parse it, then treat its body as additional ops
      // For simplicity, we will parse foreach and then parse remaining path ops as usual, but the foreach body will be expanded by evaluator
      // So we still need to parse path ops that may include foreach — we'll delegate to outside
    }
    const ops = parsePathOps();
    if (peek()?.kind === "semi") consume();
    else {
      // For error tolerance, if semicolon missing, report but keep partial
      if (peek()) pushError("Missing ';' after path", peek()!);
    }
    return { kind: "path", action: act, options: opts, ops, loc };
  }

  function parseTikzInline(startCs: Token): void {
    // \tikz [opts] { ... }  or  \tikz [opts] \draw ... ;
    const loc = locFrom(startCs);
    const opts = parseBracketOptions();
    if (peek()?.kind === "lbrace") {
      consume(); // {
      const body: (PathStatement | CoordinateStatement)[] = [];
      while (peek() && peek()!.kind !== "rbrace") {
        const t = peek()!;
        if (t.kind === "cs" && ["\\draw", "\\fill", "\\filldraw", "\\path", "\\coordinate", "\\clip", "\\shade"].includes(t.text)) {
          const cs = consume()!;
          const stmt = parsePathStatement(cs);
          if (stmt) body.push(stmt as never);
        } else if (t.kind === "cs" && t.text === "\\node") {
          const stmt = parseNodeStatement(consume()!);
          if (stmt) body.push(stmt as never);
        } else {
          consume();
        }
      }
      if (peek()?.kind === "rbrace") consume();
      else pushError("Unclosed '{' after \\tikz", startCs);
      const pic: Picture = { kind: "picture", options: opts, body, loc };
      ast.push(pic);
      pictures.push(pic);
    } else {
      // Single statement form: \tikz \draw ... ;
      // Parse one statement
      if (peek()?.kind === "cs" && ["\\draw", "\\fill", "\\filldraw", "\\path", "\\coordinate"].includes(peek()!.text)) {
        const cs = consume()!;
        const stmt = parsePathStatement(cs);
        const pic: Picture = { kind: "picture", options: opts, body: stmt ? [stmt as never] : [], loc };
        ast.push(pic);
        pictures.push(pic);
      } else {
        // Check for \tikz[opts] (0,0) -- (1,1);  unlikely but handle?
        const ops = parsePathOps();
        if (ops.length > 0) {
          const stmt: PathStatement = { kind: "path", action: "draw", options: [], ops, loc };
          const pic: Picture = { kind: "picture", options: opts, body: [stmt], loc };
          ast.push(pic);
          pictures.push(pic);
          if (peek()?.kind === "semi") consume();
        }
      }
    }
  }

  function parsePictureEnv(): void {
    // \begin{tikzpicture}[opts]  ... \end{tikzpicture}
    const beginCs = consume()!; // \begin
    // expect {tikzpicture}
    let found = false;
    // skip until {tikzpicture}
    while (peek()) {
      const t = peek()!;
      if (t.kind === "lbrace") {
        consume();
        // collect ident inside
        let inner = "";
        while (peek() && peek()!.kind !== "rbrace") {
          const tt = consume()!;
          inner += tt.text;
        }
        if (peek()?.kind === "rbrace") consume();
        if (inner.trim() === "tikzpicture") { found = true; break; }
      } else {
        consume();
      }
    }
    if (!found) { pushError("Expected {tikzpicture} after \\begin", beginCs); return; }
    const opts = parseBracketOptions();
    const loc = locFrom(beginCs);
    const body: PictureBodyItem[] = [];
    while (peek()) {
      const t = peek()!;
      if (t.kind === "cs" && t.text === "\\end") {
        // Peek ahead to see if \end{tikzpicture}
        let j = i + 1;
        let isTikzEnd = false;
        // Find next lbrace content
        while (j < tokens.length) {
          if (tokens[j].kind === "lbrace") {
            let k = j + 1; let inner = "";
            while (k < tokens.length && tokens[k].kind !== "rbrace") { inner += tokens[k].text; k++; }
            if (inner.trim() === "tikzpicture") isTikzEnd = true;
            break;
          }
          if (tokens[j].kind === "cs") break;
          j++;
        }
        if (isTikzEnd) {
          const endCs = consume()!;
          // skip {tikzpicture}
          while (peek() && peek()!.kind !== "rbrace") {
            if (peek()!.kind === "lbrace") {
              consume();
              while (peek() && peek()!.kind !== "rbrace") consume();
              if (peek()?.kind === "rbrace") consume();
              break;
            } else consume();
          }
          const pic: Picture = { kind: "picture", options: opts, body, loc };
          ast.push(pic);
          pictures.push(pic);
          void endCs;
          return;
        }
        // Not our end — let scope handler deal with \end{scope} etc.
        const item = parseAnyStatementInPicture();
        if (item) body.push(item);
        else if (peek()) consume();
        continue;
      }
      // Try to parse any picture body item (draw, scope, tikzset, definecolor, foreach, etc.)
      const item = parseAnyStatementInPicture();
      if (item) {
        body.push(item);
        continue;
      }
      // Handle bare { ... } as scope
      if (peek()?.kind === "lbrace") {
        const sc = parseBraceScope();
        if (sc) { body.push(sc); continue; }
      }
      // If not handled, consume one token to avoid infinite
      if (peek()) consume();
      else break;
    }
    // EOF without \end
    pushError("Missing \\end{tikzpicture}", beginCs);
    const pic: Picture = { kind: "picture", options: opts, body, loc };
    ast.push(pic);
    pictures.push(pic);
  }

  // -------- main loop (also handles preamble where pictures may be implicit) --------
  // Collect preamble items that should be hoisted into next picture (tikzset, definecolor, macros)
  const pendingPreamble: PictureBodyItem[] = [];
  while (i < tokens.length) {
    const t = peek()!;
    if (!t) break;
    if (t.kind === "cs" && t.text === "\\begin") {
      // Check if it's tikzpicture or scope — tikzpicture creates new picture, scope is inside
      const isTikzPic = (() => {
        let j = i + 1;
        while (j < tokens.length) {
          if (tokens[j].kind === "lbrace") {
            let k = j + 1; let inner = "";
            while (k < tokens.length && tokens[k].kind !== "rbrace") { inner += tokens[k].text; k++; }
            return inner.trim() === "tikzpicture";
          }
          j++;
          if (tokens[j]?.kind === "cs") break;
        }
        return false;
      })();
      if (isTikzPic) {
        parsePictureEnv();
        // pending preamble should have been prepended? Actually picture already created with its own body;
        // If we had pending items before first picture, inject them
        if (pendingPreamble.length > 0 && pictures.length > 0) {
          const last = pictures[pictures.length - 1];
          last.body.unshift(...pendingPreamble);
          pendingPreamble.length = 0;
        }
        continue;
      }
      // otherwise \begin{scope} — will be handled inside picture body, but if at top level, treat as standalone
      // For top-level, create implicit picture for scope
      const scItem = parseAnyStatementInPicture();
      if (scItem) {
        if (pendingPreamble.length > 0 || scItem.kind === "scope") {
          // Wrap in implicit picture
          const pic: Picture = { kind: "picture", options: [], body: [...pendingPreamble, scItem], loc: (scItem as any).loc };
          ast.push(pic); pictures.push(pic);
          pendingPreamble.length = 0;
        } else {
          pendingPreamble.push(scItem);
        }
        continue;
      }
      consume();
      continue;
    }
    if (t.kind === "cs" && t.text === "\\tikz") {
      const cs = consume()!;
      parseTikzInline(cs);
      // inject pending preamble into that picture if needed
      if (pendingPreamble.length > 0 && pictures.length > 0) {
        const last = pictures[pictures.length - 1];
        last.body.unshift(...pendingPreamble);
        pendingPreamble.length = 0;
      }
      continue;
    }
     // Top-level statements that create implicit pictures
    if (t.kind === "cs" && ["\\draw", "\\fill", "\\filldraw", "\\path", "\\coordinate", "\\clip", "\\shade", "\\shadedraw", "\\node"].includes(t.text)) {
      if (t.text === "\\node") {
        const stmt = parseNodeStatement(consume()!);
        if (stmt) {
          const pic: Picture = { kind: "picture", options: [], body: [...pendingPreamble, stmt as never], loc: locFrom(t) };
          ast.push(pic);
          pictures.push(pic);
          pendingPreamble.length = 0;
        }
        continue;
      }
      const cs = consume()!;
      const stmt = parsePathStatement(cs);
      if (stmt) {
        const pic: Picture = { kind: "picture", options: [], body: [...pendingPreamble, stmt as never], loc: locFrom(cs) };
        ast.push(pic);
        pictures.push(pic);
        pendingPreamble.length = 0;
      }
      continue;
    }
    // Preamble / global definitions that don't create pictures themselves
    if (t.kind === "cs" && ["\\tikzset", "\\tikzstyle", "\\definecolor", "\\colorlet", "\\def", "\\newcommand", "\\renewcommand", "\\let", "\\pgfmathsetmacro", "\\pgfmathtruncatemacro", "\\foreach"].includes(t.text)) {
      const item = parseAnyStatementInPicture();
      if (item) {
        // If we are outside any picture, buffer it for next picture; otherwise if no picture yet, keep pending
        pendingPreamble.push(item);
        // Also push as a standalone picture if it's a foreach that should render? For \foreach at top-level without picture, it will be hoisted
        // If body contains drawable, it will be handled when next picture is created
        continue;
      }
    }
    if (t.kind === "cs" && t.text === "\\usetikzlibrary") {
      // skip \usetikzlibrary{...}
      consume();
      if (peek()?.kind === "lbrace") {
        let depth = 0;
        while (peek()) {
          const k = peek()!.kind;
          if (k === "lbrace") depth++;
          else if (k === "rbrace") { depth--; consume(); if (depth <= 0) break; continue; }
          consume();
        }
      }
      continue;
    }
    if (t.kind === "cs" && t.text === "\\foreach") {
      const item = parseForeachStatement(consume()!);
      if (item) pendingPreamble.push(item);
      continue;
    }
    // Bare scope {…} at top level
    if (t.kind === "lbrace") {
      const sc = parseBraceScope();
      if (sc) {
        const pic: Picture = { kind: "picture", options: [], body: [...pendingPreamble, sc], loc: sc.loc };
        ast.push(pic); pictures.push(pic);
        pendingPreamble.length = 0;
        continue;
      }
    }
    // Ignore other preamble commands (\documentclass, \usepackage, etc.) and stray tokens
    consume();
  }
  // If any pending preamble items never got a picture, create an implicit picture for them if they contain drawable content
  if (pendingPreamble.length > 0) {
    // Check if any item is drawable (scope with body, foreach, etc.) — if all are definitions, we can ignore
    const hasDrawable = pendingPreamble.some(p => p.kind === "scope" || p.kind === "foreach" || p.kind === "path" || p.kind === "coordinate");
    if (hasDrawable) {
      const pic: Picture = { kind: "picture", options: [], body: [...pendingPreamble], loc: { line: 1, column: 1, pos: 0 } };
      ast.push(pic); pictures.push(pic);
    } else {
      // No drawable — attach to a dummy picture so evaluator still processes definecolor etc? But evaluator will need global state
      // Create a picture with just definitions (will be processed for side-effects)
      if (pictures.length === 0) {
        const pic: Picture = { kind: "picture", options: [], body: [...pendingPreamble], loc: { line: 1, column: 1, pos: 0 } };
        ast.push(pic); pictures.push(pic);
      } else {
        // Append to first picture's preamble
        pictures[0].body.unshift(...pendingPreamble);
      }
    }
  }

  // Edge: no picture found but tokens existed — errors already captured
  if (pictures.length === 0 && ast.length === 0 && tokens.length > 0) {
    // Create empty ast to allow partial render fallback
  }

  return { ast, pictures, errors, tokens };
}
