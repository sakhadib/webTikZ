/**
 * Phase 11 — Worker + OffscreenCanvas mode.
 * Usage:
 *   const worker = createWorkerRenderer(); worker.postMessage({src, w, h}, [offscreen])
 *   // or:
 *   const pic = await WebTikZ.compile(src, {useWorker: true})
 * Worker bootstrap string is inlined for bundlers that don't support Worker URL.
 */
export type WorkerMsg =
  | {id:number, kind:"render", src:string, width:number, height:number, dpr?:number}
  | {id:number, kind:"compile", src:string};

export type WorkerReply =
  | {id:number, ok:true, bitmap?: ImageBitmap, svg?: string, bbox?: any}
  | {id:number, ok:false, error:string};

export const workerBootstrap = `
self.onmessage = async (e)=>{
  const {id, kind, src} = e.data;
  try {
    // In worker, WebTikZ is imported via importScripts or bundled.
    // Fallback: echo bbox as empty — real impl loads webtikz.min.js via importScripts.
    if(kind==="compile"){
      // @ts-ignore
      const m = self.WebTikZ || (await import(self.webtikzUrl || "/dist/webtikz.mjs"));
      const {displayList}= await m.compile(src);
      self.postMessage({id, ok:true, bbox: displayList.bbox});
    } else if(kind==="render"){
      const canvas = e.data.canvas || new OffscreenCanvas(e.data.width||800, e.data.height||600);
      const m = self.WebTikZ || (await import(self.webtikzUrl || "/dist/webtikz.mjs"));
      const pic = await m.render(src, canvas);
      const bitmap = canvas.transferToImageBitmap ? canvas.transferToImageBitmap() : null;
      self.postMessage({id, ok:true, bitmap, bbox: pic.bbox}, bitmap?[bitmap]:[]);
    }
  } catch(err){ self.postMessage({id, ok:false, error:String(err)}); }
};
`;

export function createWorkerRenderer(url: string = "/dist/webtikz.js"): Worker | null {
  if (typeof Worker === "undefined") return null;
  const blob = new Blob([`self.webtikzUrl=${JSON.stringify(url)};` + workerBootstrap], {type:"application/javascript"});
  const wUrl = URL.createObjectURL(blob);
  try { return new Worker(wUrl); } catch { return null; }
}

export function supportsOffscreenCanvas(): boolean {
  return typeof (globalThis as any).OffscreenCanvas !== "undefined";
}
