import { parse } from "../parser/index.ts";
import { evaluate } from "../core/evaluator.ts";
import type { DisplayList } from "../render/displayList.ts";

export interface CompileOptions {
  scale?: number;
}

export interface CompileResult {
  displayList: DisplayList;
  errors: { message: string; line: number; column: number; severity: "error" | "warning" }[];
}

/**
 * Parse + evaluate source to a DisplayList without touching DOM.
 * Suitable for tests, Workers, and SSR.
 */
export async function compile(source: string, opts: CompileOptions = {}): Promise<CompileResult> {
  // Phase 0 is synchronous; async only for future TextEngine (Phase 3)
  // where font loading and measurement are async. Keep Promise API from day one.
  const parsed = parse(source);
  const { displayList, errors } = evaluate(parsed, opts);
  // Future: await text measurement pass here.
  return { displayList, errors };
}
