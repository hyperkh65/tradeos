// pdfjs-dist가 Node.js에서 DOMMatrix를 요구하므로 폴리필 (app/api/shipments/parse-bl/route.ts와
// 동일한 필요성 — pdfjs-dist를 쓰는 서버쪽 모듈은 전부 이 파일을 side-effect import한다.
if (typeof globalThis.DOMMatrix === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor(init?: number[] | string) {
      if (Array.isArray(init) && init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    multiply(o: any) {
      const r = new (globalThis as any).DOMMatrix();
      r.a = this.a * o.a + this.b * o.c; r.b = this.a * o.b + this.b * o.d;
      r.c = this.c * o.a + this.d * o.c; r.d = this.c * o.b + this.d * o.d;
      r.e = this.e * o.a + this.f * o.c + o.e; r.f = this.e * o.b + this.f * o.d + o.f;
      return r;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transformPoint(p: any) {
      return { x: (p.x ?? 0) * this.a + (p.y ?? 0) * this.c + this.e, y: (p.x ?? 0) * this.b + (p.y ?? 0) * this.d + this.f };
    }
    translate(tx = 0, ty = 0) {
      return new (globalThis as any).DOMMatrix([this.a, this.b, this.c, this.d, this.e + tx, this.f + ty]);
    }
    scale(sx = 1, sy = 1) {
      return new (globalThis as any).DOMMatrix([this.a * sx, this.b * sx, this.c * sy, this.d * sy, this.e, this.f]);
    }
  };
}
