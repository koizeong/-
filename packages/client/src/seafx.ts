import type { SideReplay, TurnEvent, Vec2 } from "@brigade/sim-core";
import { h01, type DrawCtx } from "./flavor.js";

/**
 * 海戦の再生の演出(ルールには関わらない。地図の「演出」で切り替え)。
 * - 砲弾:撃った艦から目標へ飛ぶ弾。着くと、当たった弾があれば橙の炸裂、なければ白い水柱
 * - 雷跡:自軍の雷撃は、撃った艦から狙った点へ白い航跡が延びる
 * - 被雷・誘爆・撃沈:大きな水柱・爆発と、浮かぶ大きな文字
 */

/** 弾の飛ぶ時間(ゲーム内の秒)。本当の飛ぶ時間より長くして、目で追えるようにする */
const FLIGHT_PER_M = 0.004;
const FLIGHT_MIN = 25;
/** 着弾の水柱・炸裂の残る時間(ゲーム内の秒) */
const SPLASH_SEC = 90;
/** 魚雷の速さ(m/秒。表示用) */
const TORPEDO_MPS = 22;

function lerp(a: Vec2, b: Vec2, k: number): Vec2 {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** 砲弾の飛翔と着弾。hits のない撃ち合い(陸の撃ち合い)は描かない */
export function drawShellFire(d: DrawCtx, rp: SideReplay) {
  const { g, S, t } = d;
  for (let n = 0; n < rp.shots.length; n++) {
    const sh = rp.shots[n]!;
    if (sh.hits === undefined) continue;
    const range = Math.hypot(sh.to.x - sh.from.x, sh.to.y - sh.from.y);
    const flight = Math.max(FLIGHT_MIN, range * FLIGHT_PER_M);
    const age = t - sh.t;
    if (age < 0 || age > flight + SPLASH_SEC) continue;
    const a = S(sh.from);
    const b = S(sh.to);
    const color = sh.dir === "out" ? "255, 212, 0" : "255, 77, 77";
    if (age <= flight) {
      // 飛んでいる弾:斉射の3発を少しずらして、弧を描くように(画面の上へ膨らませる)
      const k = age / flight;
      for (let i = 0; i < 3; i++) {
        const kk = Math.max(0, Math.min(1, k - i * 0.04));
        const p = lerp(a, b, kk);
        const lift = Math.sin(Math.PI * kk) * Math.min(40, Math.hypot(b.x - a.x, b.y - a.y) * 0.15);
        g.fillStyle = `rgba(${color}, 0.95)`;
        g.beginPath();
        g.arc(p.x + (h01(n * 7 + i) - 0.5) * 4, p.y - lift, 2.2, 0, Math.PI * 2);
        g.fill();
        // 尾
        const q = lerp(a, b, Math.max(0, kk - 0.05));
        const qlift = Math.sin(Math.PI * Math.max(0, kk - 0.05)) * Math.min(40, Math.hypot(b.x - a.x, b.y - a.y) * 0.15);
        g.strokeStyle = `rgba(${color}, 0.45)`;
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(q.x, q.y - qlift);
        g.lineTo(p.x, p.y - lift);
        g.stroke();
      }
      continue;
    }
    const k = (age - flight) / SPLASH_SEC;
    if (sh.hits > 0) {
      // 命中:橙の炸裂と、当たった数
      const r = 6 + 10 * k;
      g.fillStyle = `rgba(255, 150, 40, ${0.9 * (1 - k)})`;
      g.beginPath();
      g.arc(b.x, b.y, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `rgba(255, 240, 180, ${0.9 * (1 - k)})`;
      g.beginPath();
      g.arc(b.x, b.y, r * 0.45, 0, Math.PI * 2);
      g.fill();
      if (k < 0.7) {
        g.font = "bold 12px sans-serif";
        g.lineWidth = 3;
        g.strokeStyle = "rgba(0,0,0,0.7)";
        const label = sh.hits > 1 ? `命中×${sh.hits}` : "命中";
        g.strokeText(label, b.x + 9, b.y - 9 - 10 * k);
        g.fillStyle = sh.dir === "out" ? "#ffe066" : "#ff6b6b";
        g.fillText(label, b.x + 9, b.y - 9 - 10 * k);
        g.font = "12px sans-serif";
      }
    } else {
      // 外れ:目標のまわりに白い水柱(3本)
      for (let i = 0; i < 3; i++) {
        const ox = (h01(n * 13 + i) - 0.5) * 22;
        const oy = (h01(n * 17 + i) - 0.5) * 22;
        const hgt = 10 * Math.sin(Math.PI * Math.min(1, k * 1.6));
        g.strokeStyle = `rgba(235, 245, 255, ${0.85 * (1 - k)})`;
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(b.x + ox, b.y + oy);
        g.lineTo(b.x + ox, b.y + oy - hgt);
        g.stroke();
        g.strokeStyle = `rgba(235, 245, 255, ${0.5 * (1 - k)})`;
        g.lineWidth = 1;
        g.beginPath();
        g.arc(b.x + ox, b.y + oy, 2 + 5 * k, 0, Math.PI * 2);
        g.stroke();
      }
    }
  }
}

/** 自軍の雷跡:撃った艦の位置から狙った点へ、魚雷の速さで延びる白い線(扇に3本) */
export function drawTorpedoWakes(d: DrawCtx, rp: SideReplay) {
  const { g, S, t } = d;
  for (const e of rp.events) {
    if (e.type !== "torpedoLaunched") continue;
    const age = t - e.t;
    const track = rp.own[e.unitId];
    if (age < 0 || !track?.length) continue;
    const from = track.find((p) => p.t >= e.t) ?? track[track.length - 1]!;
    const dist = Math.hypot(e.at.x - from.x, e.at.y - from.y);
    const run = TORPEDO_MPS * age;
    if (run > dist + 2000) continue;
    const ang = Math.atan2(e.at.y - from.y, e.at.x - from.x);
    for (let i = -1; i <= 1; i++) {
      const a2 = ang + i * 0.06;
      const len = Math.min(run, dist * 1.15);
      const head = { x: from.x + Math.cos(a2) * len, y: from.y + Math.sin(a2) * len };
      const tail = { x: from.x + Math.cos(a2) * Math.max(0, len - 3000), y: from.y + Math.sin(a2) * Math.max(0, len - 3000) };
      const p = S(tail);
      const q = S(head);
      g.strokeStyle = "rgba(240, 250, 255, 0.75)";
      g.setLineDash([4, 3]);
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(q.x, q.y);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = "rgba(255, 255, 255, 0.95)";
      g.beginPath();
      g.arc(q.x, q.y, 1.8, 0, Math.PI * 2);
      g.fill();
    }
  }
}

type Big = { t: number; at: Vec2; kind: "torpedoHit" | "magazine" | "sunk"; own: boolean };

/** 自軍の艦と、見えていた敵の艦の被雷・誘爆・撃沈 */
export function bigSeaEvents(rp: SideReplay): Big[] {
  const out: Big[] = [];
  const ownAt = (e: TurnEvent): Vec2 | undefined => {
    const tr = rp.own[e.unitId];
    if (!tr?.length) return undefined;
    return tr.find((p) => p.t >= e.t) ?? tr[tr.length - 1];
  };
  for (const e of rp.events) {
    const kind = e.type === "torpedoHit" ? "torpedoHit" : e.type === "shipDamage" && e.kind === "magazine" ? "magazine" : e.type === "destroyed" && rp.own[e.unitId] ? "sunk" : undefined;
    if (!kind) continue;
    // 陸の部隊の壊滅は、ここでは扱わない(艦の軌跡だけを持つ海戦の再生で使う)
    const at = ownAt(e);
    if (at) out.push({ t: e.t, at, kind, own: true });
  }
  for (const x of rp.seaSights ?? []) out.push({ t: x.t, at: { x: x.x, y: x.y }, kind: x.kind, own: false });
  return out;
}

const BIG_SEC = 240;
const BIG_LABEL: Record<Big["kind"], [string, string]> = {
  torpedoHit: ["被雷!", "魚雷命中!"],
  magazine: ["誘爆!", "誘爆!"],
  sunk: ["沈没", "撃沈!"],
};

/** 被雷の大きな水柱、誘爆・撃沈の爆発と、大きな文字 */
export function drawBigSeaEvents(d: DrawCtx, list: readonly Big[]) {
  const { g, S, t } = d;
  for (const b of list) {
    const age = t - b.t;
    if (age < 0 || age > BIG_SEC) continue;
    const k = age / BIG_SEC;
    const p = S(b.at);
    if (b.kind === "torpedoHit") {
      // 白い大きな水柱と、広がる輪
      g.fillStyle = `rgba(240, 248, 255, ${0.9 * (1 - k)})`;
      g.beginPath();
      g.ellipse(p.x, p.y - 12 * (1 - k), 6, 18 * (1 - k * 0.5), 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = `rgba(240, 248, 255, ${0.8 * (1 - k)})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(p.x, p.y, 8 + 30 * k, 0, Math.PI * 2);
      g.stroke();
    } else {
      // 爆発:橙と黄の火の玉と、黒い煙
      const r = 10 + 26 * Math.min(1, k * 2);
      g.fillStyle = `rgba(40, 35, 30, ${0.6 * (1 - k)})`;
      g.beginPath();
      g.arc(p.x, p.y - 16 * k, r * 1.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `rgba(255, 120, 20, ${0.9 * (1 - k)})`;
      g.beginPath();
      g.arc(p.x, p.y, r * (1 - k * 0.5), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = `rgba(255, 235, 140, ${0.95 * (1 - k)})`;
      g.beginPath();
      g.arc(p.x, p.y, r * 0.45 * (1 - k * 0.5), 0, Math.PI * 2);
      g.fill();
    }
    if (k < 0.85) {
      const label = BIG_LABEL[b.kind][b.own ? 0 : 1];
      g.font = "bold 18px sans-serif";
      g.lineWidth = 4;
      g.strokeStyle = "rgba(0,0,0,0.8)";
      const y = p.y - 26 - 18 * k;
      g.strokeText(label, p.x + 12, y);
      g.fillStyle = b.own ? "#ff5a4f" : "#ffe066";
      g.fillText(label, p.x + 12, y);
      g.font = "12px sans-serif";
    }
  }
}
