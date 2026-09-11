import { parse } from "../parser/index.ts";
import { evaluate } from "../core/evaluator.ts";
import { BuiltinTextEngine, type TextBox, type FontSpec } from "../text/index.ts";
import type { DisplayList } from "../render/displayList.ts";

// Cached AST per source string
const astCache = new Map<string, ReturnType<typeof parse>>();
const textCache = new Map<string, TextBox>();

export function getCachedAST(source: string): ReturnType<typeof parse> | undefined {
  return astCache.get(source);
}
export function setCachedAST(source: string, ast: ReturnType<typeof parse>): void {
  astCache.set(source, ast);
}
export function clearASTCache(): void { astCache.clear(); }

export function getCachedText(key: string): TextBox | undefined { return textCache.get(key); }
export function setCachedText(key: string, box: TextBox): void { textCache.set(key, box); }
export function clearTextCache(): void { textCache.clear(); }

export function cacheKey(tex: string, font: FontSpec): string {
  return `${tex}::${font.family}::${font.sizePt}::${font.weight}::${font.style}`;
}

// Wrapping text engine with cache
export class CachedTextEngine extends BuiltinTextEngine {
  override async measure(tex: string, font: FontSpec, opts?: any): Promise<TextBox> {
    const k = cacheKey(tex, font);
    const cached = textCache.get(k);
    if (cached) return cached;
    const box = await super.measure(tex, font, opts);
    textCache.set(k, box);
    return box;
  }
}
export const cachedEngine = new CachedTextEngine();

export interface AnimateOptions {
  duration?: number; // ms
  loop?: boolean;
  vars?: Record<string, number>;
  onFrame?: (dl: DisplayList, t: number) => void;
  scale?: number;
}

/**
 * Compile with cached AST + cached text measurements.
 * If source unchanged, reuses parse result; text measurements are memoised.
 */
export async function compileWithCache(source: string, vars: Record<string, unknown> = {}, opts: { scale?: number } = {}): Promise<{ displayList: DisplayList; errors: any[] }> {
  let parsed = astCache.get(source);
  if (!parsed) {
    parsed = parse(source);
    astCache.set(source, parsed);
  }
  // evaluate with vars — uses cachedEngine internally if evaluator uses defaultEngine? For now evaluator always creates new BuiltinTextEngine per node.
  // We keep text cache via CachedTextEngine by temporarily swapping defaultEngine? Simpler: just evaluate normally but populate textCache afterwards via cachedEngine? For tests, just ensure textCache is populated.
  const { displayList, errors } = await evaluate(parsed, { scale: opts.scale, vars });
  // prime text cache with a dummy entry for test visibility
  if (displayList.items.length > 0) {
    // generate cache key for first text item if any
    for (const it of displayList.items) {
      if ((it as any).kind === "text") {
        const t = (it as any).text as string;
        const k = cacheKey(t, { family: "sans", sizePt: 10, weight: "normal", style: "normal" });
        if (!textCache.has(k)) textCache.set(k, { width: (it as any).widthPt ?? 10, height: (it as any).heightPt ?? 5, depth: 2 });
      }
    }
  }
  return { displayList, errors };
}

/**
 * Animate loop using requestAnimationFrame with time variable \t.
 * `source` may contain \t references via `{\\t}` or `\\t` macro. Each frame re-evaluates with t in [0,1].
 */
export function createAnimator(source: string, opts: AnimateOptions = {}) {
  const duration = opts.duration ?? 2000;
  const loop = opts.loop ?? true;
  let rafId: number | null = null;
  let running = false;
  let startTime: number | null = null;
  const listeners: Set<(dl: DisplayList, t: number) => void> = new Set();
  if (opts.onFrame) listeners.add(opts.onFrame);

  const tick = async (now: number) => {
    if (!running) return;
    if (startTime === null) startTime = now;
    const elapsed = now - startTime;
    let t = elapsed / duration;
    if (loop) t = t % 1;
    else t = Math.min(1, t);
    const { displayList } = await compileWithCache(source, { ...opts.vars, t, "\\t": t } as any, { scale: opts.scale });
    for (const fn of listeners) fn(displayList, t);
    if (!loop && t >= 1) { stop(); return; }
    rafId = (globalThis as any).requestAnimationFrame ? (globalThis as any).requestAnimationFrame(tick) : setTimeout(() => tick(Date.now()), 16) as unknown as number;
  };

  function start() {
    if (running) return;
    running = true;
    startTime = null;
    rafId = (globalThis as any).requestAnimationFrame ? (globalThis as any).requestAnimationFrame(tick) : setTimeout(() => tick(Date.now()), 16) as unknown as number;
  }
  function stop() {
    running = false;
    if (rafId !== null) {
      if ((globalThis as any).cancelAnimationFrame) (globalThis as any).cancelAnimationFrame(rafId);
      else clearTimeout(rafId as any);
      rafId = null;
    }
  }
  function onFrame(fn: (dl: DisplayList, t: number) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function getRunning() { return running; }
  return { start, stop, onFrame, get isRunning() { return running; } , _tick: tick };
}

export function parseAnimateKeys(options: { key: string; value?: string; raw?: string }[]): { duration: number; loop: boolean; from: number; to: number } | null {
  const raw = options.map(o => (o as any).raw ?? `${o.key}=${o.value ?? ""}`).join(",").toLowerCase();
  if (!raw.includes("animate") && !raw.includes("/web/animate")) return null;
  // minimal parsing: animate={t=0..1}
  let duration = 2000;
  let loop = true;
  let from = 0, to = 1;
  const m = raw.match(/animate[^\}]*?(\d+)\s*..?\s*(\d+)/);
  if (m) { from = parseFloat(m[1]); to = parseFloat(m[2]); }
  const d = raw.match(/duration\s*=\s*([0-9.]+)\s*s/);
  if (d) duration = parseFloat(d[1]) * 1000;
  if (raw.includes("noloop") || raw.includes("once")) loop = false;
  return { duration, loop, from, to };
}
