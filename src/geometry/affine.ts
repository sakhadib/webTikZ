import { Vec2 } from "./vec2.ts";

/**
 * 2D affine transform stored as 2x3 matrix:
 *   [ a c e ]
 *   [ b d f ]
 *   [ 0 0 1 ]
 * Column vectors: x' = a*x + c*y + e, y' = b*x + d*y + f
 */
export class Affine {
  constructor(
    public readonly a: number = 1,
    public readonly b: number = 0,
    public readonly c: number = 0,
    public readonly d: number = 1,
    public readonly e: number = 0,
    public readonly f: number = 0,
  ) {}

  static readonly IDENTITY = new Affine();

  static translation(tx: number, ty: number): Affine {
    return new Affine(1, 0, 0, 1, tx, ty);
  }
  static scaling(sx: number, sy: number = sx): Affine {
    return new Affine(sx, 0, 0, sy, 0, 0);
  }
  static rotation(deg: number): Affine {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad),
      sin = Math.sin(rad);
    return new Affine(cos, sin, -sin, cos, 0, 0);
  }
  static rotationAround(deg: number, center: Vec2): Affine {
    return Affine.translation(center.x, center.y)
      .multiply(Affine.rotation(deg))
      .multiply(Affine.translation(-center.x, -center.y));
  }

  multiply(other: Affine): Affine {
    // this * other  (apply other, then this)
    return new Affine(
      this.a * other.a + this.c * other.b,
      this.b * other.a + this.d * other.b,
      this.a * other.c + this.c * other.d,
      this.b * other.c + this.d * other.d,
      this.a * other.e + this.c * other.f + this.e,
      this.b * other.e + this.d * other.f + this.f,
    );
  }

  apply(p: Vec2): Vec2 {
    return new Vec2(this.a * p.x + this.c * p.y + this.e, this.b * p.x + this.d * p.y + this.f);
  }

  applyVec(v: Vec2): Vec2 {
    // without translation (for vectors / directions)
    return new Vec2(this.a * v.x + this.c * v.y, this.b * v.x + this.d * v.y);
  }

  invert(): Affine {
    const det = this.a * this.d - this.b * this.c;
    if (Math.abs(det) < 1e-12) throw new Error("Affine: non-invertible matrix");
    const invDet = 1 / det;
    const a = this.d * invDet,
      b = -this.b * invDet,
      c = -this.c * invDet,
      d = this.a * invDet;
    const e = -(a * this.e + c * this.f),
      f = -(b * this.e + d * this.f);
    return new Affine(a, b, c, d, e, f);
  }

  isIdentity(eps = 1e-9): boolean {
    return (
      Math.abs(this.a - 1) <= eps &&
      Math.abs(this.b) <= eps &&
      Math.abs(this.c) <= eps &&
      Math.abs(this.d - 1) <= eps &&
      Math.abs(this.e) <= eps &&
      Math.abs(this.f) <= eps
    );
  }

  toCanvasTransform(): [number, number, number, number, number, number] {
    return [this.a, this.b, this.c, this.d, this.e, this.f];
  }

  toString(): string {
    return `Affine([${this.a} ${this.c} ${this.e}; ${this.b} ${this.d} ${this.f}])`;
  }
}
