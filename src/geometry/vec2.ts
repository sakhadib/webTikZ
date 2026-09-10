/** 2D vector in TeX points (pt). */
export class Vec2 {
  constructor(
    public readonly x: number,
    public readonly y: number,
  ) {}

  static readonly ZERO = new Vec2(0, 0);
  static readonly X = new Vec2(1, 0);
  static readonly Y = new Vec2(0, 1);

  add(v: Vec2): Vec2 {
    return new Vec2(this.x + v.x, this.y + v.y);
  }
  sub(v: Vec2): Vec2 {
    return new Vec2(this.x - v.x, this.y - v.y);
  }
  scale(s: number): Vec2 {
    return new Vec2(this.x * s, this.y * s);
  }
  mul(v: Vec2): Vec2 {
    return new Vec2(this.x * v.x, this.y * v.y);
  }
  dot(v: Vec2): number {
    return this.x * v.x + this.y * v.y;
  }
  cross(v: Vec2): number {
    return this.x * v.y - this.y * v.x;
  }
  len(): number {
    return Math.hypot(this.x, this.y);
  }
  len2(): number {
    return this.x * this.x + this.y * this.y;
  }
  norm(): Vec2 {
    const l = this.len();
    return l === 0 ? Vec2.ZERO : new Vec2(this.x / l, this.y / l);
  }
  perp(): Vec2 {
    return new Vec2(-this.y, this.x);
  }
  lerp(v: Vec2, t: number): Vec2 {
    return new Vec2(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t);
  }
  angle(): number {
    return Math.atan2(this.y, this.x);
  }
  rotate(rad: number): Vec2 {
    const c = Math.cos(rad),
      s = Math.sin(rad);
    return new Vec2(this.x * c - this.y * s, this.x * s + this.y * c);
  }
  equals(v: Vec2, eps = 1e-9): boolean {
    return Math.abs(this.x - v.x) <= eps && Math.abs(this.y - v.y) <= eps;
  }
  toString(): string {
    return `(${this.x},${this.y})`;
  }
  toArray(): [number, number] {
    return [this.x, this.y];
  }
  static fromArray([x, y]: [number, number]): Vec2 {
    return new Vec2(x, y);
  }
  static polar(r: number, deg: number): Vec2 {
    const rad = (deg * Math.PI) / 180;
    return new Vec2(r * Math.cos(rad), r * Math.sin(rad));
  }
}
