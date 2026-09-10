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
 * Phase 0/1 minimal lexer: TeX-ish tokenizer with source positions.
 * Covers: control sequences (\draw), groups {} [] (), ; , -- , comments %, numbers+units, identifiers.
 */
export function lex(input: string): { tokens: Token[]; errors: LexError[] } {
  const tokens: Token[] = [];
  const errors: LexError[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const len = input.length;

  function push(kind: string, text: string, startLine: number, startCol: number, startPos: number): void {
    tokens.push({ kind, text, line: startLine, column: startCol, pos: startPos });
  }

  while (i < len) {
    const startPos = i;
    const startLine = line;
    const startCol = col;
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
        j++; // single non-letter e.g. \\, \;, \%
      }
      const text = input.slice(i, j);
      const adv = j - i;
      push("cs", text, startLine, startCol, startPos);
      i = j;
      col += adv;
      continue;
    }

    // numbers with optional unit
    if (/[0-9.\-+]/.test(ch) && /[0-9]/.test(input[i] === "-" || input[i] === "+" || input[i] === "." ? (input[i+1] ?? "") : ch)) {
      let j = i;
      if (input[j] === "+" || input[j] === "-") j++;
      while (j < len && /[0-9]/.test(input[j])) j++;
      if (j < len && input[j] === ".") { j++; while (j < len && /[0-9]/.test(input[j])) j++; }
      // unit
      const uStart = j;
      while (j < len && /[a-zA-Z%]/.test(input[j])) j++;
      const text = input.slice(i, j);
      const hasUnit = j > uStart;
      push(hasUnit ? "dimension" : "number", text, startLine, startCol, startPos);
      col += j - i;
      i = j;
      continue;
    }

    // two-char operators -- , |- , -|
    if (ch === "-" && input[i + 1] === "-") { push("op", "--", startLine, startCol, startPos); i += 2; col += 2; continue; }
    if (ch === "|" && input[i + 1] === "-") { push("op", "|-", startLine, startCol, startPos); i += 2; col += 2; continue; }
    if (ch === "-" && input[i + 1] === "|") { push("op", "-|", startLine, startCol, startPos); i += 2; col += 2; continue; }

    // single char punctuation
    const singles: Record<string, string> = {
      "{": "lbrace", "}": "rbrace",
      "[": "lbracket", "]": "rbracket",
      "(": "lparen", ")": "rparen",
      ";": "semi", ",": "comma", ":": "colon", ".": "dot",
      "=": "equals", "/": "slash", "!": "bang",
    };
    if (singles[ch]) { push(singles[ch], ch, startLine, startCol, startPos); i++; col++; continue; }

    // plain char
    if (/[a-zA-Z]/.test(ch)) {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9@]/.test(input[j])) j++;
      push("ident", input.slice(i, j), startLine, startCol, startPos);
      col += j - i;
      i = j;
      continue;
    }

    // fallback single
    push("char", ch, startLine, startCol, startPos);
    i++; col++;
  }

  return { tokens, errors };
}
