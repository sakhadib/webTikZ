/**
 * TeX point is internal unit: 1 pt = 1/72.27 in.
 * Canvas CSS px = 1/96 in => 1 pt = 96/72.27 px ≈ 1.3284
 */
export const PT_PER_IN = 72.27;
export const PX_PER_IN = 96;
export const PX_PER_PT = PX_PER_IN / PT_PER_IN; // ~1.328
export const PT_PER_PX = 1 / PX_PER_PT;
export const PT_PER_CM = PT_PER_IN / 2.54; // ≈28.45275
export const PT_PER_MM = PT_PER_CM / 10;

export type Unit = "pt" | "bp" | "mm" | "cm" | "in" | "pc" | "em" | "ex" | "px";

const TO_PT: Record<string, number> = {
  pt: 1,
  bp: PT_PER_IN / 72, // big point 1/72 in
  mm: PT_PER_MM,
  cm: PT_PER_CM,
  in: PT_PER_IN,
  pc: 12, // pica =12pt
  em: 10, // fallback; caller should supply font-relative
  ex: 4.3,
  px: PT_PER_PX,
};

export function toPt(value: number, unit: Unit | string, emPt = 10, exPt = 4.3): number {
  if (unit === "em") return value * emPt;
  if (unit === "ex") return value * exPt;
  const f = TO_PT[unit];
  if (f === undefined) throw new Error(`Unknown unit: ${unit}`);
  return value * f;
}

export function ptToPx(pt: number): number {
  return pt * PX_PER_PT;
}
export function pxToPt(px: number): number {
  return px * PT_PER_PX;
}
