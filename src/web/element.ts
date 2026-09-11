import { compile } from "../api/compile.ts";
import { renderToCanvas } from "../render/canvas.ts";
import { applyAria } from "./a11y.ts";
import { applyThemeToDisplayList } from "./theme.ts";
import { attachInteractivity } from "./interactivity.ts";

const BaseHTMLElement = (typeof HTMLElement !== "undefined" ? HTMLElement : class {} as any);
export class TikzPictureElement extends (BaseHTMLElement as typeof HTMLElement) {
  static observedAttributes = ["src", "source", "scale", "theme", "fit", "background"];
  private _canvas: HTMLCanvasElement | null = null;
  private _resizeObserver: ResizeObserver | null = null;
  private _shadow: ShadowRoot | null = null;
  private _source: string = "";
  private _scale: number = 1;
  private _theme: string = "light";
  private _fit: string | null = null;
  private _background: string | null = null;

  constructor() {
    super();
    // use shadow if available for encapsulation, fallback to light DOM
    try { this._shadow = this.attachShadow({ mode: "open" }); } catch { this._shadow = null; }
  }

  connectedCallback(): void {
    this._source = this.getAttribute("src") ?? this.getAttribute("source") ?? this.textContent ?? "";
    // if textContent was used, clear it to avoid duplicate display
    if (this.getAttribute("src") === null && this.getAttribute("source") === null && this.textContent?.trim()) {
      const src = this.textContent ?? "";
      this._source = src;
      // keep textContent for SSR but don't double-render?
    }
    const s = this.getAttribute("scale");
    if (s) this._scale = parseFloat(s) || 1;
    this._theme = this.getAttribute("theme") ?? "light";
    this._fit = this.getAttribute("fit");
    this._background = this.getAttribute("background");
    void this._render();
    if (this._fit === "width" || this._fit === "contain" || this.hasAttribute("responsive")) {
      this._setupResizeObserver();
    }
  }

  disconnectedCallback(): void {
    if (this._resizeObserver) { this._resizeObserver.disconnect(); this._resizeObserver = null; }
  }

  attributeChangedCallback(name: string, _old: string | null, newVal: string | null): void {
    if (name === "src" || name === "source") { this._source = newVal ?? ""; void this._render(); }
    else if (name === "scale") { this._scale = newVal ? parseFloat(newVal) || 1 : 1; void this._render(); }
    else if (name === "theme") { this._theme = newVal ?? "light"; void this._render(); }
    else if (name === "fit") { this._fit = newVal; this._setupResizeObserver(); void this._render(); }
    else if (name === "background") { this._background = newVal; void this._render(); }
  }

  get source(): string { return this._source; }
  set source(v: string) { this._source = v; void this._render(); }
  get scale(): number { return this._scale; }
  set scale(v: number) { this._scale = v; void this._render(); }
  get theme(): string { return this._theme; }
  set theme(v: string) { this._theme = v; void this._render(); }

  private _setupResizeObserver(): void {
    if (typeof ResizeObserver === "undefined") return;
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this._resizeObserver = new ResizeObserver(() => { void this._render(); });
    this._resizeObserver.observe(this);
  }

  private async _render(): Promise<void> {
    if (!this._source && !this.isConnected) return;
    const src = this._source ?? "";
    if (!src.trim()) return;
    const { displayList } = await compile(src, { scale: this._scale, theme: this._theme as any } as any);
    let dl = displayList;
    if (this._theme === "dark" || this._theme === "light") {
      dl = applyThemeToDisplayList(displayList, this._theme as any);
    }
    let canvas = this._canvas;
    if (!canvas) {
      canvas = document.createElement("canvas");
      this._canvas = canvas;
      const root = this._shadow ?? this;
      // clear previous
      root.innerHTML = "";
      root.appendChild(canvas);
    }
    // responsive fit: adjust scale to fit container width
    let effectiveScale = this._scale;
    if (this._fit === "width" || this._fit === "contain") {
      const containerW = this.clientWidth || this.parentElement?.clientWidth || 0;
      if (containerW > 0) {
        const wPt = dl.bbox.isEmpty ? 10 : dl.bbox.width + 1;
        const pxW = wPt * (96/72.27) * effectiveScale;
        if (pxW > containerW) effectiveScale = containerW / (wPt * (96/72.27));
      }
    }
    renderToCanvas(dl, canvas, { scale: effectiveScale, background: this._background });
    applyAria(canvas, dl);
    // attach interactivity stub if web attributes present
    if (this.hasAttribute("interactive")) {
      attachInteractivity(canvas, dl, { scale: effectiveScale });
    }
  }

  async update(opts: { source?: string; scale?: number; theme?: string }): Promise<void> {
    if (opts.source !== undefined) this._source = opts.source;
    if (opts.scale !== undefined) this._scale = opts.scale;
    if (opts.theme !== undefined) this._theme = opts.theme;
    await this._render();
  }

  get canvas(): HTMLCanvasElement | null { return this._canvas; }
}

export function defineTikzPictureElement(tag = "tikz-picture"): void {
  if (typeof customElements !== "undefined" && !customElements.get(tag)) {
    customElements.define(tag, TikzPictureElement);
  }
}

// Auto-define when imported in browser
if (typeof customElements !== "undefined" && typeof window !== "undefined") {
  try { defineTikzPictureElement(); } catch {}
}
