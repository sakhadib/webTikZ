import { Vec2 } from "./vec2.ts";
import { Cubic, cubicPoint, cubicTangent, approximateArcLength } from "./bezier.ts";
import type { PathSegment } from "../render/displayList.ts";

export function segmentsToCubics(segments: PathSegment[]): Cubic[] {
  const out: Cubic[] = [];
  let cur = new Vec2(0,0);
  let start = new Vec2(0,0);
  for (const s of segments) {
    if (s.kind==="moveTo") { cur=s.to; start=cur; }
    else if (s.kind==="lineTo") {
      const p0=cur; const p3=s.to;
      // degenerate cubic for line
      const p1=p0.lerp(p3,1/3); const p2=p0.lerp(p3,2/3);
      out.push({p0,p1,p2,p3});
      cur=p3;
    } else if (s.kind==="curveTo") {
      out.push({p0:cur,p1:s.cp1,p2:s.cp2,p3:s.to});
      cur=s.to;
    } else if (s.kind==="close") {
      const p0=cur; const p3=start;
      const p1=p0.lerp(p3,1/3); const p2=p0.lerp(p3,2/3);
      out.push({p0,p1,p2,p3});
      cur=start;
    }
  }
  return out;
}

export function totalLength(segments: PathSegment[]): number {
  let len=0;
  for(const c of segmentsToCubics(segments)) len+=approximateArcLength(c,20);
  return len;
}

export function pointAtFraction(segments: PathSegment[], frac:number): {point:Vec2,tangent:Vec2} {
  frac=Math.max(0,Math.min(1,frac));
  const cubics=segmentsToCubics(segments);
  const lens=cubics.map(c=>approximateArcLength(c,20));
  const tot=lens.reduce((a,b)=>a+b,0);
  if(tot===0) return {point:new Vec2(0,0),tangent:new Vec2(1,0)};
  const target=tot*frac;
  let acc=0;
  for(let i=0;i<cubics.length;i++){
    const l=lens[i];
    if(acc+l>=target-1e-9){
      const local=(target-acc)/l;
      // map local [0,1] linearly to t (approx arc-length uniform)
      const t=local;
      const pt=cubicPoint(cubics[i],t);
      const tan=cubicTangent(cubics[i],t).norm();
      return {point:pt,tangent:tan};
    }
    acc+=l;
  }
  const last=cubics[cubics.length-1];
  return {point:last.p3, tangent:cubicTangent(last,1).norm()};
}

export function pointAtDistance(segments: PathSegment[], dist:number): {point:Vec2,tangent:Vec2} {
  const tot=totalLength(segments);
  if(dist<=0) return pointAtFraction(segments,0);
  if(dist>=tot) return pointAtFraction(segments,1);
  return pointAtFraction(segments, dist/tot);
}
