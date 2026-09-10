/**
 * Headless render of corpus entries for snapshot / visual diff without Docker.
 * Usage: tsx scripts/reference-render.ts --corpus .corpus/index.json --out .reference
 */
import { compile } from "../src/index.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const entries = [{ id: "demo-001", source: "\\begin{tikzpicture}\n  \\draw (0,0) -- (1,1);\n\\end{tikzpicture}" }];
for (const e of entries) {
  const { displayList } = await compile(e.source);
  mkdirSync(".reference", { recursive: true });
  writeFileSync(resolve(`.reference/${e.id}.json`), JSON.stringify(displayList, null, 2));
  console.log(`wrote .reference/${e.id}.json bbox=${JSON.stringify(displayList.bbox)}`);
}
