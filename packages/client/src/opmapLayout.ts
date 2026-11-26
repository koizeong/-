/**
 * 戦役地図の描く位置のほどき。地域が数十 km の内に集まると(港と飛行場、包囲の内と外)、丸・札・名前が重なって読めない。
 * 地域ごとに名前の幅の箱を作り、重なった組を少ないほうの向き(横か縦)へ押し離すことを繰り返す。もとの位置へ弱く引き戻すので、
 * 東西・南北の並びはおおむね保つ。横は地図の幅に収め、縦は足りなければ地図を高くする。乱数は使わない(毎回同じ形)
 */

/** 地図に出す短い名前:括弧の前まで(全体の名前はマウスを載せると出す) */
export function shortRegionName(name: string): string {
  const i = name.search(/[((]/);
  const s = i > 0 ? name.slice(0, i) : name;
  return s.length > 14 ? `${s.slice(0, 13)}…` : s;
}

export interface LayoutBox {
  id: string;
  x: number;
  y: number;
  /** 名前の文字数(箱の幅を決める) */
  label: number;
}

const FONT = 15;
/** 丸と名前を合わせた箱の縦の大きさ(丸の上の札の分も少し見込む) */
const BOX_H = 84;
const GAP = 8;
const ITER = 1200;
const PULL = 0.01;

/** 箱の半分の幅 */
export const halfWidth = (label: number) => Math.max(36, (label * FONT) / 2 + GAP / 2);

/**
 * 重なりをほどいた位置を返す(id → 位置)と、地図の高さ。W は地図の幅、pad は縁の余白。
 * 入力の y は下向き(SVG の座標)
 */
export function relaxLayout(boxes: LayoutBox[], W: number, pad: number): { pos: Record<string, { x: number; y: number }>; height: number } {
  const p = boxes.map((b) => ({ x: b.x, y: b.y, hw: halfWidth(b.label) }));
  const home = boxes.map((b) => ({ x: b.x, y: b.y }));
  const minX = (i: number) => pad + Math.min(p[i]!.hw, (W - 2 * pad) / 2) - 30;
  const maxX = (i: number) => W - pad - Math.min(p[i]!.hw, (W - 2 * pad) / 2) + 30;
  for (let it = 0; it < ITER; it++) {
    let moved = false;
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        const a = p[i]!;
        const b = p[j]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        if (dx === 0 && dy === 0) {
          // 同じ所:もとの位置の並びで向きを決める(それも同じなら番号で)
          dx = home[j]!.x - home[i]!.x || j - i;
          dy = home[j]!.y - home[i]!.y;
        }
        // 箱を楕円とみなし、2つの真ん中を結ぶ向きに要る間合いを出す(横は名前の幅、縦は丸と名前の高さ)
        const d = Math.hypot(dx, dy);
        const ux = dx / d;
        const uy = dy / d;
        const need = 1 / Math.hypot(ux / (a.hw + b.hw), uy / BOX_H);
        const cur = Math.hypot(b.x - a.x, b.y - a.y);
        if (cur >= need) continue;
        moved = true;
        // 結ぶ向きのまま押し離す(東西・南北の向きを保つ)
        const push = (need - cur) / 2;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
      }
    }
    for (let i = 0; i < p.length; i++) {
      const q = p[i]!;
      q.x += (home[i]!.x - q.x) * PULL;
      q.y += (home[i]!.y - q.y) * PULL;
      q.x = Math.min(maxX(i), Math.max(minX(i), q.x));
    }
    if (!moved && it > 0) break;
  }
  // 縦は上の縁に合わせてずらし、足りない分だけ地図を高くする
  const top = Math.min(...p.map((q) => q.y));
  const bottom = Math.max(...p.map((q) => q.y));
  const shift = pad - top;
  const pos: Record<string, { x: number; y: number }> = {};
  boxes.forEach((b, i) => (pos[b.id] = { x: p[i]!.x, y: p[i]!.y + shift }));
  return { pos, height: bottom - top + 2 * pad };
}
