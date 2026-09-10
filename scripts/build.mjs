import * as esbuild from "esbuild";
import { existsSync, mkdirSync } from "node:fs";

const watch = process.argv.includes("--watch");

const common = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  sourcemap: true,
  target: "es2022",
  logLevel: "info",
};

if (!existsSync("dist")) mkdirSync("dist", { recursive: true });

const builds = [
  // IIFE / UMD — <script> tag, global WebTikZ
  esbuild.context({
    ...common,
    outfile: "dist/webtikz.js",
    format: "iife",
    globalName: "WebTikZ",
    minify: false,
  }),
  esbuild.context({
    ...common,
    outfile: "dist/webtikz.min.js",
    format: "iife",
    globalName: "WebTikZ",
    minify: true,
  }),
  // ESM
  esbuild.context({
    ...common,
    outfile: "dist/webtikz.mjs",
    format: "esm",
    minify: false,
  }),
  esbuild.context({
    ...common,
    outfile: "dist/webtikz.min.mjs",
    format: "esm",
    minify: true,
  }),
];

if (watch) {
  await Promise.all(builds.map((c) => c.then((ctx) => ctx.watch())));
  console.log("watching...");
} else {
  await Promise.all(
    builds.map(async (c) => {
      const ctx = await c;
      await ctx.rebuild();
      await ctx.dispose();
    }),
  );
  console.log("build complete -> dist/");
}
