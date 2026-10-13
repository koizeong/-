/**
 * シード付き乱数(sfc32)。sim-core で使ってよい乱数はこれだけ。
 * 状態は4つの32bit整数で、保存・再生のためにそのまま取り出して復元できる。
 */
export type RngState = readonly [number, number, number, number];

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  private constructor(state: RngState) {
    [this.a, this.b, this.c, this.d] = state;
  }

  /** 整数シードから生成する。同じシードなら必ず同じ列になる。 */
  static fromSeed(seed: number): Rng {
    const s = seed >>> 0;
    const rng = new Rng([0x9e3779b9, 0x243f6a88, 0xb7e15162, s]);
    // 初期状態の偏りを捨てる
    for (let i = 0; i < 15; i++) rng.nextUint32();
    return rng;
  }

  static fromState(state: RngState): Rng {
    return new Rng(state);
  }

  getState(): RngState {
    return [this.a, this.b, this.c, this.d];
  }

  nextUint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** [0, 1) の一様乱数 */
  next(): number {
    return this.nextUint32() / 4294967296;
  }

  /** [min, max) の一様乱数 */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** 1 ± spread の倍率。戦闘解決の「±10〜20%の揺らぎ」に使う。 */
  spread(spread: number): number {
    return this.range(1 - spread, 1 + spread);
  }
}
