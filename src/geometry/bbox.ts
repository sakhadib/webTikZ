import { Vec2 } from "./vec2.ts";

export class BBox {
  constructor(
    public minX: number = Infinity,
    public minY: number = Infinity,
    public maxX: number = -Infinity,
    public maxY: number = -Infinity,
  ) {}

  static empty(): BBox {
    return new BBox();
  }
  static fromPoints(points: Vec2[]): BBox {
    const b = new BBox();
    for (const p of points) b.addPoint(p);
    return b;
  }
  static fromRect(x: number, y: number, w: number, h: number): BBox {
    return new BBox(x, y, x + w, y + h);
  }

  get isEmpty(): boolean {
    return this.minX === Infinity;
  }
  get width(): number {
    return this.isEmpty ? 0 : this.maxX - this.minX;
  }
  get height(): number {
    return this.isEmpty ? 0 : this.maxY - this.minY;
  }
  get center(): Vec2 {
    return new Vec2((this.minX + this.maxX) / 2, (this.minY + this.maxY) / 2);
  }

  addPoint(p: Vec2): this {
    if (p.x < this.minX) this.minX = p.x;
    if (p.y < this.minY) this.minY = p.y;
    if (p.x > this.maxX) this.maxX = p.x;
    if (p.y > this.maxY) this.maxY = p.y;
    return this;
  }

  addBBox(other: BBox): this {
    if (other.isEmpty) return this;
    this.addPoint(new Vec2(other.minX, other.minY));
    this.addPoint(new Vec2(other.maxX, other.maxY));
    return this;
  }

  expand(margin: number): this {
    if (this.isEmpty) return this;
    this.minX -= margin;
    this.minY -= margin;
    this.maxX += margin;
    this.maxY += margin;
    return this;
  }

  union(other: BBox): BBox {
    if (this.isEmpty) return other.clone();
    if (other.isEmpty) return this.clone();
    return new BBox(
      Math.min(this.minX, other.minX),
      Math.min(this.minY, other.minY),
      Math.max(this.maxX, other.maxX),
      Math.max(this.maxY, other.maxY),
    );
  }

  intersect(other: BBox): BBox | null {
    const mnX = Math.max(this.minX, other.minX);
    const mnY = Math.max(this.minY, other.minY);
    const mxX = Math.min(this.maxX, other.maxX);
    const mxY = Math.min(this.maxY, other.maxY);
    if (mnX > mxX || mnY > mxY) return null;
    return new BBox(mnX, mnY, mxX, mxY);
  }

  contains(p: Vec2): boolean {
    return p.x >= this.minX && p.x <= this.maxX && p.y >= this.minY && p.y <= this.maxY;
  }

  clone(): BBox {
    return new BBox(this.minX, this.minY, this.maxX, this.maxY);
  }

  equals(other: BBox, eps = 1e-9): boolean {
    if (this.isEmpty && other.isEmpty) return true;
    return (
      Math.abs(this.minX - other.minX) <= eps &&
      Math.abs(this.minY - other.minY) <= eps &&
      Math.abs(this.maxX - other.maxX) <= eps &&
      Math.abs(this.maxY - other.maxY) <= eps
    );
  }

  toString(): string {
    if (this.isEmpty) return "BBox(empty)";
    return `BBox(${this.minX},${this.minY} -> ${this.maxX},${this.maxY})`;
  }

  toJSON(): [number, number, number, number] | null {
    if (this.isEmpty) return null;
    return [this.minX, this.minY, this.maxX, this.maxY];
  }
}
