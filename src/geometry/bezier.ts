import { Vec2 } from "./vec2.ts";
import { BBox } from "./bbox.ts";

export const KAPPA = 0.5522847498307936; // 4/3 * tan(pi/8) — PGF circle approx

/** Cubic Bézier segment p0 -> p3 with controls p1,p2 */
export interface Cubic {
  p0: Vec2;
  p1: Vec2;
  p2: Vec2;
  p3: Vec2;
}

export function cubicPoint(c: Cubic, t: number): Vec2 {
  const mt = 1 - t;
  const mt2 = mt * mt,
    t2 = t * t;
  return new Vec2(
    mt2 * mt * c.p0.x + 3 * mt2 * t * c.p1.x + 3 * mt * t2 * c.p2.x + t2 * t * c.p3.x,
    mt2 * mt * c.p0.y + 3 * mt2 * t * c.p1.y + 3 * mt * t2 * c.p2.y + t2 * t * c.p3.y,
  );
}

export function cubicTangent(c: Cubic, t: number): Vec2 {
  const mt = 1 - t;
  // derivative
  const dx =
    3 * mt * mt * (c.p1.x - c.p0.x) +
    6 * mt * t * (c.p2.x - c.p1.x) +
    3 * t * t * (c.p3.x - c.p2.x);
  const dy =
    3 * mt * mt * (c.p1.y - c.p0.y) +
    6 * mt * t * (c.p2.y - c.p1.y) +
    3 * t * t * (c.p3.y - c.p2.y);
  return new Vec2(dx, dy);
}

export function cubicBBox(c: Cubic): BBox {
  const b = BBox.fromPoints([c.p0, c.p3]);
  // extrema of derivative (solve quadratic for each axis)
  for (const axis of ["x", "y"] as const) {
    const p0 = c.p0[axis],
      p1 = c.p1[axis],
      p2 = c.p2[axis],
      p3 = c.p3[axis];
    const a = -p0 + 3 * p1 - 3 * p2 + p3;
    const b2 = 2 * (p0 - 2 * p1 + p2);
    const cc = -p0 + p1;
    // derivative roots: 3a t^2 + 2 b2? Re-derive: derivative is quadratic.
    // Use standard method: solve 3*a*t^2 + 2*(b)*t + c =0 where...
    // Simpler: numeric: find t where derivative =0 via quadratic formula on axis
    const A = 3 * a;
    const B = 2 * b2;
    const C = cc * 1; // actually coefficient? Let's recompute properly
    // Correct coefficients for derivative /3:
    // d/dt B(t) = 3*(1-t)^2*(p1-p0)+6*(1-t)*t*(p2-p1)+3*t^2*(p3-p2)
    // => divide 3: (1-t)^2*(p1-p0)+2*(1-t)*t*(p2-p1)+t^2*(p3-p2)=0
    // Expand: (p1-p0) -2t(p1-p0)+t^2(p1-p0)+2t(p2-p1)-2t^2(p2-p1)+t^2(p3-p2)=0
    // => t^2*(p1-p0-2p2+2p1+p3-p2)+ t*(-2p1+2p0+2p2-2p1)+ (p1-p0)=0
    // => t^2*(3p1 -3p2 + p3 - p0?) Wait this is messy; do generic quadratic solve numerically
    void A;
    void B;
    void C;
    // Use brute: sample derivative zero via solving with standard formula using a,b,c above is error-prone
    // Fallback: solve using the properly derived coefficients
    const qa = -p0 + 3 * p1 - 3 * p2 + p3;
    const qb = 2 * p0 - 4 * p1 + 2 * p2;
    const qc = -p0 + p1;
    // Actually derivative/3 has coeffs qa*t^2 + qb*t + qc =0 ? Let's test: qb as above
    // Quick numeric fallback: just check t values from quadratic
    const disc = qb * qb - 4 * qa * qc;
    if (Math.abs(qa) < 1e-12) {
      if (Math.abs(qb) > 1e-12) {
        const t = -qc / qb;
        if (t > 0 && t < 1) b.addPoint(cubicPoint(c, t));
      }
    } else if (disc >= 0) {
      const sd = Math.sqrt(disc);
      for (const t of [(-qb + sd) / (2 * qa), (-qb - sd) / (2 * qa)]) {
        if (t > 0 && t < 1) b.addPoint(cubicPoint(c, t));
      }
    }
  }
  return b;
}

export function approximateArcLength(c: Cubic, steps = 20): number {
  let len = 0;
  let prev = c.p0;
  for (let i = 1; i <= steps; i++) {
    const p = cubicPoint(c, i / steps);
    len += p.sub(prev).len();
    prev = p;
  }
  return len;
}

/** Subdivide cubic at t */
export function cubicSplit(c: Cubic, t: number): [Cubic, Cubic] {
  const p01 = c.p0.lerp(c.p1, t);
  const p12 = c.p1.lerp(c.p2, t);
  const p23 = c.p2.lerp(c.p3, t);
  const p012 = p01.lerp(p12, t);
  const p123 = p12.lerp(p23, t);
  const p0123 = p012.lerp(p123, t);
  return [
    { p0: c.p0, p1: p01, p2: p012, p3: p0123 },
    { p0: p0123, p1: p123, p2: p23, p3: c.p3 },
  ];
}
