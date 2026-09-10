// PGF basic layer stub — Phase 5+
// Exports soft-path builder for future phases.
export class SoftPath {
  segments: import("../render/displayList.ts").PathSegment[] = [];
  moveTo(x: number, y: number): this { this.segments.push({ kind: "moveTo", to: new (awaitVec2())(x,y) }); return this; }
}

function awaitVec2() {
  // lazy to avoid bundling issues; replaced by real import when pgf layer is implemented
  return (globalThis as unknown as { Vec2: typeof import("../geometry/vec2.ts").Vec2 }).Vec2 ?? class { constructor(public x:number, public y:number){} } as unknown as typeof import("../geometry/vec2.ts").Vec2;
}
