import { lex, type Token } from "../lexer/index.ts";

export interface ParseError { message: string; line: number; column: number; }

export type ASTNode =
  | { kind: "picture"; options?: string; body: ASTNode[]; loc: Loc }
  | { kind: "draw"; options?: string; path: PathOp[]; loc: Loc }
  | { kind: "raw"; text: string; loc: Loc };

export interface PathOp {
  kind: "moveto" | "lineto" | "raw";
  coord?: { x: string; y: string; loc: Loc };
  text: string;
}

export interface Loc { line: number; column: number; pos: number; }

export interface ParseResult {
  ast: ASTNode[];
  errors: ParseError[];
  tokens: Token[];
}

/**
 * Minimal Phase 0 parser: extracts tikzpicture env and \draw statements.
 * Full recursive-descent with AST is Phase 1; this stub satisfies exit criteria.
 */
export function parse(source: string): ParseResult {
  const { tokens, errors: lexErrors } = lex(source);
  const errors: ParseError[] = lexErrors.map(e => ({ message: e.message, line: e.line, column: e.column }));

  const ast: ASTNode[] = [];
  let i = 0;

  function peek(off = 0): Token | undefined { return tokens[i + off]; }
  function consume(): Token | undefined { return tokens[i++]; }

  // Extract \begin{tikzpicture} ... \end{tikzpicture} or bare statements
  let inPicture = false;
  let pictureBody: ASTNode[] = [];
  let pictureLoc: Loc | null = null;

  while (i < tokens.length) {
    const t = peek();
    if (!t) break;

    // \begin{tikzpicture}
    if (t.kind === "cs" && t.text === "\\begin") {
      const nxt = peek(1);
      // look ahead for {tikzpicture}
      // consume \begin { tikzpicture }
      consume(); // \begin
      // skip until rbrace that closes tikzpicture
      let found = false;
      while (peek() && !(peek()!.kind === "ident" && peek()!.text === "tikzpicture")) {
        consume();
      }
      if (peek()?.text === "tikzpicture") { consume(); found = true; }
      // consume to rbrace
      while (peek() && peek()!.kind !== "rbrace") consume();
      if (peek()?.kind === "rbrace") consume();
      // options [...]
      if (peek()?.kind === "lbracket") {
        // skip bracketed options
        let depth = 0;
        while (peek()) {
          const k = peek()!.kind;
          if (k === "lbracket") depth++;
          else if (k === "rbracket") { depth--; consume(); if (depth <= 0) break; else continue; }
          consume();
        }
      }
      if (found) { inPicture = true; pictureLoc = { line: t.line, column: t.column, pos: t.pos }; continue; }
    }

    if (t.kind === "cs" && t.text === "\\end") {
      // consume \end{tikzpicture}
      const start = consume()!;
      while (peek() && peek()!.kind !== "rbrace") consume();
      if (peek()?.kind === "rbrace") consume();
      if (inPicture) {
        ast.push({ kind: "picture", body: pictureBody, loc: pictureLoc! });
        pictureBody = [];
        inPicture = false;
        void start;
      }
      continue;
    }

    // \draw / \fill / \path / \coordinate -- capture until ;
    if (t.kind === "cs" && ["\\draw", "\\fill", "\\filldraw", "\\path", "\\coordinate", "\\tikz"].includes(t.text)) {
      const start = consume()!;
      const ops = extractPathOps();
      const node: ASTNode = { kind: "draw", path: ops, loc: { line: start.line, column: start.column, pos: start.pos } };
      if (inPicture) pictureBody.push(node);
      else ast.push(node);
      continue;
    }

    // bare \draw without env? also handle \draw inside picture already
    // fallback: collect raw until ;
    if (t.kind === "cs") {
      const start = consume()!;
      const raw = collectUntilSemi();
      const node: ASTNode = { kind: "raw", text: start.text + raw, loc: { line: start.line, column: start.column, pos: start.pos } };
      if (inPicture) pictureBody.push(node); else ast.push(node);
      continue;
    }

    consume();
  }

  if (inPicture && pictureBody.length > 0) {
    ast.push({ kind: "picture", body: pictureBody, loc: pictureLoc! });
  }

  return { ast, errors, tokens };

  function extractPathOps(): PathOp[] {
    const ops: PathOp[] = [];
    // collect raw coords like (0,0) -- (1,1)
    let buf = "";
    while (peek() && peek()!.kind !== "semi") {
      const cur = consume()!;
      buf += cur.text + " ";
      // detect coordinate
      if (cur.kind === "lparen") {
        // read until rparen
        let inner = "";
        while (peek() && peek()!.kind !== "rparen") inner += consume()!.text;
        if (peek()?.kind === "rparen") { consume(); buf += inner + ") "; }
      }
    }
    if (peek()?.kind === "semi") { consume(); buf += ";"; }
    if (buf.trim()) ops.push({ kind: "raw", text: buf.trim() });
    return ops;
  }

  function collectUntilSemi(): string {
    let s = " ";
    while (peek() && peek()!.kind !== "semi") s += consume()!.text + " ";
    if (peek()?.kind === "semi") { s += consume()!.text; }
    return s;
  }
}
