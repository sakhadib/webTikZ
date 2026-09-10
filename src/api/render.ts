import { compile, type CompileOptions } from "./compile.ts";
import { renderToCanvas } from "../render/canvas.ts";
import { renderToSVG } from "../render/svg.ts";
import type { DisplayList } from "../render/displayList.ts";

export interface RenderOptions extends CompileOptions {
  scale?: number;
  dpr?: number;
  background?: string | null;
  onError?: (err: { message: string; line: number; column: number; severity: string }) => void;
}

export interface Picture {
  displayList: DisplayList;
  bbox: DisplayList["bbox"];
  nodes: DisplayList["nodes"];
  canvas: HTMLCanvasElement | null;
  errors: { message: string; line: number; column: number; severity: string }[];
  toSVG(opts?: { scale?: number }): string;
  toPNG(scale?: number): Promise<Blob>;
  destroy(): void;
  update(opts: { source?: string; vars?: Record<string, unknown> }): Promise<Picture>;
}

function resolveTarget(target: HTMLCanvasElement | HTMLElement | string | null): HTMLElement | HTMLCanvasElement | null {
  if (!target) return null;
  if (typeof target === "string") return document.querySelector(target);
  return target;
}

export async function render(
  source: string,
  target: HTMLCanvasElement | HTMLElement | string | null,
  opts: RenderOptions = {},
): Promise<Picture> {
  const { displayList, errors } = await compile(source, opts);
  if (opts.onError) errors.forEach(opts.onError);

  let canvas: HTMLCanvasElement | null = null;
  const el = resolveTarget(target);

  if (el instanceof HTMLCanvasElement) {
    canvas = el;
    renderToCanvas(displayList, canvas, opts);
  } else if (el instanceof HTMLElement) {
    // create or reuse canvas inside container
    canvas = el.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) {
      canvas = document.createElement("canvas");
      el.appendChild(canvas);
    }
    renderToCanvas(displayList, canvas, opts);
  } else if (target === null || target === undefined) {
    // no DOM target — compile only
    canvas = null;
  }

  const pic: Picture = {
    displayList,
    bbox: displayList.bbox,
    nodes: displayList.nodes,
    canvas,
    errors,
    toSVG(o) {
      return renderToSVG(displayList, { scale: o?.scale ?? opts.scale, background: opts.background ?? null });
    },
    async toPNG(scale = 2) {
      const svg = renderToSVG(displayList, { scale });
      // Fallback: render svg to canvas then to blob
      // For now, if we have a canvas, use it
      if (canvas) {
        return new Promise<Blob>((resolve, reject) => {
          canvas!.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
        });
      }
      // No canvas — create one via SVG image (requires DOM)
      void svg;
      throw new Error("toPNG requires a canvas target in this build");
    },
    destroy() {
      if (canvas && el instanceof HTMLElement && canvas.parentElement === el) canvas.remove();
    },
    async update(u) {
      const nextSource = u.source ?? source;
      return render(nextSource, target, opts);
    },
  };

  return pic;
}

export async function autoRender(opts: RenderOptions & { selector?: string } = {}): Promise<Picture[]> {
  const selector = opts.selector ?? 'script[type="text/tikz"], tikz-picture';
  const nodes = document.querySelectorAll(selector);
  const pics: Picture[] = [];
  for (const n of nodes) {
    let src = "";
    if (n instanceof HTMLScriptElement) src = n.textContent ?? "";
    else src = (n as HTMLElement).textContent ?? (n as HTMLElement).getAttribute("src") ?? "";
    const container = document.createElement("div");
    container.className = "webtikz-output";
    n.parentNode?.insertBefore(container, n.nextSibling);
    const pic = await render(src, container, opts);
    pics.push(pic);
  }
  return pics;
}
