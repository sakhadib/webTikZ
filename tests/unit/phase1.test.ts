import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.ts";
import { lex } from "../../src/lexer/index.ts";

const examples: { name: string; src: string; expectItems?: number }[] = [
  { name: "01 simple line", src: "\\draw (0,0) -- (1,1);" },
  { name: "02 help lines grid", src: "\\draw[help lines] (0,0) grid (4,3);" },
  { name: "03 red thick rectangle", src: "\\draw[red,thick] (0,0) rectangle (2,1);" },
  { name: "04 circle radius", src: "\\draw (0,0) circle [radius=1cm];" },
  { name: "05 circle paren", src: "\\draw (0,0) circle (1cm);" },
  { name: "06 grid step default", src: "\\draw (0,0) grid (2,2);" },
  { name: "07 cycle triangle", src: "\\draw (0,0) -- (1,0) -- (1,1) -- cycle;" },
  { name: "08 arrow dashed", src: "\\draw[->,dashed] (0,0) -- (2,0);" },
  { name: "09 double arrow", src: "\\draw[<->] (0,0) -- (2,0);" },
  { name: "10 named coordinate", src: "\\coordinate (A) at (0,0); \\draw (A) -- (1,1);" },
  { name: "11 relative ++", src: "\\draw (0,0) -- ++(1,0) -- ++(0,1);" },
  { name: "12 relative +", src: "\\draw (0,0) -- +(1,0) -- (2,0);" },
  { name: "13 polar", src: "\\draw (30:2) -- (0,0);" },
  { name: "14 fill rectangle", src: "\\fill[blue] (0,0) rectangle (1,1);" },
  { name: "15 filldraw circle", src: "\\filldraw[draw=red,fill=blue] (0,0) circle (0.5cm);" },
  { name: "16 ultra thick dotted", src: "\\draw[ultra thick, dotted] (0,0) -- (1,0);" },
  { name: "17 densely dashed", src: "\\draw[densely dashed, red] (0,0) -- (2,0);" },
  { name: "18 line width 2pt", src: "\\draw[line width=2pt] (0,0) -- (1,0);" },
  { name: "19 blue!30 mixing", src: "\\draw[blue!30] (0,0) -- (1,0);" },
  { name: "20 olive lime", src: "\\draw[draw=olive, fill=lime] (0,0) rectangle (1,1);" },
  { name: "21 tikzpicture env", src: "\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}" },
  { name: "22 inline tikz", src: "\\tikz \\draw (0,0) -- (1,0);" },
  { name: "23 multiple coordinates", src: "\\coordinate (A) at (0,0); \\coordinate (B) at (2,0); \\draw (A) -- (B);" },
  { name: "24 rectangle mm", src: "\\draw (0,0) rectangle (20mm,10mm);" },
  { name: "25 grid step 5mm", src: "\\draw[step=5mm] (0,0) grid (2,2);" },
  { name: "26 small circle 5pt", src: "\\draw (0,0) circle (5pt);" },
  { name: "27 mixed path", src: "\\draw (0,0) -- (1,0) rectangle (2,1);" },
  { name: "28 error partial", src: "\\draw (0,0) -- (1,0) -- ; \\draw (0,0) -- (0,1);" },
  { name: "29 help lines step", src: "\\draw[help lines, step=0.5cm] (0,0) grid (2,2);" },
  { name: "30 complex", src: "\\draw[red,thick,dashed,->] (0,0) -- (30:2) -- (2,0) -- cycle;" },
];

describe("Phase 1 — 30 curated node-free examples", () => {
  for (const ex of examples) {
    it(ex.name, async () => {
      const { displayList, errors } = await compile(ex.src);
      // Should have at least one path item unless it's the error case that still partial
      expect(displayList.items.length).toBeGreaterThan(0);
      expect(displayList.bbox.isEmpty).toBe(false);
      // No hard errors for valid examples (28 is expected to have error but still render second path)
      if (ex.name !== "28 error partial") {
        const hard = errors.filter(e => e.severity === "error");
        expect(hard.length).toBe(0);
      }
      // Basic visual sanity: bbox dimensions positive
      expect(displayList.bbox.width).toBeGreaterThan(0);
      expect(displayList.bbox.height).toBeGreaterThan(0);
    });
  }
});

describe("Lexer Phase 1", () => {
  it("tokenizes arrows and line widths", () => {
    const { tokens } = lex("\\draw[->, ultra thick, dashed] (0,0) -- (1,0);");
    expect(tokens.some(t => t.text === "->")).toBe(true);
  });
  it("handles help lines as two idents but option raw preserves space", async () => {
    const { displayList } = await compile("\\draw[help lines] (0,0) -- (1,0);");
    const it = displayList.items[0] as any;
    expect(it.stroke.color).toBe("#808080");
    expect(it.stroke.widthPt).toBe(0.2);
  });
});

describe("Coordinates Phase 1", () => {
  it("polar (30:2) produces correct endpoint", async () => {
    const { displayList } = await compile("\\draw (0,0) -- (30:2);");
    const it = displayList.items[0] as any;
    const end = it.segments[1].to;
    // 30deg, radius 2cm = 56.9pt * cos/sin
    expect(end.x).toBeCloseTo(49.3, 0.5);
    expect(end.y).toBeCloseTo(28.45, 0.5);
  });
  it("named coordinate resolves", async () => {
    const { displayList } = await compile("\\coordinate (P) at (1,2); \\draw (P) -- (0,0);");
    expect(displayList.nodes["P"]).toBeDefined();
  });
});

describe("Error reporting", () => {
  it("reports line:column and codeFrame", async () => {
    const { errors } = await compile("\\draw (0,0) -- (1,0\n"); // missing )
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].line).toBe(1);
    expect(errors[0].column).toBeGreaterThan(0);
    expect(errors[0].codeFrame).toBeDefined();
  });
  it("partial render on error", async () => {
    const { displayList, errors } = await compile("\\draw (0,0) -- ; \\draw (0,0) -- (1,0);");
    expect(errors.length).toBeGreaterThan(0);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
});
