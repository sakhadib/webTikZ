import { Vec2 } from "../geometry/vec2.ts";
import { PT_PER_CM } from "../geometry/units.ts";

export type LayoutKind = "circular" | "layered" | "spring" | "tree" | "grid";

export function circularLayout(nodeIds: string[], center: Vec2 = new Vec2(0,0), radiusPt?: number): Map<string, Vec2> {
  const n = nodeIds.length;
  const r = radiusPt ?? Math.max(28, n*8);
  const m = new Map<string, Vec2>();
  for(let i=0;i<n;i++){
    const ang = 2*Math.PI*i/n - Math.PI/2; // start top
    m.set(nodeIds[i], new Vec2(center.x + r*Math.cos(ang), center.y + r*Math.sin(ang)));
  }
  return m;
}

export function layeredLayout(nodeIds: string[], edges: [string,string][], center: Vec2 = new Vec2(0,0)): Map<string, Vec2> {
  // Simple Sugiyama rank: BFS depth from sources
  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for(const id of nodeIds){ adj.set(id, []); indeg.set(id,0); }
  for(const [a,b] of edges){ if(!adj.has(a)) adj.set(a,[]); if(!adj.has(b)) adj.set(b,[]); adj.get(a)!.push(b); indeg.set(b, (indeg.get(b)??0)+1); }
  // find sources
  const queue: string[] = [];
  const rank = new Map<string, number>();
  for(const id of nodeIds) if((indeg.get(id)??0)===0) queue.push(id);
  if(queue.length===0) nodeIds.forEach(id=>queue.push(id));
  queue.forEach(id=>rank.set(id,0));
  const visited = new Set<string>();
  while(queue.length){
    const u = queue.shift()!;
    if(visited.has(u)) continue; visited.add(u);
    const r = rank.get(u)??0;
    for(const v of adj.get(u)??[]){
      const nr = Math.max(rank.get(v)??0, r+1);
      rank.set(v,nr);
      if(!visited.has(v)) queue.push(v);
    }
  }
  // group by rank
  const byRank = new Map<number, string[]>();
  for(const id of nodeIds){
    const rk = rank.get(id)??0;
    if(!byRank.has(rk)) byRank.set(rk,[]);
    byRank.get(rk)!.push(id);
  }
  const ranks = Array.from(byRank.keys()).sort((a,b)=>a-b);
  const colGap = 2*PT_PER_CM;
  const rowGap = 1.5*PT_PER_CM;
  const m = new Map<string, Vec2>();
  for(const rk of ranks){
    const arr = byRank.get(rk)!;
    const yOffset = -((arr.length-1)*rowGap)/2;
    for(let i=0;i<arr.length;i++){
      m.set(arr[i], new Vec2(center.x + rk*colGap, center.y + yOffset + i*rowGap));
    }
  }
  return m;
}

export function springLayout(nodeIds: string[], edges: [string,string][], center: Vec2=new Vec2(0,0), iterations=50): Map<string, Vec2> {
  // initialize circular then iterate
  const pos = circularLayout(nodeIds, center, 40);
  // simple force-directed
  const k = 20;
  for(let iter=0; iter<iterations; iter++){
    const disp = new Map<string, Vec2>();
    for(const id of nodeIds) disp.set(id, new Vec2(0,0));
    // repulsion
    for(let i=0;i<nodeIds.length;i++){
      for(let j=i+1;j<nodeIds.length;j++){
        const a=nodeIds[i], b=nodeIds[j];
        const pa=pos.get(a)!, pb=pos.get(b)!;
        let delta = pa.sub(pb);
        let dist = delta.len() || 0.1;
        let force = (k*k)/dist;
        const dir = delta.norm().scale(force*0.1);
        disp.set(a, disp.get(a)!.add(dir));
        disp.set(b, disp.get(b)!.sub(dir));
      }
    }
    // attraction along edges
    for(const [a,b] of edges){
      if(!pos.has(a)||!pos.has(b)) continue;
      const pa=pos.get(a)!, pb=pos.get(b)!;
      let delta = pa.sub(pb);
      let dist = delta.len() || 0.1;
      let force = (dist*dist)/k;
      const dir = delta.norm().scale(force*0.05);
      disp.set(a, disp.get(a)!.sub(dir));
      disp.set(b, disp.get(b)!.add(dir));
    }
    for(const id of nodeIds){
      const d = disp.get(id)!;
      const len = d.len();
      const capped = len>5 ? d.norm().scale(5) : d;
      pos.set(id, pos.get(id)!.add(capped));
    }
  }
  return pos;
}

export function treeLayout(nodeIds: string[], edges: [string,string][], center: Vec2=new Vec2(0,0)): Map<string, Vec2> {
  // Reingold-Tilford in-order: assume edges form a tree from root (first node)
  if(nodeIds.length===0) return new Map();
  const children = new Map<string, string[]>();
  for(const id of nodeIds) children.set(id, []);
  for(const [a,b] of edges){ if(children.has(a)) children.get(a)!.push(b); else children.set(a,[b]); }
  // find root = node with indeg 0
  const indeg = new Map<string, number>();
  for(const id of nodeIds) indeg.set(id,0);
  for(const [a,b] of edges) indeg.set(b,(indeg.get(b)??0)+1);
  let root = nodeIds[0];
  for(const id of nodeIds) if((indeg.get(id)??0)===0){ root=id; break; }
  const pos = new Map<string, Vec2>();
  let nextX=0;
  const levelGap = 1.5*PT_PER_CM;
  const siblingGap = 1.2*PT_PER_CM;
  function dfs(u:string, depth:number){
    const childs = children.get(u)??[];
    if(childs.length===0){
      pos.set(u, new Vec2(center.x + nextX*siblingGap, center.y - depth*levelGap));
      nextX++;
    } else {
      const firstChildPos: Vec2[]=[];
      for(const v of childs) dfs(v, depth+1);
      // position parent at midpoint of children
      let sumX=0, cnt=0;
      for(const v of childs){ const p=pos.get(v); if(p){ sumX+=p.x; cnt++; } }
      const mx = cnt? sumX/cnt : center.x + nextX*siblingGap;
      pos.set(u, new Vec2(mx, center.y - depth*levelGap));
    }
  }
  dfs(root,0);
  // place any disconnected nodes grid
  for(const id of nodeIds) if(!pos.has(id)) pos.set(id, new Vec2(center.x + nextX++*siblingGap, center.y));
  return pos;
}

export function gridLayout(nodeIds: string[], cols=Math.ceil(Math.sqrt(nodeIds.length))): Map<string, Vec2> {
  const gap = 1.5*PT_PER_CM;
  const m=new Map<string, Vec2>();
  for(let i=0;i<nodeIds.length;i++){
    const r=Math.floor(i/cols), c=i%cols;
    m.set(nodeIds[i], new Vec2(c*gap, -r*gap));
  }
  return m;
}

export function layoutForOptions(kind: string, ids: string[], edges:[string,string][], center: Vec2): Map<string, Vec2> {
  const low=kind.toLowerCase();
  if(low.includes("circular")) return circularLayout(ids, center);
  if(low.includes("layered")) return layeredLayout(ids, edges, center);
  if(low.includes("spring")||low.includes("force")) return springLayout(ids, edges, center);
  if(low.includes("tree")||low.includes("reingold")) return treeLayout(ids, edges, center);
  if(low.includes("grid")) return gridLayout(ids);
  return circularLayout(ids, center);
}
