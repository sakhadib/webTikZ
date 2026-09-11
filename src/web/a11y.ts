import type { DisplayList } from "../render/displayList.ts";

export function generateDescription(dl: DisplayList): string {
  const texts: string[] = [];
  const walk = (items: any[]) => {
    for (const it of items) {
      if (it.kind === "text" && it.text?.trim()) texts.push(it.text.trim());
      else if (it.kind === "group" && it.children) walk(it.children);
      else if (it.kind === "path" && it._label) texts.push(it._label);
    }
  };
  walk(dl.items as any);
  // also include node names
  const nodeNames = Object.keys(dl.nodes);
  let edgeCount = 0;
  for (const it of dl.items as any[]) if (it.kind === "path" && !it.isClosed) edgeCount++;
  let desc = "";
  if (texts.length) desc += `Nodes: ${texts.join(", ")}. `;
  if (nodeNames.length) desc += `Named nodes: ${nodeNames.join(", ")}. `;
  if (edgeCount) desc += `${edgeCount} path(s).`;
  if (!desc) desc = "TikZ picture";
  return desc.trim();
}

export function applyAria(canvas: HTMLCanvasElement, dl: DisplayList, opts: { label?: string; description?: string } = {}): void {
  canvas.setAttribute("role", "img");
  const label = opts.label ?? (generateDescription(dl).slice(0, 120) || "TikZ picture");
  canvas.setAttribute("aria-label", label);
  const desc = opts.description ?? generateDescription(dl);
  // create or update aria-describedby element
  const descId = canvas.id ? `${canvas.id}-desc` : "webtikz-desc";
  canvas.setAttribute("aria-describedby", descId);
  canvas.setAttribute("aria-description", desc);
  // also ensure title for tooltip? Not needed
  // store for test inspection
  (canvas as any)._aria = { role: "img", label, desc, descId };
}

export function getAria(canvas: HTMLCanvasElement): { role: string | null; label: string | null; desc: string | null } {
  return {
    role: canvas.getAttribute("role"),
    label: canvas.getAttribute("aria-label"),
    desc: canvas.getAttribute("aria-description"),
  };
}
