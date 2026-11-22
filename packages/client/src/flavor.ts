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

/** 航空司令部の編隊の任務 → 描く機の形 */
const FLIGHT_KIND: Record<string, PlaneKind> = { support: "attack", armedRecon: "attack", escort: "fighter", intercept: "fighter", recon: "recon", airlift: "transport" };
/** 持ち場で旋回する1周(ゲームの秒)と半径(m) */
const STATION_PERIOD_S = 900;
const STATION_R = 700;
/** 急降下の前後(ゲームの秒) */
const DIVE_S = 150;

type FlightPt = NonNullable<SideReplay["flights"]>[number]["points"][number];

/** 時刻 t の編隊の位置と向き(小ステップの点の間を線形に) */
function flightAt(pts: FlightPt[], t: number): { pos: Vec2; heading: number; pt: FlightPt } | null {
  if (!pts.length || t < pts[0]!.t) return null;
  const last = pts[pts.length - 1]!;
  if (t > last.t) {
    // 帰り道で地図の外へ出た編隊は、最後の向きのまま少し飛び続けて消える(記録は地図の内だけ)
    const prev = pts[pts.length - 2];
    if (last.phase !== "outbound" || !prev || t - last.t > 120) return null;
    const dt = last.t - prev.t || 60;
    const k = (t - last.t) / dt;
    return { pos: { x: last.x + (last.x - prev.x) * k, y: last.y + (last.y - prev.y) * k }, heading: headingOf(last.x - prev.x, last.y - prev.y), pt: last };
  }
  let i = 0;
  while (i < pts.length - 1 && pts[i + 1]!.t < t) i++;
  const a = pts[i]!;
  const b = pts[Math.min(i + 1, pts.length - 1)]!;
  const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
  // 向きは前後の点から(止まっていれば、その前の動き)
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  for (let j = i; Math.hypot(dx, dy) < 1 && j > 0; j--) {
    dx = pts[j]!.x - pts[j - 1]!.x;
    dy = pts[j]!.y - pts[j - 1]!.y;
  }
  return { pos: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, heading: headingOf(dx, dy), pt: k < 0.5 ? a : b };
}

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


/** 編隊を見せる長さ(ターンの再生の割合)。実際の出撃は数分でも、飛んだことが分かるようにこれだけかけて見せる */
const FLIGHT_SHOW_SHARE = 0.5;
/** 出来事を見せる長さ(ターンの再生の割合):急降下・弾幕・空戦の曳光・撃墜・落下傘 */
const DIVE_SHARE = 0.07;
const FLAK_SHARE = 0.06;
const DOGFIGHT_SHARE = 0.08;
const FALL_SHARE = 0.14;
const DROP_SHARE = 0.2;
/** 地図の上の機の大きさの倍率(デフォルメ。実際より大きく描く) */
const FLIGHT_PLANE_SCALE = 1.45;

type ReplayFlightT = NonNullable<SideReplay["flights"]>[number];

/** 1つの編隊の見せ方:実際の時刻(local)と、再生の時刻(display)の対応 */
interface FlightShow {
  f: ReplayFlightT;
  pts: FlightPt[];
  /** 再生で見せる時刻の幅 */
  w0: number;
  w1: number;
  /** 実際の時刻の幅(帰り道は地図の外へ少し延ばす) */
  t0: number;
  t1: number;
}

/**
 * 1つの編隊を再生のどこで見せるか。航空の動きのあった時間帯(act0〜act1)をまとめてターンの再生いっぱいに引き延ばし
 * (同じ時に飛んでいた編隊は同じ時に見える=空戦の相手もそろう)、そのうえで1つの編隊に最低 FLIGHT_SHOW_SHARE の長さを持たせる
 */
function showOf(f: ReplayFlightT, tStart: number, tEnd: number, act0: number, act1: number): FlightShow | null {
  if (!f.points.length) return null;
  const pts = [...f.points];
  // 帰り道の編隊は、最後の向きのまま地図の外まで延ばす(記録は地図の内だけ)
  const last = pts[pts.length - 1]!;
  const prev = pts[pts.length - 2];
  if (last.phase === "outbound" && prev && (last.x !== prev.x || last.y !== prev.y)) {
    const dt = last.t - prev.t || 60;
    pts.push({ ...last, t: last.t + dt * 3, x: last.x + (last.x - prev.x) * 3, y: last.y + (last.y - prev.y) * 3 });
  }
  // 帰り道は、持ち場(なければ帰り始めた所)を中心に 30〜40度回して、来た道と重ならないようにする
  // (表示だけ。実際の編隊は来た向きへ帰る。同じ線を往復すると、来て戻っただけに見えて分かりにくい)
  const firstOut = pts.findIndex((p) => p.phase === "outbound");
  if (firstOut > 0) {
    const pivot = pts[firstOut - 1]!;
    const seed = Math.round(pts[0]!.x + pts[0]!.y + pts[0]!.t);
    const deg = (30 + 10 * h01(seed)) * (h01(seed + 7) > 0.5 ? 1 : -1);
    const r = (deg * Math.PI) / 180;
    const c = Math.cos(r);
    const sn = Math.sin(r);
    for (let i = firstOut; i < pts.length; i++) {
      const p = pts[i]!;
      const dx = p.x - pivot.x;
      const dy = p.y - pivot.y;
      pts[i] = { ...p, x: pivot.x + dx * c - dy * sn, y: pivot.y + dx * sn + dy * c };
    }
  }
  const t0 = pts[0]!.t;
  const t1 = pts[pts.length - 1]!.t;
  const span = Math.max(600, tEnd - tStart);
  const lo = tStart + span * 0.05;
  const hi = tEnd - span * 0.05;
  const k = act1 > act0 ? (hi - lo) / (act1 - act0) : 1;
  const center = act1 > act0 ? lo + (((t0 + t1) / 2 - act0) * k) : (lo + hi) / 2;
  const dur = Math.min(span, Math.max((t1 - t0) * k, span * FLIGHT_SHOW_SHARE));
  const mid = Math.min(tEnd - dur / 2, Math.max(tStart + dur / 2, center));
  return { f, pts, w0: mid - dur / 2, w1: mid + dur / 2, t0, t1 };
}

/** まとめる編隊:入ってきた時刻の差(秒)と場所の差(m) */
const MERGE_S = 300;
const MERGE_M = 3000;

/** 持ち場で目標の上を通り抜ける長さ(m) */
const PASS_M = 1800;

/** 持ち場にいた実際の時刻の幅(最初と最後の station の点) */
function stationSpan(pts: FlightPt[]): [number, number] | null {
  const st = pts.filter((p) => p.phase === "station");
  return st.length ? [st[0]!.t, st[st.length - 1]!.t] : null;
}

/** 再生の時刻 → 実際の時刻 */
const localOf = (s: FlightShow, t: number) => s.t0 + ((t - s.w0) / (s.w1 - s.w0)) * (s.t1 - s.t0);
/** 実際の時刻 → 再生の時刻(出来事を見せる時刻) */
const displayOf = (s: FlightShow, t: number) => (s.t1 > s.t0 ? s.w0 + ((t - s.t0) / (s.t1 - s.t0)) * (s.w1 - s.w0) : (s.w0 + s.w1) / 2);

/**
 * 航空司令部の編隊。等速ではなく、飛んだことが分かるようにデフォルメして見せる:
 * 実際には数分の出撃でも再生の半分以上をかけて、地図の縁から入り → 持ち場で旋回・急降下して攻撃 → 縁へ帰るまでを描き、
 * 飛ぶ道筋を薄い線で先に見せる。出来事(攻撃・対空砲火・空戦・撃墜・投下)はその道筋の上の、起きた順の所で見せる。
 * 位置と出来事は本当の記録(霧を通したもの)。演出を切っても機と道筋は出し、detail が真のときだけ弾幕・煙などを足す
 */
export function drawFlights(d: DrawCtx, rp: SideReplay, tStart: number, tEnd: number, detail: boolean, label: (f: ReplayFlightT) => string) {
  const { g, S, t } = d;
  const span = Math.max(600, tEnd - tStart);
  // 同じ陣営・同じ任務で、ほぼ同じ所から同じ頃に入ってきた編隊は1つにまとめる(機数は札に合計で)
  const extra = new Map<ReplayFlightT, number>();
  const all: ReplayFlightT[] = [];
  for (const f of rp.flights ?? []) {
    if (!f.points.length) continue;
    const a = f.points[0]!;
    const same = all.find((g) => g.own === f.own && g.mission === f.mission && Math.abs(g.points[0]!.t - a.t) <= MERGE_S && Math.hypot(g.points[0]!.x - a.x, g.points[0]!.y - a.y) <= MERGE_M);
    if (same) {
      extra.set(same, (extra.get(same) ?? 0) + a.aircraft);
      // まとめた編隊の出来事(攻撃・撃墜など)も見せる
      same.fx.push(...f.fx.filter((e) => !same.fx.some((x) => x.t === e.t && x.kind === e.kind)));
    } else all.push({ ...f, fx: [...f.fx] });
  }
  const act0 = Math.min(...all.map((f) => f.points[0]!.t));
  const act1 = Math.max(...all.map((f) => f.points[f.points.length - 1]!.t));
  const shows = all.map((f) => showOf(f, tStart, tEnd, act0, act1)).filter((x): x is FlightShow => !!x);
  // 今の位置(空戦の曳光の相手探しにも使う)
  const now = shows.map((s) => ({ s, at: t >= s.w0 && t <= s.w1 ? flightAt(s.pts, Math.min(s.t1, Math.max(s.t0, localOf(s, t)))) : null }));
  now.forEach(({ s, at }, fi) => {
    const f = s.f;
    const kind = FLIGHT_KIND[f.mission] ?? "attack";
    const color = f.own ? d.ownColor : d.enemyColor;
    // 撃墜:落ちた機は、撃たれた所から落ちていく(編隊が去った後も)
    if (detail)
      for (const e of f.fx) {
        if (!e.lost) continue;
        const te = displayOf(s, e.t);
        const fall = span * FALL_SHARE;
        if (t < te || t > te + fall) continue;
        const from = flightAt(s.pts, Math.min(s.t1, Math.max(s.t0, e.t))) ?? { pos: s.pts[s.pts.length - 1]!, heading: 0 };
        const n = Math.min(3, Math.max(1, Math.round(e.lost)));
        for (let i = 0; i < n; i++) drawFalling(d, kind, color, add(from.pos, { x: (h01(fi * 7 + i) - 0.5) * 800, y: (h01(fi * 11 + i) - 0.5) * 800 }), from.heading + i * 40, ((t - te) / fall) * FALL_S, fi * 13 + i);
      }
    // 空輸の投下
    for (const e of f.fx) {
      if (e.kind !== "drop") continue;
      const te = displayOf(s, e.t);
      const dur = span * DROP_SHARE;
      if (t < te || t > te + dur) continue;
      const p = flightAt(s.pts, e.t);
      if (p) drawChutes(g, S, p.pos, ((t - te) / dur) * 900, 8);
    }
    if (!at) return;
    // 出てくるときと去るときは薄く
    const edge = Math.min(1, (t - s.w0) / (span * 0.04), (s.w1 - t) / (span * 0.04));
    g.globalAlpha = Math.max(0.15, edge);
    const tl = localOf(s, t);
    // 護衛の戦闘機は攻撃機と一緒に飛ぶので、空戦の間だけ描く(画面に機が多すぎないように)
    const dogfighting = kind === "fighter" && f.fx.some((e) => e.kind === "dogfight" && Math.abs(t - displayOf(s, e.t)) <= span * DOGFIGHT_SHARE);
    if (f.mission === "escort" && !dogfighting) {
      g.globalAlpha = 1;
      return;
    }
    // 飛ぶ道筋(自軍は先まで薄い点線、通ったところは濃く)
    if (f.own && !dogfighting) {
      g.lineWidth = 1;
      g.setLineDash([4, 6]);
      g.strokeStyle = "rgba(31,95,168,0.3)";
      g.beginPath();
      s.pts.forEach((p, i) => {
        const q = S(p);
        if (i === 0) g.moveTo(q.x, q.y);
        else g.lineTo(q.x, q.y);
      });
      g.stroke();
      g.setLineDash([]);
    }
    g.lineWidth = 1.5;
    g.strokeStyle = f.own ? "rgba(31,95,168,0.6)" : "rgba(176,58,46,0.6)";
    g.beginPath();
    let started = false;
    for (const p of s.pts) {
      if (p.t > tl) break;
      const q = S(p);
      if (!started) g.moveTo(q.x, q.y);
      else g.lineTo(q.x, q.y);
      started = true;
    }
    if (started) {
      const q = S(at.pos);
      g.lineTo(q.x, q.y);
      g.stroke();
    }
    const { pt } = at;
    // 描く機は1つの編隊に1機(空戦中の戦闘機だけ2機)。機数は札で
    const n = dogfighting ? 2 : 1;
    const size = PLANE_PX[kind] * FLIGHT_PLANE_SCALE;
    // 攻撃:急降下(影が近づき、機が目標へ寄る)と機銃掃射の曳光
    const diveWin = span * DIVE_SHARE;
    const dive = f.fx.map((e) => ({ e, te: displayOf(s, e.t) })).find((x) => x.e.kind === "attack" && Math.abs(t - x.te) <= diveWin);
    const diveK = dive ? 1 - Math.abs(t - dive.te) / diveWin : 0;
    // 空戦:戦闘機どうしが撃ち合っている間だけ、入り乱れて回る(攻撃機・偵察機・輸送機は回らない。dogfighting は上で)
    // 持ち場:目標・空域の上をまっすぐ通り抜ける(持ち場にいる間に、進む向きへ PASS_M だけ進む)
    const st = stationSpan(s.pts);
    const pass = pt.phase === "station" && st ? Math.min(1, Math.max(0, (tl - st[0]) / Math.max(1, st[1] - st[0]))) - 0.5 : 0;
    const stAt = st ? flightAt(s.pts, st[0]) : null;
    const stFwd = stAt ? { x: Math.sin((stAt.heading * Math.PI) / 180), y: Math.cos((stAt.heading * Math.PI) / 180) } : null;
    const hr = ((pt.phase === "station" && stAt ? stAt.heading : at.heading) * Math.PI) / 180;
    const fwd = { x: Math.sin(hr), y: Math.cos(hr) };
    for (let i = 0; i < n; i++) {
      let pl: PlaneAt;
      if (dogfighting) {
        // 戦闘機の巴戦:1機ずつずれた輪を、向きを変えながら回る
        const a = (t / (span / 6)) * Math.PI * 2 * (i % 2 ? -1 : 1) + (i * Math.PI * 2) / n + fi;
        const r = STATION_R * (0.8 + 0.3 * i);
        pl = { pos: { x: at.pos.x + Math.cos(a) * r, y: at.pos.y + Math.sin(a) * r }, heading: headingOf(-Math.sin(a) * (i % 2 ? -1 : 1), Math.cos(a) * (i % 2 ? -1 : 1)) };
      } else {
        // まっすぐ進む:持ち場では目標の上を通り抜け、急降下では目標へ突っ込んで抜ける
        // 持ち場を出た直後は、通り抜けた先から帰り道へなめらかにつなぐ(とびを出さない)
        const after = pt.phase === "outbound" && st && stFwd ? Math.max(0, 1 - (tl - st[1]) / 180) : 0;
        const center = pt.phase === "station" ? add(at.pos, fwd, pass * PASS_M) : after > 0 ? add(at.pos, stFwd!, 0.5 * PASS_M * after) : at.pos;
        const diveOff = dive ? ((t - dive.te) / diveWin) * 500 : 0;
        pl = slot({ pos: add(center, fwd, diveOff), heading: at.heading }, i, kind === "transport" ? 400 : 300);
      }
      const p = S(pl.pos);
      const baseAlt = kind === "transport" ? 24 : 18;
      const alt = baseAlt * (1 - diveK * 0.85);
      g.fillStyle = "rgba(20, 20, 20, 0.25)";
      planeShape(g, kind, p.x + alt * 0.6, p.y + alt, pl.heading, size);
      g.fillStyle = "#1b1b1b";
      planeShape(g, kind, p.x, p.y, pl.heading, size + 2.5);
      g.fillStyle = color;
      planeShape(g, kind, p.x, p.y, pl.heading, size);
      // 機銃掃射・投弾:急降下のいちばん低い所で、地面へ曳光
      if (dive && diveK > 0.45 && h01(Math.floor(t / 15) + i * 7 + fi) > 0.3) {
        const gnd = S(add(at.pos, { x: (h01(i + fi * 3) - 0.5) * 400, y: (h01(i * 5 + fi) - 0.5) * 400 }));
        g.strokeStyle = "#ffe36b";
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x + (gnd.x - p.x) * 0.85, p.y + (gnd.y - p.y) * 0.85);
        g.stroke();
      }
    }
    // 対空砲火の弾幕:撃たれた所のまわりで黒い煙の玉がはじける
    if (detail)
      for (const e of f.fx) {
        if (e.kind !== "flak") continue;
        const te = displayOf(s, e.t);
        const win = span * FLAK_SHARE;
        if (Math.abs(t - te) > win) continue;
        for (let i = 0; i < 8; i++) {
          const born = te - win + h01(fi * 31 + i + Math.round(e.t)) * win * 2;
          const age = (t - born) / (win * 0.6);
          if (age < 0 || age > 1) continue;
          const q = S({ x: at.pos.x + (h01(i * 5 + fi) - 0.5) * 1800, y: at.pos.y + (h01(i * 9 + fi + 1) - 0.5) * 1800 });
          const y = q.y - 16;
          if (age < 0.15) {
            g.fillStyle = "rgba(255, 200, 90, 0.95)";
            g.beginPath();
            g.arc(q.x, y, 3.5, 0, Math.PI * 2);
            g.fill();
          }
          g.fillStyle = `rgba(35, 35, 35, ${0.6 * (1 - age)})`;
          g.beginPath();
          g.arc(q.x, y, 3 + age * 8, 0, Math.PI * 2);
          g.fill();
        }
      }
    // 空戦の曳光:撃ち合った時刻の前後に、近くの敵の編隊との間に短い線
    if (detail && f.fx.some((e) => e.kind === "dogfight" && Math.abs(t - displayOf(s, e.t)) <= span * DOGFIGHT_SHARE)) {
      const foe = now
        .filter((o) => o.at && o.s.f.own !== f.own)
        .sort((a, b) => Math.hypot(a.at!.pos.x - at.pos.x, a.at!.pos.y - at.pos.y) - Math.hypot(b.at!.pos.x - at.pos.x, b.at!.pos.y - at.pos.y))[0];
      if (foe?.at && h01(Math.floor(t / 20) + fi) > 0.25) {
        const a = S(at.pos);
        const b = S(foe.at.pos);
        g.strokeStyle = h01(Math.floor(t / 20) + fi * 3) > 0.5 ? "#ffe36b" : "#ff9a5a";
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(a.x + (b.x - a.x) * 0.6, a.y + (b.y - a.y) * 0.6);
        g.stroke();
      }
    }
    // 札:機数と任務
    const q = S(at.pos);
    g.font = "bold 11px sans-serif";
    g.lineWidth = 3;
    g.strokeStyle = "rgba(255,255,255,0.9)";
    const text = label(f).replace("{n}", String(pt.aircraft + (extra.get(f) ?? 0)));
    g.strokeText(text, q.x + 14, q.y - 12);
    g.fillStyle = color;
    g.fillText(text, q.x + 14, q.y - 12);
    g.globalAlpha = 1;
  });
}
