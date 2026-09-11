import { Vec2 } from "../geometry/vec2.ts";
import type { PathSegment } from "../render/displayList.ts";

export interface ArrowOpts {
  lengthPt?: number;
  widthPt?: number;
  open?: boolean;
  round?: boolean;
  reversed?: boolean;
  sepPt?: number;
  scale?: number;
  bend?: boolean;
}

export interface ArrowTipDef {
  name: string; // canonical lower
  draw: (tip:Vec2, dir:Vec2, opts:ArrowOpts)=> PathSegment[];
}

function mkTriangle(tip:Vec2, dir:Vec2, opts:ArrowOpts, fill=true):PathSegment[]{
  const len=(opts.lengthPt??6)*(opts.scale??1);
  const wid=(opts.widthPt??4)*(opts.scale??1);
  let d=dir.norm();
  if(opts.reversed) d=d.scale(-1);
  const base=tip.sub(d.scale(len)).add(d.scale(opts.sepPt??0));
  const perp=d.perp().scale(wid/2);
  const p1=base.add(perp), p2=base.sub(perp);
  if(opts.open) return [{kind:"moveTo",to:p1},{kind:"lineTo",to:tip},{kind:"lineTo",to:p2}];
  return [{kind:"moveTo",to:tip},{kind:"lineTo",to:p1},{kind:"lineTo",to:p2},{kind:"close"}];
}

const registry = new Map<string, ArrowTipDef>();

function reg(name:string, fn:(tip:Vec2,dir:Vec2,opts:ArrowOpts)=>PathSegment[]){
  registry.set(name.toLowerCase(), {name, draw:fn});
}

reg("Stealth", (t,d,o)=> mkTriangle(t,d,o,true));
reg("Latex", (t,d,o)=> mkTriangle(t,d,{...o, widthPt: o.widthPt??6, lengthPt: o.lengthPt??7}, true));
reg("To", (t,d,o)=> mkTriangle(t,d,o,true));
reg("Triangle", (t,d,o)=> mkTriangle(t,d,o,true));
reg("Kite", (t,d,o)=> mkTriangle(t,d,o,true));
reg("Circle", (tip,dir,opts)=>{
  const r=((opts.lengthPt??4)/2)*(opts.scale??1);
  const c=tip.sub(dir.norm().scale(r+(opts.sepPt??0)));
  // approximate circle as 4 cubics via segments generation? We'll return a circle path as polygon approximation
  const segs:PathSegment[]=[{kind:"moveTo",to: new Vec2(c.x+r,c.y)}];
  segs.push({kind:"lineTo",to: new Vec2(c.x, c.y+r)});
  segs.push({kind:"lineTo",to: new Vec2(c.x-r,c.y)});
  segs.push({kind:"lineTo",to: new Vec2(c.x, c.y-r)});
  segs.push({kind:"close"});
  return segs;
});
reg("Square", (tip,dir,opts)=>{
  const s=(opts.lengthPt??4)*(opts.scale??1);
  const d=dir.norm(); const perp=d.perp();
  const base=tip.sub(d.scale(s));
  const h=s/2;
  const p1=base.add(perp.scale(h)), p2=base.sub(perp.scale(h));
  const q1=tip.add(perp.scale(h)), q2=tip.sub(perp.scale(h));
  return [{kind:"moveTo",to:q1},{kind:"lineTo",to:q2},{kind:"lineTo",to:p2},{kind:"lineTo",to:p1},{kind:"close"}];
});
reg("Bar", (tip,dir,opts)=>{
  const w=(opts.widthPt??6)*(opts.scale??1);
  const d=dir.norm().perp();
  const half=d.scale(w/2);
  const p1=tip.add(half), p2=tip.sub(half);
  return [{kind:"moveTo",to:p1},{kind:"lineTo",to:p2}];
});
reg("Hooks", (tip,dir,opts)=>{
  const len=(opts.lengthPt??5)*(opts.scale??1);
  const wid=(opts.widthPt??4)*(opts.scale??1);
  const d=dir.norm(); const perp=d.perp();
  const base=tip.sub(d.scale(len));
  const p1=base.add(perp.scale(wid/2));
  const p2=base.sub(perp.scale(wid/2));
  return [{kind:"moveTo",to:p1},{kind:"lineTo",to:base},{kind:"lineTo",to:p2}];
});
reg("Rays", (tip,dir,opts)=>{
  const len=(opts.lengthPt??6)*(opts.scale??1);
  const d=dir.norm(); const base=tip.sub(d.scale(len));
  const perp=d.perp();
  return [{kind:"moveTo",to:tip},{kind:"lineTo",to:base.add(perp.scale(3))},{kind:"moveTo",to:tip},{kind:"lineTo",to:base.sub(perp.scale(3))}];
});

// legacy aliases lowercase
["latex","stealth","to"].forEach(k=>{
  const def=registry.get(k);
  if(def) registry.set(k, def);
});
registry.set("latex", registry.get("latex")!);
registry.set("stealth", registry.get("stealth")!);

export function getArrowTip(name:string):ArrowTipDef|undefined{
  return registry.get(name.toLowerCase());
}
export function listArrowTips():string[]{ return [...registry.keys()]; }

export function createArrowSegments(tip:Vec2, dir:Vec2, name:string, opts:ArrowOpts):PathSegment[]{
  const def=getArrowTip(name);
  if(!def) return mkTriangle(tip,dir,opts,true);
  const segs=def.draw(tip,dir,opts);
  if(opts.round){
    // keep as is; canvas lineJoin round will handle visual
  }
  return segs;
}

export function parseArrowSpec(raw:string): {names:string[], opts:ArrowOpts}[] {
  // spec like "Stealth[length=5pt,width=3pt,open]" or ">>" or "|<->|"
  // For simplicity, handle comma/semicolon separated tips
  raw=raw.trim();
  if(!raw) return [];
  // handle shorthand >> : two Stealth
  if(raw===">>"||raw==="<<") return [{names:["Stealth","Stealth"],opts:{}}];
  if(raw===">") return [{names:["Stealth"],opts:{}}];
  if(raw==="<") return [{names:["Stealth"],opts:{reversed:true}}];
  if(raw.includes("<->")) return [{names:["Stealth"],opts:{reversed:true}},{names:["Stealth"],opts:{}}];
  const parts=raw.split(",").map(s=>s.trim()).filter(Boolean);
  const out:{names:string[],opts:ArrowOpts}[]=[];
  for(const p of parts){
    // e.g., "Stealth[round, length=5pt]"
    const m=p.match(/^([A-Za-z]+)(?:\[(.+)\])?$/);
    if(!m){ out.push({names:[p],opts:{}}); continue; }
    const name=m[1];
    const inside=m[2]??"";
    const opts:ArrowOpts={};
    if(inside){
      for(const kv of inside.split(",").map(s=>s.trim()).filter(Boolean)){
        const [k,v]=kv.split("=").map(s=>s.trim().toLowerCase());
        if(!v){
          if(k==="open") opts.open=true;
          else if(k==="round") opts.round=true;
          else if(k==="reversed") opts.reversed=true;
          else if(k==="bend") opts.bend=true;
        } else {
          if(k==="length") opts.lengthPt=parseFloat(v);
          else if(k==="width") opts.widthPt=parseFloat(v);
          else if(k==="sep") opts.sepPt=parseFloat(v);
          else if(k==="scale") opts.scale=parseFloat(v);
          else if(k==="open") opts.open=v==="true";
          else if(k==="round") opts.round=v==="true";
        }
      }
    }
    out.push({names:[name],opts});
  }
  return out;
}
