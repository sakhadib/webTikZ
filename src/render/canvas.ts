import type { DisplayList, DisplayItem, PathSegment } from "./displayList.ts";
import { ptToPx } from "../geometry/units.ts";

export interface RenderOptions {
  scale?: number;
  dpr?: number;
  background?: string | null;
}

/**
 * Render DisplayList to a <canvas>. Handles HiDPI and y-flip.
 * Internal coordinates are in pt with origin at TikZ (0,0) = bottom-left internally,
 * but canvas origin is top-left. We translate so bbox.min is at origin and flip Y.
 */
export function renderToCanvas(
  dl: DisplayList,
  canvas: HTMLCanvasElement,
  opts: RenderOptions = {},
): void {
  const dpr = opts.dpr ?? globalThis.devicePixelRatio ?? 1;
  const extraScale = opts.scale ?? 1;
  const bg = opts.background ?? null;

  const bbox = dl.bbox;
  const wPt = bbox.isEmpty ? 10 : bbox.width;
  const hPt = bbox.isEmpty ? 10 : bbox.height;

  // Add small padding so stroke isn't clipped
  const padPt = 0.5;
  const paddedW = wPt + padPt * 2;
  const paddedH = hPt + padPt * 2;

  const cssW = ptToPx(paddedW) * extraScale;
  const cssH = ptToPx(paddedH) * extraScale;

  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.setTransform(dpr * extraScale, 0, 0, dpr * extraScale, 0, 0);

  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssW / extraScale, cssH / extraScale);
  } else {
    ctx.clearRect(0, 0, cssW / extraScale, cssH / extraScale);
  }

  // Transform: map pt -> px, flip Y, translate bbox to origin + padding
  // ptToPx factor already accounted? We applied ptToPx to canvas size but context is in px units.
  // Simpler: work in px; convert pt->px inside drawing
  // Save: translate to (pad, pad+h) then scale( pxPerPt, -pxPerPt ) then translate(-minX, -minY)
  const pxPerPt = ptToPx(1);
  ctx.save();
  // After setTransform above, we're in CSS px scaled by extraScale; now apply pt mapping
  // Move origin to bottom-left + padding
  ctx.translate(padPt * pxPerPt, (paddedH - padPt) * pxPerPt);
  ctx.scale(pxPerPt, -pxPerPt);
  ctx.translate(-bbox.minX, -bbox.minY);

  for (const item of dl.items) drawItem(ctx, item);

  ctx.restore();
}

function drawItem(ctx: CanvasRenderingContext2D, item: DisplayItem): void {
  if (item.kind === "path") {
    const p:any=item;
    // overlay / useAsBoundingBox etc not affect paint; but gradient/pattern
    drawPath(ctx, item.segments, item.stroke, item.fill, p.gradient, p.pattern, p._arrowTipSegs);
  } else if (item.kind === "text") {
    ctx.save();
    // Text is drawn in pt space already flipped by outer transform; need to flip back for readable text
    ctx.scale(1, -1);
    ctx.font = item.font ?? "10pt sans-serif";
    ctx.fillStyle = item.color ?? "#000";
    ctx.textAlign = item.align ?? "left";
    ctx.textBaseline = item.baseline ?? "alphabetic";
    // item.at is in pt; after outer flip, y is negated; with inner flip we need to negate y
    ctx.fillText(item.text, item.at.x, -item.at.y);
    ctx.restore();
  } else if (item.kind === "group") {
    ctx.save();
    ctx.globalAlpha *= item.opacity ?? 1;
    if (item.clipPath) {
      buildPath(ctx, item.clipPath);
      ctx.clip();
    }
    for (const child of item.children) drawItem(ctx, child);
    ctx.restore();
  }
}

function buildPath(ctx: CanvasRenderingContext2D, segs: PathSegment[]): void {
  ctx.beginPath();
  for (const s of segs) {
    if (s.kind === "moveTo") ctx.moveTo(s.to.x, s.to.y);
    else if (s.kind === "lineTo") ctx.lineTo(s.to.x, s.to.y);
    else if (s.kind === "curveTo") ctx.bezierCurveTo(s.cp1.x, s.cp1.y, s.cp2.x, s.cp2.y, s.to.x, s.to.y);
    else if (s.kind === "close") ctx.closePath();
  }
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  segs: PathSegment[],
  stroke: import("./displayList.ts").StrokeStyle | null,
  fill: import("./displayList.ts").FillStyle | null,
  gradient?: any,
  pattern?: any,
  arrowSegs?: PathSegment[],
): void {
  if (segs.length === 0) return;
  buildPath(ctx, segs);

  const s = stroke;
  const f = fill;

  if (f || gradient || pattern) {
    ctx.save();
    ctx.globalAlpha *= (f?.opacity ?? 1);
    if (gradient) {
      // compute bbox for gradient
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      for(const seg of segs){ const pts:any[]=[]; if((seg as any).to) pts.push((seg as any).to); if((seg as any).cp1) pts.push((seg as any).cp1,(seg as any).cp2); for(const p of pts){ if(p.x<minX)minX=p.x; if(p.y<minY)minY=p.y; if(p.x>maxX)maxX=p.x; if(p.y>maxY)maxY=p.y; } }
      if(!isFinite(minX)){ minX=0; minY=0; maxX=10; maxY=10; }
      let grad:any;
      if(gradient.kind==="radial"){
        const cx=(minX+maxX)/2, cy=(minY+maxY)/2, r=Math.max(maxX-minX, maxY-minY)/2||10;
        grad=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
      } else {
        const ang=(gradient.angleDeg??0)*Math.PI/180;
        // simple axis: left->right or bottom->top based on colors order
        if(Math.abs(Math.cos(ang))>0.5){
          grad=ctx.createLinearGradient(minX,0,maxX,0);
        } else {
          grad=ctx.createLinearGradient(0,minY,0,maxY);
        }
      }
      for(const stop of gradient.colors) try{grad.addColorStop(stop.offset, stop.color);}catch{}
      ctx.fillStyle=grad;
    } else if (pattern) {
      // create offscreen pattern
      try{
        const size=8;
        const off=document.createElement("canvas");
        off.width=size; off.height=size;
        const octx=off.getContext("2d")!;
        octx.strokeStyle=pattern.color; octx.fillStyle=pattern.color;
        octx.lineWidth=0.6;
        if(pattern.name.includes("dots")){
          octx.beginPath(); octx.arc(2,2,1,0,Math.PI*2); octx.fill();
          octx.beginPath(); octx.arc(6,6,1,0,Math.PI*2); octx.fill();
        } else if(pattern.name.includes("crosshatch")||pattern.name.includes("grid")){
          octx.beginPath(); octx.moveTo(0,0); octx.lineTo(size,size); octx.moveTo(size,0); octx.lineTo(0,size); octx.stroke();
        } else if(pattern.name.includes("bricks")){
          octx.strokeRect(0,0,size,4); octx.strokeRect(0,4,size,4);
        } else if(pattern.name.includes("checkerboard")){
          octx.fillRect(0,0,4,4); octx.fillRect(4,4,4,4);
        } else {
          // north east lines default
          octx.beginPath(); octx.moveTo(0,size); octx.lineTo(size,0); octx.stroke();
        }
        const pat=ctx.createPattern(off,"repeat");
        if(pat) ctx.fillStyle=pat;
        else ctx.fillStyle=f?.color ?? "#888";
      }catch{ ctx.fillStyle=f?.color ?? "#888"; }
    } else if(f){
      ctx.fillStyle = f.color;
    }
    // @ts-ignore
    ctx.fill((f?.rule ?? "nonzero"));
    ctx.restore();
  }
  if (s) {
    ctx.save();
    ctx.globalAlpha *= s.opacity ?? 1;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.widthPt;
    ctx.lineCap = s.cap;
    ctx.lineJoin = s.join;
    ctx.miterLimit = s.miterLimit;
    if (s.dash) ctx.setLineDash(s.dash);
    ctx.lineDashOffset = s.dashPhasePt ?? 0;
    ctx.stroke();
    ctx.restore();
  }
  if(arrowSegs && arrowSegs.length>0){
    ctx.save();
    ctx.fillStyle="#000";
    buildPath(ctx, arrowSegs);
    ctx.fill();
    ctx.restore();
  }
}

/** Utility: create canvas, render, return canvas (for tests / Node with canvas polyfill) */
export function createCanvasForDisplayList(dl: DisplayList, opts: RenderOptions = {}): HTMLCanvasElement {
  const canvas = typeof document !== "undefined"
    ? document.createElement("canvas")
    : // Node fallback — requires 'canvas' package if used outside browser
      (() => {
        throw new Error("No document: supply a canvas element explicitly");
      })();
  renderToCanvas(dl, canvas, opts);
  return canvas;
}
