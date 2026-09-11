/**
 * Phase 11 — Resource limits.
 * All limits are enforced in parser/evaluator/worker. Exceeding throws EvalError with line:col.
 */
export const LIMITS = {
  maxForeachIterations: 10000,   // total loop bodies executed per picture
  maxRecursionDepth: 64,         // macro / child / graph recursion
  maxDisplayListItems: 50000,    // items after evaluation
  maxPathSegments: 200000,       // PathSegment count
  maxWallTimeMs: 3000,           // wall-clock per compile
  maxMacroExpansions: 5000,
  maxNodeCount: 10000,
  maxLoopNesting: 16,
} as const;

export class LimitError extends Error {
  constructor(public code: string, msg: string) { super(msg); this.name="LimitError"; }
}

let startMs = 0;
export function beginBudget(){ startMs = Date.now(); }
export function checkWallTime(){
  if (startMs && Date.now() - startMs > LIMITS.maxWallTimeMs) throw new LimitError("wallTime", `Time limit ${LIMITS.maxWallTimeMs} ms exceeded — picture too complex`);
}
export function checkCount(n: number, limit: number, label: string){
  if(n > limit) throw new LimitError(label, `${label} limit ${limit} exceeded (${n})`);
}
