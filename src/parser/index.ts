import { lex, type Token } from "../lexer/index.ts";

export interface ParseError { message: string; line: number; column: number; pos: number; codeFrame?: string; }
export interface Loc { line: number; column: number; pos: number; }

export type Option = { raw: string; key: string; value?: string; loc: Loc };

export type Coordinate =
  | { kind: "cartesian"; x: string; y: string; loc: Loc; relative: "plus" | "plusplus" | null }
  | { kind: "polar"; angle: string; radius: string; loc: Loc; relative: "plus" | "plusplus" | null }
  | { kind: "named"; name: string; anchor?: string; loc: Loc; relative: "plus" | "plusplus" | null };

export type PathOp =
  | { kind: "move"; coord: Coordinate; loc: Loc }
  | { kind: "lineTo"; coord: Coordinate; loc: Loc }
  | { kind: "rectangle"; coord: Coordinate; loc: Loc }
  | { kind: "circle"; center: Coordinate | null; radiusPt?: string; options: Option[]; loc: Loc }
  | { kind: "grid"; coord: Coordinate; options: Option[]; loc: Loc }
  | { kind: "cycle"; loc: Loc }
  | { kind: "raw"; text: string; loc: Loc };

export type PathStatement = {
  kind: "path";
  action: "draw" | "fill" | "filldraw" | "path" | "shade" | "clip";
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

export type Picture = {
  kind: "picture";
  options: Option[];
  body: (PathStatement | CoordinateStatement)[];
  loc: Loc;
};

export type ASTNode = Picture | PathStatement | CoordinateStatement | { kind: "raw"; text: string; loc: Loc };

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

  // helpers for options
  function parseBracketOptions(): Option[] {
    if (!peek() || peek()!.kind !== "lbracket") return [];
    const lb = consume()!; // [
    const opts: Option[] = [];
    let buf: Token[] = [];
    let depth = 1;
    let optStart: Loc = locFrom(lb);
    function flush(): void {
      if (buf.length === 0) return;
      const first = buf[0], last = buf[buf.length - 1];
      const raw = source.slice(first.pos, last.pos + last.text.length).trim();
      if (!raw) { buf = []; return; }
      // split on first '='
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
      if (t.kind === "lbracket") { depth++; buf.push(consume()!); }
      else if (t.kind === "rbracket") {
        depth--;
        if (depth === 0) { flush(); consume(); break; }
        else buf.push(consume()!);
      } else if (t.kind === "comma" && depth === 1) {
        flush();
        consume();
        if (peek()) optStart = locFrom(peek()!);
      } else {
        if (buf.length === 0) optStart = locFrom(t);
        buf.push(consume()!);
      }
    }
    if (depth !== 0) pushError("Unclosed [ options", lb);
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

    // Polar: contains ':' (e.g., "30:2cm" or "30 : 2")
    // We look for colon token
    const colonIdx = innerTokens.findIndex(t => t.kind === "colon");
    if (colonIdx !== -1) {
      const angleToks = innerTokens.slice(0, colonIdx);
      const radiusToks = innerTokens.slice(colonIdx + 1);
      const angle = angleToks.map(t => t.text).join("").trim() || "0";
      const radius = radiusToks.map(t => t.text).join("").trim() || "1";
      return { kind: "polar", angle, radius, loc: startLoc, relative };
    }
    // Check for comma -> cartesian
    const commaIdx = innerTokens.findIndex(t => t.kind === "comma");
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
      // -- line
      if (t.kind === "op" && t.text === "--") {
        const loc = locFrom(consume());
        // Check for cycle immediately after --
        if (peek()?.kind === "ident" && peek()!.text.toLowerCase() === "cycle") {
          const cloc = locFrom(consume()!);
          ops.push({ kind: "cycle", loc: cloc });
          continue;
        }
        const coord = parseCoordinate();
        if (!coord) {
          pushError("Expected coordinate after '--'", t);
          // skip to next op or semi
          if (peek() && peek()!.kind !== "semi") consume();
          continue;
        }
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
      // grid
      if (t.kind === "ident" && t.text.toLowerCase() === "grid") {
        const loc = locFrom(consume());
        const gopts = parseBracketOptions();
        const coord = parseCoordinate();
        if (!coord) { pushError("Expected coordinate after 'grid'", t); continue; }
        ops.push({ kind: "grid", coord, options: gopts, loc });
        continue;
      }
      // cycle standalone
      if (t.kind === "ident" && t.text.toLowerCase() === "cycle") {
        const loc = locFrom(consume());
        ops.push({ kind: "cycle", loc });
        continue;
      }
      // |- or -| etc (Phase2) — treat as lineTo for now if encountered
      if (t.kind === "op" && (t.text === "|-" || t.text === "-|")) {
        const loc = locFrom(consume());
        const coord = parseCoordinate();
        if (!coord) { pushError(`Expected coordinate after '${t.text}'`, t); continue; }
        ops.push({ kind: "lineTo", coord, loc });
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

  function parsePathStatement(cs: Token): PathStatement | CoordinateStatement | null {
    const actionMap: Record<string, PathStatement["action"]> = {
      "\\draw": "draw",
      "\\fill": "fill",
      "\\filldraw": "filldraw",
      "\\path": "path",
      "\\shade": "shade",
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
    const body: (PathStatement | CoordinateStatement)[] = [];
    while (peek()) {
      const t = peek()!;
      if (t.kind === "cs" && t.text === "\\end") {
        // consume \end{tikzpicture}
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
      if (t.kind === "cs" && ["\\draw", "\\fill", "\\filldraw", "\\path", "\\coordinate", "\\clip", "\\shade"].includes(t.text)) {
        const cs = consume()!;
        const stmt = parsePathStatement(cs);
        if (stmt) body.push(stmt as never);
        continue;
      }
      if (t.kind === "cs" && t.text === "\\tikz") {
        const cs = consume()!;
        // Inline tikz inside picture? treat as nested
        // For now just parse as separate picture
        parseTikzInline(cs);
        continue;
      }
      // Skip other cs like \usetikzlibrary etc inside picture? error
      if (t.kind === "cs") {
        // Unknown command inside picture: consume and try to skip to ;
        pushError(`Unknown command ${t.text} inside tikzpicture`, t);
        consume();
        // skip to ;
        while (peek() && peek()!.kind !== "semi" && !(peek()!.kind === "cs" && peek()!.text === "\\end")) consume();
        if (peek()?.kind === "semi") consume();
        continue;
      }
      consume();
    }
    // EOF without \end
    pushError("Missing \\end{tikzpicture}", beginCs);
    const pic: Picture = { kind: "picture", options: opts, body, loc };
    ast.push(pic);
    pictures.push(pic);
  }

  // -------- main loop --------
  while (i < tokens.length) {
    const t = peek()!;
    if (!t) break;
    if (t.kind === "cs" && t.text === "\\begin") {
      parsePictureEnv();
      continue;
    }
    if (t.kind === "cs" && t.text === "\\tikz") {
      const cs = consume()!;
      parseTikzInline(cs);
      continue;
    }
    if (t.kind === "cs" && ["\\draw", "\\fill", "\\filldraw", "\\path", "\\coordinate", "\\clip", "\\shade"].includes(t.text)) {
      const cs = consume()!;
      const stmt = parsePathStatement(cs);
      if (stmt) {
        // Wrap bare statement in an implicit picture (lenient mode)
        const pic: Picture = { kind: "picture", options: [], body: [stmt as never], loc: locFrom(cs) };
        ast.push(pic);
        pictures.push(pic);
      }
      continue;
    }
    if (t.kind === "cs" && t.text === "\\usetikzlibrary") {
      // skip \usetikzlibrary{...}
      consume();
      // skip { ... }
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
    // Ignore other preamble commands (\documentclass, \usepackage, etc.) and stray tokens
    consume();
  }

  // Edge: no picture found but tokens existed — errors already captured
  if (pictures.length === 0 && ast.length === 0 && tokens.length > 0) {
    // Create empty ast to allow partial render fallback
  }

  return { ast, pictures, errors, tokens };
}
