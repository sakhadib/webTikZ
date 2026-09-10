import { describe, it, expect } from "vitest";
import { lex } from "../../src/lexer/index.ts";

describe("lexer", () => {
  it("tokenizes control sequences and positions", () => {
    const { tokens } = lex("\\draw (0,0) -- (1,1);");
    expect(tokens[0]).toMatchObject({ kind: "cs", text: "\\draw", line: 1, column: 1 });
    expect(tokens.some(t=>t.text==="--")).toBe(true);
  });
  it("handles % comments", () => {
    const { tokens } = lex("a % comment\n b");
    expect(tokens.map(t=>t.text)).toEqual(["a","b"]);
  });
});
