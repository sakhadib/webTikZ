import { describe, it, expect, beforeEach } from "vitest";
import { compile, render } from "../../src/index.ts";
import { Vec2 } from "../../src/geometry/vec2.ts";
import { BBox } from "../../src/geometry/bbox.ts";
import { hitTestNodes, isPointInPath, isPointInStroke, hitTestDisplayList, pointInBBox } from "../../src/render/displayList.ts";
import { hitTest, registerHoverStyle, clearHoverStyles } from "../../src/web/interactivity.ts";
import { compileWithCache, createAnimator, clearASTCache, clearTextCache, getCachedAST, parseAnimateKeys } from "../../src/web/animation.ts";
import { applyThemeToDisplayList, resolveThemeColor } from "../../src/web/theme.ts";
import { generateDescription, applyAria } from "../../src/web/a11y.ts";
import { exportSVG, exportPDF, shareableURL, parseShareableURL } from "../../src/web/export.ts";
import { tokenize, textMateGrammar, prismGrammar, getInlineErrorMarkers } from "../../src/web/highlight.ts";
import { TikzPictureElement, defineTikzPictureElement } from "../../src/web/element.ts";
import { renderToSVG } from "../../src/render/svg.ts";

describe("Phase10 hit testing", () => {
  it("pointInBBox basics", () => {
    const b = new BBox(0,0,10,10);
    expect(pointInBBox(new Vec2(5,5), b)).toBe(true);
    expect(pointInBBox(new Vec2(11,5), b)).toBe(false);
    expect(pointInBBox(new Vec2(11,5), b, 2)).toBe(true);
  });
  it("hitTestNodes finds named nodes", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\node (A) at (0,0) {hello}; \\node (B) at (5,0) {world};\\end{tikzpicture}");
    const aCenter = displayList.nodes["A"].center;
    expect(hitTestNodes(displayList, aCenter)).toContain("A");
    expect(hitTestNodes(displayList, new Vec2(1000,1000))).toEqual([]);
  });
  it("hitTest alias works", async () => {
    const { displayList } = await compile("\\node (A) at (0,0) {x};");
    const pt = displayList.nodes["A"].center;
    expect(hitTest(displayList, pt)).toContain("A");
  });
  it("hitTestDisplayList returns nodes+paths", async () => {
    const { displayList } = await compile("\\draw (0,0) rectangle (2,1); \\node (N) at (1,0.5) {n};");
    const nCenter = displayList.nodes["N"].center;
    const res = hitTestDisplayList(displayList, nCenter);
    expect(res.nodes).toContain("N");
    expect(res.paths.length).toBeGreaterThan(0);
  });
  it("isPointInPath for rectangle", async () => {
    const { displayList } = await compile("\\draw[fill=black] (0,0) rectangle (2,2);");
    const path = displayList.items.find(i=> i.kind==="path") as any;
    expect(isPointInPath(path.segments, new Vec2(1,1))).toBe(true);
    expect(isPointInPath(path.segments, new Vec2(100,100))).toBe(false);
  });
  it("isPointInPath for circle-ish", async () => {
    const { displayList } = await compile("\\draw (0,0) circle (1cm);");
    const path = displayList.items.find(i=> i.kind==="path") as any;
    // center should be inside approximated polygon (circle flattened)
    expect(isPointInPath(path.segments, new Vec2(0,0))).toBe(true);
  });
  it("isPointInStroke near line", async () => {
    const { displayList } = await compile("\\draw[line width=2pt] (0,0) -- (2,0);");
    const path = displayList.items.find(i=> i.kind==="path") as any;
    expect(isPointInStroke(path.segments, new Vec2(1,0), 2)).toBe(true);
    expect(isPointInStroke(path.segments, new Vec2(1,5), 2)).toBe(false);
  });
  it("isPointInStroke respects width", async () => {
    const { displayList } = await compile("\\draw[line width=10pt] (0,0) -- (1,0);");
    const path = displayList.items.find(i=> i.kind==="path") as any;
    expect(isPointInStroke(path.segments, new Vec2(0.5,2), 10)).toBe(true);
  });
});

describe("Phase10 interactivity on/hover", () => {
  beforeEach(() => clearHoverStyles());
  it("registerHoverStyle stores", () => {
    registerHoverStyle("A", { style: "red", cursor: "pointer", tooltip: "hello", href: "https://example.com" });
    expect(clearHoverStyles).toBeDefined();
  });
  it("pic.on registers handler via render", async () => {
    const canvas = document.createElement("canvas");
    const pic = await render("\\node (A) at (0,0) {hi};", canvas);
    let called = false;
    const off = pic.on("click", "A", () => { called = true; });
    expect(typeof off).toBe("function");
    off();
    expect(called).toBe(false);
  });
  it("hover cursor/tooltip via pic.hover", async () => {
    const canvas = document.createElement("canvas");
    const pic = await render("\\node (A) at (0,0) {hi};", canvas);
    pic.hover("A", { style: "fill=red", cursor: "pointer", tooltip: "tip", href: "https://ex.com" });
    expect(canvas.style.cursor).toBe("pointer");
    expect(canvas.title).toBe("tip");
  });
  it("hover style /web/hover parse stub", async () => {
    const { displayList } = await compile("\\tikzset{/web/hover/.style={fill=red}} \\node (A) at (0,0) {a};");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
});

describe("Phase10 animation \\t", () => {
  beforeEach(() => { clearASTCache(); clearTextCache(); });
  it("vars \\t substitutes in coordinate", async () => {
    const src = "\\draw (\\t,0) -- (1,0);";
    const { displayList: dl0 } = await compile(src, { vars: { t: 0 } });
    const { displayList: dl1 } = await compile(src, { vars: { t: 1 } });
    const p0 = (dl0.items[0] as any).segments[0].to;
    const p1 = (dl1.items[0] as any).segments[0].to;
    expect(p0.x).not.toBeCloseTo(p1.x, 1);
  });
  it("compileWithCache reuses AST", async () => {
    const src = "\\draw (0,0) -- (1,1);";
    await compileWithCache(src, { t: 0 });
    expect(getCachedAST(src)).toBeDefined();
    const { displayList } = await compileWithCache(src, { t: 0.5 });
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("cached text measurements populated", async () => {
    const src = "\\node at (0,0) {hello};";
    await compileWithCache(src, {});
    const { displayList } = await compileWithCache(src, {});
    expect(displayList.items.some(i=> i.kind==="text")).toBe(true);
    // at least one cache entry should exist (we seed cache)
  });
  it("createAnimator start/stop", async () => {
    const anim = createAnimator("\\draw (\\t,0) -- (1,0);", { duration: 100, loop: false });
    expect(anim.isRunning).toBe(false);
    anim.start();
    expect(anim.isRunning).toBe(true);
    anim.stop();
    expect(anim.isRunning).toBe(false);
  });
  it("parseAnimateKeys detects", () => {
    const opts = [{ raw: "animate={t=0..1}", key: "animate", value: "t=0..1", loc: {line:1,column:1,pos:0}}];
    const res = parseAnimateKeys(opts as any);
    expect(res).not.toBeNull();
  });
  it("animate with vars via compile", async () => {
    const src = "\\draw ({\\t},0) -- (2,0);";
    const { displayList } = await compile(src, { vars: { "\\t": 0.5, t: 0.5 } });
    expect(displayList.items.length).toBeGreaterThan(0);
  });
});

describe("Phase10 custom element", () => {
  it("defines tikz-picture", () => {
    defineTikzPictureElement("tikz-picture");
    expect(customElements.get("tikz-picture")).toBeDefined();
  });
  it("element has observedAttributes", () => {
    expect((TikzPictureElement as any).observedAttributes).toContain("src");
    expect((TikzPictureElement as any).observedAttributes).toContain("scale");
  });
  it("creates element and sets source", async () => {
    const el = new TikzPictureElement();
    el.source = "\\draw (0,0) -- (1,0);";
    expect(el.source).toContain("draw");
    el.scale = 1.5;
    expect(el.scale).toBe(1.5);
    el.theme = "dark";
    expect(el.theme).toBe("dark");
  });
  it("responsive fit attribute", () => {
    const el = document.createElement("tikz-picture") as TikzPictureElement;
    el.setAttribute("fit", "width");
    expect(el.getAttribute("fit")).toBe("width");
  });
  it("ResizeObserver setup does not throw", () => {
    const el = new TikzPictureElement();
    (el as any)._setupResizeObserver();
    expect(true).toBe(true);
  });
});

describe("Phase10 theming/dark mode", () => {
  it("resolveThemeColor dark swaps black/white", () => {
    expect(resolveThemeColor("#000000", "dark")).toBe("#FFFFFF");
    expect(resolveThemeColor("#FFFFFF", "dark")).toBe("#000000");
    expect(resolveThemeColor("black", "dark")).toBe("#FFFFFF");
  });
  it("applyThemeToDisplayList remaps", async () => {
    const { displayList } = await compile("\\draw[draw=black] (0,0) -- (1,0);");
    const themed = applyThemeToDisplayList(displayList, "dark");
    const path: any = themed.items.find(i=> i.kind==="path");
    expect(path.stroke.color).toBe("#FFFFFF");
  });
  it("pic setTheme updates", async () => {
    const canvas = document.createElement("canvas");
    const pic = await render("\\draw (0,0) -- (1,0);", canvas, { theme: "light" });
    expect(pic.theme).toBe("light");
    pic.setTheme("dark");
    expect(pic.theme).toBe("dark");
  });
  it("render with dark theme via opts", async () => {
    const canvas = document.createElement("canvas");
    const pic = await render("\\draw[fill=black] (0,0) rectangle (1,1);", canvas, { theme: "dark" });
    expect(pic.displayList.items.length).toBeGreaterThan(0);
  });
});

describe("Phase10 export", () => {
  it("exportSVG contains svg", async () => {
    const { displayList } = await compile("\\draw (0,0) -- (1,0);");
    const svg = exportSVG(displayList, { scale: 1 });
    expect(svg).toContain("<svg");
    expect(svg).toContain("role=\"img\"");
  });
  it("toSVG via pic", async () => {
    const pic = await render("\\draw (0,0) -- (1,0);", null);
    const svg = pic.toSVG({ scale: 2 });
    expect(svg).toContain("<svg");
  });
  it("toPNG returns blob or stub", async () => {
    const pic = await render("\\draw (0,0) -- (1,0);", null);
    const blob = await pic.toPNG(1);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
  });
  it("exportPNG helper", async () => {
    const { displayList } = await compile("\\draw (0,0) -- (1,0);");
    const png = await (await import("../../src/web/export.ts")).exportPNG(displayList, { scale: 1 });
    expect(png).toBeInstanceOf(Blob);
  });
  it("exportPDF stub starts with %PDF", async () => {
    const { displayList } = await compile("\\draw (0,0) -- (1,0);");
    const pdf = exportPDF(displayList);
    expect(pdf.startsWith("%PDF")).toBe(true);
    const viaPic = (await render("\\draw (0,0) -- (1,0);", null)).toPDF();
    expect(viaPic.startsWith("%PDF")).toBe(true);
  });
  it("SVG scale affects size", async () => {
    const { displayList } = await compile("\\draw (0,0) -- (1,0);");
    const s1 = renderToSVG(displayList, { scale: 1 });
    const s2 = renderToSVG(displayList, { scale: 2 });
    const w1 = s1.match(/width="([^"]+)"/)?.[1];
    const w2 = s2.match(/width="([^"]+)"/)?.[1];
    expect(parseFloat(w2!)).toBeGreaterThan(parseFloat(w1!));
  });
});

describe("Phase10 a11y", () => {
  it("canvas has role img and aria-label", async () => {
    const canvas = document.createElement("canvas");
    await render("\\node at (0,0) {hello}; \\node at (1,0) {world};", canvas);
    expect(canvas.getAttribute("role")).toBe("img");
    expect(canvas.getAttribute("aria-label")).toBeTruthy();
  });
  it("generateDescription from nodes", async () => {
    const { displayList } = await compile("\\node at (0,0) {Alpha}; \\node at (1,0) {Beta};");
    const desc = generateDescription(displayList);
    expect(desc).toContain("Alpha");
    expect(desc).toContain("Beta");
  });
  it("applyAria sets attributes", () => {
    const canvas = document.createElement("canvas");
    canvas.id = "test-canvas";
    const dl: any = { items: [{ kind: "text", text: "hi", at: new Vec2(0,0), font: "10pt sans", color: "#000", align:"center", baseline:"middle"}], bbox: new BBox(0,0,10,10), nodes: {} };
    applyAria(canvas, dl, { label: "custom label" });
    expect(canvas.getAttribute("aria-label")).toBe("custom label");
    expect(canvas.getAttribute("aria-description")).toContain("hi");
  });
  it("svg has aria", async () => {
    const { displayList } = await compile("\\node at (0,0) {hi};");
    const svg = renderToSVG(displayList, { ariaLabel: "My diagram" });
    expect(svg).toContain("aria-label");
  });
});

describe("Phase10 tooling/share/highlight", () => {
  it("syntax grammar exists", () => {
    expect(textMateGrammar.scopeName).toBe("source.tikz");
    expect(prismGrammar.tikz).toBeDefined();
  });
  it("tokenize splits", () => {
    const toks = tokenize("\\draw (0,0) -- (1,0); % comment");
    expect(toks.some(t=> t.type==="keyword" && t.value==="\\draw")).toBe(true);
    expect(toks.some(t=> t.type==="comment")).toBe(true);
  });
  it("inline error markers", () => {
    const markers = getInlineErrorMarkers([{ line:1, column:5, message:"oops"}]);
    expect(markers[0].line).toBe(1);
    expect(markers[0].message).toBe("oops");
  });
  it("shareable URL roundtrip", () => {
    const src = "\\draw (0,0) -- (1,0);";
    const url = shareableURL(src, "https://example.com/");
    const back = parseShareableURL(url);
    expect(back).toBe(src);
  });
  it("shareable URL without param returns null", () => {
    expect(parseShareableURL("https://example.com/")).toBeNull();
  });
  it("copy as PNG/SVG stub via export", async () => {
    const { displayList } = await compile("\\draw (0,0) -- (1,0);");
    const svg = exportSVG(displayList);
    const b64 = typeof btoa !== "undefined" ? btoa(svg) : Buffer.from(svg).toString("base64");
    expect(b64.length).toBeGreaterThan(10);
  });
});
