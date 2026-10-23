import type { SideReplay, Vec2 } from "@brigade/sim-core";

/**
 * 戦場の雰囲気を出す演出(表示だけ。ルールには関わらない)。
 * 再生中の航空機(空襲・近接航空支援・補給線への攻撃・制空任務と空戦・航空偵察・空挺降下と空輸・対空砲火)、
 * 着弾の煙、発砲の閃光、燃える残骸、天候(雨・雪・霧・曇り・地面の積雪とぬかるみ)、夜と暗い時間の暗さ
 */

/** 決まった値から 0〜1 の擬似乱数(毎フレーム同じ形になるように) */
export function h01(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const norm = (v: Vec2): Vec2 => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};
const add = (a: Vec2, b: Vec2, k = 1): Vec2 => ({ x: a.x + b.x * k, y: a.y + b.y * k });

export type PlaneKind = "fighter" | "attack" | "transport" | "recon";

/** 1機の位置と向き(世界座標。heading は北0・時計回りの度)。falling は撃墜されて落ちている */
interface PlaneAt {
  pos: Vec2;
  heading: number;
  falling?: number;
}

/** 飛んでいる編隊(時刻 t0〜t1 の間だけ描く) */
export interface Sortie {
  kind: PlaneKind;
  own: boolean;
  t0: number;
  t1: number;
  count: number;
  /** 時刻 t の i 番目の機の位置 */
  at: (t: number, i: number) => PlaneAt | null;
  /** 落下傘を落とす地点と時刻(空挺・空輸) */
  drop?: { pos: Vec2; t: number; n: number };
}

/** 2点の間をまっすぐ飛ぶ。k は 0〜1 */
function straight(a: Vec2, b: Vec2, k: number): PlaneAt {
  return { pos: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, heading: headingOf(b.x - a.x, b.y - a.y) };
}
const headingOf = (dx: number, dy: number) => (Math.atan2(dx, dy) * 180) / Math.PI;

/** 編隊の中の i 番目の機のずれ(楔形。進む向きの後ろへ広がる) */
function slot(p: PlaneAt, i: number, spacing: number): PlaneAt {
  if (i === 0) return p;
  const r = (p.heading * Math.PI) / 180;
  const back = { x: -Math.sin(r), y: -Math.cos(r) };
  const side = { x: Math.cos(r), y: -Math.sin(r) };
  const row = Math.ceil(i / 2);
  const s = i % 2 === 1 ? 1 : -1;
  return { ...p, pos: add(add(p.pos, back, row * spacing), side, s * row * spacing) };
}

export interface SortieInput {
  rp: SideReplay;
  tStart: number;
  tEnd: number;
  /** 自陣営の後方の向き(単位ベクトル。自軍の機はこちらから来て、こちらへ帰る) */
  home: Vec2;
  widthM: number;
  heightM: number;
  /** 空域のキー("列,行")→ 中心と大きさ(世界座標) */
  sector: (key: string) => { c: Vec2; w: number; h: number };
}

/** 再生の記録から、飛ぶ編隊を組み立てる(ターンごとに1回) */
export function buildSorties({ rp, tStart, tEnd, home, widthM, heightM, sector }: SortieInput): Sortie[] {
  const span = Math.max(600, tEnd - tStart);
  const far = Math.max(widthM, heightM) * 0.75;
  const approach = span * 0.16;
  const out: Sortie[] = [];
  const clampT = (t: number) => Math.min(tEnd - span * 0.25, Math.max(tStart + span * 0.12, t));

  // 空襲・近接航空支援・補給線への攻撃:着弾(空)を、陣営と場所ごとにまとめて1つの攻撃にする
  const groups: { own: boolean; pos: Vec2; t0: number; t1: number; n: number }[] = [];
  for (const im of rp.impacts) {
    if (im.kind !== "air") continue;
    const g = groups.find((x) => x.own === im.own && Math.hypot(x.pos.x - im.x, x.pos.y - im.y) < 2500 && im.t - x.t1 <= 600);
    if (g) {
      g.t1 = Math.max(g.t1, im.t);
      g.n++;
    } else groups.push({ own: im.own, pos: { x: im.x, y: im.y }, t0: im.t, t1: im.t, n: 1 });
  }
  groups.forEach((gr, gi) => {
    const dir = gr.own ? home : { x: -home.x, y: -home.y };
    const perp = { x: -dir.y, y: dir.x };
    const seed = gi * 31 + Math.round(gr.pos.x);
    const T = gr.pos;
    const start = add(add(T, dir, far), perp, (h01(seed) - 0.5) * far * 0.6);
    const loiterR = 700 + h01(seed + 1) * 500;
    const t0 = gr.t0 - approach;
    const t1 = gr.t1 + approach;
    const exitTo = add(add(T, dir, far), perp, (h01(seed + 2) - 0.5) * far);
    out.push({
      kind: "attack",
      own: gr.own,
      t0,
      t1,
      count: 3,
      at: (t, i) => {
        // 進入 → 目標の上を回って急降下を繰り返す → 帰投
        const lag = i * 40;
        const tt = t - lag;
        if (tt < t0) return null;
        if (tt < gr.t0) return straight(start, T, (tt - t0) / approach);
        if (tt <= gr.t1) {
          const a = ((tt - gr.t0) / 240) * Math.PI * 2 + i * 2.1;
          const pos = { x: T.x + Math.cos(a) * loiterR, y: T.y + Math.sin(a) * loiterR };
          return { pos, heading: headingOf(-Math.sin(a), Math.cos(a)) };
        }
        const k = (tt - gr.t1) / approach;
        if (k > 1) return null;
        const a = ((gr.t1 - gr.t0) / 240) * Math.PI * 2 + i * 2.1;
        const from = { x: T.x + Math.cos(a) * loiterR, y: T.y + Math.sin(a) * loiterR };
        return straight(from, exitTo, k);
      },
    });
  });

  // 制空任務と空戦:空域の中心を戦闘機が旋回する。空戦なら敵の戦闘機も入り乱れ、失った編隊の数だけ味方が落ちる
  const fights = new Map<string, number>();
  for (const e of rp.hqEvents) if (e.type === "dogfight") fights.set(e.sector, (fights.get(e.sector) ?? 0) + e.lostGroups);
  const patrolled = new Set<string>();
  for (const e of rp.hqEvents) if (e.type === "airSuperiority") patrolled.add(e.sector);
  for (const key of new Set([...patrolled, ...fights.keys()])) {
    const sc = sector(key);
    const r = Math.min(sc.w, sc.h) * 0.22;
    const lost = fights.get(key) ?? 0;
    const fought = fights.has(key);
    const t0 = tStart + span * 0.05;
    const t1 = tEnd - span * 0.05;
    const orbit = (own: boolean, phase: number) => (t: number, i: number): PlaneAt | null => {
      if (t < t0 || t > t1) return null;
      const dirSign = own ? 1 : -1;
      const a = dirSign * ((t - t0) / 300) * Math.PI * 2 + phase + i * ((Math.PI * 2) / 4);
      const rr = r * (0.7 + 0.3 * Math.sin(a * 1.7 + i));
      const pos = { x: sc.c.x + Math.cos(a) * rr, y: sc.c.y + Math.sin(a) * rr * 0.8 };
      const heading = headingOf(-Math.sin(a) * dirSign, Math.cos(a) * dirSign * 0.8);
      // 撃墜:空戦の中ほどで、失った数だけ味方の機が煙を引いて落ちる
      const downAt = t0 + (t1 - t0) * (0.35 + 0.15 * i);
      if (own && fought && i < Math.min(lost, 3) && t > downAt) {
        const k = (t - downAt) / 240;
        if (k > 1) return null;
        return { pos: add(pos, { x: 0, y: -1 }, k * r * 0.3), heading: heading + k * 300, falling: k };
      }
      return { pos, heading };
    };
    out.push({ kind: "fighter", own: true, t0, t1, count: 4, at: orbit(true, h01(key.length) * 6) });
    if (fought) out.push({ kind: "fighter", own: false, t0, t1, count: 4, at: orbit(false, 1.3) });
  }

  // 航空偵察:1機が目標の上を通り抜ける
  rp.hqEvents.forEach((e, ei) => {
    if (e.type !== "airRecon") return;
    const tc = clampT(e.t);
    const perp = { x: -home.y, y: home.x };
    const a = add(add(e.target, home, far), perp, far * 0.3);
    const b = add(add(e.target, home, -far * 0.6), perp, -far * 0.2);
    const ta = tc - approach;
    const tb = tc + approach;
    out.push({ kind: "recon", own: true, t0: ta, t1: tb, count: 1, at: (t) => (t < ta || t > tb ? null : straight(a, b, (t - ta) / (tb - ta))) });
    void ei;
  });

  // 空挺降下・空輸:輸送機の編隊が地点の上を通り、落下傘を落として帰る
  rp.hqEvents.forEach((e, ei) => {
    if (e.type !== "airborneLanded" && e.type !== "airDrop") return;
    const at = e.type === "airborneLanded" ? e.at : e.target;
    const tc = clampT(e.t) + ei * 60;
    const exitDir = norm({ x: home.x + home.y * 0.8, y: home.y - home.x * 0.8 });
    const a = add(at, home, far);
    const b = add(at, exitDir, far);
    const ta = tc - approach;
    const tb = tc + approach;
    const n = e.type === "airborneLanded" ? 6 : 3;
    out.push({
      kind: "transport",
      own: true,
      t0: ta,
      t1: tb,
      count: n,
      at: (t, i) => {
        const tt = t - i * 25;
        if (tt < ta || tt > tb) return null;
        return tt < tc ? straight(a, at, (tt - ta) / approach) : straight(at, b, (tt - tc) / approach);
      },
      drop: { pos: at, t: tc, n: e.type === "airborneLanded" ? 18 : 6 },
    });
  });

  return out;
}

/** 機の影絵(画面座標・px)。heading は画面の上が北 */
function planeShape(g: CanvasRenderingContext2D, kind: PlaneKind, x: number, y: number, heading: number, size: number) {
  g.save();
  g.translate(x, y);
  g.rotate((heading * Math.PI) / 180);
  const s = size / 20;
  g.scale(s, s);
  g.beginPath();
  if (kind === "transport") {
    // 双発の輸送機:長い直線翼
    g.ellipse(0, 0, 2.6, 11, 0, 0, Math.PI * 2);
    g.moveTo(-14, -1);
    g.lineTo(14, -1);
    g.lineTo(14, 2);
    g.lineTo(-14, 2);
    g.closePath();
    g.moveTo(-5, 8.5);
    g.lineTo(5, 8.5);
    g.lineTo(5, 10.5);
    g.lineTo(-5, 10.5);
    g.closePath();
  } else {
    // 単発機:胴体・主翼(戦闘機は少し後退、攻撃機は太い)・尾翼
    const wing = kind === "attack" ? 11 : 10;
    const chord = kind === "attack" ? 4 : 3;
    g.ellipse(0, 0, kind === "attack" ? 2 : 1.6, 9, 0, 0, Math.PI * 2);
    g.moveTo(-wing, 0);
    g.lineTo(wing, 0);
    g.lineTo(wing - 1, chord);
    g.lineTo(-wing + 1, chord);
    g.closePath();
    g.moveTo(-4, 7);
    g.lineTo(4, 7);
    g.lineTo(3.5, 9);
    g.lineTo(-3.5, 9);
    g.closePath();
  }
  g.fill();
  g.restore();
}

export interface DrawCtx {
  g: CanvasRenderingContext2D;
  S: (p: Vec2) => Vec2;
  t: number;
  ownColor: string;
  enemyColor: string;
}

const PLANE_PX: Record<PlaneKind, number> = { fighter: 15, attack: 18, recon: 15, transport: 26 };

/** 編隊を描く(影 → 機体 → 撃墜の煙)。落下傘も */
export function drawSorties(d: DrawCtx, sorties: Sortie[]) {
  const { g, S, t } = d;
  for (const so of sorties) {
    if (t < so.t0 - 300 || t > so.t1 + 300) continue;
    const color = so.own ? d.ownColor : d.enemyColor;
    // 落下傘(地点の上、落としてからゆっくり降りる)
    if (so.drop && t >= so.drop.t && t <= so.drop.t + 900) {
      const k = (t - so.drop.t) / 900;
      for (let i = 0; i < so.drop.n; i++) {
        const p = S({ x: so.drop.pos.x + (h01(i * 3 + 1) - 0.5) * 900, y: so.drop.pos.y + (h01(i * 7 + 2) - 0.5) * 900 });
        const r = 4 + 2 * (1 - k);
        const off = (1 - k) * 18; // 高いほど上にずれて見える
        g.globalAlpha = Math.min(1, (1 - k) * 2.5);
        g.fillStyle = "#f4f1e6";
        g.strokeStyle = "#555";
        g.lineWidth = 1;
        g.beginPath();
        g.arc(p.x, p.y - off, r, Math.PI, 0);
        g.closePath();
        g.fill();
        g.stroke();
        g.beginPath();
        g.moveTo(p.x - r, p.y - off);
        g.lineTo(p.x, p.y - off + r + 3);
        g.lineTo(p.x + r, p.y - off);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    for (let i = 0; i < so.count; i++) {
      const pl = so.at(t, i);
      if (!pl) continue;
      // 攻撃機・輸送機は少しずつ遅れて同じ道をたどる(一列で進入する)。ほかはそれぞれの位置
      const placed = so.kind === "recon" ? slot(pl, i, 300) : pl;
      const p = S(placed.pos);
      const size = PLANE_PX[so.kind];
      const alt = placed.falling !== undefined ? 14 * (1 - placed.falling) : so.kind === "transport" ? 22 : 16;
      // 影(高さの分だけ右下にずらす)
      g.fillStyle = "rgba(20, 20, 20, 0.22)";
      planeShape(g, so.kind, p.x + alt * 0.6, p.y + alt, placed.heading, size);
      // 撃墜の黒煙
      if (placed.falling !== undefined) {
        for (let j = 0; j < 6; j++) {
          g.fillStyle = `rgba(40, 40, 40, ${0.35 * (1 - j / 6)})`;
          g.beginPath();
          g.arc(p.x + j * 3, p.y - j * 4, 3 + j, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.fillStyle = "#2b2b2b";
      planeShape(g, so.kind, p.x, p.y, placed.heading, size + 2);
      g.fillStyle = color;
      planeShape(g, so.kind, p.x, p.y, placed.heading, size);
    }
  }
  // 空戦の曳光:敵味方の機が近いときに短い線
  const fighters = sorties.filter((x) => x.kind === "fighter");
  const mine = fighters.filter((x) => x.own);
  const theirs = fighters.filter((x) => !x.own);
  if (mine.length && theirs.length) {
    g.lineWidth = 1.2;
    for (const a of mine)
      for (const b of theirs)
        for (let i = 0; i < a.count; i++) {
          const pa = a.at(t, i);
          const pb = b.at(t, i);
          if (!pa || !pb || pa.falling !== undefined) continue;
          if (h01(Math.floor(t / 20) + i * 13) > 0.45) continue;
          const sa = S(pa.pos);
          const sb = S(pb.pos);
          g.strokeStyle = h01(Math.floor(t / 20) + i) > 0.5 ? "#ffe36b" : "#ff9a5a";
          g.beginPath();
          g.moveTo(sa.x, sa.y);
          g.lineTo(sa.x + (sb.x - sa.x) * 0.6, sa.y + (sb.y - sa.y) * 0.6);
          g.stroke();
        }
  }
}

/** 対空砲火の弾幕(目標の上に黒い煙の玉がはじける) */
export function drawFlak(d: DrawCtx, rp: SideReplay, tStart: number, tEnd: number) {
  const { g, S, t } = d;
  const span = tEnd - tStart;
  rp.hqEvents.forEach((e, ei) => {
    if (e.type !== "flak") return;
    const tc = Math.min(tEnd - span * 0.25, Math.max(tStart + span * 0.12, e.t));
    const from = tc - span * 0.1;
    const to = tc + span * 0.25;
    if (t < from || t > to) return;
    for (let i = 0; i < 14; i++) {
      const born = from + h01(ei * 50 + i) * (to - from);
      const age = t - born;
      if (age < 0 || age > 200) continue;
      const k = age / 200;
      const p = S({ x: e.target.x + (h01(i * 5 + ei) - 0.5) * 2200, y: e.target.y + (h01(i * 9 + ei + 1) - 0.5) * 2200 });
      if (k < 0.12) {
        g.fillStyle = "rgba(255, 200, 90, 0.9)";
        g.beginPath();
        g.arc(p.x, p.y, 3, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = `rgba(35, 35, 35, ${0.55 * (1 - k)})`;
      g.beginPath();
      g.arc(p.x, p.y, 3 + k * 7, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** 風(煙が流れる向き。東北東へ少しずつ) */
const WIND: Vec2 = { x: 0.9, y: 0.35 };

/** 着弾の煙:落ちてからしばらく、膨らみながら風に流れて薄れる(世界座標の m で動き、画面の px で描く) */
export function drawImpactSmoke(d: DrawCtx, rp: SideReplay, scale: number, lingerSec: number) {
  const { g, S, t } = d;
  for (let n = 0; n < rp.impacts.length; n++) {
    const im = rp.impacts[n]!;
    const age = t - im.t;
    if (age < 0 || age > lingerSec) continue;
    const k = age / lingerSec;
    const drift = age * 0.9; // m
    for (let i = 0; i < 3; i++) {
      const jx = (h01(n * 7 + i) - 0.5) * im.radiusM * 1.2;
      const jy = (h01(n * 11 + i + 3) - 0.5) * im.radiusM * 1.2;
      const p = S({ x: im.x + jx + WIND.x * drift, y: im.y + jy + WIND.y * drift });
      const r = Math.max(3, (im.radiusM * 0.25 + age * 0.35) * scale) + 2;
      const shade = im.kind === "air" ? 45 : 90;
      g.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${0.32 * (1 - k)})`;
      g.beginPath();
      g.arc(p.x, p.y, r, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** 発砲の閃光(撃った側の位置に、撃った直後だけ小さな光) */
export function drawMuzzleFlashes(d: DrawCtx, rp: SideReplay, stepSec: number) {
  const { g, S, t } = d;
  for (let n = 0; n < rp.shots.length; n++) {
    const sh = rp.shots[n]!;
    const age = t - sh.t;
    if (age < 0 || age > stepSec * 0.5) continue;
    const k = 1 - age / (stepSec * 0.5);
    const p = S(sh.from);
    const ox = (h01(n) - 0.5) * 10;
    const oy = (h01(n + 9) - 0.5) * 10;
    g.fillStyle = `rgba(255, 245, 200, ${0.9 * k})`;
    g.beginPath();
    g.arc(p.x + ox, p.y + oy, 1.5 + 2.5 * k, 0, Math.PI * 2);
    g.fill();
  }
}

/** 燃える残骸:揺れる炎と立ちのぼる黒煙(now は演出の時計・ミリ秒) */
export function drawWreck(g: CanvasRenderingContext2D, x: number, y: number, now: number, seed: number) {
  const tt = now / 1000;
  for (let i = 0; i < 5; i++) {
    const life = (tt * 0.45 + h01(seed + i)) % 1;
    const px = x + life * 14 + Math.sin(tt * 1.3 + i) * 2;
    const py = y - 4 - life * 26;
    g.fillStyle = `rgba(45, 42, 40, ${0.42 * (1 - life)})`;
    g.beginPath();
    g.arc(px, py, 3 + life * 7, 0, Math.PI * 2);
    g.fill();
  }
  const fl = 0.75 + 0.25 * Math.sin(tt * 9 + seed);
  g.fillStyle = `rgba(255, 140, 30, ${0.85 * fl})`;
  g.beginPath();
  g.ellipse(x, y - 2, 3.5, 5 * fl, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = `rgba(255, 230, 120, ${0.9 * fl})`;
  g.beginPath();
  g.ellipse(x, y - 1, 1.6, 2.6 * fl, 0, 0, Math.PI * 2);
  g.fill();
}

/** 地面の積雪とぬかるみ(地形の上に薄く) */
export function drawGround(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ground: { mud: number; snow: number } | undefined) {
  if (!ground) return;
  if (ground.snow > 0.02) {
    g.fillStyle = `rgba(250, 252, 255, ${Math.min(0.55, ground.snow * 0.6)})`;
    g.fillRect(x, y, w, h);
  }
  if (ground.mud > 0.02) {
    g.fillStyle = `rgba(110, 80, 45, ${Math.min(0.25, ground.mud * 0.3)})`;
    g.fillRect(x, y, w, h);
  }
}

/** 夜・暗い時間の暗さ。lights の地点(画面座標・半径 px)だけ明るく抜く */
export function drawDarkness(g: CanvasRenderingContext2D, w: number, h: number, alpha: number, lights: { x: number; y: number; r: number; k: number }[]) {
  if (alpha <= 0) return;
  const c = document.createElement("canvas");
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  const o = c.getContext("2d")!;
  o.fillStyle = `rgba(8, 16, 40, ${alpha})`;
  o.fillRect(0, 0, w, h);
  o.globalCompositeOperation = "destination-out";
  for (const l of lights) {
    const gr = o.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
    gr.addColorStop(0, `rgba(0,0,0,${0.9 * l.k})`);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    o.fillStyle = gr;
    o.beginPath();
    o.arc(l.x, l.y, l.r, 0, Math.PI * 2);
    o.fill();
  }
  g.drawImage(c, 0, 0, w, h);
}

/** 霧・曇りのかすみ(地形の上、部隊の下に。部隊は読めるままにする。now は演出の時計・ミリ秒) */
export function drawHaze(g: CanvasRenderingContext2D, w: number, h: number, weather: string, now: number) {
  const tt = now / 1000;
  if (weather === "fog") {
    g.fillStyle = "rgba(232, 236, 238, 0.3)";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) {
      const x = ((h01(i) * w + tt * 8 * (1 + h01(i + 1))) % (w + 400)) - 200;
      const y = h01(i + 4) * h;
      const r = 160 + h01(i + 2) * 220;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(240, 243, 245, 0.35)");
      gr.addColorStop(1, "rgba(240, 243, 245, 0)");
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  } else if (weather === "overcast") {
    g.fillStyle = "rgba(60, 70, 85, 0.08)";
    g.fillRect(0, 0, w, h);
  } else if (weather === "rain") {
    g.fillStyle = "rgba(70, 80, 95, 0.1)";
    g.fillRect(0, 0, w, h);
  }
}

/** 降るもの(雨・雪。画面いっぱいに、いちばん上へ薄く。now は演出の時計・ミリ秒) */
export function drawPrecipitation(g: CanvasRenderingContext2D, w: number, h: number, weather: string, now: number) {
  const tt = now / 1000;
  if (weather === "rain") {
    g.strokeStyle = "rgba(90, 110, 140, 0.35)";
    g.lineWidth = 1;
    g.beginPath();
    const n = Math.round((w * h) / 9000);
    for (let i = 0; i < n; i++) {
      const x = ((h01(i) * (w + 100) + tt * 120) % (w + 100)) - 50;
      const y = (h01(i + 0.5) * h + tt * 700 * (0.8 + 0.4 * h01(i + 2))) % h;
      g.moveTo(x, y);
      g.lineTo(x - 3, y + 12);
    }
    g.stroke();
  } else if (weather === "snow") {
    g.fillStyle = "rgba(255, 255, 255, 0.85)";
    const n = Math.round((w * h) / 7000);
    for (let i = 0; i < n; i++) {
      const sp = 30 + 40 * h01(i + 3);
      const x = (h01(i) * w + Math.sin(tt * 0.8 + i) * 12 + tt * 15) % w;
      const y = (h01(i + 0.7) * h + tt * sp) % h;
      g.beginPath();
      g.arc(x, y, 1 + h01(i + 5) * 1.6, 0, Math.PI * 2);
      g.fill();
    }
  }
}
