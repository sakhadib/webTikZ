/**
 * Path2D LRU cache — Phase 11 perf.
 * Caches Path2D objects keyed by segment JSON to avoid rebuilding on re-render.
 * Fallbacks gracefully when Path2D unavailable (jsdom tests).
 */
export class LRU<K, V> {
  private map = new Map<K, V>();
  constructor(private max: number = 256) {}
  get(k: K): V | undefined {
    const v = this.map.get(k);
    if (v !== undefined) { this.map.delete(k); this.map.set(k, v); }
    return v;
  }
  set(k: K, v: V) {
    if (this.map.has(k)) this.map.delete(k);
    else if (this.map.size >= this.max) {
      const first = this.map.keys().next().value as K;
      this.map.delete(first);
    }
    this.map.set(k, v);
  }
  clear(){ this.map.clear(); }
  get size(){ return this.map.size; }
}

import type { PathSegment } from "../render/displayList.ts";

const pathCache = new LRU<string, Path2D>(512);
// Also cache bbox computations
const bboxCache = new LRU<string, {minX:number,minY:number,maxX:number,maxY:number}>(512);

function keyOf(segs: PathSegment[]): string {
  // cheap key: JSON without spaces — segments are small
  let s=""; for(const seg of segs){ const k=seg as any; s+=k.kind+","; if(k.to) s+=k.to.x.toFixed(2)+","+k.to.y.toFixed(2)+";"; if(k.cp1) s+=k.cp1.x.toFixed(2)+","+k.cp1.y.toFixed(2)+","+k.cp2.x.toFixed(2)+","+k.cp2.y.toFixed(2)+";"; }
  return s;
}

export function getCachedPath2D(segs: PathSegment[]): Path2D | null {
  const P2D = (globalThis as any).Path2D as any;
  if (!P2D) return null;
  const key = keyOf(segs);
  const cached = pathCache.get(key);
  if (cached) return cached;
  try {
    const p: Path2D = new P2D();
    for (const s of segs) {
      if (s.kind==="moveTo") (p as any).moveTo(s.to.x, s.to.y);
      else if (s.kind==="lineTo") (p as any).lineTo(s.to.x, s.to.y);
      else if (s.kind==="curveTo") (p as any).bezierCurveTo((s as any).cp1.x, (s as any).cp1.y, (s as any).cp2.x, (s as any).cp2.y, (s as any).to.x, (s as any).to.y);
      else if (s.kind==="close") (p as any).closePath();
    }
    pathCache.set(key, p);
    return p;
  } catch { return null; }
}

export function clearPathCache(){ pathCache.clear(); bboxCache.clear(); }
export function pathCacheSize(){ return pathCache.size; }
