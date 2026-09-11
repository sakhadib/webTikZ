import { compile } from "./api/compile.ts";
import { render, autoRender } from "./api/render.ts";
import { renderToCanvas } from "./render/canvas.ts";
import { renderToSVG } from "./render/svg.ts";
import { lex } from "./lexer/index.ts";
import { parse } from "./parser/index.ts";

import { defineTikzPictureElement } from "./web/element.ts";
import { hitTestDisplayList, isPointInPath, isPointInStroke, hitTestNodes } from "./render/displayList.ts";
import * as theme from "./web/theme.ts";
import * as a11y from "./web/a11y.ts";
import * as anim from "./web/animation.ts";
import * as inter from "./web/interactivity.ts";
import * as exp from "./web/export.ts";
import * as hl from "./web/highlight.ts";

export const WebTikZ = {
  version: "0.0.1",
  compile,
  render,
  autoRender,
  renderToCanvas,
  renderToSVG,
  lex,
  parse,
  hitTest: hitTestNodes,
  hitTestDisplayList,
  isPointInPath,
  isPointInStroke,
  theme,
  a11y,
  anim,
  inter,
  exp,
  hl,
  defineTikzPictureElement,
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
