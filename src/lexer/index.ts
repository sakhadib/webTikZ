export interface Token {
  kind: string;
  text: string;
  line: number;
  column: number;
  pos: number;
}

export interface LexError {
  message: string;
  line: number;
  column: number;
}

/**
 * Phase 1 Lexer: TeX-ish tokenizer with source positions.
 * Covers: control sequences, {}[]() ; , --, -> <- <-> |- -|, numbers+units, identifiers, % comments.
 */
export function lex(input: string): { tokens: Token[]; errors: LexError[] } {
  const tokens: Token[] = [];
  const errors: LexError[] = [];
  let i = 0;
  let line = 1;
  let col = 1;
  const len = input.length;

  function push(kind: string, text: string, sl: number, sc: number, sp: number): void {
    tokens.push({ kind, text, line: sl, column: sc, pos: sp });
  }

  while (i < len) {
    const sp = i;
    const sl = line;
    const sc = col;
    const ch = input[i];

    // whitespace
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      if (ch === "\n") { line++; col = 1; } else col++;
      i++;
      continue;
    }

    // comment % to end of line
    if (ch === "%") {
      while (i < len && input[i] !== "\n") { i++; col++; }
      continue;
    }

    // control sequence \xxx
    if (ch === "\\") {
      let j = i + 1;
      if (j < len && /[a-zA-Z@]/.test(input[j])) {
        while (j < len && /[a-zA-Z@]/.test(input[j])) j++;
      } else if (j < len) {
        j++;
      }
      const text = input.slice(i, j);
      push("cs", text, sl, sc, sp);
      i = j;
      col += j - sp;
      continue;
    }

    // arrows / multi-char ops — longest first
    if (input.startsWith("<->", i)) { push("op", "<->", sl, sc, sp); i += 3; col += 3; continue; }
    if (input.startsWith("->", i)) { push("op", "->", sl, sc, sp); i += 2; col += 2; continue; }
    if (input.startsWith("<-", i)) { push("op", "<-", sl, sc, sp); i += 2; col += 2; continue; }
    if (input.startsWith("--", i)) { push("op", "--", sl, sc, sp); i += 2; col += 2; continue; }
    if (input.startsWith("|-", i)) { push("op", "|-", sl, sc, sp); i += 2; col += 2; continue; }
    if (input.startsWith("-|", i)) { push("op", "-|", sl, sc, sp); i += 2; col += 2; continue; }

    // numbers with optional unit — only if looks like number
    // Do before single-char '+' '-' to correctly capture e.g. "2cm"
    if (/[0-9.\-+]/.test(ch)) {
      const next = input[i + 1] ?? "";
      const isNumberStart =
        /[0-9]/.test(ch) ||
        (ch === "." && /[0-9]/.test(next)) ||
        ((ch === "+" || ch === "-") && (/[0-9]/.test(next) || (next === "." && /[0-9]/.test(input[i + 2] ?? ""))));
      if (isNumberStart) {
        let j = i;
        if (input[j] === "+" || input[j] === "-") j++;
        while (j < len && /[0-9]/.test(input[j])) j++;
        if (j < len && input[j] === ".") { j++; while (j < len && /[0-9]/.test(input[j])) j++; }
        const uStart = j;
        while (j < len && /[a-zA-Z%]/.test(input[j])) j++;
        const text = input.slice(i, j);
        const hasUnit = j > uStart;
        push(hasUnit ? "dimension" : "number", text, sl, sc, sp);
        col += j - i;
        i = j;
        continue;
      }
    }

    // single char punctuation / brackets
    const singles: Record<string, string> = {
      "{": "lbrace", "}": "rbrace",
      "[": "lbracket", "]": "rbracket",
      "(": "lparen", ")": "rparen",
      ";": "semi", ",": "comma", ":": "colon", ".": "dot",
      "=": "equals", "/": "slash", "!": "bang",
      ">": "gt", "<": "lt",
      "+": "plus", "-": "minus",
      "*": "star", "^": "caret", "_": "underscore",
      "$": "dollar", "&": "amp", "#": "hash", "'": "quote", '"': "dquote",
    };
    if (singles[ch]) { push(singles[ch], ch, sl, sc, sp); i++; col++; continue; }

    // identifiers (letters)
    if (/[a-zA-Z]/.test(ch)) {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9@]/.test(input[j])) j++;
      push("ident", input.slice(i, j), sl, sc, sp);
      col += j - i;
      i = j;
      continue;
    }

    // fallback single
    push("char", ch, sl, sc, sp);
    i++; col++;
  }

  return { tokens, errors };
}
