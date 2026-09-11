import { Vec2 } from "./vec2.ts";
import { Cubic, cubicPoint } from "./bezier.ts";
import { segmentsToCubics } from "./path.ts";
import type { PathSegment } from "../render/displayList.ts";

function lineIntersect(a0:Vec2,a1:Vec2,b0:Vec2,b1:Vec2): Vec2|null{
  const d1=a1.sub(a0), d2=b1.sub(b0);
  const cross=d1.cross(d2);
  if(Math.abs(cross)<1e-9) return null;
  const t=(b0.sub(a0).cross(d2))/cross;
  const u=(b0.sub(a0).cross(d1))/cross;
  if(t<=-1e-9||t>=1+1e-9||u<=-1e-9||u>=1+1e-9) return null;
  return a0.add(d1.scale(t));
}

function bboxOverlap(c1:Cubic,c2:Cubic):boolean{
  const minX1=Math.min(c1.p0.x,c1.p1.x,c1.p2.x,c1.p3.x);
  const maxX1=Math.max(c1.p0.x,c1.p1.x,c1.p2.x,c1.p3.x);
  const minY1=Math.min(c1.p0.y,c1.p1.y,c1.p2.y,c1.p3.y);
  const maxY1=Math.max(c1.p0.y,c1.p1.y,c1.p2.y,c1.p3.y);
  const minX2=Math.min(c2.p0.x,c2.p1.x,c2.p2.x,c2.p3.x);
  const maxX2=Math.max(c2.p0.x,c2.p1.x,c2.p2.x,c2.p3.x);
  const minY2=Math.min(c2.p0.y,c2.p1.y,c2.p2.y,c2.p3.y);
  const maxY2=Math.max(c2.p0.y,c2.p1.y,c2.p2.y,c2.p3.y);
  return !(maxX1<minX2||maxX2<minX1||maxY1<minY2||maxY2<minY1);
}

function splitCubic(c:Cubic,t=0.5):[Cubic,Cubic]{
  const p01=c.p0.lerp(c.p1,t), p12=c.p1.lerp(c.p2,t), p23=c.p2.lerp(c.p3,t);
  const p012=p01.lerp(p12,t), p123=p12.lerp(p23,t), p0123=p012.lerp(p123,t);
  return [{p0:c.p0,p1:p01,p2:p012,p3:p0123},{p0:p0123,p1:p123,p2:p23,p3:c.p3}];
}

function isFlat(c:Cubic, tol=0.5):boolean{
  // distance of controls to line
  const line=c.p3.sub(c.p0);
  const len=line.len();
  if(len<1e-9) return (c.p1.sub(c.p0).len()<tol && c.p2.sub(c.p0).len()<tol);
  const n=line.norm().perp();
  const d1=Math.abs(c.p1.sub(c.p0).dot(n));
  const d2=Math.abs(c.p2.sub(c.p0).dot(n));
  return d1<tol && d2<tol;
}

function bezierIntersections(a:Cubic,b:Cubic, depth=0, maxDepth=12, out:Vec2[]=[]):Vec2[]{
  if(depth>maxDepth){
    // approximate as lines
    const pt=lineIntersect(a.p0,a.p3,b.p0,b.p3);
    if(pt) out.push(pt);
    return out;
  }
  if(!bboxOverlap(a,b)) return out;
  if(isFlat(a) && isFlat(b)){
    const pt=lineIntersect(a.p0,a.p3,b.p0,b.p3);
    if(pt) out.push(pt);
    return out;
  }
  // subdivide larger
  const lenA=a.p3.sub(a.p0).len()+a.p1.sub(a.p0).len();
  const lenB=b.p3.sub(b.p0).len()+b.p1.sub(b.p0).len();
  if(lenA>lenB){
    const [a1,a2]=splitCubic(a);
    bezierIntersections(a1,b,depth+1,maxDepth,out);
    bezierIntersections(a2,b,depth+1,maxDepth,out);
  } else {
    const [b1,b2]=splitCubic(b);
    bezierIntersections(a,b1,depth+1,maxDepth,out);
    bezierIntersections(a,b2,depth+1,maxDepth,out);
  }
  return out;
}

export function intersectSegments(a:PathSegment[], b:PathSegment[]): Vec2[]{
  const ca=segmentsToCubics(a);
  const cb=segmentsToCubics(b);
  const pts:Vec2[]=[];
  for(const c1 of ca) for(const c2 of cb){
    bezierIntersections(c1,c2,0,10,pts);
  }
  // dedup
  const uniq:Vec2[]=[];
  for(const p of pts){
    if(!uniq.some(q=>q.sub(p).len()<0.5)) uniq.push(p);
  }
  return uniq;
}

export function lineIntersection(a0:Vec2,a1:Vec2,b0:Vec2,b1:Vec2):Vec2|null{ return lineIntersect(a0,a1,b0,b1); }
