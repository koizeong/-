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
 * 場面は同時に AIR_MAX_CONCURRENT まで。時刻と場所は本当の記録(霧を通したもの)で、ルールには関わらない
 */
export interface AirVignette {
  kind: "pass" | "dogfight";
  /** 通り抜けの機の形(攻撃・偵察・輸送) */
  plane: PlaneKind;
  own: boolean;
  /** 目標(空戦は場所) */
  at: Vec2;
  /** 入ってくる向き(単位ベクトル。通り抜けだけ) */
  dir: Vec2;
  /** 見せる時刻(再生の時刻)と長さ */
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

/** 場面の長さ(ターンの再生の割合):通り抜け・空戦・照準の印を先に出す長さ */
const PASS_SHARE = 0.2;
const DOGFIGHT_SHOW_SHARE = 0.18;
const MARK_LEAD_SHARE = 0.08;
/** 同時に見せる場面の数 */
const AIR_MAX_CONCURRENT = 3;
/** まとめる出来事:時刻(秒)と場所(m)の差 */
const GROUP_S = 600;
const GROUP_M = 3000;
/** 機の大きさの倍率(デフォルメ) */
const PASS_PLANE_SCALE = 1.5;

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
export function buildAirShow(rp: SideReplay, tStart: number, tEnd: number, label: (own: boolean, mission: string, aircraft: number) => string): AirShow {
  const span = Math.max(600, tEnd - tStart);
  type Raw = Omit<AirVignette, "start" | "dur"> & { t: number };
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
  // 時刻の順に、同時に AIR_MAX_CONCURRENT まで並べる(足りなければ後ろへずらす)
  raws.sort((a, b) => a.t - b.t);
  const placed: AirVignette[] = [];
  for (const r of raws) {
    const dur = span * (r.kind === "pass" ? PASS_SHARE : DOGFIGHT_SHOW_SHARE);
    let start = Math.max(tStart + span * MARK_LEAD_SHARE, r.t - dur / 2);
    for (let k = 0; k < 50; k++) {
      const busy = placed.filter((v) => v.start < start + dur && start < v.start + v.dur);
      if (busy.length < AIR_MAX_CONCURRENT) break;
      start = Math.min(...busy.map((v) => v.start + v.dur));
    }
    start = Math.min(start, tEnd - dur);
    const { t: _t, ...rest } = r;
    placed.push({ ...rest, start, dur });
  }
  return { vignettes: placed, notes };
}

/** 場面を描く */
export function drawAirShow(d: DrawCtx, show: AirShow, tStart: number, tEnd: number, extent: number, detail: boolean) {
  const { g, S, t } = d;
  const span = Math.max(600, tEnd - tStart);
  show.vignettes.forEach((v, vi) => {
    const color = v.own ? d.ownColor : d.enemyColor;
    const u = (t - v.start) / v.dur;
    if (v.kind === "pass") {
      // 照準の印:少し前から目標に出て、通り抜けの真ん中で消える
      const lead = span * MARK_LEAD_SHARE;
      if (t >= v.start - lead && u <= 0.55 && v.plane === "attack") {
        const q = S(v.at);
        const pulse = 0.5 + 0.5 * Math.sin(t / 40);
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
      // 落ちた機:目標の上で列から外れて落ちる
      const fall = span * 0.15;
      const tMid = v.start + v.dur / 2;
      if (detail && v.lost >= 0.5 && t >= tMid && t <= tMid + fall) {
        const n = Math.min(3, Math.max(1, Math.round(v.lost)));
        const hd = headingOf(v.dir.x, v.dir.y);
        for (let i = 0; i < n; i++) drawFalling(d, v.plane, color, add(v.at, { x: (h01(vi * 7 + i) - 0.5) * 600, y: (h01(vi * 11 + i) - 0.5) * 600 }), hd + i * 30, ((t - tMid) / fall) * FALL_S, vi * 13 + i);
      }
      // 空輸の落下傘
      if (v.drop && t >= tMid && t <= tMid + span * 0.2) drawChutes(g, S, v.at, ((t - tMid) / (span * 0.2)) * 900, 8);
      if (u < 0 || u > 1) return;
      // 対空砲火:目標の上ではじける弾幕
      if (detail && v.flak && u > 0.25 && u < 0.75)
        for (let i = 0; i < 10; i++) {
          const born = 0.25 + h01(vi * 31 + i) * 0.4;
          const age = (u - born) / 0.12;
          if (age < 0 || age > 1) continue;
          const q = S({ x: v.at.x + (h01(i * 5 + vi) - 0.5) * 1500, y: v.at.y + (h01(i * 9 + vi + 1) - 0.5) * 1500 });
          const y = q.y - 18;
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
      // 機:一直線に等速で、目標の上を通り抜ける(地図の外から外へ)
      const hd = headingOf(v.dir.x, v.dir.y);
      const lead0 = add(v.at, v.dir, extent * (2 * u - 1));
      const n = Math.min(3, Math.max(1, Math.ceil(v.aircraft / 6)));
      const size = PLANE_PX[v.plane] * PASS_PLANE_SCALE;
      const low = 1 - Math.min(1, Math.abs(2 * u - 1) * 2.5);
      for (let i = 0; i < n; i++) {
        const pl = slot({ pos: lead0, heading: hd }, i, v.plane === "transport" ? 450 : 320);
        const p = S(pl.pos);
        const alt = (v.plane === "transport" ? 26 : 20) * (1 - 0.8 * (v.strafe ? low : 0));
        g.fillStyle = "rgba(20, 20, 20, 0.25)";
        planeShape(g, v.plane, p.x + alt * 0.6, p.y + alt, hd, size);
        g.fillStyle = "#1b1b1b";
        planeShape(g, v.plane, p.x, p.y, hd, size + 2.5);
        g.fillStyle = color;
        planeShape(g, v.plane, p.x, p.y, hd, size);
        // 機銃掃射・投弾:目標の上で、進む先の地面へ曳光
        if (v.strafe && low > 0.3 && h01(Math.floor(t / 12) + i * 7 + vi) > 0.25) {
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
    if (u < 0 || u > 1.6) return;
    const fade = u > 1 ? 1 - (u - 1) / 0.6 : Math.min(1, u / 0.1);
    const mid = v.start + v.dur / 2;
    const fall = span * 0.15;
    if (detail && t >= mid && t <= mid + fall) {
      for (let i = 0; i < Math.min(3, Math.round(v.ownLost)); i++) drawFalling(d, "fighter", d.ownColor, add(v.at, { x: (h01(vi + i) - 0.5) * 900, y: (h01(vi * 3 + i) - 0.5) * 900 }), 60 * i, ((t - mid) / fall) * FALL_S, vi * 17 + i);
      for (let i = 0; i < Math.min(3, Math.round(v.enemyLost)); i++) drawFalling(d, "fighter", d.enemyColor, add(v.at, { x: (h01(vi * 5 + i) - 0.5) * 900, y: (h01(vi * 7 + i) - 0.5) * 900 }), 120 + 60 * i, ((t - mid) / fall) * FALL_S, vi * 19 + i);
    }
    if (u > 1) return;
    g.globalAlpha = fade;
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
        if (h01(Math.floor(t / 18) + i * 5 + vi) < 0.35) continue;
        const a = S(planes[i]!.pos);
        const b = S(planes[2 + ((i + Math.floor(t / 40)) % 2)]!.pos);
        g.strokeStyle = h01(Math.floor(t / 18) + i) > 0.5 ? "#ffe36b" : "#ff9a5a";
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
