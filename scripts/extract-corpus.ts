#!/usr/bin/env tsx
/**
 * Extract codeexample blocks from pgfmanual source.
 * Usage: npm run corpus:extract -- --input /path/to/pgfmanual-en.tex --out .corpus/index.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i !== -1 ? (args[i + 1] ?? fallback) : fallback;
}

const input = getArg("--input", "");
const out = getArg("--out", ".corpus/index.json");

if (!input) {
  console.log("Usage: tsx scripts/extract-corpus.ts --input /path/to/pgfmanual.tex --out .corpus/index.json");
  console.log("No --input given, using demo: creating .corpus with 1 example (draw (0,0) -- (1,1))");
  const demo = [
    {
      id: "demo-001",
      section: "demo",
      source: "\\begin{tikzpicture}\n  \\draw (0,0) -- (1,1);\n\\end{tikzpicture}",
      tags: ["phase-0"],
    },
  ];
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), JSON.stringify(demo, null, 2));
  console.log(`Wrote ${demo.length} entries to ${out}`);
  process.exit(0);
}

if (!existsSync(input)) {
  console.error(`Input not found: ${input}`);
  process.exit(1);
}

const text = readFileSync(input, "utf-8");
const re = /\\begin\{codeexample\}[^\n]*\n([\s\S]*?)\\end\{codeexample\}/g;
let m: RegExpExecArray | null;
const entries: { id: string; section: string; source: string; tags: string[] }[] = [];
let section = "unknown";
let idx = 0;

// naive section detection
const sectionRe = /\\section\{([^}]+)\}/g;
let sm: RegExpExecArray | null;
const sections: { pos: number; name: string }[] = [];
while ((sm = sectionRe.exec(text))) sections.push({ pos: sm.index, name: sm[1] });

while ((m = re.exec(text))) {
  const pos = m.index;
  // nearest section before pos
  for (const s of sections) if (s.pos < pos) section = s.name;
  const body = m[1].trim();
  // extract tikzpicture inside example
  const tikzMatch = body.match(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/);
  const source = tikzMatch ? tikzMatch[0] : body.slice(0, 2000);
  entries.push({ id: `pgf-${String(idx++).padStart(4, "0")}`, section, source, tags: [] });
}

mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(resolve(out), JSON.stringify(entries, null, 2));
console.log(`Extracted ${entries.length} codeexample blocks -> ${out}`);
