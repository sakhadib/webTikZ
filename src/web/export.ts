import type { DisplayList } from "../render/displayList.ts";
import { renderToSVG } from "../render/svg.ts";
import { ptToPx } from "../geometry/units.ts";

export function exportSVG(dl: DisplayList, opts: { scale?: number; background?: string | null } = {}): string {
  return renderToSVG(dl, opts);
}

export async function exportPNG(dl: DisplayList, opts: { scale?: number; background?: string | null } = {}): Promise<Blob> {
  const scale = opts.scale ?? 2;
  // Try to render via offscreen canvas if available
  if (typeof document !== "undefined") {
    try {
      const canvas = document.createElement("canvas");
      if (!canvas.getContext("2d")) throw new Error("no context");
      const { renderToCanvas } = await import("../render/canvas.ts");
      renderToCanvas(dl, canvas, { scale, background: opts.background ?? null });
      const blob = await Promise.race([
        new Promise<Blob | null>((resolve) => {
          try {
            if ((canvas as any).toBlob) canvas.toBlob((b) => resolve(b), "image/png");
            else resolve(null);
          } catch { resolve(null); }
        }),
        new Promise<Blob | null>((resolve) => setTimeout(() => resolve(null), 100)),
      ]);
      if (blob) return blob;
    } catch {}
  }
  // Node fallback: return SVG converted blob stub
  const svg = renderToSVG(dl, { scale });
  return new Blob([svg], { type: "image/png" });
}

export function exportPDF(dl: DisplayList, opts: { scale?: number } = {}): string {
  // Stub: returns SVG wrapped as PDF-like string (real impl would use svg to pdf)
  const svg = renderToSVG(dl, opts);
  // minimal PDF wrapper
  return `%PDF-1.4\n% WebTikZ PDF export (SVG stub)\n${svg}`;
}

export function toDataURL(svg: string): string {
  return `data:image/svg+xml;base64,${typeof btoa !== "undefined" ? btoa(svg) : Buffer.from(svg).toString("base64")}`;
}

export function shareableURL(source: string, base = typeof location !== "undefined" ? location.href : "https://webtikz.example"): string {
  const encoded = encodeURIComponent(typeof btoa !== "undefined" ? btoa(source) : Buffer.from(source).toString("base64"));
  return `${base.split("?")[0]}?tikz=${encoded}`;
}
export function parseShareableURL(url: string): string | null {
  try {
    const u = new URL(url, "https://webtikz.example");
    const v = u.searchParams.get("tikz");
    if (!v) return null;
    try { return typeof atob !== "undefined" ? atob(decodeURIComponent(v)) : Buffer.from(decodeURIComponent(v), "base64").toString(); } catch { return decodeURIComponent(v); }
  } catch { return null; }
}
