import { compile } from "./api/compile.ts";
import { render, autoRender } from "./api/render.ts";
import { renderToCanvas } from "./render/canvas.ts";
import { renderToSVG } from "./render/svg.ts";
import { lex } from "./lexer/index.ts";
import { parse } from "./parser/index.ts";

export const WebTikZ = {
  version: "0.0.1",
  compile,
  render,
  autoRender,
  renderToCanvas,
  renderToSVG,
  lex,
  parse,
  // plugin registry stub
  _plugins: [] as unknown[],
  use(plugin: unknown) {
    (this._plugins as unknown[]).push(plugin);
    return this;
  },
  defineShape() { throw new Error("defineShape: not yet implemented (Phase 5)"); },
  defineArrow() { throw new Error("defineArrow: not yet implemented (Phase 4)"); },
};

// Auto-init on DOMContentLoaded (browser only)
if (typeof document !== "undefined" && typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { void autoRender(); });
  } else {
    void autoRender();
  }
}

// UMD global compatibility: esbuild IIFE will also set globalThis.WebTikZ via globalName,
// but ensure ESM import also exposes it.
if (typeof globalThis !== "undefined") {
  (globalThis as unknown as { WebTikZ: typeof WebTikZ }).WebTikZ = WebTikZ;
}

export default WebTikZ;
export { compile, render, autoRender, renderToCanvas, renderToSVG, lex, parse };
export * from "./geometry/index.ts";
export * from "./render/displayList.ts";
