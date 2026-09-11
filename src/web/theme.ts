import type { DisplayList } from "../render/displayList.ts";

export const CSS_VARS = {
  fg: "var(--webtikz-fg, #000000)",
  bg: "var(--webtikz-bg, #ffffff)",
};

export function resolveThemeColor(color: string, theme: "light" | "dark" | string): string {
  const normalized = color.trim().toLowerCase();
  const isBlack = normalized === "#000000" || normalized === "black" || normalized === "#000";
  const isWhite = normalized === "#ffffff" || normalized === "white" || normalized === "#fff";
  if (theme === "dark") {
    if (isBlack) return "#FFFFFF";
    if (isWhite) return "#000000";
    // slight invert for other colors? keep as is for now
    return color;
  }
  if (theme === "light") {
    return color;
  }
  return color;
}

export function applyThemeToDisplayList(dl: DisplayList, theme: "light" | "dark" | string): DisplayList {
  if (!theme || theme === "light") return dl;
  // shallow clone with remapped colors
  const remap = (c: string) => resolveThemeColor(c, theme as any);
  const clone: DisplayList = { bbox: dl.bbox, nodes: dl.nodes, items: dl.items.map(item => {
    if ((item as any).kind === "path") {
      const p: any = { ...item };
      if (p.stroke) p.stroke = { ...p.stroke, color: remap(p.stroke.color) };
      if (p.fill) p.fill = { ...p.fill, color: remap(p.fill.color) };
      if (p.gradient) p.gradient = { ...p.gradient, colors: p.gradient.colors.map((s:any)=> ({...s, color: remap(s.color)})) };
      return p;
    }
    if ((item as any).kind === "text") {
      const t: any = { ...item, color: remap((item as any).color) };
      return t;
    }
    if ((item as any).kind === "group") {
      const g: any = { ...item };
      g.children = g.children.map((c:any) => {
        if (c.kind === "path" && c.stroke) return { ...c, stroke: { ...c.stroke, color: remap(c.stroke.color)}};
        if (c.kind === "text") return { ...c, color: remap(c.color) };
        return c;
      });
      return g;
    }
    return item;
  }) };
  return clone;
}

export function getCSSVariable(name: "fg" | "bg", fallback?: string): string {
  if (typeof document === "undefined") return fallback ?? (name === "fg" ? "#000000" : "#ffffff");
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--webtikz-${name}`).trim();
  return v || fallback || (name === "fg" ? "#000000" : "#ffffff");
}
