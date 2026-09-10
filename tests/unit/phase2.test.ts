import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.ts";

// 150 curated Phase 2 examples (no nodes) — covers every checklist item
const examples: { name: string; src: string }[] = [];

// Helper to add
function add(name: string, src: string) { examples.push({ name, src }); }

// 1. Keys / styles (10)
add("keys-01 style", "\\tikzset{my style/.style={red, thick}} \\draw[my style] (0,0) -- (1,0);");
add("keys-02 append style", "\\tikzset{my style/.style={red}} \\tikzset{my style/.append style={thick}} \\draw[my style] (0,0) -- (1,0);");
add("keys-03 default", "\\tikzset{mykey/.initial=red, mykey/.default=blue} \\draw[mykey] (0,0) -- (1,0);");
add("keys-04 is choice", "\\tikzset{mychoice/.is choice, mychoice/a/.style={red}, mychoice/b/.style={blue}} \\draw[mychoice=a] (0,0) -- (1,0);");
add("keys-05 tikzset multiple", "\\tikzset{every picture/.style={scale=1.2}, every path/.style={thick}} \\draw (0,0) -- (1,0);");
add("keys-06 tikzstyle legacy", "\\tikzstyle{mybox}=[draw=red, thick] \\draw[mybox] (0,0) rectangle (1,1);");
add("keys-07 every picture", "\\tikzset{every picture/.style={red}} \\begin{tikzpicture}\\draw (0,0) -- (1,0);\\end{tikzpicture}");
add("keys-08 every path", "\\tikzset{every path/.style={blue}} \\draw (0,0) -- (1,0);");
add("keys-09 every scope", "\\tikzset{every scope/.style={shift={(0.5,0)}}} \\begin{tikzpicture}\\begin{scope}\\draw (0,0) -- (1,0);\\end{scope}\\end{tikzpicture}");
add("keys-10 style inheritance", "\\tikzset{a/.style={red}, b/.style={a, thick}} \\draw[b] (0,0) -- (1,0);");

// 2. Scopes (12)
add("scope-01 simple", "\\begin{tikzpicture}\\begin{scope}[shift={(1,0)}]\\draw (0,0) -- (1,0);\\end{scope}\\end{tikzpicture}");
add("scope-02 nested", "\\begin{tikzpicture}\\begin{scope}[scale=2]\\begin{scope}[shift={(1,0)}]\\draw (0,0) -- (1,0);\\end{scope}\\end{scope}\\end{tikzpicture}");
add("scope-03 brace group", "\\begin{tikzpicture}{\\draw (0,0) -- (1,0);} {\\draw (0,0) -- (1,1);}\\end{tikzpicture}");
add("scope-04 tikzset inside", "\\begin{tikzpicture}\\begin{scope}\\tikzset{mycol/.style={red}}\\draw[mycol] (0,0) -- (1,0);\\end{scope}\\end{tikzpicture}");
add("scope-05 option inheritance", "\\begin{tikzpicture}[scale=1.5]\\draw (0,0) -- (1,0);\\begin{scope}\\draw (0,0) -- (1,0);\\end{scope}\\end{tikzpicture}");
add("scope-06 multiple paths", "\\begin{scope}[shift={(1,0)}]\\draw (0,0) -- (1,0); \\fill[blue] (0,0) rectangle (1,1);\\end{scope}");
add("scope-07 empty", "\\begin{scope}[scale=2]\\end{scope} \\draw (0,0) -- (1,0);");
add("scope-08 with grid", "\\begin{scope}[shift={(0.5,0.5)}]\\draw[help lines] (0,0) grid (1,1);\\end{scope}");
add("scope-09 with circle", "\\begin{scope}[shift={(1,1)}]\\draw (0,0) circle (0.5cm);\\end{scope}");
add("scope-10 with foreach", "\\begin{scope}[scale=1.2]\\foreach \\x in {1,2} {\\draw (\\x,0) -- (\\x,1);}\\end{scope}");
add("scope-11 with definecolor", "\\begin{scope}\\definecolor{tmp}{rgb}{0.2,0.8,0.4}\\draw[tmp] (0,0) -- (1,0);\\end{scope}");
add("scope-12 clip scope", "\\begin{scope}[clip]\\draw (0,0) rectangle (1,1);\\fill[red] (0,0) rectangle (2,2);\\end{scope}");

// 3. Transforms (15)
add("trans-01 shift", "\\draw[shift={(1,1)}] (0,0) -- (1,0);");
add("trans-02 xshift", "\\draw[xshift=1cm] (0,0) -- (1,0);");
add("trans-03 yshift", "\\draw[yshift=5mm] (0,0) -- (1,0);");
add("trans-04 scale", "\\draw[scale=2] (0,0) rectangle (1,1);");
add("trans-05 xscale", "\\draw[xscale=2] (0,0) rectangle (1,1);");
add("trans-06 yscale", "\\draw[yscale=0.5] (0,0) rectangle (1,1);");
add("trans-07 rotate", "\\draw[rotate=30] (0,0) -- (1,0);");
add("trans-08 rotate around", "\\draw[rotate around={45:(0.5,0.5)}] (0,0) rectangle (1,1);");
add("trans-09 xslant", "\\draw[xslant=0.5] (0,0) rectangle (1,1);");
add("trans-10 yslant", "\\draw[yslant=0.3] (0,0) rectangle (1,1);");
add("trans-11 cm", "\\draw[cm={1,0,0,1,10,10}] (0,0) -- (1,0);");
add("trans-12 x vector", "\\draw[x={(2cm,0)}] (0,0) -- (1,0);");
add("trans-13 y vector", "\\draw[y={(0,2cm)}] (0,0) -- (1,0);");
add("trans-14 transform canvas", "\\draw[transform canvas={scale=2}] (0,0) -- (1,0);");
add("trans-15 combined", "\\draw[shift={(0.5,0)}, scale=1.5, rotate=15] (0,0) rectangle (1,1);");

// 4. Colors (12)
add("color-01 define rgb", "\\definecolor{myred}{rgb}{0.9,0.1,0.1} \\draw[myred] (0,0) -- (1,0);");
add("color-02 define RGB", "\\definecolor{myblue}{RGB}{10,120,200} \\draw[myblue] (0,0) -- (1,0);");
add("color-03 define HTML", "\\definecolor{myhtml}{HTML}{FF00FF} \\draw[myhtml] (0,0) -- (1,0);");
add("color-04 define gray", "\\definecolor{mygray}{gray}{0.5} \\draw[mygray] (0,0) -- (1,0);");
add("color-05 define cmyk", "\\definecolor{mycmyk}{cmyk}{0,1,1,0} \\draw[mycmyk] (0,0) -- (1,0);");
add("color-06 colorlet", "\\colorlet{mycol}{red!50} \\draw[mycol] (0,0) -- (1,0);");
add("color-07 mix 30", "\\draw[red!30!blue] (0,0) -- (1,0);");
add("color-08 blue20", "\\draw[blue!20] (0,0) -- (1,0);");
add("color-09 minus", "\\draw[-red] (0,0) -- (1,0);");
add("color-10 color text", "\\draw[color=olive] (0,0) -- (1,0); \\fill[color=teal] (0,0) rectangle (0.5,0.5);");
add("color-11 text", "\\draw[text=red] (0,0) -- (1,0);");
add("color-12 chained", "\\draw[red!20!blue!30!white] (0,0) -- (1,0);");

// 5. pgfmath (18)
add("math-01 basic", "\\draw ({2+3},0) -- (0,0);");
add("math-02 sin", "\\draw ({sin(30)},0) -- (0,0);");
add("math-03 cos", "\\draw ({cos(60)},0) -- (0,0);");
add("math-04 tan", "\\draw ({tan(45)},0) -- (0,0);");
add("math-05 sqrt", "\\draw ({sqrt(4)},0) -- (0,0);");
add("math-06 veclen", "\\draw ({veclen(3,4)},0) -- (0,0);");
add("math-07 atan2", "\\draw ({atan2(1,1)},0) -- (0,0);");
add("math-08 minmax", "\\draw ({min(1,2)},0) -- ({max(1,2)},0);");
add("math-09 mod", "\\draw ({mod(5,2)},0) -- (0,0);");
add("math-10 rnd", "\\draw ({rnd},0) -- (1,0);");
add("math-11 ifthenelse", "\\draw ({ifthenelse(1>0,2,3)},0) -- (0,0);");
add("math-12 pi e", "\\draw ({pi},0) -- ({e},0);");
add("math-13 pgfmathsetmacro", "\\pgfmathsetmacro{\\a}{2*3} \\draw (\\a,0) -- (0,0);");
add("math-14 trunc", "\\pgfmathtruncatemacro{\\b}{2.7} \\draw (\\b,0) -- (0,0);");
add("math-15 with units", "\\draw ({2cm+3mm},0) -- (0,0);");
add("math-16 braces", "\\draw ({2+3},0) -- ({sin(30)*2},0);");
add("math-17 complex", "\\draw ({veclen(3,4)*2},0) -- (0,0);");
add("math-18 nested", "\\draw ({sqrt(pow(2,2)+pow(3,2))},0) -- (0,0);");

// 6. Macros (10)
add("macro-01 def", "\\def\\myval{2} \\draw (\\myval,0) -- (0,0);");
add("macro-02 def simple2", "\\def\\myline{2} \\draw (0,0) -- (\\myline,0);");
add("macro-03 newcommand", "\\newcommand{\\foo}{1.5} \\draw (\\foo,0) -- (0,0);");
add("macro-04 newcommand param", "\\newcommand{\\bar}[1]{#1} \\draw (\\bar{2},0) -- (0,0);");
add("macro-05 renewcommand", "\\newcommand{\\a}{1} \\renewcommand{\\a}{2} \\draw (\\a,0) -- (0,0);");
add("macro-06 let", "\\def\\orig{1} \\let\\copy=\\orig \\draw (\\copy,0) -- (0,0);");
add("macro-07 let simple", "\\let\\x=1 \\draw (\\x,0) -- (0,0);");
add("macro-08 def with math", "\\def\\r{1.2} \\draw (\\r,0) circle (0.5cm);");
add("macro-09 nested def", "\\def\\a{1} \\def\\b{\\a} \\draw (\\b,0) -- (0,0);");
add("macro-10 def in scope", "\\begin{scope}\\def\\s{0.5} \\draw (\\s,0) -- (1,0);\\end{scope}");

// 7. Foreach (22)
add("foreach-01 simple", "\\foreach \\x in {1,2,3} {\\draw (\\x,0) -- (\\x,1);}");
add("foreach-02 range", "\\foreach \\x in {1,...,5} {\\draw (\\x,0) -- (\\x,1);}");
add("foreach-03 stepped", "\\foreach \\x in {1,3,...,11} {\\draw (\\x,0) -- (\\x,1);}");
add("foreach-04 multiple vars", "\\foreach \\x/\\y in {1/2, 2/3, 3/4} {\\draw (\\x,\\y) -- (\\y,\\x);}");
add("foreach-05 evaluate", "\\foreach \\x [evaluate=\\x as \\y using \\x*2] in {1,2,3} {\\draw (\\x,\\y) -- (\\y,\\x);}");
add("foreach-06 count", "\\foreach \\x [count=\\i] in {a,b,c} {\\draw (\\i,0) -- (\\i,1);}");
add("foreach-07 remember", "\\foreach \\x [remember=\\x as \\prev initially 0] in {1,2,3} {\\draw (\\prev,0) -- (\\x,0);}");
add("foreach-08 parse true", "\\foreach \\x [parse=true] in {1,2} {\\draw (\\x,0) -- (\\x,1);}");
add("foreach-09 nesting", "\\foreach \\x in {1,2} {\\foreach \\y in {1,2} {\\draw (\\x,\\y) -- (\\x+1,\\y+1);}}");
add("foreach-10 top-level", "\\foreach \\x in {0,1,2} {\\draw (\\x,0) -- (\\x,1);}");
add("foreach-11 top-level2", "\\foreach \\x in {1,2} {\\draw (0,0) -- (\\x,0);}");
add("foreach-12 with math", "\\foreach \\x in {0,30,...,90} {\\draw (\\x:1) -- (0,0);}");
add("foreach-13 color", "\\foreach \\c in {red, green, blue} {\\draw[\\c] (0,0) -- (1,0);}");
add("foreach-14 scale", "\\foreach \\s in {1,2} {\\begin{scope}[scale=\\s]\\draw (0,0) rectangle (1,1);\\end{scope}}");
add("foreach-15 grid", "\\foreach \\x in {0,1,2} {\\draw (\\x,0) grid (\\x+1,1);}");
add("foreach-16 circle", "\\foreach \\r in {0.5,1,1.5} {\\draw (0,0) circle (\\r cm);}");
add("foreach-17 with scope", "\\foreach \\x in {1,2} {\\begin{scope}[shift={(\\x,0)}]\\draw (0,0) -- (1,0);\\end{scope}}");
add("foreach-18 empty body", "\\foreach \\x in {1,2} {} \\draw (0,0) -- (1,0);");
add("foreach-19 trailing comma", "\\foreach \\x in {1,2,3,} {\\draw (\\x,0) -- (\\x,1);}");
add("foreach-20 spaces", "\\foreach \\x in { 1 , 2 , 3 } {\\draw (\\x,0) -- (\\x,1);}");
add("foreach-21 single", "\\foreach \\x in {5} {\\draw (\\x,0) -- (\\x,1);}");
add("foreach-22 list with spaces", "\\foreach \\x in {1, 2, 3} {\\draw (\\x,0) circle (2pt);}");
add("foreach-23 path-level", "\\draw (0,0) \\foreach \\x in {1,2,3} { -- (\\x,0)};");

// 8. Curves (20)
add("curve-01 controls single", "\\draw (0,0) .. controls (1,1) .. (2,0);");
add("curve-02 controls double", "\\draw (0,0) .. controls (1,1) and (2,1) .. (3,0);");
add("curve-03 arc simple", "\\draw (0,0) arc [start angle=0, end angle=90, radius=1cm];");
add("curve-04 arc delta", "\\draw (0,0) arc [start angle=0, delta angle=90, radius=1cm];");
add("curve-05 arc paren", "\\draw (0,0) arc (0:90:1cm);");
add("curve-06 arc xyradius", "\\draw (0,0) arc [start angle=0, end angle=90, x radius=1cm, y radius=0.5cm];");
add("curve-07 ellipse", "\\draw (0,0) ellipse [x radius=1cm, y radius=0.5cm];");
add("curve-08 ellipse and", "\\draw (0,0) ellipse (1cm and 0.5cm);");
add("curve-09 parabola", "\\draw (0,0) parabola (2,1);");
add("curve-10 parabola bend", "\\draw (0,0) parabola bend (1,1) (2,0);");
add("curve-11 parabola options", "\\draw (0,0) parabola [bend at end] (2,1);");
add("curve-12 sin", "\\draw (0,0) sin (1,1);");
add("curve-13 cos", "\\draw (0,0) cos (1,1);");
add("curve-14 to bend left", "\\draw (0,0) to[bend left] (2,0);");
add("curve-15 to bend right", "\\draw (0,0) to[bend right=45] (2,0);");
add("curve-16 to out in", "\\draw (0,0) to[out=90, in=90] (2,0);");
add("curve-17 to looseness", "\\draw (0,0) to[bend left, looseness=2] (2,0);");
add("curve-18 to relative", "\\draw (0,0) to[bend left, relative] (2,0);");
add("curve-19 multiple to", "\\draw (0,0) to[bend left] (1,0) to[bend right] (2,0);");
add("curve-20 controls with grid", "\\draw[help lines] (0,0) grid (2,2); \\draw (0,0) .. controls (1,2) .. (2,0);");

// 9. Orthogonal (6)
add("orth-01 -|", "\\draw (0,0) -| (1,1);");
add("orth-02 |-", "\\draw (0,0) |- (1,1);");
add("orth-03 mixed", "\\draw (0,0) -- (1,0) -| (2,1);");
add("orth-04 with transform", "\\draw[shift={(0.5,0)}] (0,0) -| (1,1);");
add("orth-05 multiple", "\\draw (0,0) |- (1,1) -| (2,0);");
add("orth-06 with style", "\\draw[thick, -|, red] (0,0) -| (1,1);");

// 10. Corners / strokes (14)
add("corner-01 rounded", "\\draw[rounded corners] (0,0) -- (1,0) -- (1,1) -- cycle;");
add("corner-02 rounded 5pt", "\\draw[rounded corners=5pt] (0,0) rectangle (1,1);");
add("corner-03 sharp", "\\draw[sharp corners] (0,0) -- (1,0) -- (1,1);");
add("corner-04 line cap round", "\\draw[line cap=round] (0,0) -- (1,0);");
add("corner-05 line cap rect", "\\draw[line cap=rect] (0,0) -- (1,0);");
add("corner-06 line join round", "\\draw[line join=round] (0,0) -- (1,0) -- (1,1);");
add("corner-07 line join bevel", "\\draw[line join=bevel] (0,0) -- (1,0) -- (1,1);");
add("corner-08 miter limit", "\\draw[miter limit=2] (0,0) -- (1,0) -- (1,1) -- cycle;");
add("corner-09 dash pattern", "\\draw[dash pattern=on 2pt off 2pt] (0,0) -- (2,0);");
add("corner-10 dash phase", "\\draw[dash pattern=on 2pt off 2pt, dash phase=1pt] (0,0) -- (2,0);");
add("corner-11 double", "\\draw[double] (0,0) -- (1,0);");
add("corner-12 double distance", "\\draw[double, double distance=2pt] (0,0) -- (1,0);");
add("corner-13 thick double", "\\draw[thick, double] (0,0) -- (1,0);");
add("corner-14 rounded with fill", "\\filldraw[rounded corners, fill=blue!20] (0,0) rectangle (1,1);");

// 11. Fill rules / opacity (10)
add("fill-01 even odd", "\\fill[even odd rule] (0,0) rectangle (1,1) (0.25,0.25) rectangle (0.75,0.75);");
add("fill-02 nonzero", "\\fill[nonzero rule] (0,0) rectangle (1,1) (0.25,0.25) rectangle (0.75,0.75);");
add("fill-03 opacity", "\\draw[opacity=0.5] (0,0) -- (1,0);");
add("fill-04 draw opacity", "\\draw[draw opacity=0.3, thick] (0,0) -- (1,0);");
add("fill-05 fill opacity", "\\fill[fill opacity=0.5, blue] (0,0) rectangle (1,1);");
add("fill-06 fill rule", "\\fill[fill rule=even odd] (0,0) rectangle (1,1);");
add("fill-07 opacity with filldraw", "\\filldraw[fill=red, opacity=0.5] (0,0) circle (0.5cm);");
add("fill-08 combined", "\\draw[draw=red, fill=blue, fill opacity=0.3] (0,0) rectangle (1,1);");
add("fill-09 transparent grid", "\\fill[opacity=0.2] (0,0) grid (2,2);");
add("fill-10 overlay", "\\draw[opacity=0.5, overlay] (0,0) -- (1,0);");

// 12. Clip (8)
add("clip-01 simple", "\\clip (0,0) rectangle (1,1); \\fill[red] (0,0) rectangle (2,2);");
add("clip-02 scope clip", "\\begin{scope}[clip]\\draw (0,0) rectangle (1,1);\\fill[red] (0,0) rectangle (2,2);\\end{scope}");
add("clip-03 clip option", "\\draw[clip] (0,0) rectangle (1,1); \\fill[blue] (0,0) rectangle (2,2);");
add("clip-04 multiple clips", "\\clip (0,0) rectangle (1,1); \\clip (0.5,0.5) rectangle (1.5,1.5); \\fill[green] (0,0) rectangle (2,2);");
add("clip-05 with transform", "\\begin{scope}[shift={(0.5,0.5)}, clip]\\clip (0,0) circle (0.5cm);\\fill[red] (0,0) rectangle (1,1);\\end{scope}");
add("clip-06 with scope", "\\begin{tikzpicture}\\clip (0,0) rectangle (2,1); \\draw (0,0) -- (2,0);\\end{tikzpicture}");
add("clip-07 with grid", "\\clip (0,0) grid (1,1); \\draw (0,0) -- (2,2);");
add("clip-08 with draw", "\\clip (0,0) rectangle (1,1); \\draw (0,0) -- (1,1);");

describe("Phase 2 — 150 curated (no nodes) suite", () => {
  for (const ex of examples) {
    it(ex.name, async () => {
      const { displayList, errors } = await compile(ex.src);
      // All should produce at least one item (even clip produces group)
      expect(displayList.items.length).toBeGreaterThan(0);
      // No hard errors for most; allow warnings for unknown keys but not errors for our curated list
      const hard = errors.filter(e => e.severity === "error");
      // For some edge like empty foreach body, allow 0? But our list all should be valid
      expect(hard.length, `${ex.name} errors: ${hard.map(e=>e.message).join(", ")}`).toBe(0);
      // Bbox should be defined (clip may still have bbox)
      // For clip-only, bbox may be from clip path, so still non-empty
      expect(displayList.bbox.isEmpty, `${ex.name} bbox empty`).toBe(false);
    });
  }
});

describe("Phase 2 — specific feature checks", () => {
  it("pgfmath veclen", async () => {
    const { displayList } = await compile("\\draw ({veclen(3,4)},0) -- (0,0);");
    const it = displayList.items[0] as any;
    const start = it.segments[0].to;
    expect(start.x).toBeCloseTo(5 * 28.45275, 0.5); // veclen 3,4 =5cm
  });
  it("transform rotate around", async () => {
    const { displayList } = await compile("\\draw[rotate around={45:(0.5,0)}] (0,0) -- (1,0);");
    expect(displayList.items.length).toBe(1);
  });
  it("double creates stroke with flag", async () => {
    const { displayList } = await compile("\\draw[double] (0,0) -- (1,0);");
    const it = displayList.items[0] as any;
    expect(it.stroke).toBeDefined();
    expect((it.stroke as any)._double).toBe(true);
  });
  it("opacity sets correctly", async () => {
    const { displayList } = await compile("\\fill[fill opacity=0.3] (0,0) rectangle (1,1);");
    const it = displayList.items[0] as any;
    expect(it.fill.opacity).toBeCloseTo(0.3);
  });
  it("clip produces group", async () => {
    const { displayList } = await compile("\\clip (0,0) rectangle (1,1);");
    expect(displayList.items[0].kind).toBe("group");
  });
});
