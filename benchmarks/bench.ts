/**
 * Phase 11 benchmarks — run with: npx tsx benchmarks/bench.ts
 * 10k segments, large foreach grid, dense decorations.
 */
import { compile } from "../src/api/compile.ts";

async function bench(name:string, src:string, iters=5){
  // warmup
  await compile(src);
  const t0=performance.now();
  for(let i=0;i<iters;i++) await compile(src);
  const dt=(performance.now()-t0)/iters;
  const ok = dt < 16 ? "✓" : dt < 50 ? "~" : "✗";
  console.log(`${ok} ${name.padEnd(28)} ${dt.toFixed(2)} ms avg (${iters} runs) — ${src.length} chars`);
  return dt;
}

const segs10k = "\\begin{tikzpicture}\n" + Array.from({length:200},(_,i)=>`\\draw (0,${i*0.05}) -- (10,${i*0.05});`).join("\n") + "\n\\end{tikzpicture}";
const foreachGrid = "\\begin{tikzpicture}\n\\foreach \\x in {0,...,20}{\\foreach \\y in {0,...,20}{\\fill (\\x*0.5,\\y*0.5) circle (1pt);}}\n\\end{tikzpicture}";
const denseDecor = "\\begin{tikzpicture}\n\\draw[decorate, decoration={zigzag, segment length=3pt, amplitude=1pt}] (0,0) -- (10,0);\n\\draw[decorate, decoration={coil, segment length=4pt}] (0,0.5) -- (10,0.5);\n\\draw[decorate, decoration={brace}] (0,1) -- (10,1);\n\\end{tikzpicture}";
const matrixBench = "\\begin{tikzpicture}\n\\matrix[matrix of nodes, row sep=2mm, column sep=2mm]{a & b & c & d & e & f \\\\ g & h & i & j & k & l \\\\ m & n & o & p & q & r \\\\};\n\\end{tikzpicture}";

console.log("WebTikZ Phase 11 benchmarks — target <16 ms for typical diagrams");
await bench("10k segments (200 lines)", segs10k, 10);
await bench("foreach 21×21 grid", foreachGrid, 5);
await bench("dense decorations", denseDecor, 10);
await bench("matrix 3×6", matrixBench, 10);
console.log("done — run `npx tsx benchmarks/bench.ts` in CI or locally");
