import { PT_PER_CM } from "../geometry/units.ts";

export interface TextBox {
  width: number; // pt
  height: number; // pt (above baseline)
  depth: number; // pt (below baseline)
}

export interface FontSpec {
  family: string; // css family
  sizePt: number;
  weight: string; // "normal" | "bold"
  style: string; // "normal" | "italic"
  color?: string;
}

export interface TextEngine {
  measure(tex: string, font: FontSpec, opts?: MeasureOpts): Promise<TextBox>;
  draw(ctx: CanvasRenderingContext2D, box: TextBox, tex: string, font: FontSpec, x: number, y: number, opts?: MeasureOpts): void;
}

export interface MeasureOpts {
  textWidthPt?: number;
  align?: string; // left|center|right|justify
}

// Font size map TeX sizes -> pt, based on 10pt base
const FONT_SIZE_MAP: Record<string, number> = {
  "\\tiny": 5,
  "\\scriptsize": 7,
  "\\footnotesize": 8,
  "\\small": 9,
  "\\normalsize": 10,
  "\\large": 12,
  "\\Large": 14.4,
  "\\LARGE": 17.28,
  "\\huge": 20.74,
  "\\Huge": 24.88,
};

export function parseFontSpec(options: { key: string; value?: string }[], current: FontSpec): FontSpec {
  let spec = { ...current };
  for (const o of options) {
    const k = o.key.trim().toLowerCase();
    const v = (o.value ?? "").trim();
    if (k === "font" && v) {
      // font=\small\bfseries etc or font={\sffamily\small}
      // Extract commands inside
      const m = v.match(/\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)/);
      if (m) {
        const cmd = "\\" + m[1];
        if (FONT_SIZE_MAP[cmd]) spec.sizePt = FONT_SIZE_MAP[cmd];
      }
      if (/\\bfseries/.test(v) || /\\textbf/.test(v) || /\\bf/.test(v)) spec.weight = "bold";
      if (/\\itshape/.test(v) || /\\textit/.test(v) || /\\it/.test(v) || /\\em/.test(v)) spec.style = "italic";
      if (/\\sffamily/.test(v)) spec.family = "Latin Modern Sans, sans-serif";
      if (/\\ttfamily/.test(v)) spec.family = "Latin Modern Mono, monospace";
      if (/\\rmfamily/.test(v)) spec.family = "Latin Modern Roman, serif";
      // also try to parse explicit size like "10pt"
      const sz = v.match(/([0-9.]+)\s*pt/);
      if (sz) spec.sizePt = parseFloat(sz[1]);
    }
    if (k === "text" && v) {
      spec.color = v;
    }
  }
  // Standalone style keys like \bfseries etc may appear as bare keys
  for (const o of options) {
    const raw = o.key.trim();
    if (FONT_SIZE_MAP[raw]) spec.sizePt = FONT_SIZE_MAP[raw];
    if (raw === "\\bfseries" || raw === "\\bf") spec.weight = "bold";
    if (raw === "\\itshape" || raw === "\\it" || raw === "\\em") spec.style = "italic";
    if (raw === "\\sffamily") spec.family = "Latin Modern Sans, sans-serif";
    if (raw === "\\ttfamily") spec.family = "Latin Modern Mono, monospace";
  }
  return spec;
}

export function defaultFont(): FontSpec {
  return { family: "Latin Modern Roman, serif", sizePt: 10, weight: "normal", style: "normal" };
}

// Greek mapping
const GREEK_MAP: Record<string, string> = {
  "\\alpha": "α", "\\beta": "β", "\\gamma": "γ", "\\delta": "δ", "\\epsilon": "ε",
  "\\zeta": "ζ", "\\eta": "η", "\\theta": "θ", "\\iota": "ι", "\\kappa": "κ",
  "\\lambda": "λ", "\\mu": "μ", "\\nu": "ν", "\\xi": "ξ", "\\pi": "π",
  "\\rho": "ρ", "\\sigma": "σ", "\\tau": "τ", "\\upsilon": "υ", "\\phi": "φ",
  "\\chi": "χ", "\\psi": "ψ", "\\omega": "ω",
  "\\Gamma": "Γ", "\\Delta": "Δ", "\\Theta": "Θ", "\\Lambda": "Λ", "\\Xi": "Ξ",
  "\\Pi": "Π", "\\Sigma": "Σ", "\\Phi": "Φ", "\\Psi": "Ψ", "\\Omega": "Ω",
};

const COMMON_OPS: Record<string, string> = {
  "\\cdot": "·", "\\ldots": "…", "\\cdots": "⋯", "\\dots": "…",
  "\\times": "×", "\\div": "÷", "\\pm": "±", "\\mp": "∓",
  "\\leq": "≤", "\\le": "≤", "\\geq": "≥", "\\ge": "≥", "\\neq": "≠", "\\ne": "≠",
  "\\approx": "≈", "\\equiv": "≡", "\\sim": "∼", "\\simeq": "≃",
  "\\rightarrow": "→", "\\to": "→", "\\leftarrow": "←", "\\Rightarrow": "⇒", "\\Leftarrow": "⇐",
  "\\leftrightarrow": "↔", "\\Leftrightarrow": "⇔", "\\infty": "∞",
  "\\partial": "∂", "\\nabla": "∇", "\\sum": "∑", "\\prod": "∏", "\\int": "∫",
  "\\hat": "^", "\\bar": "¯", "\\vec": "→",
};

function stripMiniTex(tex: string): string {
  let s = tex;
  // Remove $ delimiters
  s = s.replace(/\$/g, "");
  // \frac{a}{b} -> a/b
  s = s.replace(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, "$1/$2");
  s = s.replace(/\\sqrt\s*\{([^}]*)\}/g, "√$1");
  s = s.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^}]*)\}/g, "√$2");
  // \mathbf, \mathrm, \mathbb, \text, \mathbf etc: strip command keep arg
  s = s.replace(/\\(mathbf|mathrm|mathbb|mathcal|mathit|mathsf|mathtt|text|textbf|textit|emph)\s*\{([^}]*)\}/g, "$2");
  // Greek
  for (const [k, v] of Object.entries(GREEK_MAP)) s = s.split(k).join(v);
  for (const [k, v] of Object.entries(COMMON_OPS)) s = s.split(k).join(v);
  // superscripts ^ and subscripts _ with braces
  s = s.replace(/\^\s*\{([^}]*)\}/g, "$1");
  s = s.replace(/_\s*\{([^}]*)\}/g, "$1");
  s = s.replace(/\^([a-zA-Z0-9])/g, "$1");
  s = s.replace(/_([a-zA-Z0-9])/g, "$1");
  // hat, bar etc single arg already handled via COMMON_OPS but keep
  // Remove remaining \commands like \,
  s = s.replace(/\\[a-zA-Z]+/g, "");
  // Braces
  s = s.replace(/[{}]/g, "");
  // \\ -> newline marker replaced elsewhere
  return s.trim();
}

function splitLines(tex: string): string[] {
  // TikZ \\ inside nodes is line break; handle \\
  // Also split on \\  ; keep text width handling outside
  return tex.split(/\\\\/g);
}

function canvasFontString(f: FontSpec): string {
  return `${f.style} ${f.weight} ${f.sizePt}pt "${f.family}", serif`;
}

let cachedCanvas: HTMLCanvasElement | null = null;
function getCanvas(): HTMLCanvasElement | null {
  if (cachedCanvas) return cachedCanvas;
  if (typeof document !== "undefined") {
    cachedCanvas = document.createElement("canvas");
    return cachedCanvas;
  }
  // Node fallback: try OffscreenCanvas if available
  try {
    // @ts-ignore
    if (typeof OffscreenCanvas !== "undefined") {
      // @ts-ignore
      cachedCanvas = new OffscreenCanvas(1, 1) as unknown as HTMLCanvasElement;
      return cachedCanvas;
    }
  } catch {}
  return null;
}

export class BuiltinTextEngine implements TextEngine {
  async measure(tex: string, font: FontSpec, opts?: MeasureOpts): Promise<TextBox> {
    // In Node tests without DOM, document.fonts may not exist — still estimate
    // Always await fonts ready if available
    try {
      // @ts-ignore
      if (typeof document !== "undefined" && document.fonts?.ready) {
        // don't block forever, but await ready if possible (non-blocking for speed)
        // we don't strictly await here for simplicity
      }
    } catch {}
    const lines = splitLines(tex);
    const plainLines = lines.map(l => stripMiniTex(l));
    const textWidthPt = opts?.textWidthPt;
    // Estimate per line width
    const canvas = getCanvas();
    let maxWidth = 0;
    let widths: number[] = [];
    let heightPerLine = font.sizePt * 1.2; // approx

    for (const line of plainLines) {
      if (!line) { widths.push(0); continue; }
      let w: number;
      if (canvas) {
        try {
          const ctx = (canvas as any).getContext("2d") as CanvasRenderingContext2D;
          if (ctx) {
            ctx.font = canvasFontString(font);
            w = ctx.measureText(line).width;
            // Convert px to pt: measureText is in canvas px with font size pt*pxPerPt
            // But ctx font size is in pt -> browser px conversion approx sizePt*1.328
            // measureText returns px, we need pt: /1.328
            // However simpler: we set font as "${sizePt}pt" and measure gives px; convert using ratio
            const pxPerPt = 96 / 72.27;
            w = w / pxPerPt;
          } else {
            w = line.length * font.sizePt * 0.6;
          }
        } catch {
          w = line.length * font.sizePt * 0.6;
        }
      } else {
        w = line.length * font.sizePt * 0.6;
      }
      // If text width and wrapping requested, simulate wrapping
      if (textWidthPt && w > textWidthPt) {
        // crude wrapping: split into multiple visual lines
        const charsPerLine = Math.max(1, Math.floor(textWidthPt / (font.sizePt * 0.6)));
        const wrapped = Math.ceil(line.length / charsPerLine);
        const wrappedW = Math.min(w, textWidthPt);
        // width is constrained
        maxWidth = Math.max(maxWidth, wrappedW);
        widths.push(...Array(wrapped).fill(wrappedW));
        continue;
      }
      widths.push(w);
      maxWidth = Math.max(maxWidth, w);
    }
    if (textWidthPt && maxWidth > textWidthPt) maxWidth = textWidthPt;
    const totalHeight = widths.length * heightPerLine;
    // Adjust: if content is just math like $x_1$, height typical 7pt etc. Keep above estimate
    return {
      width: maxWidth,
      height: totalHeight * 0.7, // above baseline portion
      depth: totalHeight * 0.3,
    };
  }

  draw(ctx: CanvasRenderingContext2D, box: TextBox, tex: string, font: FontSpec, x: number, y: number, opts?: MeasureOpts): void {
    const lines = splitLines(tex);
    const plainLines = lines.map(l => stripMiniTex(l));
    const align = opts?.align ?? "center";
    const textWidthPt = opts?.textWidthPt;
    ctx.save();
    ctx.font = canvasFontString(font);
    ctx.fillStyle = font.color ?? "#000";
    ctx.textBaseline = "alphabetic";
    // We are in pt space flipped? Caller handles flip. Here we just fillText.
    const lineHeight = font.sizePt * 1.2;
    let totalH = plainLines.length * lineHeight;
    if (textWidthPt) {
      // estimate wrapped height
      let wrappedCount = 0;
      for (const line of plainLines) {
        let w = ctx.measureText(line).width / (96/72.27);
        if (w > textWidthPt) wrappedCount += Math.ceil(line.length / Math.max(1, textWidthPt/(font.sizePt*0.6)));
        else wrappedCount += 1;
      }
      totalH = wrappedCount * lineHeight;
    }
    // Node text is centered vertically around x,y? y is node center baseline
    let curY = y + totalH/2 - lineHeight*0.7;
    // Actually simpler: start at y + box.height - lineHeight/2
    // Use box metrics: draw lines top-down
    for (const line of plainLines) {
      // Wrapping simulation: if needed, split
      let sublines: string[] = [line];
      if (textWidthPt) {
        const w = line ? (ctx.measureText(line).width / (96/72.27)) : 0;
        if (w > textWidthPt) {
          const charsPerLine = Math.max(1, Math.floor(textWidthPt / (font.sizePt*0.6)));
          sublines = [];
          for (let i=0;i<line.length;i+=charsPerLine) sublines.push(line.slice(i, i+charsPerLine));
        }
      }
      for (const sub of sublines) {
        let dx = 0;
        const sw = sub ? ctx.measureText(sub).width / (96/72.27) : 0;
        if (align === "center") dx = -sw/2;
        else if (align === "right") dx = -sw;
        else if (align === "left") dx = - (box.width/2); // left aligned within node width? approximate left
        // For nodes, left alignment means text starts at left bbox edge: x - width/2
        if (align === "left" && textWidthPt) dx = -(box.width/2);
        if (align === "center") dx = -sw/2;
        if (align === "right") dx = box.width/2 - sw;
        // fallback center for narrow
        if (!textWidthPt && align === "center") dx = -sw/2;
        else if (!textWidthPt && align === "left") dx = -box.width/2;
        else if (!textWidthPt && align === "right") dx = box.width/2 - sw;
        // scale flip: caller already flipped Y once; we draw with y inverted? The core canvas render flips Y globally and then flips back for text.
        // Here we receive canvas with outer flip; we draw with additional handling outside. We'll just fillText at (x+dx, -curY?) Actually evaluator will call draw with (x,y) in pt after flipping.
        // For our engine, we assume ctx is already in pt space with Y flipped twice -> upright. So y positive up.
        // We'll draw at y = curY with negation handled by caller. Simpler fill at x+dx, -curY?
        // The render/canvas drawItem does scale(1,-1) and fillText at (x, -y). So here we are called inside that scale? We'll mimic similar.
        // To keep consistent, draw at (x+dx, -curY) if using technique? But we are called from nodes/render; we will just fillText at x+dx, curY directly after setting correct transform.
        // For now, handle both: we check if ctx's transform has negative Y?
        // Simpler: just fillText at (x+dx, curY) where curY inverted?
        // We'll just call fillText with (x+dx, -curY) style? Not.
        // Instead we draw at (x+dx, curY) assuming caller set flipped.
        ctx.fillText(stripMiniTex(sub), x + dx, curY);
        curY -= lineHeight;
      }
    }
    ctx.restore();
  }
}

// Adapters (stubs)
export class MathJaxAdapter implements TextEngine {
  constructor(private mj: any) { void mj; }
  async measure(tex: string, font: FontSpec): Promise<TextBox> {
    const eng = new BuiltinTextEngine();
    return eng.measure(tex, font);
  }
  draw(ctx: CanvasRenderingContext2D, box: TextBox, tex: string, font: FontSpec, x: number, y: number, opts?: MeasureOpts): void {
    const eng = new BuiltinTextEngine();
    eng.draw(ctx, box, tex, font, x, y, opts);
  }
}
export class OverlayAdapter implements TextEngine {
  async measure(tex: string, font: FontSpec): Promise<TextBox> {
    const eng = new BuiltinTextEngine();
    return eng.measure(tex, font);
  }
  draw(): void {}
}

export let defaultEngine: TextEngine = new BuiltinTextEngine();
export function setDefaultEngine(e: TextEngine) { defaultEngine = e; }
export function getDefaultEngine(): TextEngine { return defaultEngine; }
