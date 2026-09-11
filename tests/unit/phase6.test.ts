import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.ts";
import { listDecorations, getDecoration } from "../../src/decorations/index.ts";

describe("Phase6 decoration automaton", () => {
  it("lists decorations", () => {
    const names = listDecorations();
    expect(names).toContain("zigzag");
    expect(names.length).toBeGreaterThanOrEqual(20);
  });
  it("automaton states exist for zigzag", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={zigzag, amplitude=2pt, segment length=5pt}] (0,0) -- (2,0);");
    const p = displayList.items.find(i=>i.kind==="path") as any;
    expect(p).toBeDefined();
    expect(p.segments.length).toBeGreaterThan(2);
  });
});

describe("Phase6 pathmorphing", () => {
  it("zigzag", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={zigzag, amplitude=3pt, segment length=8pt}] (0,0) -- (3,0);");
    const p = displayList.items.find(i=>i.kind==="path") as any;
    expect(p.segments.some((s:any)=>s.kind==="lineTo")).toBe(true);
  });
  it("saw", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={saw, amplitude=2pt}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("snake", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={snake, amplitude=2pt, segment length=6pt}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("bumps", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={bumps}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
    const p = displayList.items.find(i=>i.kind==="path") as any;
    expect(p.segments.length).toBeGreaterThan(1);
  });
  it("coil", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={coil, amplitude=2pt}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("random steps", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={random steps, segment length=5pt, amplitude=2pt}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("bent", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={bent, amplitude=3pt}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("straight zigzag", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={straight zigzag}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("zigzag mirror", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={zigzag, amplitude=3pt, mirror}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("zigzag raise", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={zigzag, amplitude=3pt, raise=2pt}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("zigzag on curve", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={zigzag}] (0,0) .. controls (1,1) .. (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
});

describe("Phase6 pathreplacing", () => {
  it("brace", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={brace, amplitude=5pt}] (0,0) -- (2,0);");
    const p = displayList.items.find(i=>i.kind==="path") as any;
    expect(p.segments.length).toBeGreaterThan(2);
  });
  it("brace mirror", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={brace, mirror, amplitude=5pt}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("brace aspect", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={brace, aspect=0.3}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("border", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={border, amplitude=2pt}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("waves", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={waves}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("expanding waves", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={expanding waves}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("ticks", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={ticks, segment length=5pt}] (0,0) -- (2,0);");
    // ticks produces extra paths for each tick
    const paths = displayList.items.filter(i=>i.kind==="path");
    expect(paths.length).toBeGreaterThan(1);
  });
  it("show path construction", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={show path construction}] (0,0) -- (1,0) -- (1,1);");
    const paths = displayList.items.filter(i=>i.kind==="path");
    expect(paths.length).toBeGreaterThan(1);
  });
  it("ticks with mirror", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={ticks, mirror}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
});

describe("Phase6 markings", () => {
  it("mark at position 0.5", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={markings, mark=at position 0.5 with {\\arrow{>}}}] (0,0) -- (2,0);");
    const paths = displayList.items.filter(i=>i.kind==="path");
    expect(paths.length).toBeGreaterThan(1);
  });
  it("mark at position 0", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={markings, mark=at position 0 with {\\arrow{>}}}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("mark at position 1", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={markings, mark=at position 1 with {\\arrow{>}}}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("between positions step", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={markings, mark=between positions 0 and 1 step 0.25 with {\\arrow{>}}}] (0,0) -- (2,0);");
    const extra = displayList.items.filter(i=>i.kind==="path");
    expect(extra.length).toBeGreaterThan(4);
  });
  it("arrows along path shortcut", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={markings, mark=at position 0.5 with {\\arrow{Stealth}}}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("markings with raise", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={markings, mark=at position 0.5 with {\\arrow{>}}, raise=2pt}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("markings multiple marks", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={markings, mark=at position 0.25 with {\\arrow{>}}, mark=at position 0.75 with {\\arrow{>}}}] (0,0) -- (2,0);");
    expect(displayList.items.filter(i=>i.kind==="path").length).toBeGreaterThan(2);
  });
});

describe("Phase6 shapes text footprints fractals", () => {
  it("shapes decoration", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={shapes}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(1);
  });
  it("text along path", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={text along path, text={Hello}}] (0,0) -- (2,0);");
    const texts = displayList.items.filter(i=>i.kind==="text");
    expect(texts.length).toBeGreaterThan(0);
  });
  it("text decoration alias", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={text, text=ABC}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("footprints", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={footprints}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(1);
  });
  it("koch curve", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={koch curve}] (0,0) -- (1,0);");
    const p = displayList.items.find(i=>i.kind==="path") as any;
    expect(p.segments.length).toBeGreaterThan(2);
  });
  it("koch snowflake", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={koch snowflake}] (0,0) -- (1,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("cantor set", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={cantor set}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("common options pre post", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={zigzag, pre length=5pt, post length=5pt}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("decorate false does not decorate", async () => {
    const { displayList } = await compile("\\draw[decoration={zigzag}] (0,0) -- (2,0);");
    const p = displayList.items.find(i=>i.kind==="path") as any;
    // without decorate, should remain single straight line (1 lineTo)
    expect(p.segments.filter((s:any)=>s.kind==="lineTo").length).toBe(1);
  });
  it("non-decorated path unchanged", async () => {
    const { displayList } = await compile("\\draw (0,0) -- (2,0);");
    const p = displayList.items.find(i=>i.kind==="path") as any;
    expect(p.segments.length).toBe(2); // move + line
  });
  it("persistent precomputation amplitude reused", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={zigzag, amplitude=4pt}] (0,0) -- (2,0); \\draw[decorate, decoration={zigzag, amplitude=1pt}] (0,0) -- (1,0);");
    expect(displayList.items.length).toBe(2);
  });
  it("auto corner handling", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={zigzag, amplitude=2pt, segment length=3pt}] (0,0) -- (0.5,0) -- (0.5,0.5);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("transform option accepted", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={zigzag, transform={scale=1}}] (0,0) -- (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("segment length controls density", async () => {
    const a = await compile("\\draw[decorate, decoration={zigzag, segment length=20pt}] (0,0) -- (2,0);");
    const b = await compile("\\draw[decorate, decoration={zigzag, segment length=5pt}] (0,0) -- (2,0);");
    const pa = (a.displayList.items.find(i=>i.kind==="path") as any).segments.length;
    const pb = (b.displayList.items.find(i=>i.kind==="path") as any).segments.length;
    expect(pb).toBeGreaterThan(pa);
  });
  it("decorated closed path", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={zigzag}] (0,0) rectangle (1,1);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("fractals stub acceptable", async () => {
    const { displayList } = await compile("\\draw[decorate, decoration={fractals}] (0,0) -- (1,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
});
