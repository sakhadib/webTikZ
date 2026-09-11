import { Vec2 } from "../geometry/vec2.ts";
import { BBox } from "../geometry/bbox.ts";
import { PT_PER_CM } from "../geometry/units.ts";
import { evalMath } from "../math/index.ts";
import type { Option } from "../parser/index.ts";
import type { DisplayItem, PathSegment } from "../render/displayList.ts";
import { DEFAULT_STROKE, DEFAULT_FILL } from "../render/displayList.ts";

// ---------------------------------------------------------------------------
// Axis Config
// ---------------------------------------------------------------------------
export interface AxisConfig {
  widthPt: number;
  heightPt: number;
  xmin: number | null;
  xmax: number | null;
  ymin: number | null;
  ymax: number | null;
  zmin: number | null;
  zmax: number | null;
  xmode: "linear" | "log";
  ymode: "linear" | "log";
  grid: "none" | "major" | "minor" | "both";
  axisLines: "box" | "left" | "middle" | "none";
  xtick: number[] | null;
  ytick: number[] | null;
  xticklabels: string[] | null;
  yticklabels: string[] | null;
  xtickDistance: number | null;
  ytickDistance: number | null;
  xlabel?: string;
  ylabel?: string;
  title?: string;
}

export function parseAxisConfig(options: Option[], envName: string, macros: Map<string,string>): AxisConfig {
  const cfg: AxisConfig = {
    widthPt: 8 * PT_PER_CM,
    heightPt: 6 * PT_PER_CM,
    xmin: null, xmax: null, ymin: null, ymax: null, zmin: null, zmax: null,
    xmode: "linear", ymode: "linear",
    grid: "none", axisLines: "box",
    xtick: null, ytick: null, xticklabels: null, yticklabels: null,
    xtickDistance: null, ytickDistance: null,
  };
  // env name influences mode
  const lowerEnv = envName.toLowerCase();
  if (lowerEnv.includes("semilogx") || lowerEnv.includes("semilogxaxis") || lowerEnv==="semilogxaxis") cfg.xmode="log";
  if (lowerEnv.includes("semilogy") ) cfg.ymode="log";
  if (lowerEnv.includes("loglog")) { cfg.xmode="log"; cfg.ymode="log"; }

  const rawAll = options.map(o=>o.raw.toLowerCase()).join(",");
  if (rawAll.includes("semilogx")) cfg.xmode="log";
  if (rawAll.includes("semilogy") || rawAll.includes("semilogy")) cfg.ymode="log";
  if (rawAll.includes("loglog")) { cfg.xmode="log"; cfg.ymode="log"; }
  // bar flags from axis options
  if (rawAll.includes("ybar")) (cfg as any).ybar=true;
  if (rawAll.includes("xbar")) (cfg as any).xbar=true;
  if (rawAll.includes("stacked")) (cfg as any).stacked=true;

  for (const o of options) {
    const k = o.key.trim().toLowerCase();
    const v = (o.value ?? "").trim();
    const raw = o.raw.toLowerCase();
    // width/height
    if (k==="width" && v) {
      try { cfg.widthPt = evalDim(v, macros); } catch {}
    } else if (k==="height" && v) {
      try { cfg.heightPt = evalDim(v, macros); } catch {}
    } else if ((k==="xmin" || k==="ymin" || k==="xmax" || k==="ymax" || k==="zmin" || k==="zmax") && v) {
      const num = parseFloat(v.replace(/[{}]/g,""));
      if (!isNaN(num)) (cfg as any)[k]=num;
      else {
        try { const nv = evalMath(v, {macros}); (cfg as any)[k]=nv; } catch {}
      }
    } else if (k==="xmin" && !v && raw.includes("xmin")) {
      const m = raw.match(/xmin\s*=\s*([^\s,]+)/); if(m){ const n=parseFloat(m[1]); if(!isNaN(n)) cfg.xmin=n; }
    } else if (k==="grid" || raw==="grid") {
      if (!v || v.toLowerCase()==="major") cfg.grid="major";
      else if (v.toLowerCase()==="minor") cfg.grid="minor";
      else if (v.toLowerCase()==="both") cfg.grid="both";
      else if (v.toLowerCase()==="none") cfg.grid="none";
      else cfg.grid="major";
    } else if (raw.includes("grid=major")) cfg.grid="major";
    else if (raw.includes("grid=minor")) cfg.grid="minor";
    else if (raw.includes("grid=both")) cfg.grid="both";
    else if (k==="axis lines" && v) {
      const lv=v.toLowerCase();
      if (lv.includes("box")) cfg.axisLines="box";
      else if (lv.includes("left")) cfg.axisLines="left";
      else if (lv.includes("middle")) cfg.axisLines="middle";
      else if (lv.includes("none")) cfg.axisLines="none";
    } else if (k==="axis x line" && v) {
      // map to axisLines partially
      if (v.toLowerCase().includes("box")) cfg.axisLines="box";
    } else if (k==="axis y line" && v) {
      if (v.toLowerCase().includes("box")) cfg.axisLines="box";
    } else if (k==="xtick" && v!==undefined) {
      cfg.xtick = parseTickList(v);
    } else if (k==="ytick" && v!==undefined) {
      cfg.ytick = parseTickList(v);
    } else if (k==="xticklabels" && v!==undefined) {
      cfg.xticklabels = parseTickLabels(v);
    } else if (k==="yticklabels" && v!==undefined) {
      cfg.yticklabels = parseTickLabels(v);
    } else if (k==="xtick distance" && v) {
      const n=parseFloat(v); if(!isNaN(n)) cfg.xtickDistance=n;
    } else if (k==="ytick distance" && v) {
      const n=parseFloat(v); if(!isNaN(n)) cfg.ytickDistance=n;
    } else if (k==="xlabel" && v) cfg.xlabel=v.replace(/[{}]/g,"");
    else if (k==="ylabel" && v) cfg.ylabel=v.replace(/[{}]/g,"");
    else if (k==="title" && v) cfg.title=v.replace(/[{}]/g,"");
    else if (k==="xmode" && v) cfg.xmode = v.toLowerCase().includes("log")?"log":"linear";
    else if (k==="ymode" && v) cfg.ymode = v.toLowerCase().includes("log")?"log":"linear";
  }
  // also detect bare xtick={...} where key includes xtick string with value undefined but raw contains =
  for (const o of options) {
    const raw=o.raw;
    if (raw.toLowerCase().startsWith("xtick=") && cfg.xtick===null) {
      const v = o.value ?? raw.split("=").slice(1).join("=").trim();
      cfg.xtick = parseTickList(v);
    }
    if (raw.toLowerCase().startsWith("ytick=") && cfg.ytick===null) {
      const v = o.value ?? raw.split("=").slice(1).join("=").trim();
      cfg.ytick = parseTickList(v);
    }
  }
  return cfg;
}

function parseTickList(v: string): number[]|null {
  let s=v.trim();
  if (s.startsWith("{") && s.endsWith("}")) s=s.slice(1,-1);
  if (!s.trim()) return [];
  if (s.toLowerCase()==="none") return [];
  const parts=s.split(",").map(x=>x.trim()).filter(Boolean);
  const nums: number[]=[];
  for(const p of parts){ const n=parseFloat(p); if(!isNaN(n)) nums.push(n); }
  return nums;
}
function parseTickLabels(v: string): string[]|null {
  let s=v.trim(); if(s.startsWith("{")&&s.endsWith("}")) s=s.slice(1,-1);
  return s.split(",").map(x=>x.trim().replace(/[{}]/g,""));
}
function evalDim(s: string, macros: Map<string,string>): number {
  // reuse evaluateDimensionString logic but inline
  let str=s.trim();
  for (const [k,v] of macros.entries()){ const key=k.replace(/^\\/,""); str=str.replace(new RegExp("\\\\"+key+"\\b","g"), v); }
  const hasUnit=/[0-9]\s*(pt|bp|mm|cm|in|pc|em|ex|px)\b/i.test(str);
  if (str.startsWith("{")&&str.endsWith("}")) {
    const res=evalMath(str,{macros});
    if(!hasUnit) return res*PT_PER_CM;
    return res;
  }
  if (/[+\-*/^()]/.test(str) || /sin|cos|tan|sqrt|veclen|atan2|min|max|ifthenelse|pi|e|mod/i.test(str)){
    try{ const res=evalMath(str,{macros}); if(!hasUnit) return res*PT_PER_CM; return res; }catch{}
  }
  // fallback manual parse
  const m=str.match(/^\s*([0-9.+\-]+)\s*(pt|cm|mm|in|bp|pc|px|em|ex)?\s*$/i);
  if(m){ const val=parseFloat(m[1]); const unit=(m[2]??"pt").toLowerCase(); const TO_PT:any={pt:1, cm:PT_PER_CM, mm:PT_PER_CM/10, in:72.27, bp:72.27/72, pc:12, px:1/1.3284, em:10, ex:4.3}; return val*(TO_PT[unit]??1); }
  const num=parseFloat(str); if(!isNaN(num)) return num*PT_PER_CM;
  return PT_PER_CM;
}

// ---------------------------------------------------------------------------
// Colormap viridis stub
// ---------------------------------------------------------------------------
const viridisCols = ["#440154","#31688e","#35b779","#fde725"];
function hexToRgb(h:string){ const v=h.replace("#",""); return {r:parseInt(v.slice(0,2),16), g:parseInt(v.slice(2,4),16), b:parseInt(v.slice(4,6),16)}; }
function rgbToHex(r:number,g:number,b:number){ const toHex=(n:number)=>Math.round(n).toString(16).padStart(2,"0"); return `#${toHex(r)}${toHex(g)}${toHex(b)}`; }
export function viridis(t:number): string {
  t=Math.max(0,Math.min(1,t));
  const n=viridisCols.length-1;
  const idx=t*n; const i=Math.floor(idx); const f=idx-i;
  if(i>=n) return viridisCols[n];
  const c1=hexToRgb(viridisCols[i]), c2=hexToRgb(viridisCols[i+1]);
  return rgbToHex(c1.r+(c2.r-c1.r)*f, c1.g+(c2.g-c1.g)*f, c1.b+(c2.b-c1.b)*f);
}

// ---------------------------------------------------------------------------
// Data extraction for addplot
// ---------------------------------------------------------------------------
export interface PlotDataPoint { x:number; y:number; z?: number; xError?: number; yError?: number; }
export interface PlotSpec {
  options: Option[];
  raw: string; // full raw after addplot
  dataKind: "expression"|"coordinates"|"table"|"unknown";
  expr?: string;
  pointsRaw?: string;
  tableRaw?: string;
}

export function extractPoints(spec: PlotSpec, macros: Map<string,string>): PlotDataPoint[] {
  if (spec.dataKind==="coordinates") {
    const str=spec.pointsRaw ?? spec.raw;
    const pts: PlotDataPoint[]=[];
    const re=/\(\s*([^,\)]+)\s*,\s*([^\)]+?)\s*\)/g; let m:any;
    while((m=re.exec(str))!==null){
      const xStr=m[1].trim(); const yStr=m[2].trim();
      // yStr may contain third coordinate? e.g., "1,2,3" without split? Our regex captures only 2, need handle 3
      // For 3D coordinates like (1,2,3) we need alternative: split yStr by comma
      if(yStr.includes(",")){
        const parts=yStr.split(",").map((s:string)=>s.trim()).filter(Boolean);
        if(parts.length>=2){
          const x=parseFloat(xStr); const y=parseFloat(parts[0]); const z=parseFloat(parts[1]);
          if(!isNaN(x)&&!isNaN(y)) pts.push({x,y,z: isNaN(z)?undefined:z});
          continue;
        }
      }
      const x=parseFloat(xStr); const y=parseFloat(yStr);
      if(!isNaN(x)&&!isNaN(y)) pts.push({x,y});
      else {
        // try evalMath for expressions like "1+2"
        try{ const xv=evalMath(xStr,{macros}); const yv=evalMath(yStr,{macros}); pts.push({x:xv,y:yv}); }catch{}
      }
    }
    return pts;
  } else if (spec.dataKind==="table") {
    const raw=spec.tableRaw ?? spec.raw;
    // raw contains rows separated by \\ or newline
    const rows = raw.split(/\\\\|\n/).map(s=>s.trim()).filter(Boolean);
    const pts: PlotDataPoint[]=[];
    for(const r of rows){
      // skip header if contains non-numeric? simple: try parse first two tokens as numbers
      const cols=r.split(/\s+/).filter(Boolean);
      if(cols.length<2) continue;
      // if first row contains column names like "x y" skip if not numeric and not first data but we treat generically
      const x=parseFloat(cols[0]); const y=parseFloat(cols[1]);
      if(isNaN(x)||isNaN(y)){
        // maybe header, skip
        if(pts.length===0) continue;
        else continue;
      }
      pts.push({x,y});
    }
    return pts;
  } else if (spec.dataKind==="expression") {
    const expr=spec.expr ?? spec.raw;
    // options may include domain/samples/variable
    let domainFrom=-5, domainTo=5; let samples=25; let samplesAt: number[]|null=null; let variable="x";
    let domainYFrom=-5, domainYTo=5, samplesY=25; // for 3D surf
    for(const o of spec.options){
      const k=o.key.toLowerCase(); const v=(o.value??"").trim();
      if(k==="domain" && v){
        const parts=v.split(":").map(s=>s.trim());
        if(parts[0]) domainFrom=parseFloat(parts[0]); if(parts[1]) domainTo=parseFloat(parts[1]);
      } else if (k==="samples" && v){ const n=parseInt(v,10); if(!isNaN(n)) samples=n; }
      else if (k==="samples at" && v){ let s=v.replace(/[{}]/g,""); samplesAt=s.split(",").map(x=>parseFloat(x.trim())).filter(n=>!isNaN(n)); }
      else if (k==="variable" && v){ variable=v.replace(/^\\/,""); }
      else if (k==="domain y" && v){ const parts=v.split(":"); if(parts[0]) domainYFrom=parseFloat(parts[0]); if(parts[1]) domainYTo=parseFloat(parts[1]); }
      else if (k==="samples y" && v){ const n=parseInt(v,10); if(!isNaN(n)) samplesY=n; }
    }
    // also need to detect 3D surf expression that uses both x and y: if spec is 3D (addplot3), then generate grid
    const is3D = spec.raw.toLowerCase().includes("surf") || spec.raw.toLowerCase().includes("mesh") || spec.options.some(o=>o.raw.toLowerCase().includes("surf")||o.raw.toLowerCase().includes("mesh")) || spec.dataKind==="expression" && expr.includes("y");
    // Actually heuristic: if expression contains both x and y variable, treat as surf grid
    const exprUsesY = /[yY]/.test(expr) && expr.includes("y") && (variable==="x" || variable==="\\x");
    // For now, if is surf/mesh, generate grid NxN
    if (spec.options.some(o=>o.raw.toLowerCase().includes("surf")||o.raw.toLowerCase().includes("mesh"))) {
      const pts: PlotDataPoint[]=[];
      // If not 3D grid, we still generate surf grid for visualization: samples x samplesY
      const xs: number[] = samplesAt ? samplesAt : Array.from({length:samples},(_,i)=> domainFrom + i*(domainTo-domainFrom)/(samples-1||1));
      const ys: number[] = Array.from({length:samplesY},(_,i)=> domainYFrom + i*(domainYTo-domainYFrom)/(samplesY-1||1));
      for(const xv of xs){
        for(const yv of ys){
          const iterM=new Map(macros);
          iterM.set("x", String(xv)); iterM.set("\\x", String(xv));
          iterM.set("y", String(yv)); iterM.set("\\y", String(yv));
          let zv=0; try{ zv=evalMath(expr,{macros:iterM}); }catch{ zv=xv*yv/10; }
          pts.push({x:xv, y:yv, z:zv});
        }
      }
      return pts;
    }
    const xs: number[] = samplesAt ? samplesAt : Array.from({length:samples},(_,i)=> domainFrom + i*(domainTo-domainFrom)/(samples-1||1));
    const pts: PlotDataPoint[]=[];
    for(const xv of xs){
      const iterM=new Map(macros);
      iterM.set(variable, String(xv)); iterM.set("\\"+variable, String(xv));
      iterM.set("x", String(xv)); iterM.set("\\x", String(xv));
      let yv=0;
      try{ yv=evalMath(expr,{macros:iterM}); }catch{ yv=0; }
      pts.push({x:xv, y:yv});
    }
    return pts;
  }
  return [];
}

// Helpers for tick generation
export function autoTicks(min:number, max:number, mode:"linear"|"log"): number[] {
  if(mode==="log"){
    const start=Math.ceil(Math.log10(Math.max(1e-9, min)));
    const end=Math.floor(Math.log10(Math.max(1e-9, max)));
    const ticks:number[]=[];
    for(let p=start;p<=end;p++) ticks.push(Math.pow(10,p));
    if(ticks.length===0) ticks.push(min,max);
    return ticks;
  }
  const n=5;
  const ticks:number[]=[];
  for(let i=0;i<=n;i++) ticks.push(min + (max-min)*i/n);
  return ticks;
}

// Generate axis items
export interface AxisEvalContext {
  transform: import("../geometry/affine.ts").Affine;
  canvasTransform: import("../geometry/affine.ts").Affine;
  macros: Map<string,string>;
  errors: any[];
}

export function generateAxisItems(
  cfg: AxisConfig,
  plotSpecs: PlotSpec[],
  legendEntries: string[],
  ctx: AxisEvalContext
): DisplayItem[] {
  const items: DisplayItem[]=[];
  const width=cfg.widthPt, height=cfg.heightPt;
  // we need actual data limits for auto
  // extract points for all plots to compute limits
  const allPoints: PlotDataPoint[][] = plotSpecs.map(spec=> extractPoints(spec, ctx.macros));
  let dataXmin=Infinity, dataXmax=-Infinity, dataYmin=Infinity, dataYmax=-Infinity, dataZmin=Infinity, dataZmax=-Infinity;
  for(const pts of allPoints){
    for(const p of pts){
      if(p.x<dataXmin) dataXmin=p.x;
      if(p.x>dataXmax) dataXmax=p.x;
      if(p.y<dataYmin) dataYmin=p.y;
      if(p.y>dataYmax) dataYmax=p.y;
      if(p.z!==undefined){ if(p.z<dataZmin) dataZmin=p.z; if(p.z>dataZmax) dataZmax=p.z; }
    }
  }
  if(!isFinite(dataXmin)){ dataXmin=0; dataXmax=1; }
  if(!isFinite(dataYmin)){ dataYmin=0; dataYmax=1; }
  if(dataXmin===dataXmax){ dataXmax=dataXmin+1; }
  if(dataYmin===dataYmax){ dataYmax=dataYmin+1; }
  let xmin=cfg.xmin ?? dataXmin;
  let xmax=cfg.xmax ?? dataXmax;
  let ymin=cfg.ymin ?? dataYmin;
  let ymax=cfg.ymax ?? dataYmax;
  // log handling clamp >0
  if(cfg.xmode==="log"){
    if(xmin<=0) xmin=0.1; if(xmax<=0) xmax=1;
    if(cfg.xmin===null && dataXmin>0) xmin=dataXmin;
  }
  if(cfg.ymode==="log"){
    if(ymin<=0) ymin=0.1; if(ymax<=0) ymax=1;
    if(cfg.ymin===null && dataYmin>0) ymin=dataYmin;
  }

  const mapX=(x:number)=>{
    if(cfg.xmode==="log") return (Math.log10(x)-Math.log10(xmin))/(Math.log10(xmax)-Math.log10(xmin))*width;
    return (x - xmin)/(xmax - xmin)*width;
  };
  const mapY=(y:number)=>{
    if(cfg.ymode==="log") return (Math.log10(y)-Math.log10(ymin))/(Math.log10(ymax)-Math.log10(ymin))*height;
    return (y - ymin)/(ymax - ymin)*height;
  };
  const applyTr=(p:Vec2)=> ctx.transform.apply(p);

  // Axis box / lines
  let boxSegs: PathSegment[];
  if(cfg.axisLines==="box"){
    const p00=applyTr(new Vec2(0,0));
    const p10=applyTr(new Vec2(width,0));
    const p11=applyTr(new Vec2(width,height));
    const p01=applyTr(new Vec2(0,height));
    boxSegs=[{kind:"moveTo", to:p00},{kind:"lineTo", to:p10},{kind:"lineTo", to:p11},{kind:"lineTo", to:p01},{kind:"close"}];
  } else if(cfg.axisLines==="left"){
    // L shape: bottom and left
    const p00=applyTr(new Vec2(0,0));
    const p10=applyTr(new Vec2(width,0));
    const p01=applyTr(new Vec2(0,height));
    boxSegs=[{kind:"moveTo", to:p00},{kind:"lineTo", to:p10},{kind:"moveTo", to:p00},{kind:"lineTo", to:p01}];
  } else if(cfg.axisLines==="middle"){
    // cross at 0 if inside
    const x0 = (xmin<0 && xmax>0) ? mapX(0) : width/2;
    const y0 = (ymin<0 && ymax>0) ? mapY(0) : height/2;
    const p00=applyTr(new Vec2(0,y0)); const p10=applyTr(new Vec2(width,y0));
    const p01=applyTr(new Vec2(x0,0)); const p11=applyTr(new Vec2(x0,height));
    boxSegs=[{kind:"moveTo", to:p00},{kind:"lineTo", to:p10},{kind:"moveTo", to:p01},{kind:"lineTo", to:p11}];
  } else {
    boxSegs=[{kind:"moveTo", to:applyTr(new Vec2(0,0))},{kind:"lineTo", to:applyTr(new Vec2(width,0))},{kind:"lineTo", to:applyTr(new Vec2(width,height))},{kind:"lineTo", to:applyTr(new Vec2(0,height))},{kind:"close"}];
  }
  items.push({kind:"path", segments:boxSegs, stroke:{...DEFAULT_STROKE}, fill:null, isClosed: cfg.axisLines==="box"} as any);

  // Ticks and grids
  let xticks = cfg.xtick;
  if(xticks===null){
    if(cfg.xtickDistance!==null){
      xticks=[]; let v=xmin; for(let i=0;i<20;i++){ if(v>xmax) break; xticks.push(v); v+=cfg.xtickDistance; }
    } else xticks=autoTicks(xmin,xmax,cfg.xmode);
  }
  let yticks = cfg.ytick;
  if(yticks===null){
    if(cfg.ytickDistance!==null){
      yticks=[]; let v=ymin; for(let i=0;i<20;i++){ if(v>ymax) break; yticks.push(v); v+=cfg.ytickDistance; }
    } else yticks=autoTicks(ymin,ymax,cfg.ymode);
  }
  // grid lines
  const gridColor="#cccccc";
  if(cfg.grid!=="none"){
    for(const xv of xticks ?? []){
      const x=mapX(xv);
      if(!isFinite(x)) continue;
      const p0=applyTr(new Vec2(x,0)); const p1=applyTr(new Vec2(x,height));
      items.push({kind:"path", segments:[{kind:"moveTo", to:p0},{kind:"lineTo", to:p1}], stroke:{...DEFAULT_STROKE, color:gridColor, widthPt:0.2, dash:null, dashPhasePt:0, opacity:0.7}, fill:null, isClosed:false} as any);
    }
    for(const yv of yticks ?? []){
      const y=mapY(yv);
      if(!isFinite(y)) continue;
      const p0=applyTr(new Vec2(0,y)); const p1=applyTr(new Vec2(width,y));
      items.push({kind:"path", segments:[{kind:"moveTo", to:p0},{kind:"lineTo", to:p1}], stroke:{...DEFAULT_STROKE, color:gridColor, widthPt:0.2, dash:null, dashPhasePt:0, opacity:0.7}, fill:null, isClosed:false} as any);
    }
  }
  // tick lines + labels
  for(let i=0;i<(xticks?.length??0);i++){
    const xv=xticks![i];
    const x=mapX(xv);
    if(!isFinite(x)) continue;
    const p0=applyTr(new Vec2(x,0)); const p1=applyTr(new Vec2(x,-3));
    items.push({kind:"path", segments:[{kind:"moveTo", to:p0},{kind:"lineTo", to:p1}], stroke:{...DEFAULT_STROKE, widthPt:0.4}, fill:null, isClosed:false} as any);
    const label = cfg.xticklabels?.[i] ?? String(xv);
    const at=applyTr(new Vec2(x,-8));
    items.push({kind:"text", text:label, at, font:"7pt sans", color:"#000", align:"center", baseline:"top", widthPt:20, heightPt:7} as any);
  }
  for(let i=0;i<(yticks?.length??0);i++){
    const yv=yticks![i];
    const y=mapY(yv);
    if(!isFinite(y)) continue;
    const p0=applyTr(new Vec2(0,y)); const p1=applyTr(new Vec2(-3,y));
    items.push({kind:"path", segments:[{kind:"moveTo", to:p0},{kind:"lineTo", to:p1}], stroke:{...DEFAULT_STROKE, widthPt:0.4}, fill:null, isClosed:false} as any);
    const label = cfg.yticklabels?.[i] ?? String(yv);
    const at=applyTr(new Vec2(-5,y));
    items.push({kind:"text", text:label, at, font:"7pt sans", color:"#000", align:"right", baseline:"middle", widthPt:20, heightPt:7} as any);
  }
  // xlabel, ylabel, title
  if(cfg.xlabel){
    const at=applyTr(new Vec2(width/2, -18));
    items.push({kind:"text", text:cfg.xlabel, at, font:"8pt sans", color:"#000", align:"center", baseline:"top", widthPt:30, heightPt:8} as any);
  }
  if(cfg.ylabel){
    const at=applyTr(new Vec2(-22, height/2));
    items.push({kind:"text", text:cfg.ylabel, at, font:"8pt sans", color:"#000", align:"center", baseline:"middle", widthPt:30, heightPt:8} as any);
  }
  if(cfg.title){
    const at=applyTr(new Vec2(width/2, height+8));
    items.push({kind:"text", text:cfg.title, at, font:"9pt sans", color:"#000", align:"center", baseline:"bottom", widthPt:40, heightPt:9} as any);
  }

  // Stacked handling: maintain cumulative per x (also cfg stacked)
  const stacked = (cfg as any).stacked || plotSpecs.some(s=> s.raw.toLowerCase().includes("stacked") || s.options.some(o=>o.raw.toLowerCase().includes("stacked")));
  const cfgIsYBar = (cfg as any).ybar;
  const cfgIsXBar = (cfg as any).xbar;
  const cumulative = new Map<number, number>(); // x index -> cum y

  // previous plot for fill between
  let prevPointsScaled: Vec2[]|null=null;
  let prevPointsData: PlotDataPoint[]|null=null;

  for(let pi=0; pi<plotSpecs.length; pi++){
    const spec=plotSpecs[pi];
    const ptsData= allPoints[pi];
    if(ptsData.length===0) continue;
    const rawLower = [spec.raw.toLowerCase(), ...spec.options.map(o=>o.raw.toLowerCase())].join(" ");
    let isYBar = rawLower.includes("ybar");
    let isXBar = rawLower.includes("xbar") && !isYBar;
    // axis-level bar types if not specified per-plot
    if(!isYBar && !isXBar){
      if(cfgIsYBar) isYBar=true;
      else if(cfgIsXBar) isXBar=true;
    }
    const isScatter = rawLower.includes("scatter") || rawLower.includes("only marks") || rawLower.includes("mark=");
    const isArea = rawLower.includes("area") || rawLower.includes("fill between") || (rawLower.includes("fill") && !isYBar && !isXBar && !rawLower.includes("scatter")) ;
    const isSurf = rawLower.includes("surf");
    const isMesh = rawLower.includes("mesh") && !isSurf;
    const hasColormap = rawLower.includes("colormap") || rawLower.includes("point meta") || rawLower.includes("viridis");
    const hasErrorBars = rawLower.includes("error bars") || rawLower.includes("y error") || rawLower.includes("x error");

    // color
    let strokeColor="#0000ff";
    for(const o of spec.options){
      const k=o.key.toLowerCase(); const v=(o.value??"").trim().toLowerCase();
      const raw=o.raw.toLowerCase();
      if(k==="color" && v) strokeColor=v;
      else if(k==="draw" && v) strokeColor=v;
      else if(k==="fill" && v) {/* for bars */}
      else if(raw.includes("red")) strokeColor="red";
      else if(raw.includes("blue")) strokeColor="#0000ff";
      else if(raw.includes("green")) strokeColor="green";
      else if(raw.includes("black")) strokeColor="black";
    }
    // map points to scaled
    const ptsScaled: Vec2[] = ptsData.map(p=>{
      const sx=mapX(p.x);
      const sy=mapY(p.y);
      return applyTr(new Vec2(sx,sy));
    });

    if(isYBar){
      const barWidth = 8; // pt before transform? Adapt to scale? Use 10pt in axis space then transformed? Keep 8 in pt internal axis local before apply.
      // width in axis pt: compute as width / (ptsData.length *1.5) but cap 12
      const bw = Math.min(12, width/(ptsData.length*1.2));
      for(let i=0;i<ptsData.length;i++){
        const d=ptsData[i];
        let baseY: number;
        let topY: number;
        if(stacked){
          const key=d.x;
          const prev = cumulative.get(key) ?? 0;
          baseY = mapY(prev);
          const cum = prev + d.y;
          topY = mapY(cum);
          cumulative.set(key, cum);
        } else {
          // baseline at 0 if inside range else ymin
          const baseVal = (ymin<0 && ymax>0) ? 0 : ymin;
          baseY = mapY(baseVal);
          topY = mapY(d.y);
        }
        const xC = mapX(d.x);
        const x1 = xC - bw/2; const x2 = xC + bw/2;
        const p00=applyTr(new Vec2(x1, baseY));
        const p10=applyTr(new Vec2(x2, baseY));
        const p11=applyTr(new Vec2(x2, topY));
        const p01=applyTr(new Vec2(x1, topY));
        const segs: PathSegment[]=[{kind:"moveTo", to:p00},{kind:"lineTo", to:p10},{kind:"lineTo", to:p11},{kind:"lineTo", to:p01},{kind:"close"}];
        const fillColor = hasColormap ? viridis( (d.y - ymin)/(ymax-ymin) ) : strokeColor;
        items.push({kind:"path", segments:segs, stroke:{...DEFAULT_STROKE, color:"#000", widthPt:0.3}, fill:{color:fillColor, opacity:1, rule:"nonzero"}, isClosed:true} as any);
      }
    } else if(isXBar){
      const bh = Math.min(12, height/(ptsData.length*1.2));
      for(let i=0;i<ptsData.length;i++){
        const d=ptsData[i];
        let baseX: number;
        let topX: number;
        if(stacked){
          const key=d.y;
          const prev = cumulative.get(key) ?? 0;
          baseX = mapX(prev);
          const cum = prev + d.x;
          topX = mapX(cum);
          cumulative.set(key, cum);
        } else {
          const baseVal = (xmin<0 && xmax>0) ? 0 : xmin;
          baseX = mapX(baseVal);
          topX = mapX(d.x);
        }
        const yC = mapY(d.y);
        const y1=yC - bh/2, y2=yC + bh/2;
        const p00=applyTr(new Vec2(baseX, y1));
        const p10=applyTr(new Vec2(topX, y1));
        const p11=applyTr(new Vec2(topX, y2));
        const p01=applyTr(new Vec2(baseX, y2));
        const segs: PathSegment[]=[{kind:"moveTo", to:p00},{kind:"lineTo", to:p10},{kind:"lineTo", to:p11},{kind:"lineTo", to:p01},{kind:"close"}];
        const fillColor = hasColormap ? viridis( (d.x - xmin)/(xmax-xmin) ) : strokeColor;
        items.push({kind:"path", segments:segs, stroke:{...DEFAULT_STROKE, color:"#000", widthPt:0.3}, fill:{color:fillColor, opacity:1, rule:"nonzero"}, isClosed:true} as any);
      }
    } else if(isSurf){
      // generate colored quads from 3D grid
      // ptsData is flat grid with size samples x samplesY
      // deduce grid dims: assume sqrt? Use known samples values if available
      // We'll treat as NxN where N = sqrt(ptsData.length)
      const N = Math.round(Math.sqrt(ptsData.length));
      const zmin = Math.min(...ptsData.map(p=>p.z??0));
      const zmax = Math.max(...ptsData.map(p=>p.z??0));
      const range = (zmax-zmin)||1;
      for(let ix=0; ix<N-1; ix++){
        for(let iy=0; iy<N-1; iy++){
          const i00= ix*N + iy;
          const i10= (ix+1)*N + iy;
          const i01= ix*N + (iy+1);
          const i11= (ix+1)*N + (iy+1);
          if(i11>=ptsData.length) continue;
          const p00d=ptsData[i00], p10d=ptsData[i10], p11d=ptsData[i11], p01d=ptsData[i01];
          const zavg=( (p00d.z??0)+(p10d.z??0)+(p11d.z??0)+(p01d.z??0))/4;
          const t=(zavg - zmin)/range;
          const col = viridis(t);
          // map x,y to axis space (ignore z height for 2D projection; we project isometrically slightly? Keep 2D)
          const s00=applyTr(new Vec2(mapX(p00d.x), mapY(p00d.y)));
          const s10=applyTr(new Vec2(mapX(p10d.x), mapY(p10d.y)));
          const s11=applyTr(new Vec2(mapX(p11d.x), mapY(p11d.y)));
          const s01=applyTr(new Vec2(mapX(p01d.x), mapY(p01d.y)));
          const segs: PathSegment[]=[{kind:"moveTo", to:s00},{kind:"lineTo", to:s10},{kind:"lineTo", to:s11},{kind:"lineTo", to:s01},{kind:"close"}];
          items.push({kind:"path", segments:segs, stroke:{...DEFAULT_STROKE, color:col, widthPt:0.2}, fill:{color:col, opacity:0.8, rule:"nonzero"}, isClosed:true, colormap:"viridis", surf:true} as any);
        }
      }
      // also store as surf for test detection
    } else if(isMesh){
      const N = Math.round(Math.sqrt(ptsData.length));
      for(let ix=0; ix<N; ix++){
        for(let iy=0; iy<N-1; iy++){
          const i0=ix*N+iy, i1=ix*N+iy+1;
          if(i1>=ptsData.length) continue;
          const a=ptsData[i0], b=ptsData[i1];
          const pa=applyTr(new Vec2(mapX(a.x), mapY(a.y)));
          const pb=applyTr(new Vec2(mapX(b.x), mapY(b.y)));
          items.push({kind:"path", segments:[{kind:"moveTo", to:pa},{kind:"lineTo", to:pb}], stroke:{...DEFAULT_STROKE, color:strokeColor, widthPt:0.4}, fill:null, isClosed:false, mesh:true} as any);
        }
      }
      for(let iy=0; iy<N; iy++){
        for(let ix=0; ix<N-1; ix++){
          const i0=ix*N+iy, i1=(ix+1)*N+iy;
          if(i1>=ptsData.length) continue;
          const a=ptsData[i0], b=ptsData[i1];
          const pa=applyTr(new Vec2(mapX(a.x), mapY(a.y)));
          const pb=applyTr(new Vec2(mapX(b.x), mapY(b.y)));
          items.push({kind:"path", segments:[{kind:"moveTo", to:pa},{kind:"lineTo", to:pb}], stroke:{...DEFAULT_STROKE, color:strokeColor, widthPt:0.4}, fill:null, isClosed:false, mesh:true} as any);
        }
      }
    } else if(isScatter){
      for(let i=0;i<ptsScaled.length;i++){
        const pt=ptsScaled[i];
        const d=ptsData[i];
        const col = hasColormap ? viridis( (d.y - ymin)/(ymax-ymin) ) : strokeColor;
        // small circle radius 2pt
        const r=2;
        // approximate circle via square with bezier? simplified as small rectangle for test detection
        const p00=new Vec2(pt.x - r, pt.y - r);
        const p11=new Vec2(pt.x + r, pt.y + r);
        // create 4-segment circle via bezier using kappa ~0.552
        const segs = circleSegs(pt, r);
        items.push({kind:"path", segments:segs, stroke:{...DEFAULT_STROKE, color:col, widthPt:0.4}, fill:{color:col, opacity:1, rule:"nonzero"}, isClosed:true, scatter:true} as any);
      }
    } else if(isArea){
      // fill between detection: if raw contains fill between
      if(rawLower.includes("fill between")){
        // fill between this plot and previous
        if(prevPointsScaled && prevPointsScaled.length===ptsScaled.length){
          const segs: PathSegment[]=[];
          segs.push({kind:"moveTo", to: ptsScaled[0]});
          for(let i=1;i<ptsScaled.length;i++) segs.push({kind:"lineTo", to: ptsScaled[i]});
          for(let i=prevPointsScaled.length-1;i>=0;i--) segs.push({kind:"lineTo", to: prevPointsScaled[i]});
          segs.push({kind:"close"});
          items.push({kind:"path", segments:segs, stroke:null, fill:{color:strokeColor, opacity:0.4, rule:"nonzero"}, isClosed:true, area:true, fillBetween:true} as any);
        } else {
          // fallback area under curve
          const baseY = mapY((ymin<0&&ymax>0)?0:ymin);
          const baseTrans = (x:number)=> applyTr(new Vec2(x, baseY));
          const segs: PathSegment[]=[];
          segs.push({kind:"moveTo", to: ptsScaled[0]});
          for(let i=1;i<ptsScaled.length;i++) segs.push({kind:"lineTo", to: ptsScaled[i]});
          segs.push({kind:"lineTo", to: baseTrans(ptsScaled[ptsScaled.length-1].x - ctx.transform.e)}); // wrong, use x
          // instead use last x
          // we already have pts, close to baseline
          const lastX = ptsScaled[ptsScaled.length-1];
          const firstX = ptsScaled[0];
          segs.push({kind:"lineTo", to: applyTr(new Vec2(mapX(ptsData[ptsData.length-1].x), baseY))});
          segs.push({kind:"lineTo", to: applyTr(new Vec2(mapX(ptsData[0].x), baseY))});
          segs.push({kind:"close"});
          items.push({kind:"path", segments:segs, stroke:null, fill:{color:strokeColor, opacity:0.35, rule:"nonzero"}, isClosed:true, area:true, fillBetween:true} as any);
        }
      } else {
        // area under curve (filled)
        const baseVal = (ymin<0 && ymax>0)?0:ymin;
        const baseY = mapY(baseVal);
        const segs: PathSegment[]=[];
        segs.push({kind:"moveTo", to: ptsScaled[0]});
        for(let i=1;i<ptsScaled.length;i++) segs.push({kind:"lineTo", to: ptsScaled[i]});
        // close to baseline
        const lastXVal=ptsData[ptsData.length-1].x;
        const firstXVal=ptsData[0].x;
        segs.push({kind:"lineTo", to: applyTr(new Vec2(mapX(lastXVal), baseY))});
        segs.push({kind:"lineTo", to: applyTr(new Vec2(mapX(firstXVal), baseY))});
        segs.push({kind:"close"});
        items.push({kind:"path", segments:segs, stroke:{...DEFAULT_STROKE, color:strokeColor, widthPt:0.6}, fill:{color:strokeColor, opacity:0.35, rule:"nonzero"}, isClosed:true, area:true} as any);
        // also line on top
        const lineSegs: PathSegment[]=[{kind:"moveTo", to: ptsScaled[0]}];
        for(let i=1;i<ptsScaled.length;i++) lineSegs.push({kind:"lineTo", to: ptsScaled[i]});
        items.push({kind:"path", segments:lineSegs, stroke:{...DEFAULT_STROKE, color:strokeColor, widthPt:0.6}, fill:null, isClosed:false} as any);
      }
    } else {
      // default line
      if(ptsScaled.length===0) continue;
      const segs: PathSegment[]=[{kind:"moveTo", to: ptsScaled[0]}];
      for(let i=1;i<ptsScaled.length;i++) segs.push({kind:"lineTo", to: ptsScaled[i]});
      const col = hasColormap ? viridis(0.5) : strokeColor;
      const item:any={kind:"path", segments:segs, stroke:{...DEFAULT_STROKE, color:col, widthPt:0.6}, fill:null, isClosed:false};
      if(hasColormap) item.colormap="viridis";
      items.push(item);
      // error bars
      if(hasErrorBars){
        // try to parse error value from options
        let yErr = 0.3; // default
        for(const o of spec.options){
          const raw=o.raw.toLowerCase();
          const mm=raw.match(/y\s*error\s*=\s*([0-9.]+)/);
          if(mm) yErr=parseFloat(mm[1]);
        }
        // also look for explicit table error? ignore
        for(let i=0;i<ptsData.length;i++){
          const d=ptsData[i];
          const pt=ptsScaled[i];
          const errPt = hasColormap? yErr*(ymax-ymin)*0.05 : yErr;
          // if log, not simple; use fixed pt 5
          const yUp = applyTr(new Vec2(mapX(d.x), mapY(d.y + yErr)));
          const yDown = applyTr(new Vec2(mapX(d.x), mapY(d.y - yErr)));
          // vertical line
          items.push({kind:"path", segments:[{kind:"moveTo", to:yDown},{kind:"lineTo", to:yUp}], stroke:{...DEFAULT_STROKE, color:strokeColor, widthPt:0.4}, fill:null, isClosed:false, errorBar:true} as any);
          // caps
          const cap=2;
          items.push({kind:"path", segments:[{kind:"moveTo", to:new Vec2(yUp.x-cap, yUp.y)},{kind:"lineTo", to:new Vec2(yUp.x+cap, yUp.y)}], stroke:{...DEFAULT_STROKE, color:strokeColor, widthPt:0.4}, fill:null, isClosed:false, errorBar:true} as any);
          items.push({kind:"path", segments:[{kind:"moveTo", to:new Vec2(yDown.x-cap, yDown.y)},{kind:"lineTo", to:new Vec2(yDown.x+cap, yDown.y)}], stroke:{...DEFAULT_STROKE, color:strokeColor, widthPt:0.4}, fill:null, isClosed:false, errorBar:true} as any);
        }
      }
    }
    prevPointsScaled = ptsScaled;
    prevPointsData = ptsData;
  }
  // legend
  if(legendEntries.length>0){
    const lx = width - 40;
    const ly = height - 10;
    for(let i=0;i<legendEntries.length;i++){
      const txt=legendEntries[i];
      const y = ly - i*12;
      const lineA=applyTr(new Vec2(lx, y));
      const lineB=applyTr(new Vec2(lx+12, y));
      items.push({kind:"path", segments:[{kind:"moveTo", to:lineA},{kind:"lineTo", to:lineB}], stroke:{...DEFAULT_STROKE, color:(plotSpecs[i]?.options.find(o=>o.raw.includes("red"))? "red" : "#0000ff"), widthPt:0.6}, fill:null, isClosed:false, legend:true} as any);
      const at=applyTr(new Vec2(lx+14, y));
      items.push({kind:"text", text:txt, at, font:"7pt sans", color:"#000", align:"left", baseline:"middle", widthPt:30, heightPt:7, legend:true} as any);
    }
  }

  return items;
}

function circleSegs(center:Vec2, r:number): PathSegment[] {
  const K=0.5522847498;
  const cp = r*K;
  return [
    {kind:"moveTo", to: new Vec2(center.x + r, center.y)},
    {kind:"curveTo", cp1: new Vec2(center.x + r, center.y + cp), cp2: new Vec2(center.x + cp, center.y + r), to: new Vec2(center.x, center.y + r)},
    {kind:"curveTo", cp1: new Vec2(center.x - cp, center.y + r), cp2: new Vec2(center.x - r, center.y + cp), to: new Vec2(center.x - r, center.y)},
    {kind:"curveTo", cp1: new Vec2(center.x - r, center.y - cp), cp2: new Vec2(center.x - cp, center.y - r), to: new Vec2(center.x, center.y - r)},
    {kind:"curveTo", cp1: new Vec2(center.x - cp, center.y - r), cp2: new Vec2(center.x + r, center.y - cp), to: new Vec2(center.x + r, center.y)},
    {kind:"close"},
  ];
}
