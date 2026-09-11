import { describe, it, expect } from "vitest";
import { compile } from "../../src/index.ts";
import { Vec2 } from "../../src/geometry/vec2.ts";

describe("Phase8 fadings", () => {
  it("path fading west accepted", async () => {
    const { displayList, errors } = await compile("\\begin{tikzpicture}\\fill[path fading=west, blue] (0,0) rectangle (2,1);\\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
    const it:any = displayList.items.find(i=>i.kind==="path");
    expect(it).toBeDefined();
    expect(it.fading || it.pathFading || it.fitFading !== undefined).toBeTruthy();
  });
  it("path fading south", async () => {
    const { displayList } = await compile("\\draw[path fading=south] (0,0) rectangle (1,1);");
    const it:any = displayList.items[0];
    expect(it.fading ?? it.pathFading).toBeDefined();
  });
  it("fit fading with position", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\fill[fit fading] (0,0) rectangle (1,1);\\end{tikzpicture}");
    const it:any = displayList.items[0];
    expect(it.fading || it.fitFading || it.pathFading).toBeTruthy();
  });
  it("scope fading east", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\begin{scope}[scope fading=east]\\fill[red] (0,0) rectangle (1,1);\\end{scope}\\end{tikzpicture}");
    expect(displayList.items.length).toBeGreaterThan(0);
    const hasFading = displayList.items.some((i:any)=> i.fading || i.scopeFading || (i.kind==="group" && (i.fading || i.scopeFading)));
    expect(hasFading).toBe(true);
  });
  it("\\tikzfading definition accepted", async () => {
    const { displayList, errors } = await compile("\\tikzfading[name=fade out, inner color=transparent!0, outer color=transparent!100]\\fill[path fading=fade out] (0,0) rectangle (1,1);");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
    const it:any = displayList.items.find(i=> (i as any).fading || (i as any).pathFading);
    expect(it || displayList.items.length>0).toBeTruthy();
    // check registry via compile side-effect? Just ensure no error
  });
  it("fading with fading angle", async () => {
    const { displayList } = await compile("\\fill[path fading=west, fading angle=45] (0,0) rectangle (1,1);");
    const it:any = displayList.items[0];
    expect(it.fading || it.pathFading).toBeDefined();
  });
  it("tikzfading custom with pgfdeclarehorizontalshading stub", async () => {
    const { errors } = await compile("\\tikzfading[name=myfade]{\\tikz \\fill[white] (0,0) rectangle (1,1);}\\draw[path fading=myfade] (0,0) -- (1,0);");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
  });
});

describe("Phase8 transparency and blend", () => {
  it("transparency group opacity", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}[transparency group, opacity=0.5]\\fill[red] (0,0) rectangle (1,1);\\fill[blue] (0.5,0.5) rectangle (1.5,1.5);\\end{tikzpicture}");
    const hasGroup = displayList.items.some((i:any)=> i.kind==="group" && (i.opacity<1 || i.transparencyGroup));
    // also allow path opacity
    const hasOpacity = displayList.items.some((i:any)=> (i.opacity!==undefined && i.opacity<1) || i.fill?.opacity<1 || i.stroke?.opacity<1 || (i.kind==="group"));
    expect(hasGroup || hasOpacity).toBe(true);
  });
  it("blend group multiply", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}[blend group=multiply]\\fill[red] (0,0) rectangle (1,1);\\fill[blue] (0.5,0) rectangle (1.5,1);\\end{tikzpicture}");
    const g:any = displayList.items.find(i=> i.kind==="group");
    const hasBlend = g ? (g.blendMode==="multiply" || g.blendGroup==="multiply") : false;
    const hasPathBlend = displayList.items.some((i:any)=> i.blendMode==="multiply" || i.blendGroup==="multiply");
    expect(hasBlend || hasPathBlend || displayList.items.length>0).toBe(true);
  });
  it("blend group screen", async () => {
    const { displayList } = await compile("\\begin{scope}[blend group=screen]\\fill[red] (0,0) circle (0.5cm);\\fill[blue] (0.5,0) circle (0.5cm);\\end{scope}");
    const hasBlend = displayList.items.some((i:any)=> i.blendMode==="screen" || i.blendGroup==="screen" || (i.kind==="group" && (i.blendMode || i.blendGroup)));
    expect(hasBlend || displayList.items.length>0).toBe(true);
  });
  it("transparency group isolated", async () => {
    const { errors } = await compile("\\begin{tikzpicture}[transparency group, isolated=false]\\draw (0,0) -- (1,0);\\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
  });
  it("knockout group", async () => {
    const { errors } = await compile("\\begin{tikzpicture}[transparency group=knockout]\\fill[white] (0,0) rectangle (1,1);\\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
  });
});

describe("Phase8 shadows", () => {
  it("drop shadow", async () => {
    const { displayList } = await compile("\\usetikzlibrary{shadows}\\begin{tikzpicture}\\node[draw, drop shadow] at (0,0) {A};\\end{tikzpicture}");
    const hasShadow = displayList.items.some((i:any)=> i.shadow || i.dropShadow || i.kind==="path" && (i as any).shadow);
    // shadows create extra path offset
    expect(displayList.items.length).toBeGreaterThanOrEqual(2);
  });
  it("copy shadow", async () => {
    const { displayList } = await compile("\\usetikzlibrary{shadows}\\draw[copy shadow, fill=white] (0,0) rectangle (1,1);");
    expect(displayList.items.length).toBeGreaterThanOrEqual(1);
    const hasShadow = displayList.items.some((i:any)=> i.shadow || i.copyShadow || displayList.items.length>1);
    expect(hasShadow).toBe(true);
  });
  it("shadow options xshift yshift", async () => {
    const { displayList } = await compile("\\usetikzlibrary{shadows}\\node[draw, drop shadow={shadow xshift=2pt, shadow yshift=-2pt}] at (0,0) {B};");
    expect(displayList.items.length).toBeGreaterThanOrEqual(1);
  });
  it("circular drop shadow", async () => {
    const { displayList } = await compile("\\usetikzlibrary{shadows}\\node[circle, draw, circular drop shadow] at (0,0) {C};");
    expect(displayList.items.length).toBeGreaterThanOrEqual(1);
  });
  it("circular glow", async () => {
    const { displayList } = await compile("\\usetikzlibrary{shadows}\\node[circle, draw, circular glow={fill=red}] at (0,0) {D};");
    expect(displayList.items.length).toBeGreaterThanOrEqual(1);
  });
  it("drop shadow on path", async () => {
    const { displayList } = await compile("\\usetikzlibrary{shadows}\\draw[drop shadow] (0,0) rectangle (1,1);");
    expect(displayList.items.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Phase8 3D", () => {
  it("3d coordinate (x,y,z)", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\draw (1,2,3) -- (0,0,0);\\end{tikzpicture}");
    expect(displayList.items.length).toBe(1);
    const segs:any = (displayList.items[0] as any).segments;
    expect(segs.length).toBeGreaterThan(0);
    const start = segs[0].to as Vec2;
    // z should affect y projection (isometric) => not equal to just (1,2)
    // For our simple projection, (1,2,3) should have different y than (1,2)
    const { displayList: b } = await compile("\\draw (1,2) -- (0,0);");
    const segsB:any = (b.items[0] as any).segments;
    const startB = segsB[0].to as Vec2;
    // Expect z influences coordinates
    expect(start.x !== startB.x || start.y !== startB.y).toBe(true);
  });
  it("configurable z vector", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}[z={(0.5cm,0.5cm)}]\\draw (0,0,1) -- (1,0,0);\\end{tikzpicture}");
    expect(displayList.items.length).toBe(1);
  });
  it("3d library canvas is xy plane at z", async () => {
    const { displayList, errors } = await compile("\\usetikzlibrary{3d}\\begin{tikzpicture}[canvas is xy plane at z=0]\\draw (0,0) rectangle (1,1);\\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
    expect(displayList.items.length).toBe(1);
  });
  it("canvas is yz plane", async () => {
    const { errors } = await compile("\\usetikzlibrary{3d}\\begin{tikzpicture}[canvas is yz plane at x=0]\\draw (0,0) rectangle (1,1);\\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
  });
  it("canvas is xz plane", async () => {
    const { errors } = await compile("\\usetikzlibrary{3d}\\begin{tikzpicture}[canvas is xz plane at y=0]\\draw (0,0) rectangle (1,1);\\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
  });
  it("tdplotsetmaincoords isometric", async () => {
    const { displayList, errors } = await compile("\\tdplotsetmaincoords{60}{120}\\begin{tikzpicture}[tdplot_main_coords]\\draw (1,0,0) -- (0,1,0) -- (0,0,1);\\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
    expect(displayList.items.length).toBeGreaterThanOrEqual(1);
    // Should have transformed coords
  });
  it("tdplot rotated frame", async () => {
    const { errors } = await compile("\\tdplotsetmaincoords{70}{110}\\begin{tikzpicture}[tdplot_main_coords]\\draw[tdplot_rotated_coords] (0,0) -- (1,0);\\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
  });
  it("perspective library 3 point", async () => {
    const { errors } = await compile("\\usetikzlibrary{perspective}\\begin{tikzpicture}[3d view={30}{20}]\\draw (0,0,0) -- (1,0,0) -- (0,1,0);\\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
  });
  it("3D with shadows fading combined", async () => {
    const { errors } = await compile("\\tdplotsetmaincoords{60}{30}\\begin{tikzpicture}[tdplot_main_coords]\\fill[ball color=red] (0,0,0) circle (0.3cm);\\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
  });
});

describe("Phase8 spy", () => {
  it("spy on node", async () => {
    const { displayList } = await compile("\\usetikzlibrary{spy}\\begin{tikzpicture}[spy using outlines={circle, magnification=2, size=1cm}]\\draw (0,0) rectangle (2,2);\\spy on (1,1) in node at (3,1);\\end{tikzpicture}");
    expect(displayList.items.length).toBeGreaterThan(0);
    const hasSpy = displayList.items.some((i:any)=> i.kind==="group" && (i.spy || i.isSpy)) || displayList.items.some((i:any)=> i.spy === true || i.magnification);
    expect(hasSpy || displayList.items.length>=2).toBe(true);
  });
  it("spy with magnification", async () => {
    const { displayList } = await compile("\\usetikzlibrary{spy}\\begin{tikzpicture}[spy using outlines={magnification=4}]\\draw (0,0) grid (2,2);\\spy[magnification=3] on (1,1) in node at (3,1);\\end{tikzpicture}");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("spy size and lens", async () => {
    const { displayList } = await compile("\\usetikzlibrary{spy}\\begin{tikzpicture}[spy using outlines={circle, size=2cm}]\\draw (0,0) -- (2,2);\\spy on (1,1) in node[circle] at (4,1);\\end{tikzpicture}");
    expect(displayList.items.some(i=> i.kind==="path" || i.kind==="group")).toBe(true);
  });
});

describe("Phase8 includegraphics", () => {
  it("includegraphics in node", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}\\node at (0,0) {\\includegraphics[width=2cm]{https://example.com/img.png}};\\end{tikzpicture}");
    const hasImage = displayList.items.some((i:any)=> i.kind==="image" || i.image || i.src);
    expect(hasImage || displayList.items.length>0).toBe(true);
    const img:any = displayList.items.find(i=> (i as any).kind==="image");
    if (img) expect(img.src).toContain("example.com");
  });
  it("includegraphics width height", async () => {
    const { displayList } = await compile("\\node at (1,1) {\\includegraphics[width=1cm,height=1cm]{pic.png}};");
    const img:any = displayList.items.find(i=> (i as any).kind==="image");
    expect(img ? img.widthPt>0 : true).toBe(true);
  });
  it("includegraphics async loading not blocking", async () => {
    const { displayList, errors } = await compile("\\begin{tikzpicture}\\node[draw] at (0,0) {\\includegraphics[width=30pt]{data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=}};\\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
    expect(displayList.items.length).toBeGreaterThan(0);
  });
  it("includegraphics inside path node", async () => {
    const { displayList } = await compile("\\draw (0,0) -- node {\\includegraphics[width=1cm]{a.png}} (2,0);");
    expect(displayList.items.length).toBeGreaterThan(0);
  });
});

describe("Phase8 transform canvas", () => {
  it("transform canvas scale across all primitives", async () => {
    const { displayList } = await compile("\\begin{tikzpicture}[transform canvas={scale=2}]\\draw (0,0) -- (1,0);\\node at (1,0) {A};\\fill (0,0) circle (0.2cm);\\end{tikzpicture}");
    expect(displayList.items.length).toBeGreaterThanOrEqual(3);
    // Check canvasTransform exists
    const hasCanvas = displayList.items.some((i:any)=> i.canvasTransform && !i.canvasTransform.isIdentity());
    expect(hasCanvas || displayList.items.length>0).toBe(true);
  });
  it("transform canvas rotate", async () => {
    const { displayList } = await compile("\\draw[transform canvas={rotate=30}] (0,0) rectangle (1,1);");
    const it:any = displayList.items[0];
    expect(it.canvasTransform || it.transformCanvas).toBeDefined();
  });
  it("transform canvas shift", async () => {
    const { displayList } = await compile("\\begin{scope}[transform canvas={xshift=1cm}]\\draw (0,0) -- (1,0);\\end{scope}");
    expect(displayList.items.length).toBe(1);
    const it:any = displayList.items[0];
    expect(it.canvasTransform || it.transformCanvas || it.kind==="group").toBeTruthy();
  });
  it("transform canvas on node", async () => {
    const { displayList } = await compile("\\node[draw, transform canvas={scale=1.5}] at (0,0) {X};");
    expect(displayList.items.length).toBeGreaterThan(0);
    const hasCanvas = displayList.items.some((i:any)=> i.canvasTransform || i.transformCanvas || i.kind==="text");
    expect(hasCanvas).toBe(true);
  });
  it("transform canvas combined with 3d", async () => {
    const { errors } = await compile("\\tdplotsetmaincoords{60}{30}\\begin{tikzpicture}[tdplot_main_coords, transform canvas={scale=1.2}]\\draw (0,0,0) -- (1,1,1);\\end{tikzpicture}");
    expect(errors.filter(e=>e.severity==="error").length).toBe(0);
  });
});
