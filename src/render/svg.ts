import type { DisplayList, DisplayItem, PathSegment } from "./displayList.ts";
import { ptToPx } from "../geometry/units.ts";

export interface SvgOptions {
  scale?: number;
  background?: string | null;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function segsToD(segs: PathSegment[]): string {
  let d = "";
  for (const s of segs) {
    if (s.kind === "moveTo") d += `M ${s.to.x} ${s.to.y} `;
    else if (s.kind === "lineTo") d += `L ${s.to.x} ${s.to.y} `;
    else if (s.kind === "curveTo") d += `C ${s.cp1.x} ${s.cp1.y} ${s.cp2.x} ${s.cp2.y} ${s.to.x} ${s.to.y} `;
    else if (s.kind === "close") d += "Z ";
  }
  return d.trim();
}

function itemToSvg(item: DisplayItem): string {
  if (item.kind === "path") {
    const d = segsToD(item.segments);
    let attrs = `d="${esc(d)}"`;
    if (item.fill) {
      attrs += ` fill="${esc(item.fill.color)}" fill-opacity="${item.fill.opacity}" fill-rule="${item.fill.rule}"`;
    } else {
      attrs += ` fill="none"`;
    }
    if (item.stroke) {
      const s = item.stroke;
      attrs += ` stroke="${esc(s.color)}" stroke-width="${s.widthPt}" stroke-opacity="${s.opacity}" stroke-linecap="${s.cap}" stroke-linejoin="${s.join}"`;
      if (s.dash) attrs += ` stroke-dasharray="${s.dash.join(",")}" stroke-dashoffset="${s.dashPhasePt}"`;
    } else {
      attrs += ` stroke="none"`;
    }
    return `<path ${attrs} />`;
  }
  if (item.kind === "text") {
    // SVG Y is top-down; we keep pt coords and flip via transform on root <g>
    return `<text x="${item.at.x}" y="${item.at.y}" fill="${esc(item.color)}" font="${esc(item.font)}" text-anchor="${item.align === "center" ? "middle" : item.align === "right" ? "end" : "start"}" transform="scale(1,-1) translate(0,${-2 * item.at.y})">${esc(item.text)}</text>`;
  }
  if (item.kind === "group") {
    const inner = item.children.map(itemToSvg).join("\n");
    const op = item.opacity !== 1 ? ` opacity="${item.opacity}"` : "";
    if (item.clipPath) {
      const id = `clip-${Math.random().toString(36).slice(2, 8)}`;
      return `<g${op}><defs><clipPath id="${id}"><path d="${esc(segsToD(item.clipPath))}" /></clipPath></defs><g clip-path="url(#${id})">\n${inner}\n</g></g>`;
    }
    return `<g${op}>\n${inner}\n</g>`;
  }
  return "";
}

export function renderToSVG(dl: DisplayList, opts: SvgOptions = {}): string {
  const scale = opts.scale ?? 1;
  const bbox = dl.bbox;
  const padPt = 0.5;
  const wPt = (bbox.isEmpty ? 10 : bbox.width) + padPt * 2;
  const hPt = (bbox.isEmpty ? 10 : bbox.height) + padPt * 2;
  const wPx = ptToPx(wPt) * scale;
  const hPx = ptToPx(hPt) * scale;

  const inner = dl.items.map(itemToSvg).join("\n");

  // Flip Y: translate to bottom then scale Y -1, then translate bbox
  const pxPerPt = ptToPx(1);
  // We'll use a nested <g> with transform for simplicity.
  // Outer svg is in px; inner g maps pt -> px and flips.
  const tx = -bbox.minX + padPt;
  const ty = -bbox.minY + padPt;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${wPx}" height="${hPx}" viewBox="0 0 ${wPx} ${hPx}" role="img">
${opts.background ? `<rect width="100%" height="100%" fill="${esc(opts.background)}"/>` : ""}
<g transform="translate(0,${hPx}) scale(${pxPerPt * scale},${-pxPerPt * scale}) translate(${tx},${ty})">
${inner}
</g>
</svg>`;
}
