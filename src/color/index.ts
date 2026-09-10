/**
 * Phase 1 color system: 19 base xcolor (dvips) names + simple draw/fill resolution.
 * Full xcolor mixing (red!30!blue) is Phase 2; we provide basic support for `color!percent`.
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
  // alias
  grey: "#808080",
};

const NAMED_SET = new Set(Object.keys(BASE_COLORS));

export function isBaseColor(name: string): boolean {
  return NAMED_SET.has(name.toLowerCase());
}

/** Resolve a color spec to CSS color string. Supports `red`, `red!20`, `red!20!blue`. */
export function resolveColor(spec: string): string | null {
  const raw = spec.trim();
  if (!raw) return null;
  if (raw.startsWith("#")) return raw;
  // handle ! mixing naively: take first color as base, lighten toward white for `color!pct`
  // and mix two colors for `c1!pct!c2`
  if (raw.includes("!")) {
    const parts = raw.split("!");
    const c1 = parts[0].toLowerCase();
    const hex1 = BASE_COLORS[c1];
    if (!hex1) return null;
    if (parts.length === 2) {
      const pct = parseFloat(parts[1]);
      if (isNaN(pct)) return hex1;
      // c1!pct -> mix c1 at pct% with white
      return mixHex(hex1, "#FFFFFF", pct / 100);
    }
    if (parts.length >= 3) {
      const pct = parseFloat(parts[1]);
      const c2 = parts[2].toLowerCase();
      const hex2 = BASE_COLORS[c2] ?? "#FFFFFF";
      if (isNaN(pct)) return hex1;
      return mixHex(hex1, hex2, pct / 100);
    }
  }
  const key = raw.toLowerCase();
  return BASE_COLORS[key] ?? null;
}

function mixHex(a: string, b: string, t: number): string {
  // t = weight of a (0..1), (1-t) of b
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
