import { parse } from "../parser/index.ts";
import { evaluate } from "../core/evaluator.ts";
import type { DisplayList } from "../render/displayList.ts";

export interface CompileOptions {
  scale?: number;
  vars?: Record<string, unknown>;
  theme?: "light" | "dark" | string;
  hoverStyles?: Record<string, string>;
}

export interface CompileResult {
  displayList: DisplayList;
  errors: { message: string; line: number; column: number; pos: number; severity: "error" | "warning"; codeFrame?: string }[];
}

/**
 * Parse + evaluate source to a DisplayList without touching DOM.
 * Suitable for tests, Workers, and SSR.
 */
export async function compile(source: string, opts: CompileOptions = {}): Promise<CompileResult> {
  const parsed = parse(source);
  const { displayList, errors } = await evaluate(parsed, opts);
  return { displayList, errors };
}
