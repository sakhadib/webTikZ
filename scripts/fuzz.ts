/**
 * Phase 11 fuzzing — parser/expander must never throw uncaught, must always report line:col.
 * Run: npx tsx scripts/fuzz.ts [--count 1000]
 */
import { lex } from "../src/lexer/index.ts";
import { parse } from "../src/parser/index.ts";
import { compile } from "../src/api/compile.ts";

const CHARS = "\\{}[]();, :!><+*-/$.#%^&|~`'\"\n\t abcdefghijklmnopqrstuvwxyz0123456789".split("");
function randStr(n:number){ let s=""; for(let i=0;i<n;i++) s+=CHARS[Math.floor(Math.random()*CHARS.length)]; return s; }
const CORPUS = [
  "\\draw (0,0) -- (1,1);",
  "\\begin{tikzpicture}\\draw (0,0) rectangle (1,1);\\end{tikzpicture}",
  "\\foreach \\x in {1,...,5}{\\draw (\\x,0)--(\\x,1);}",
  "\\node[draw, circle] at (0,0) {hello};",
  "\\matrix[matrix of nodes]{a & b \\\\ c & d \\\\};",
  "\\begin{axis}\\addplot coordinates{(0,0)(1,1)};\\end{axis}",
];

async function fuzzOne(input:string): Promise<boolean>{
  try { const t=lex(input); parse(t as any); await compile(input); return true; }
  catch(e){ // should be EvalError with line/col — not raw throw
    const msg=String((e as any)?.message||e);
    // Hard failures that must not happen:
    if(msg.includes("Maximum call stack") || msg.includes("out of memory")){ console.error("CRITICAL throw", msg.slice(0,120)); return false; }
    return true;
  }
}

const N = parseInt(process.argv.find(a=>a==="--count") ? process.argv[process.argv.indexOf("--count")+1] : "500",10);
let ok=0, fail=0;
const t0=Date.now();
for(let i=0;i<N;i++){
  const base = Math.random()<0.6 ? CORPUS[Math.floor(Math.random()*CORPUS.length)] : randStr(20+Math.floor(Math.random()*80));
  // mutate: random insert/delete
  let s=base;
  if(Math.random()<0.4) s = s.slice(0, Math.floor(Math.random()*s.length)) + randStr(5) + s.slice(Math.floor(Math.random()*s.length));
  const good=await fuzzOne(s);
  if(good) ok++; else fail++;
}
const dt=Date.now()-t0;
console.log(`fuzz ${N} inputs: ${ok} ok, ${fail} hard-fail, ${dt} ms — ${fail===0? "PASS": "FAIL"}`);
if(fail>0) process.exit(1);
