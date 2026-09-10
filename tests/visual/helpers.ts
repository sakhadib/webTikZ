/**
 * Image diff helper: compare rendered canvas vs reference PNG.
 * Uses pixelmatch. Threshold per test is configurable.
 */
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";

export function diffPng(aPath: string, bPath: string, threshold = 0.1): { diffPixels: number; diffRatio: number } {
  const a = PNG.sync.read(readFileSync(aPath));
  const b = PNG.sync.read(readFileSync(bPath));
  if (a.width !== b.width || a.height !== b.height) throw new Error(`size mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold });
  return { diffPixels: n, diffRatio: n / (a.width * a.height) };
}
