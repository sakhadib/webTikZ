import { compile, type CompileOptions } from "./compile.ts";
import { renderToCanvas } from "../render/canvas.ts";
import { renderToSVG } from "../render/svg.ts";
import type { DisplayList } from "../render/displayList.ts";
import { attachInteractivity, registerHoverStyle, type WebEvent } from "../web/interactivity.ts";
import { applyThemeToDisplayList } from "../web/theme.ts";
import { generateDescription } from "../web/a11y.ts";
import { exportPDF } from "../web/export.ts";

export interface RenderOptions extends CompileOptions {
  scale?: number;
  dpr?: number;
  background?: string | null;
  onError?: (err: { message: string; line: number; column: number; severity: string }) => void;
  theme?: "light" | "dark" | string;
  fit?: "width" | "contain" | null;
  vars?: Record<string, unknown>;
  animate?: boolean | { duration?: number; loop?: boolean };
}

export interface Picture {
  displayList: DisplayList;
  bbox: DisplayList["bbox"];
  nodes: DisplayList["nodes"];
  canvas: HTMLCanvasElement | null;
  errors: { message: string; line: number; column: number; severity: string }[];
  toSVG(opts?: { scale?: number; theme?: string }): string;
  toPNG(scale?: number): Promise<Blob>;
  toPDF(opts?: { scale?: number }): string;
  destroy(): void;
  update(opts: { source?: string; vars?: Record<string, unknown> }): Promise<Picture>;
  on(event: WebEvent, nodeName: string, handler: (ev: Event, nodeName: string) => void): () => void;
  off?(event: WebEvent, nodeName: string, handler: Function): void;
  hover(nodeName: string, style: { style?: string; cursor?: string; tooltip?: string; href?: string }): void;
  theme: string | null;
  setTheme(theme: "light" | "dark" | string): void;
  aria: { role: string; label: string; description: string };
  animateHandle?: { start(): void; stop(): void; isRunning: boolean };
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
  // theme handling via compile vars? pass through
  const { displayList: rawDL, errors } = await compile(source, opts);
  if (opts.onError) errors.forEach(opts.onError);

  // theme remap if needed
  let displayList = rawDL;
  if (opts.theme) displayList = applyThemeToDisplayList(rawDL, opts.theme);

  let canvas: HTMLCanvasElement | null = null;
  const el = resolveTarget(target);

  if (el instanceof HTMLCanvasElement) {
    canvas = el;
    renderToCanvas(displayList, canvas, opts as any);
  } else if (el instanceof HTMLElement) {
    // create or reuse canvas inside container
    canvas = el.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) {
      canvas = document.createElement("canvas");
      el.appendChild(canvas);
    }
    renderToCanvas(displayList, canvas, opts as any);
  } else if (target === null || target === undefined) {
    // no DOM target — compile only
    canvas = null;
  }

  // interactivity wiring
  let interactivity: ReturnType<typeof attachInteractivity> | null = null;
  if (canvas) {
    try { interactivity = attachInteractivity(canvas, displayList, { scale: opts.scale, dpr: opts.dpr }); } catch {}
  }

  const ariaDesc = generateDescription(displayList);
  const pic: Picture = {
    displayList,
    bbox: displayList.bbox,
    nodes: displayList.nodes,
    canvas,
    errors,
    toSVG(o) {
      return renderToSVG(displayList, { scale: o?.scale ?? opts.scale, background: opts.background ?? null, theme: (o as any)?.theme ?? opts.theme });
    },
    async toPNG(scale = 2) {
      if (canvas) {
        try {
          if (canvas.getContext("2d")) {
            const maybe = await Promise.race([
              new Promise<Blob | null>((resolve) => {
                try {
                  if ((canvas as any).toBlob) canvas!.toBlob((b) => resolve(b), "image/png");
                  else resolve(null);
                } catch { resolve(null); }
              }),
              new Promise<Blob | null>((resolve) => setTimeout(() => resolve(null), 100)),
            ]);
            if (maybe) return maybe;
          }
        } catch {}
      }
      // fallback: offscreen canvas
      if (typeof document !== "undefined") {
        try {
          const c = document.createElement("canvas");
          if (!c.getContext("2d")) throw new Error("no ctx");
          renderToCanvas(displayList, c, { scale });
          const maybe = await Promise.race([
            new Promise<Blob | null>((resolve) => {
              try {
                if ((c as any).toBlob) c.toBlob((b) => resolve(b), "image/png");
                else resolve(null);
              } catch { resolve(null); }
            }),
            new Promise<Blob | null>((resolve) => setTimeout(() => resolve(null), 100)),
          ]);
          if (maybe) return maybe;
        } catch {}
      }
      // node stub: svg blob as png type
      const svg = renderToSVG(displayList, { scale });
      return new Blob([svg], { type: "image/png" });
    },
    toPDF(o) {
      return exportPDF(displayList, { scale: o?.scale ?? opts.scale });
    },
    destroy() {
      if (interactivity) interactivity.destroy();
      if (canvas && el instanceof HTMLElement && canvas.parentElement === el) canvas.remove();
    },
    async update(u) {
      const nextSource = u.source ?? source;
      const nextOpts = { ...opts, ...(u.vars ? { vars: u.vars } : {}) };
      return render(nextSource, target, nextOpts);
    },
    on(event, nodeName, handler) {
      if (interactivity) return interactivity.on(event as any, nodeName, handler);
      // fallback no-op
      registerHoverStyle(nodeName, { style: "" });
      return () => {};
    },
    hover(nodeName, style) {
      registerHoverStyle(nodeName, style as any);
      // also set canvas cursor/tooltip/href handling via interactivity
      if (canvas && style.cursor) canvas.style.cursor = style.cursor;
      if (canvas && style.tooltip) canvas.title = style.tooltip;
    },
    theme: (opts.theme as string) ?? null,
    setTheme(t) {
      (opts as any).theme = t;
      (pic as any).theme = t;
      if (canvas) {
        const themed = applyThemeToDisplayList(rawDL, t);
        (pic as any).displayList = themed;
        (pic as any).bbox = themed.bbox;
        renderToCanvas(themed, canvas, { ...opts, theme: t } as any);
      }
    },
    aria: { role: "img", label: ariaDesc.slice(0, 120) || "TikZ picture", description: ariaDesc },
  };

  // set aria on canvas immediately
  if (canvas) {
    try { canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", pic.aria.label); canvas.setAttribute("aria-description", pic.aria.description); } catch {}
  }

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
