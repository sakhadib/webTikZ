/**
 * Syntax highlighting grammar stub for TikZ — Phase 10 tooling.
 * Provides TextMate, CodeMirror, Prism compatible grammar objects.
 */

export const textMateGrammar = {
  scopeName: "source.tikz",
  name: "TikZ",
  patterns: [
    { name: "keyword.control.tikz", match: "\\\\(draw|fill|path|node|coordinate|clip|shade|matrix|graph|foreach|tikzset|definecolor)\\b" },
    { name: "entity.name.tag.tikz", match: "\\\\begin\\{tikzpicture\\}|\\\\end\\{tikzpicture\\}" },
    { name: "comment.line.tikz", match: "%.*$" },
    { name: "constant.numeric.tikz", match: "\\b\\d+(\\.\\d+)?(pt|cm|mm|in|em|ex)?\\b" },
    { name: "string.quoted.tikz", match: "\"[^\"]*\"" },
    { name: "keyword.operator.tikz", match: "--|->|<->|\\|-|-\\|" },
  ],
  repository: {},
};

export const prismGrammar: Record<string, any> = {
  tikz: {
    comment: /%.*/,
    keyword: /\\(draw|fill|node|coordinate|path|clip|shade|matrix|graph|foreach)\b/,
    coord: /\([^)]+\)/,
    option: /\[[^\]]+\]/,
    string: /"[^"]*"/,
  },
};

export const codeMirrorMode = {
  name: "tikz",
  token: (stream: any) => {
    if (stream.match(/^%.*/)) return "comment";
    if (stream.match(/^\\[a-zA-Z]+/)) return "keyword";
    if (stream.match(/^\[[^\]]+\]/)) return "attribute";
    if (stream.match(/^\([^)]+\)/)) return "variable";
    stream.next();
    return null;
  },
};

export function tokenize(source: string): { type: string; value: string }[] {
  const tokens: { type: string; value: string }[] = [];
  const re = /(\\[a-zA-Z@]+|%.*|\\begin\{tikzpicture\}|\\end\{tikzpicture\}|\[[^\]]+\]|\([^)]+\)|--|->|<->|\S)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const v = m[1];
    let type = "text";
    if (v.startsWith("\\")) type = "keyword";
    else if (v.startsWith("%")) type = "comment";
    else if (v.startsWith("[")) type = "option";
    else if (v.startsWith("(")) type = "coord";
    else if (v === "--" || v === "->") type = "operator";
    tokens.push({ type, value: v });
  }
  return tokens;
}

export function getInlineErrorMarkers(errors: { line: number; column: number; message: string }[]): { line: number; col: number; message: string; severity: "error" | "warning" }[] {
  return errors.map(e => ({ line: e.line, col: e.column, message: e.message, severity: "error" as const }));
}
