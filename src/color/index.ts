/**
 * Phase 2 color system: full xcolor mixing + \definecolor + \colorlet
 * Supports: red, red!20, red!30!blue, -red, definecolor models rgb/RGB/HTML/gray/cmyk
 */

export const BASE_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#FFFFFF",
  red: "#ED1C24",
  green: "#009900",
  blue: "#0000FF",
  cyan: "#00FFFF",
  magenta: "#FF00FF",
  yellow: "#FFFF00",
  orange: "#FF7F00",
  violet: "#7F00FF",
  purple: "#800080",
  brown: "#964B00",
  pink: "#FFC0CB",
  olive: "#808000",
  lime: "#32CD32",
  teal: "#008080",
  gray: "#808080",
  darkgray: "#404040",
  lightgray: "#D3D3D3",
  grey: "#808080",
};

const NAMED_SET = new Set(Object.keys(BASE_COLORS));

export function isBaseColor(name: string): boolean {
  return BASE_COLORS[name.toLowerCase()] !== undefined;
}

/** Define a new color via \definecolor{name}{model}{value} */
export function defineColor(name: string, model: string, value: string): void {
  const key = name.trim().toLowerCase();
  const m = model.trim().toLowerCase();
  const v = value.trim();
  let hex: string | null = null;
  if (m === "rgb") {
    // value: "0.5,0.2,0.8" 0..1
    const parts = v.split(",").map(s => parseFloat(s.trim()));
    if (parts.length === 3 && parts.every(n => !isNaN(n))) {
      hex = `#${toHex(Math.round(parts[0] * 255))}${toHex(Math.round(parts[1] * 255))}${toHex(Math.round(parts[2] * 255))}`;
    }
  } else if (m === "rgb:html" || m === "html") {
    // HTML hex without #
    let h = v.replace("#", "").trim();
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    if (/^[0-9a-fA-F]{6}$/.test(h)) hex = "#" + h.toLowerCase();
  } else if (m === "RGB") {
    const parts = v.split(",").map(s => parseInt(s.trim(), 10));
    if (parts.length === 3) hex = `#${toHex(parts[0])}${toHex(parts[1])}${toHex(parts[2])}`;
  } else if (m === "gray") {
    const g = parseFloat(v);
    if (!isNaN(g)) {
      const b = Math.round(g * 255);
      hex = `#${toHex(b)}${toHex(b)}${toHex(b)}`;
    }
  } else if (m === "cmyk") {
    const parts = v.split(",").map(s => parseFloat(s.trim()));
    if (parts.length === 4) {
      const [c, m, y, k] = parts;
      const r = Math.round(255 * (1 - c) * (1 - k));
      const g = Math.round(255 * (1 - m) * (1 - k));
      const b = Math.round(255 * (1 - y) * (1 - k));
      hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
  } else if (m === "hsb" || m === "hsb:html") {
    // approximate via HSL
    const parts = v.split(",").map(s => parseFloat(s.trim()));
    if (parts.length === 3) {
      const h = parts[0], s = parts[1], br = parts[2];
      hex = hsbToHex(h, s, br);
    }
  }
  if (hex) {
    BASE_COLORS[key] = hex;
    NAMED_SET.add(key);
  }
}

export function colorLet(name: string, value: string): void {
  const hex = resolveColor(value);
  if (hex) {
    const key = name.trim().toLowerCase();
    BASE_COLORS[key] = hex;
    NAMED_SET.add(key);
  }
}

/** Resolve a color spec to CSS color string. Supports `red`, `-red`, `red!20`, `red!30!blue`, `blue!20!white!30` chained */
export function resolveColor(spec: string): string | null {
  const raw = spec.trim();
  if (!raw) return null;
  if (raw.startsWith("#")) return raw;
  // Handle leading - (complement) — e.g., -red => complement of red (invert)
  if (raw.startsWith("-")) {
    const inner = raw.slice(1);
    const hex = resolveColor(inner);
    if (!hex) return null;
    const p = parseHex(hex);
    return `#${toHex(255 - p.r)}${toHex(255 - p.g)}${toHex(255 - p.b)}`;
  }
  // Handle ! mixing chain: c1!p1!c2!p2!c3 ...
  if (raw.includes("!")) {
    const parts = raw.split("!");
    // Expect alternating color and percent
    // Example: red!30!blue  => parts = ["red","30","blue"]
    // red!30!blue!20!green => ["red","30","blue","20","green"]
    let currentHex: string | null = null;
    let currentColor: string | null = null;
    // First part is color
    const first = parts[0].trim().toLowerCase();
    currentHex = BASE_COLORS[first] ?? null;
    if (!currentHex) {
      // Maybe first is hex? Or unknown
      if (first.startsWith("#")) currentHex = first;
      else return null;
    }
    currentColor = first;
    let idx = 1;
    while (idx < parts.length) {
      const pctStr = parts[idx].trim();
      const pct = parseFloat(pctStr);
      if (isNaN(pct)) { idx++; continue; }
      const nextColorPart = parts[idx + 1]?.trim().toLowerCase();
      let nextHex: string | null = null;
      if (nextColorPart) {
        if (nextColorPart.startsWith("#")) nextHex = nextColorPart;
        else nextHex = BASE_COLORS[nextColorPart] ?? null;
        // If next part is empty (e.g., trailing !) then mix with white
        if (!nextHex && nextColorPart === "") nextHex = "#FFFFFF";
      }
      if (!nextHex) nextHex = "#FFFFFF";
      // Mix currentHex at pct% with nextHex at (100-pct)%
      currentHex = mixHex(currentHex, nextHex, pct / 100);
      // If there is a next color, it becomes current for next iteration? In xcolor, chain: red!30!blue!20!white means (((red!30!blue)!20!white))
      // Our loop does: after mixing red!30!blue => we get mixed. Then next pct is 20 and next color white => mix again.
      // So currentHex is already mixed, and next iteration will treat nextHex as white, but we also need to advance idx by 2
      idx += 2;
      // The next loop's first color is effectively the mixed result, so we don't need to set currentColor
      // But if chain continues, the parts[idx] should be pct, parts[idx+1] color
    }
    return currentHex;
  }
  const key = raw.toLowerCase();
  return BASE_COLORS[key] ?? null;
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a), pb = parseHex(b);
  const r = Math.round(pa.r * t + pb.r * (1 - t));
  const g = Math.round(pa.g * t + pb.g * (1 - t));
  const bl = Math.round(pa.b * t + pb.b * (1 - t));
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}
function parseHex(h: string): { r: number; g: number; b: number } {
  const s = h.replace("#", "");
  const full = s.length === 3 ? s.split("").map(c => c + c).join("") : s;
  return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) };
}
function toHex(n: number): string { return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0"); }

function hsbToHex(h: number, s: number, b: number): string {
  // h in 0..1 or 0..360? TikZ uses 0..360 for H? Assume 0..1 for now, normalize
  let hh = h;
  if (hh > 1) hh = (hh % 360) / 360;
  const c = b * s;
  const x = c * (1 - Math.abs(((hh * 6) % 2) - 1));
  const m = b - c;
  let r1 = 0, g1 = 0, b1 = 0;
  if (hh < 1/6) { r1 = c; g1 = x; }
  else if (hh < 2/6) { r1 = x; g1 = c; }
  else if (hh < 3/6) { g1 = c; b1 = x; }
  else if (hh < 4/6) { g1 = x; b1 = c; }
  else if (hh < 5/6) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const bl = Math.round((b1 + m) * 255);
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

// Line width presets (pt) per PGF manual
export const LINE_WIDTH_PRESETS: Record<string, number> = {
  "ultra thin": 0.1,
  "very thin": 0.2,
  thin: 0.4,
  semithick: 0.6,
  thick: 0.8,
  "very thick": 1.2,
  "ultra thick": 1.6,
};

// Dash presets (in pt). Values approximate PGF defaults: dash pattern on/off lengths scale with line width in TeX but we use fixed.
export const DASH_PRESETS: Record<string, number[] | null> = {
  solid: null,
  dotted: [0.5, 2],
  densely_dotted: [0.5, 1],
  loosely_dotted: [0.5, 4],
  dashed: [3, 3],
  densely_dashed: [3, 2],
  loosely_dashed: [3, 6],
};

// helper to normalize dash key: "densely dashed" -> "densely_dashed"
export function resolveDash(spec: string): number[] | null | undefined {
  const k = spec.trim().toLowerCase().replace(/\s+/g, "_");
  if (k in DASH_PRESETS) return DASH_PRESETS[k];
  return undefined;
}

// help lines preset: very thin + gray
export const HELP_LINES = { lineWidthPt: 0.2, color: BASE_COLORS["gray"] };

export function resetColors(): void {
  // keep base colors, but could clear custom ones — for testing
  // Not implemented to keep base
}
