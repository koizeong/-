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

/** 攻撃機が目標の上を1周する時間(ゲームの秒。1ターン=1時間を数秒で再生するので、目で追える速さにする) */
const LOITER_PERIOD_S = 1200;
/** 戦闘機が空域を1周する時間(ゲームの秒) */
const ORBIT_PERIOD_S = 1500;
/** 撃墜された機が落ちきるまでの時間(ゲームの秒) */
const FALL_S = 600;

/** 再生の記録から、飛ぶ編隊を組み立てる(ターンごとに1回) */
export function buildSorties({ rp, tStart, tEnd, home, widthM, heightM, sector }: SortieInput): Sortie[] {
  const span = Math.max(600, tEnd - tStart);
  // 再生は1ターン(1時間)を数秒で流すので、ゲームの時間のままでは機が速すぎて目で追えない。
  // 進入・離脱の距離を縮めて時間を長く取り、旋回はゆっくり(下の *_PERIOD_S)にする
  const far = Math.max(widthM, heightM) * 0.5;
  const approach = span * 0.25;
  const out: Sortie[] = [];
  const clampT = (t: number) => Math.min(tEnd - span * 0.25, Math.max(tStart + span * 0.12, t));

  // 空襲・近接航空支援・補給線への攻撃:着弾(空)を、陣営と場所ごとにまとめて1つの攻撃にする
  const groups: { own: boolean; pos: Vec2; t0: number; t1: number; n: number }[] = [];
  for (const im of rp.impacts) {
    // 盤上の航空隊・航空司令部の編隊の攻撃は、機そのものが実際の道筋で地図に描かれるので、演出の編隊は飛ばさない
    // (海戦で、地図の外の後方の向きから架空の編隊が来て、あらぬ方向へ帰っていくように見えていた)
    if (im.kind !== "air" || im.onMap) continue;
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
        const lag = i * 90;
        const tt = t - lag;
        if (tt < t0) return null;
        if (tt < gr.t0) return straight(start, T, (tt - t0) / approach);
        if (tt <= gr.t1) {
          const a = ((tt - gr.t0) / LOITER_PERIOD_S) * Math.PI * 2 + i * 2.1;
          const pos = { x: T.x + Math.cos(a) * loiterR, y: T.y + Math.sin(a) * loiterR };
          return { pos, heading: headingOf(-Math.sin(a), Math.cos(a)) };
        }
        const k = (tt - gr.t1) / approach;
        if (k > 1) return null;
        const a = ((gr.t1 - gr.t0) / LOITER_PERIOD_S) * Math.PI * 2 + i * 2.1;
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
      const a = dirSign * ((t - t0) / ORBIT_PERIOD_S) * Math.PI * 2 + phase + i * ((Math.PI * 2) / 4);
      const rr = r * (0.7 + 0.3 * Math.sin(a * 1.7 + i));
      const pos = { x: sc.c.x + Math.cos(a) * rr, y: sc.c.y + Math.sin(a) * rr * 0.8 };
      const heading = headingOf(-Math.sin(a) * dirSign, Math.cos(a) * dirSign * 0.8);
      // 撃墜:空戦の中ほどで、失った数だけ味方の機が煙を引いて落ちる
      const downAt = t0 + (t1 - t0) * (0.35 + 0.15 * i);
      if (own && fought && i < Math.min(lost, 3) && t > downAt) {
        const k = (t - downAt) / FALL_S;
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
        const tt = t - i * 60;
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

/** 発砲の閃光(撃った側の位置に、撃った直後だけ小さな光)。黒色火薬の時代の撃ち方つきの射撃は drawVolleys で描く */
export function drawMuzzleFlashes(d: DrawCtx, rp: SideReplay, stepSec: number) {
  const { g, S, t } = d;
  for (let n = 0; n < rp.shots.length; n++) {
    const sh = rp.shots[n]!;
    if (sh.style) continue;
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

/** 航空司令部の編隊の任務 → 描く機の形 */
const FLIGHT_KIND: Record<string, PlaneKind> = { support: "attack", armedRecon: "attack", escort: "fighter", intercept: "fighter", recon: "recon", airlift: "transport" };
/** 空戦の輪の半径(m) */
const STATION_R = 700;


/** 落下傘(地点の上、落としてからゆっくり降りる) */
function drawChutes(g: CanvasRenderingContext2D, S: DrawCtx["S"], pos: Vec2, age: number, n: number) {
  const k = age / 900;
  for (let i = 0; i < n; i++) {
    const p = S({ x: pos.x + (h01(i * 3 + 1) - 0.5) * 900, y: pos.y + (h01(i * 7 + 2) - 0.5) * 900 });
    const r = 4 + 2 * (1 - k);
    const off = (1 - k) * 18;
    g.globalAlpha = Math.min(1, (1 - k) * 2.5);
    g.fillStyle = "#f4f1e6";
    g.strokeStyle = "#555";
    g.lineWidth = 1;
    g.beginPath();
    g.arc(p.x, p.y - off, r, Math.PI, 0);
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.globalAlpha = 1;
}

/** 落ちていく機(黒煙を引いて回りながら) */
function drawFalling(d: DrawCtx, kind: PlaneKind, color: string, from: Vec2, heading: number, age: number, seed: number) {
  const { g, S } = d;
  const k = age / FALL_S;
  const drift = add(from, { x: Math.sin((heading * Math.PI) / 180), y: Math.cos((heading * Math.PI) / 180) }, 900 * k);
  const p = S(drift);
  const alt = 16 * (1 - k);
  const spin = heading + k * 540 * (h01(seed) > 0.5 ? 1 : -1);
  for (let j = 0; j < 7; j++) {
    g.fillStyle = `rgba(40, 40, 40, ${0.4 * (1 - j / 7) * (1 - k * 0.5)})`;
    g.beginPath();
    g.arc(p.x - j * 2, p.y - alt - j * 4, 2.5 + j * 0.9, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1 - k * 0.6;
  g.fillStyle = "rgba(20, 20, 20, 0.22)";
  planeShape(g, kind, p.x, p.y, spin, PLANE_PX[kind] * 0.8);
  g.fillStyle = color;
  planeShape(g, kind, p.x, p.y - alt, spin, PLANE_PX[kind] * 0.9);
  // 地面に落ちたら火の玉
  if (k > 0.9) {
    g.fillStyle = `rgba(255, 140, 40, ${(1 - k) * 8})`;
    g.beginPath();
    g.arc(p.x, p.y, 6, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}


type ReplayFlightT = NonNullable<SideReplay["flights"]>[number];

/**
 * 航空司令部の編隊の演出(ユーザー判断で作り直し。docs/air-design.md の末尾)。
 * 飛んでいる間をずっと描くのではなく、出来事ごとに短い場面だけを見せる(実時間の戦術ゲームの「通り抜け」の見せ方):
 * - 攻撃・偵察・空輸:目標に照準の印が出て、機が飛行場の方角から一直線に入り、目標の上を等速で通り抜けて反対側へ抜ける
 * - 空戦:その場所で戦闘機が入り乱れて回り、落ちた数だけ煙を引いて落ちる(回るのはここだけ)
 * - 何も起こさなかった飛行(会敵しなかった武装偵察・迎撃、護衛)は描かず、速報に1行だけ
 * 場面は同時に AIR_MAX_CONCURRENT まで。時刻と場所は本当の記録(霧を通したもの)で、ルールには関わらない。
 * 場面は地上の再生とは別の時計(実際のミリ秒)で流す(ユーザー判断:ターンの再生は元の速さ、航空の場面はゆっくり)。
 * 起きた順のまま地上の再生の長さの中に散らして始め、地上の再生が終わっても場面が残っていれば最後まで流す
 */
export interface AirVignette {
  kind: "pass" | "dogfight";
  /** 実際に起きた時刻(着弾の時刻を場面に合わせ直すのに使う) */
  t: number;
  /** 通り抜けの機の形(攻撃・偵察・輸送) */
  plane: PlaneKind;
  own: boolean;
  /** 目標(空戦は場所) */
  at: Vec2;
  /** 入ってくる向き(単位ベクトル。通り抜けだけ) */
  dir: Vec2;
  /** 見せる時刻と長さ(再生を始めてからのミリ秒。速さ1のとき) */
  start: number;
  dur: number;
  aircraft: number;
  label: string;
  /** 通り抜け:撃たれたか・落ちた機・投下・機銃掃射 */
  flak: boolean;
  lost: number;
  drop: boolean;
  strafe: boolean;
  /** 空戦:自軍・敵の落ちた機 */
  ownLost: number;
  enemyLost: number;
}

export interface AirShow {
  vignettes: AirVignette[];
  /** 速報に流す行(何も起こさなかった自軍の飛行など) */
  notes: { t: number; text: string }[];
}

/** 場面の長さ(ミリ秒):通り抜け・空戦・照準の印を先に出す長さ・落ちる機・落下傘・爆発 */
const PASS_MS = 5000;
const DOGFIGHT_MS = 4500;
const MARK_LEAD_MS = 1200;
const FALL_MS = 2400;
const DROP_MS = 3000;
const BLAST_MS = 1800;
/** 同時に見せる場面の数 */
const AIR_MAX_CONCURRENT = 3;
/** まとめる出来事:時刻(秒)と場所(m)の差 */
const GROUP_S = 600;
const GROUP_M = 3000;
/** 機の大きさの倍率(デフォルメ) */
const PASS_PLANE_SCALE = 1.5;

/**
 * 急降下の深さ(0=巡航の高さ、1=いちばん低い)。通り抜けの進み u(目標の真上が 0.5)に対して、
 * 0.22 から降り始めて目標の手前 0.46 で底(投弾)、0.62 までに引き起こす
 */
function diveLow(u: number): number {
  if (u < 0.22 || u > 0.62) return 0;
  if (u < 0.46) {
    const k = (u - 0.22) / 0.24;
    return k * k;
  }
  if (u < 0.5) return 1;
  const k = 1 - (u - 0.5) / 0.12;
  return k * k;
}

/** 編隊の、実際の時刻 t の位置(記録の点の間を線形に) */
function flightPos(f: ReplayFlightT, t: number): Vec2 {
  const P = f.points;
  if (t <= P[0]!.t) return { x: P[0]!.x, y: P[0]!.y };
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i]!;
    const b = P[i + 1]!;
    if (t <= b.t) {
      const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  const z = P[P.length - 1]!;
  return { x: z.x, y: z.y };
}

/** 入ってくる向き:最初の点(地図の縁の入口)から目標へ */
function inboundDir(f: ReplayFlightT, at: Vec2): Vec2 {
  const a = f.points[0]!;
  const l = Math.hypot(at.x - a.x, at.y - a.y);
  return l > 1 ? { x: (at.x - a.x) / l, y: (at.y - a.y) / l } : { x: 0, y: -1 };
}

/** 再生の記録から、見せる場面を組み立てる(ターンごとに1回) */
export function buildAirShow(rp: SideReplay, groundMs: number, label: (own: boolean, mission: string, aircraft: number) => string): AirShow {
  type Raw = Omit<AirVignette, "start" | "dur">;
  const raws: Raw[] = [];
  const notes: AirShow["notes"] = [];
  const near = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y) <= GROUP_M;
  const blank = { flak: false, lost: 0, drop: false, strafe: false, ownLost: 0, enemyLost: 0 };
  for (const f of rp.flights ?? []) {
    if (!f.points.length) continue;
    const n = f.points[0]!.aircraft;
    const attacks = f.fx.filter((e) => e.kind === "attack");
    const drops = f.fx.filter((e) => e.kind === "drop");
    const flak = f.fx.filter((e) => e.kind === "flak");
    const plane = FLIGHT_KIND[f.mission] ?? "attack";
    // 通り抜け:攻撃(最初の攻撃の時刻と場所)・空輸の投下・偵察(持ち場に着いた時刻)
    const first = attacks[0] ?? drops[0];
    const reconAt = f.mission === "recon" ? f.points.find((p) => p.phase === "station") : undefined;
    if (first || reconAt) {
      const t = first ? first.t : reconAt!.t;
      const at = flightPos(f, t);
      const lost = f.fx.filter((e) => e.kind === "flak" && e.lost).reduce((x, e) => x + (e.lost ?? 0), 0);
      const same = raws.find((r) => r.kind === "pass" && r.own === f.own && r.plane === plane && Math.abs(r.t - t) <= GROUP_S && near(r.at, at));
      if (same) {
        same.aircraft += n;
        same.lost += lost;
        same.flak ||= flak.length > 0;
        same.label = label(f.own, f.mission, same.aircraft);
      } else
        raws.push({ ...blank, kind: "pass", plane: f.mission === "recon" ? "recon" : plane, own: f.own, at, dir: inboundDir(f, at), t, aircraft: n, label: label(f.own, f.mission, n), flak: flak.length > 0, lost, drop: drops.length > 0, strafe: attacks.length > 0 });
    } else if (f.own && f.mission !== "escort" && !f.fx.some((e) => e.kind === "dogfight")) {
      // 何も起こさなかった自軍の飛行は速報に1行だけ
      const what = f.mission === "armedRecon" ? "武装偵察" : f.mission === "intercept" ? "迎撃" : f.mission === "support" ? "攻撃" : "出撃";
      notes.push({ t: f.points[f.points.length - 1]!.t, text: `${what} ${n}機:会敵せず帰投` });
    }
    // 空戦:撃ち合った所と時刻ごとに1つの場面
    for (const e of f.fx.filter((x) => x.kind === "dogfight")) {
      const at = flightPos(f, e.t);
      const same = raws.find((r) => r.kind === "dogfight" && Math.abs(r.t - e.t) <= GROUP_S && near(r.at, at));
      const lostOwn = f.own ? (e.lost ?? 0) : 0;
      const lostEnemy = f.own ? 0 : (e.lost ?? 0);
      if (same) {
        same.ownLost += lostOwn;
        same.enemyLost += lostEnemy;
      } else raws.push({ ...blank, kind: "dogfight", plane: "fighter", own: f.own, at, dir: { x: 0, y: -1 }, t: e.t, aircraft: 0, label: "空戦", ownLost: lostOwn, enemyLost: lostEnemy });
    }
  }
  // ターン全体に散らす(ユーザー判断):起きた順のまま、地上の再生の始めから終わりまで等間隔に始める。
  // 同時に見せるのは AIR_MAX_CONCURRENT まで(足りなければ後ろへずらす。地上の再生を越えてもよい)
  raws.sort((a, b) => a.t - b.t);
  const placed: AirVignette[] = [];
  const last = Math.max(MARK_LEAD_MS, groundMs * 0.85);
  raws.forEach((r, i) => {
    const dur = r.kind === "pass" ? PASS_MS : DOGFIGHT_MS;
    let start = raws.length > 1 ? MARK_LEAD_MS + ((last - MARK_LEAD_MS) * i) / (raws.length - 1) : MARK_LEAD_MS;
    for (let k = 0; k < 50; k++) {
      const busy = placed.filter((v) => v.start < start + dur && start < v.start + v.dur);
      if (busy.length < AIR_MAX_CONCURRENT) break;
      start = Math.min(...busy.map((v) => v.start + v.dur));
    }
    placed.push({ ...r, start, dur });
  });
  return { vignettes: placed, notes };
}

/** 通り抜けで投弾する所(進み u。急降下の底) */
export const BOMB_U = 0.46;

/** 場面が終わるまでのミリ秒(地上の再生より長ければ、再生をその分だけ延ばす) */
export function airShowEndMs(show: AirShow): number {
  return show.vignettes.reduce((m, v) => Math.max(m, v.start + v.dur + (v.lost >= 0.5 || v.ownLost >= 0.5 || v.enemyLost >= 0.5 ? FALL_MS * 0.6 : 0)), 0);
}

/** 場面に合う、盤上を飛ぶ機の攻撃の着弾 */
const matchesPass = (im: SideReplay["impacts"][number], v: AirVignette) => v.kind === "pass" && v.own === im.own && Math.abs(im.t - v.t) <= GROUP_S * 2 && Math.hypot(im.x - v.at.x, im.y - v.at.y) <= GROUP_M * 2;

/**
 * 盤上を飛ぶ機の攻撃の着弾のうち、場面の投弾で描くもの(地上の再生の時刻では描かない。場面は別の時計で流れるので、
 * 実際の時刻のまま描くと、機が来る前に爆発して見える)を外す。合う場面のない着弾はそのまま
 */
export function retimeAirImpacts(rp: SideReplay, show: AirShow): SideReplay["impacts"] {
  return rp.impacts.filter((im) => !(im.kind === "air" && im.onMap && show.vignettes.some((v) => matchesPass(im, v))));
}

/** 通り抜けの進み u(時間)→ 道の上の位置 x(-1〜1。0 が目標の真上)。攻撃は目標の手前で露骨に減速し、投弾してから加速して抜ける */
function passPos(u: number, attack: boolean): number {
  const x = 2 * u - 1;
  if (!attack) return x;
  // 奇関数:真ん中の速さは端の約 1/4(0.15 + 0.85 x^3 の傾き)。底は少し手前に寄せる
  const y = 0.15 * x + 0.85 * x * x * x;
  return y;
}

/** 場面を描く(nowMs:再生を始めてからのミリ秒。速さ1のとき) */
export function drawAirShow(d: DrawCtx, show: AirShow, nowMs: number, extent: number, detail: boolean) {
  const { g, S } = d;
  const t = nowMs;
  show.vignettes.forEach((v, vi) => {
    const color = v.own ? d.ownColor : d.enemyColor;
    const u = (t - v.start) / v.dur;
    if (v.kind === "pass") {
      const attack = v.plane === "attack";
      // 投弾の時刻:位置が目標の手前(BOMB_U の位置)に来た時
      const xb = 2 * BOMB_U - 1;
      // passPos は増える関数なので、二分法で投弾の位置に来る時刻を求める
      let lo = 0;
      let hi = 1;
      for (let k = 0; k < 30; k++) {
        const m = (lo + hi) / 2;
        if (passPos(m, attack) < xb) lo = m;
        else hi = m;
      }
      const tBomb = v.start + ((lo + hi) / 2) * v.dur;
      // 照準の印:少し前から目標に出て、投弾で消える
      if (attack && t >= v.start - MARK_LEAD_MS && t <= tBomb) {
        const q = S(v.at);
        const pulse = 0.5 + 0.5 * Math.sin(t / 160);
        g.strokeStyle = color;
        g.globalAlpha = 0.5 + 0.4 * pulse;
        g.lineWidth = 2;
        const r = 14 + 4 * pulse;
        g.beginPath();
        g.arc(q.x, q.y, r, 0, Math.PI * 2);
        g.moveTo(q.x - r - 6, q.y);
        g.lineTo(q.x - r + 6, q.y);
        g.moveTo(q.x + r - 6, q.y);
        g.lineTo(q.x + r + 6, q.y);
        g.moveTo(q.x, q.y - r - 6);
        g.lineTo(q.x, q.y - r + 6);
        g.moveTo(q.x, q.y + r - 6);
        g.lineTo(q.x, q.y + r + 6);
        g.stroke();
        g.globalAlpha = 1;
      }
      // 爆発:投弾の時刻に、目標で火の玉と煙
      if (attack && t >= tBomb && t <= tBomb + BLAST_MS) {
        const k = (t - tBomb) / BLAST_MS;
        for (let i = 0; i < 5; i++) {
          const q = S({ x: v.at.x + (h01(vi * 13 + i) - 0.5) * 500, y: v.at.y + (h01(vi * 17 + i) - 0.5) * 500 });
          const kk = Math.max(0, k - i * 0.06);
          if (kk <= 0) continue;
          g.fillStyle = `rgba(255, ${140 + 60 * (1 - kk)}, 40, ${Math.max(0, 0.85 * (1 - kk * 2))})`;
          g.beginPath();
          g.arc(q.x, q.y, 4 + 14 * kk, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = `rgba(45, 40, 35, ${0.45 * (1 - kk)})`;
          g.beginPath();
          g.arc(q.x + kk * 8, q.y - kk * 14, 6 + 16 * kk, 0, Math.PI * 2);
          g.fill();
        }
      }
      // 落ちた機:目標の上で列から外れて落ちる
      if (detail && v.lost >= 0.5 && t >= tBomb && t <= tBomb + FALL_MS) {
        const n = Math.min(3, Math.max(1, Math.round(v.lost)));
        const hd = headingOf(v.dir.x, v.dir.y);
        for (let i = 0; i < n; i++) drawFalling(d, v.plane, color, add(v.at, { x: (h01(vi * 7 + i) - 0.5) * 600, y: (h01(vi * 11 + i) - 0.5) * 600 }), hd + i * 30, ((t - tBomb) / FALL_MS) * FALL_S, vi * 13 + i);
      }
      // 空輸の落下傘
      if (v.drop && t >= tBomb && t <= tBomb + DROP_MS) drawChutes(g, S, v.at, ((t - tBomb) / DROP_MS) * 900, 8);
      if (u < 0 || u > 1) return;
      const xNow = passPos(u, attack);
      // 対空砲火:目標の上ではじける弾幕(目標に近い間)
      if (detail && v.flak && Math.abs(xNow) < 0.35)
        for (let i = 0; i < 10; i++) {
          const phase = (t / 700 + h01(vi * 31 + i)) % 1;
          const q = S({ x: v.at.x + (h01(i * 5 + vi + Math.floor(t / 700)) - 0.5) * 1500, y: v.at.y + (h01(i * 9 + vi + 1 + Math.floor(t / 700)) - 0.5) * 1500 });
          const y = q.y - 18;
          if (phase < 0.15) {
            g.fillStyle = "rgba(255, 200, 90, 0.95)";
            g.beginPath();
            g.arc(q.x, y, 3.5, 0, Math.PI * 2);
            g.fill();
          }
          g.fillStyle = `rgba(35, 35, 35, ${0.6 * (1 - phase)})`;
          g.beginPath();
          g.arc(q.x, y, 3 + phase * 8, 0, Math.PI * 2);
          g.fill();
        }
      // 機:一直線に目標の上を通り抜ける(地図の外から外へ)。攻撃は目標の手前で降りて減速し、投弾して加速しながら引き起こす
      const hd = headingOf(v.dir.x, v.dir.y);
      const lead0 = add(v.at, v.dir, extent * xNow);
      const n = Math.min(3, Math.max(1, Math.ceil(v.aircraft / 6)));
      const size = PASS_PLANE_SCALE * PLANE_PX[v.plane];
      const low = attack ? diveLow((xNow + 1) / 2) : 0;
      for (let i = 0; i < n; i++) {
        const pl = slot({ pos: lead0, heading: hd }, i, v.plane === "transport" ? 450 : 320);
        const p = S(pl.pos);
        const alt = (v.plane === "transport" ? 26 : 20) * (1 - 0.9 * low);
        g.fillStyle = "rgba(20, 20, 20, 0.25)";
        planeShape(g, v.plane, p.x + alt * 0.6, p.y + alt, hd, size);
        g.fillStyle = "#1b1b1b";
        planeShape(g, v.plane, p.x, p.y, hd, size + 2.5);
        g.fillStyle = color;
        planeShape(g, v.plane, p.x, p.y, hd, size);
        // 機銃掃射:降りきった目標の手前で、進む先の地面へ曳光
        if (v.strafe && low > 0.6 && xNow < 0 && h01(Math.floor(t / 90) + i * 7 + vi) > 0.25) {
          const gnd = S(add(pl.pos, { x: v.dir.x + (h01(i + vi * 3) - 0.5) * 0.5, y: v.dir.y + (h01(i * 5 + vi) - 0.5) * 0.5 }, 500));
          g.strokeStyle = "#ffe36b";
          g.lineWidth = 1.8;
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.lineTo(p.x + (gnd.x - p.x) * 0.85, p.y + (gnd.y - p.y) * 0.85);
          g.stroke();
        }
      }
      // 札:機数と任務(先頭の機に)
      const q = S(lead0);
      g.font = "bold 12px sans-serif";
      g.lineWidth = 3;
      g.strokeStyle = "rgba(255,255,255,0.9)";
      g.strokeText(v.label, q.x + 16, q.y - 14);
      g.fillStyle = color;
      g.fillText(v.label, q.x + 16, q.y - 14);
      return;
    }
    // 空戦:戦闘機が入り乱れて回る(自軍2機・敵2機)
    const mid = v.start + v.dur / 2;
    if (detail && t >= mid && t <= mid + FALL_MS) {
      for (let i = 0; i < Math.min(3, Math.round(v.ownLost)); i++) drawFalling(d, "fighter", d.ownColor, add(v.at, { x: (h01(vi + i) - 0.5) * 900, y: (h01(vi * 3 + i) - 0.5) * 900 }), 60 * i, ((t - mid) / FALL_MS) * FALL_S, vi * 17 + i);
      for (let i = 0; i < Math.min(3, Math.round(v.enemyLost)); i++) drawFalling(d, "fighter", d.enemyColor, add(v.at, { x: (h01(vi * 5 + i) - 0.5) * 900, y: (h01(vi * 7 + i) - 0.5) * 900 }), 120 + 60 * i, ((t - mid) / FALL_MS) * FALL_S, vi * 19 + i);
    }
    if (u < 0 || u > 1) return;
    g.globalAlpha = Math.min(1, u / 0.1, (1 - u) / 0.1);
    const planes: { pos: Vec2; heading: number; color: string }[] = [];
    for (let i = 0; i < 4; i++) {
      const dirn = i % 2 ? -1 : 1;
      const a = u * Math.PI * 2 * 2.2 * dirn + i * 1.7 + vi;
      const r = STATION_R * (0.7 + 0.25 * i);
      const c = { x: v.at.x + Math.cos(i * 2.1) * 250, y: v.at.y + Math.sin(i * 2.1) * 250 };
      planes.push({ pos: { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r }, heading: headingOf(-Math.sin(a) * dirn, Math.cos(a) * dirn), color: i < 2 ? d.ownColor : d.enemyColor });
    }
    // 曳光:自軍と敵の間に短い線
    if (detail)
      for (let i = 0; i < 2; i++) {
        if (h01(Math.floor(t / 120) + i * 5 + vi) < 0.35) continue;
        const a = S(planes[i]!.pos);
        const b = S(planes[2 + ((i + Math.floor(t / 300)) % 2)]!.pos);
        g.strokeStyle = h01(Math.floor(t / 120) + i) > 0.5 ? "#ffe36b" : "#ff9a5a";
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(a.x + (b.x - a.x) * 0.55, a.y + (b.y - a.y) * 0.55);
        g.stroke();
      }
    const size = PLANE_PX.fighter * PASS_PLANE_SCALE;
    for (const pl of planes) {
      const p = S(pl.pos);
      g.fillStyle = "rgba(20, 20, 20, 0.22)";
      planeShape(g, "fighter", p.x + 12, p.y + 20, pl.heading, size);
      g.fillStyle = "#1b1b1b";
      planeShape(g, "fighter", p.x, p.y, pl.heading, size + 2.5);
      g.fillStyle = pl.color;
      planeShape(g, "fighter", p.x, p.y, pl.heading, size);
    }
    const q = S(v.at);
    g.font = "bold 12px sans-serif";
    g.lineWidth = 3;
    g.strokeStyle = "rgba(255,255,255,0.9)";
    g.strokeText("空戦", q.x + 22, q.y - 22);
    g.fillStyle = "#6b4a00";
    g.fillText("空戦", q.x + 22, q.y - 22);
    g.globalAlpha = 1;
  });
}

// ---------------------------------------------------------------- 黒色火薬の時代の射撃(ナポレオン戦争。撃ち方 ReplayShot.style)

/** 閃光の長さ(ゲーム内の秒) */
const VOLLEY_FLASH_S = 24;
/** 硝煙の残る長さ(ゲーム内の秒。撃つのをやめると10分ほどで晴れる=ルールパックの combat.smoke) */
const VOLLEY_SMOKE_S = 420;
/** 球形弾の飛ぶ長さ(ゲーム内の秒。再生で見える速さに引き延ばしている) */
const BALL_FLIGHT_S = 40;
/** ぶどう弾(散弾)を描く距離の上限(m。これより遠ければ球形弾の跳弾) */
const CANISTER_M = 350;

/** 帯の上の点(k = -0.5〜0.5)。sim-core の frontEnds と同じ向きの取り方 */
function alongFront(c: Vec2, facing: number, widthM: number, k: number): Vec2 {
  const r = (facing * Math.PI) / 180;
  return { x: c.x + Math.cos(r) * widthM * k, y: c.y - Math.sin(r) * widthM * k };
}

/**
 * 黒色火薬の時代の射撃を撃ち方で描き分ける(地上の再生の時計 t。ゲーム内の秒):
 * - 最初の斉射(first):帯の全体がいっせいに大きく光り、厚い硝煙の帯が前に立つ
 * - そろった斉射(volley):操典の小隊ごとの斉射。光が帯の片端から片端へ順に走る(転がる斉射)
 * - ばらばらの射撃(atWill):帯のあちこちで小さな光がまばらにまたたき、薄い煙
 * - 大砲(gun):砲の数だけ大きな光と濃い煙。近ければぶどう弾が扇に散り、遠ければ球形弾が跳ねながら飛ぶ
 * 硝煙は膨らみながら風に流れ、しばらく残る(撃ち続けると帯の前が煙で隠れる)
 */
export function drawVolleys(d: DrawCtx, rp: SideReplay, stepSec: number, scale: number) {
  const { g, S, t } = d;
  // 同じ部隊の同じ刻みの射撃(目標が複数)は、閃光と煙を1度だけ描く
  const seen = new Set<string>();
  for (let n = 0; n < rp.shots.length; n++) {
    const sh = rp.shots[n]!;
    if (!sh.style) continue;
    const age = t - sh.t;
    if (age < 0 || age > VOLLEY_SMOKE_S) continue;
    const width = Math.max(40, sh.widthM ?? 0);
    const facing = sh.facing ?? (Math.atan2(sh.to.x - sh.from.x, sh.to.y - sh.from.y) * 180) / Math.PI;
    const key = `${Math.round(sh.from.x)}:${Math.round(sh.from.y)}:${sh.t}`;
    const first = !seen.has(key);
    seen.add(key);
    const dx = sh.to.x - sh.from.x;
    const dy = sh.to.y - sh.from.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / dist;
    const uy = dy / dist;
    if (sh.style === "gun") {
      if (first) drawGunFlashAndSmoke(g, S, sh.from, facing, width, age, n, scale);
      drawShot(g, S, sh.from, sh.to, ux, uy, dist, age, n);
      continue;
    }
    if (!first) continue;
    // 硝煙の帯:撃った帯の少し前(目標の側)に、膨らみながら風に流れる
    const puffs = Math.max(4, Math.min(24, Math.round(width / 60)));
    const thick = sh.style === "first" ? 0.42 : sh.style === "volley" ? 0.3 : 0.18;
    for (let i = 0; i < puffs; i++) {
      const k = (i + 0.5) / puffs - 0.5;
      // そろった斉射は小隊ごとに順に撃つので、煙も順に立つ
      const lag = sh.style === "volley" ? (i / puffs) * stepSec : sh.style === "atWill" ? h01(n * 31 + i) * stepSec : 0;
      const a = age - lag;
      if (a < 0) continue;
      const fade = 1 - a / VOLLEY_SMOKE_S;
      if (fade <= 0) continue;
      const base = alongFront(sh.from, facing, width, k);
      const drift = a * 0.25;
      const p = S({ x: base.x + ux * (12 + a * 0.04) + WIND.x * drift, y: base.y + uy * (12 + a * 0.04) + WIND.y * drift });
      const r = Math.max(2, (10 + a * 0.12) * scale) + 2;
      g.fillStyle = `rgba(236, 234, 226, ${thick * fade * (0.7 + 0.3 * h01(n + i * 7))})`;
      g.beginPath();
      g.arc(p.x, p.y, r, 0, Math.PI * 2);
      g.fill();
    }
    // 閃光
    const flashes = Math.max(5, Math.min(40, Math.round(width / 30)));
    for (let i = 0; i < flashes; i++) {
      const k = (i + 0.5) / flashes - 0.5;
      const at =
        sh.style === "first" ? 0 : sh.style === "volley" ? ((i + 0.5) / flashes) * stepSec : h01(n * 13 + i) * stepSec * 1.6;
      // ばらばらの射撃は、半分ほどの所だけが光る
      if (sh.style === "atWill" && h01(n * 17 + i) < 0.5) continue;
      const a = age - at;
      const len = sh.style === "first" ? VOLLEY_FLASH_S : VOLLEY_FLASH_S * 0.6;
      if (a < 0 || a > len) continue;
      const kk = 1 - a / len;
      const p = S(alongFront(sh.from, facing, width, k));
      const big = sh.style === "first" ? 4.5 : sh.style === "volley" ? 3 : 2;
      g.fillStyle = `rgba(255, 238, 170, ${0.95 * kk})`;
      g.beginPath();
      g.arc(p.x + ux * 3, p.y - uy * 3, 1 + big * kk, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** 大砲:砲の数だけの大きな閃光と濃い煙 */
function drawGunFlashAndSmoke(g: CanvasRenderingContext2D, S: (p: Vec2) => Vec2, from: Vec2, facing: number, width: number, age: number, n: number, scale: number) {
  const guns = 6;
  for (let i = 0; i < guns; i++) {
    const k = (i + 0.5) / guns - 0.5;
    const at = h01(n * 19 + i) * 10;
    const a = age - at;
    if (a < 0) continue;
    const base = alongFront(from, facing, width, k);
    const fade = 1 - a / VOLLEY_SMOKE_S;
    if (fade > 0) {
      const drift = a * 0.25;
      const p = S({ x: base.x + WIND.x * drift, y: base.y + WIND.y * drift });
      g.fillStyle = `rgba(225, 222, 214, ${0.45 * fade})`;
      g.beginPath();
      g.arc(p.x, p.y, Math.max(3, (14 + a * 0.15) * scale) + 2, 0, Math.PI * 2);
      g.fill();
    }
    if (a <= VOLLEY_FLASH_S) {
      const kk = 1 - a / VOLLEY_FLASH_S;
      const p = S(base);
      g.fillStyle = `rgba(255, 220, 140, ${kk})`;
      g.beginPath();
      g.arc(p.x, p.y, 2 + 5 * kk, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** 大砲の弾:近ければぶどう弾が扇に散り、遠ければ球形弾が地面で跳ねながら飛ぶ(跳ねた所に土煙) */
function drawShot(g: CanvasRenderingContext2D, S: (p: Vec2) => Vec2, from: Vec2, to: Vec2, ux: number, uy: number, dist: number, age: number, n: number) {
  if (dist <= CANISTER_M) {
    const len = BALL_FLIGHT_S * 0.5;
    if (age > len) return;
    const k = age / len;
    for (let i = 0; i < 14; i++) {
      const spread = (h01(n * 23 + i) - 0.5) * 0.5;
      const cx = ux * Math.cos(spread) - uy * Math.sin(spread);
      const cy = ux * Math.sin(spread) + uy * Math.cos(spread);
      const p = S({ x: from.x + cx * dist * k * (0.8 + 0.3 * h01(n + i)), y: from.y + cy * dist * k * (0.8 + 0.3 * h01(n + i)) });
      g.fillStyle = `rgba(40, 35, 30, ${0.8 * (1 - k)})`;
      g.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    return;
  }
  // 球形弾:目標の手前で2度跳ね、目標を抜けて転がる
  const k = age / BALL_FLIGHT_S;
  if (k > 1.3) return;
  const bounces = [0.62, 0.82, 1.0];
  if (k <= 1.2) {
    const p = S({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k });
    // 跳ねる弾は、跳ねる間だけ高く(影から離れて)見える
    const seg = bounces.findIndex((b) => k < b);
    const lo = seg <= 0 ? 0 : bounces[seg - 1]!;
    const hi = seg < 0 ? 1.2 : bounces[seg]!;
    const hop = Math.sin(((k - lo) / Math.max(0.01, hi - lo)) * Math.PI) * (seg <= 0 ? 7 : 3);
    g.fillStyle = "rgba(0, 0, 0, 0.25)";
    g.beginPath();
    g.ellipse(p.x, p.y, 2.2, 1.2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(25, 25, 25, 0.95)";
    g.beginPath();
    g.arc(p.x, p.y - hop, 2, 0, Math.PI * 2);
    g.fill();
  }
  for (const b of bounces) {
    const a = k - b;
    if (a < 0 || a > 0.25) continue;
    const p = S({ x: from.x + (to.x - from.x) * b, y: from.y + (to.y - from.y) * b });
    g.fillStyle = `rgba(140, 110, 70, ${0.6 * (1 - a / 0.25)})`;
    g.beginPath();
    g.arc(p.x, p.y, 2 + 6 * (a / 0.25), 0, Math.PI * 2);
    g.fill();
  }
}
