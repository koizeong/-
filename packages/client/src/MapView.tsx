import type { ContactView, OwnUnitView, Vec2 } from "@brigade/sim-core";
import { useEffect, useMemo, useRef, useState } from "react";
import { intendedMode, type Game } from "./game.js";
import { bearingDeg, fitCamera, toScreen, toWorld, type Camera } from "./geo.js";

const TERRAIN_COLORS: Record<string, string> = {
  plain: "#e3e7c9",
  forest: "#7aa262",
  town: "#b8a48c",
  hill: "#cdb88e",
  river: "#8fb6d9",
  large_river: "#5d8fc4",
  impassable_high: "#8a7a6a",
};
const SIDE_COLORS: Record<number, string> = { 0: "#2f6db5", 1: "#c0392b" };
/** 地図の倍率の範囲(1m あたりのピクセル)と、ボタン・キー1回の拡大率 */
const MIN_SCALE = 0.005;
const MAX_SCALE = 0.5;
const ZOOM_STEP = 1.25;

/** 地形の画像(1セル = 1ピクセル)。拡大して描く */
function terrainImage(rows: string[], legend: Record<string, string>): HTMLCanvasElement {
  const h = rows.length;
  const w = [...(rows[0] ?? "")].length;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  rows.forEach((row, r) =>
    [...row].forEach((ch, col) => {
      g.fillStyle = TERRAIN_COLORS[legend[ch] ?? ""] ?? "#ddd";
      g.fillRect(col, r, 1, 1);
    }),
  );
  return c;
}

/** 決まった値から 0〜1 の擬似乱数を作る(描画のゆらぎ用。毎フレーム同じ形になるように) */
function hash01(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** 爆発の印(着弾のエフェクト)。k は 0〜1 の強さ */
function burst(g: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number, k: number) {
  for (let i = 0; i < 9; i++) {
    const a = hash01(seed + i) * Math.PI * 2;
    const d = Math.sqrt(hash01(seed + i * 7 + 3)) * r;
    const s = 2 + hash01(seed + i * 13) * 4 * k;
    g.beginPath();
    g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, s, 0, Math.PI * 2);
    g.fill();
  }
}

/** 地図に重ねて出す出来事の短い文字(再生中) */
const EVENT_POPUPS: Partial<Record<string, string>> = {
  contact: "接敵",
  blocked: "阻止された",
  breakthrough: "突破!",
  breached: "突破された",
  encircled: "包囲",
  surrendered: "投降",
  routed: "潰走",
  rallied: "立ち直り",
  overrun: "蹂躙された",
  destroyed: "壊滅",
  outOfFuel: "燃料切れ",
};

/** 再生中の位置(軌跡を時刻で補間) */
/** 帯(正面幅)の両端(世界座標)。正面(facing)に対して横に伸びる */
function frontEnds(pos: Vec2, facing: number, width: number): [Vec2, Vec2] {
  const r = (facing * Math.PI) / 180;
  const lx = Math.cos(r) * (width / 2);
  const ly = -Math.sin(r) * (width / 2);
  return [
    { x: pos.x - lx, y: pos.y - ly },
    { x: pos.x + lx, y: pos.y + ly },
  ];
}

/** 縮尺バーの長さ(m):画面で maxPx 以下に収まる、1・2・5 × 10^n の最大値 */
function scaleBarM(scale: number, maxPx: number): number {
  const maxM = maxPx / scale;
  const p = Math.pow(10, Math.floor(Math.log10(maxM)));
  return [5, 2, 1].map((k) => k * p).find((m) => m <= maxM) ?? p;
}

function along(track: { t: number; x: number; y: number; facing?: number }[], t: number) {
  if (track.length === 0) return null;
  if (t <= track[0]!.t) return track[0]!;
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1]!;
    const b = track[i]!;
    if (t <= b.t) {
      const k = (t - a.t) / (b.t - a.t || 1);
      // 向きは近い回り方で補間する(展開した連隊の旋回が滑らかに見えるように)
      const facing = a.facing === undefined || b.facing === undefined ? (b.facing ?? a.facing) : a.facing + ((((b.facing - a.facing) % 360) + 540) % 360 - 180) * k;
      return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, facing };
    }
  }
  return track[track.length - 1]!;
}

export function MapView({ game }: { game: Game }) {
  const { s } = game;
  const info = s.info!;
  const view = s.view!;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const widthM = [...(info.map.rows[0] ?? "")].length * info.map.cellSizeM;
  const heightM = info.map.rows.length * info.map.cellSizeM;
  const [cam, setCam] = useState<Camera>(() => fitCamera(widthM, heightM, 800, 600));
  const fitted = useRef(false);
  const terrain = useMemo(() => terrainImage(info.map.rows, info.map.legend), [info]);
  const sideIndex = (side: string) => Math.max(0, info.sides.findIndex((x) => x.id === side));
  const enemyColor = SIDE_COLORS[sideIndex(info.mySide) === 0 ? 1 : 0]!;
  const myColor = SIDE_COLORS[sideIndex(info.mySide)]!;
  // 操作中の状態(押した位置、ドラッグ中の向き、パン、ピンチ)
  const drag = useRef<{ kind: "pan" | "order"; start: Vec2; sx: number; sy: number; cam: Camera; shift: boolean } | null>(null);
  const [dragFacing, setDragFacing] = useState<{ at: Vec2; facing: number | null } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; scale: number } | null>(null);
  const [showSupply, setShowSupply] = useState(true);
  const sizeRef = useRef(size);
  sizeRef.current = size;

  /** 地図の中心がマップの外へ出ていかないようにする */
  const clampCam = (c: Camera): Camera => ({
    scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, c.scale)),
    cx: Math.min(widthM, Math.max(0, c.cx)),
    cy: Math.min(heightM, Math.max(0, c.cy)),
  });
  /** 画面上の点 (px, py) の下の地点を動かさずに、倍率を factor 倍にする */
  const zoomAt = (c: Camera, factor: number, px: number, py: number): Camera => {
    const { w, h } = sizeRef.current;
    const before = toWorld(c, px, py, w, h);
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, c.scale * factor));
    return clampCam({ scale, cx: before.x - (px - w / 2) / scale, cy: before.y + (py - h / 2) / scale });
  };
  /** 画面のピクセルで (dx, dy) だけ見る範囲を動かす(右・下が正) */
  const panBy = (c: Camera, dx: number, dy: number): Camera => clampCam({ ...c, cx: c.cx + dx / c.scale, cy: c.cy - dy / c.scale });

  // ホイール:そのままならスクロール(パン)、Ctrl/⌘ を押しながら(トラックパッドのピンチも)なら拡大縮小。
  // ブラウザ自体の拡大やページのスクロールを止めるため、passive でない native のリスナーで受ける
  useEffect(() => {
    const el = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? sizeRef.current.h : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        // マウスのホイール1目盛り(約100)で 1.25 倍ほど。トラックパッドのピンチは小さな値が続けて来る
        setCam((c) => zoomAt(c, Math.exp(-Math.max(-50, Math.min(50, dy)) * 0.0045), e.clientX - r.left, e.clientY - r.top));
      } else if (e.shiftKey && dx === 0) {
        setCam((c) => panBy(c, dy, 0));
      } else {
        setCam((c) => panBy(c, dx, dy));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [widthM, heightM]);

  // 矢印キー・WASD でスクロール、+ / - で拡大縮小(入力欄にいるときは効かない)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const { w, h } = sizeRef.current;
      const step = e.shiftKey ? 0.5 : 0.2;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const move: Record<string, [number, number]> = {
        ArrowLeft: [-w * step, 0], a: [-w * step, 0],
        ArrowRight: [w * step, 0], d: [w * step, 0],
        ArrowUp: [0, -h * step], w: [0, -h * step],
        ArrowDown: [0, h * step], s: [0, h * step],
      };
      if (move[k]) {
        e.preventDefault();
        const [dx, dy] = move[k]!;
        setCam((c) => panBy(c, dx, dy));
      } else if (k === "+" || k === "=" || k === ";") {
        setCam((c) => zoomAt(c, ZOOM_STEP, w / 2, h / 2));
      } else if (k === "-") {
        setCam((c) => zoomAt(c, 1 / ZOOM_STEP, w / 2, h / 2));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [widthM, heightM]);

  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(100, r.width), h: Math.max(100, r.height) });
      if (!fitted.current) {
        setCam(fitCamera(widthM, heightM, r.width, r.height));
        fitted.current = true;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [widthM, heightM]);

  // ---- 描画 ----
  useEffect(() => {
    const c = canvasRef.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { w, h } = size;
    const S = (p: Vec2) => toScreen(cam, p, w, h);
    // 自軍ユニットの正面幅(展開済みのときだけ。戦力がしきい値を割ると縮む)
    const fr = info.frontage;
    const ownFrontage = (u: OwnUnitView) =>
      u.formation !== "deployed" ? 0 : (fr.byToe[u.toe] ?? 0) * (u.strength < fr.reducedBelowStrength ? fr.reducedMultiplier : 1);
    /** 帯(正面幅)を描く */
    const drawFront = (pos: Vec2, facing: number, width: number, color: string, alpha: number) => {
      if (width <= 0) return;
      const [a, b] = frontEnds(pos, facing, width).map(S) as [Vec2, Vec2];
      g.globalAlpha = alpha;
      g.strokeStyle = color;
      g.lineWidth = Math.max(4, 120 * cam.scale);
      g.lineCap = "butt";
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
      g.globalAlpha = 1;
    };
    g.fillStyle = "#cfd6dc";
    g.fillRect(0, 0, w, h);

    // 地形
    const tl = S({ x: 0, y: heightM });
    g.imageSmoothingEnabled = false;
    g.drawImage(terrain, tl.x, tl.y, widthM * cam.scale, heightM * cam.scale);

    // 道路
    g.strokeStyle = "#6b5a45";
    g.lineWidth = Math.max(1.5, 30 * cam.scale);
    for (const e of info.roads.edges) {
      const a = S(info.roads.nodes[e.from]!);
      const b = S(info.roads.nodes[e.to]!);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }

    // 補給路(自軍だけ):集積所から道路をたどって、各部隊が道路に出るノードまで(緑)。
    // 道路から部隊までは細い点線。選んだ部隊の補給路は太く。補給路を断たれた部隊は赤い破線の円
    if (showSupply && s.phase !== "replay") {
      const usage = new Map<number, number>();
      for (const r of Object.values(view.supplyRoutes)) for (const i of r.edges) usage.set(i, (usage.get(i) ?? 0) + 1);
      const selRoute = s.selected ? view.supplyRoutes[s.selected] : undefined;
      g.lineCap = "round";
      for (const [i, n] of usage) {
        const e = info.roads.edges[i];
        if (!e) continue;
        const a = S(info.roads.nodes[e.from]!);
        const b = S(info.roads.nodes[e.to]!);
        const sel = selRoute?.edges.includes(i);
        g.strokeStyle = sel ? "#1b8a3a" : "#2ecc71aa";
        g.lineWidth = (sel ? 7 : 3) + Math.min(4, n - 1);
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
      }
      g.lineCap = "butt";
      for (const u of view.own) {
        const r = view.supplyRoutes[u.id];
        const p = S(u.pos);
        if (r) {
          const q = S(info.roads.nodes[r.accessNodeId]!);
          g.strokeStyle = s.selected === u.id ? "#1b8a3a" : "#2ecc71aa";
          g.lineWidth = s.selected === u.id ? 2 : 1.5;
          g.setLineDash([2, 3]);
          g.beginPath();
          g.moveTo(q.x, q.y);
          g.lineTo(p.x, p.y);
          g.stroke();
          g.setLineDash([]);
        } else if (u.strength > 0) {
          g.strokeStyle = "#c0392b";
          g.lineWidth = 2;
          g.setLineDash([4, 3]);
          g.beginPath();
          g.arc(p.x, p.y, 22, 0, Math.PI * 2);
          g.stroke();
          g.setLineDash([]);
        }
      }
    }
    // 自軍の集積所(在庫つき)
    for (const d of view.depots) {
      const node = info.roads.nodes[d.nodeId];
      if (!node) continue;
      const p = S(node);
      const empty = d.ammoT <= 0 && d.fuelT <= 0;
      g.fillStyle = empty ? "#999" : "#1b8a3a";
      g.strokeStyle = "#111";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(p.x, p.y - 9);
      g.lineTo(p.x + 9, p.y);
      g.lineTo(p.x, p.y + 9);
      g.lineTo(p.x - 9, p.y);
      g.closePath();
      g.fill();
      g.stroke();
      g.font = "11px sans-serif";
      g.fillStyle = "#0b4d1f";
      g.fillText(`集積所 弾${Math.round(d.ammoT)}t 燃${Math.round(d.fuelT)}t`, p.x + 11, p.y + 4);
    }

    // 目標(保持陣営の色)
    g.font = "12px sans-serif";
    for (const o of info.objectives) {
      const p = S(o);
      const holder = view.objectives[o.id];
      g.beginPath();
      g.arc(p.x, p.y, Math.max(6, o.radiusM * cam.scale), 0, Math.PI * 2);
      g.strokeStyle = holder ? SIDE_COLORS[sideIndex(holder)]! : "#555";
      g.lineWidth = 2;
      g.setLineDash([4, 3]);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = "#222";
      g.fillText(`${o.name}${o.weight > 1 ? `(${o.weight})` : ""}`, p.x + 8, p.y - 8);
    }

    // 予約済み・下書きの司令部コマンド
    // 同じ地点に印が重なったら、文字を1行ずつ上にずらす
    const labelRows = new Map<string, number>();
    const ring = (p: Vec2, r: number, color: string, label: string) => {
      const q = S(p);
      g.beginPath();
      g.arc(q.x, q.y, Math.max(5, r * cam.scale), 0, Math.PI * 2);
      g.fillStyle = color + "33";
      g.fill();
      g.strokeStyle = color;
      g.stroke();
      // 文字は円の上に出す(着弾した地点の文字は円の下、再生中の着弾は右に出して重ならないようにする)
      g.fillStyle = color;
      const key = `${Math.round(q.x / 8)}:${Math.round(q.y / 8)}`;
      const row = labelRows.get(key) ?? 0;
      labelRows.set(key, row + 1);
      g.fillText(label, q.x - g.measureText(label).width / 2, q.y - Math.max(5, r * cam.scale) - 10 - row * 14);
    };
    /** 照準の印(砲撃・空襲の着弾予定地) */
    const crosshair = (p: Vec2, r: number, color: string) => {
      const q = S(p);
      const rr = Math.max(8, r * cam.scale);
      g.strokeStyle = color;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(q.x - rr - 6, q.y);
      g.lineTo(q.x - rr * 0.4, q.y);
      g.moveTo(q.x + rr * 0.4, q.y);
      g.lineTo(q.x + rr + 6, q.y);
      g.moveTo(q.x, q.y - rr - 6);
      g.lineTo(q.x, q.y - rr * 0.4);
      g.moveTo(q.x, q.y + rr * 0.4);
      g.lineTo(q.x, q.y + rr + 6);
      g.stroke();
    };
    for (const m of view.fireMissions) {
      ring(m.target, info.ranges.indirectImpactRadiusM, "#a35200", "砲撃(このターンに着弾)");
      crosshair(m.target, info.ranges.indirectImpactRadiusM, "#a35200");
    }
    for (const m of view.navalMissions) {
      ring(m.target, info.ranges.indirectImpactRadiusM, "#1f4e79", "艦砲射撃(このターンに着弾)");
      crosshair(m.target, info.ranges.indirectImpactRadiusM, "#1f4e79");
    }
    for (const m of view.airMissions) {
      if (m.kind === "airSuperiority") continue;
      if (m.kind === "airRecon") {
        ring(m.target, info.ranges.airReconRadiusM, "#00838f", "航空偵察(このターン)");
        continue;
      }
      if (m.kind === "airborneDrop") {
        ring(m.target, info.ranges.airborneScatterM, "#2e7d32", `空挺降下 ${m.unitId ?? ""}(このターンの始め)`);
        continue;
      }
      const r = m.kind === "airStrike" ? info.ranges.strikeRadiusM : info.ranges.dropRadiusM;
      ring(m.target, r, "#5a3ea8", m.kind === "airStrike" ? "空襲(このターン)" : "空輸(このターン)");
      if (m.kind === "airStrike") crosshair(m.target, r, "#5a3ea8");
    }
    for (const c of s.hq) {
      // 近接航空支援は支援する味方のまわりに、制空任務は地図には出さない
      if (c.type === "closeAirSupport") {
        const u = view.own.find((x) => x.id === c.unitId);
        if (u) ring(u.pos, info.ranges.closeSupportRadiusM, "#5a3ea8", "近接航空支援(要請中・このターン)");
        continue;
      }
      if (c.type === "airSuperiority") continue;
      if (c.type === "patrol") {
        const u = view.own.find((x) => x.id === c.unitId);
        if (u) {
          const a = S(u.pos);
          const b = S(c.target);
          g.strokeStyle = "#00838f";
          g.setLineDash([2, 3]);
          g.beginPath();
          g.moveTo(a.x, a.y);
          g.lineTo(b.x, b.y);
          g.stroke();
          g.setLineDash([]);
        }
        ring(c.target, info.ranges.patrolRadiusM, "#00838f", "斥候(このターン)");
        continue;
      }
      if (c.type === "airRecon") {
        ring(c.target, info.ranges.airReconRadiusM, "#e67e22", "航空偵察(要請中・次ターン)");
        continue;
      }
      if (c.type === "navalGunfire") {
        ring(c.target, info.ranges.indirectImpactRadiusM, "#e67e22", "艦砲射撃(要請中・次ターン)");
        crosshair(c.target, info.ranges.indirectImpactRadiusM, "#e67e22");
        continue;
      }
      if (c.type === "airborneDrop") {
        ring(c.target, info.ranges.airborneScatterM, "#2e7d32", `空挺降下 ${c.unitId}(要請中・次ターン)`);
        continue;
      }
      const r = c.type === "fireMission" ? info.ranges.indirectImpactRadiusM : c.type === "airStrike" ? info.ranges.strikeRadiusM : info.ranges.dropRadiusM;
      ring(c.target, r, "#e67e22", c.type === "fireMission" ? "砲撃(要請中:見えている敵の近くならこのターン、ほかは次ターン)" : c.type === "airStrike" ? "空襲(要請中・次ターン)" : "空輸(要請中・次ターン)");
      if (c.type !== "airDrop") crosshair(c.target, r, "#e67e22");
    }

    const replaying = s.phase === "replay" && s.last;
    const rp = s.last?.replay;
    const anyTrack = rp ? Object.values(rp.own)[0] : undefined;
    const tStart = anyTrack?.[0]?.t ?? 0;
    const tEnd = anyTrack?.[anyTrack.length - 1]?.t ?? tStart;
    /** 小ステップの長さ(秒)。昼は1分、夜は5分 */
    const stepSec = anyTrack && anyTrack.length > 1 ? anyTrack[1]!.t - anyTrack[0]!.t : 60;
    const replayT = replaying ? tStart + (tEnd - tStart) * s.replayProgress : 0;

    // 着弾(再生中:今まさに落ちているもの。作戦フェイズ:前のターンに落ちた地点を薄く)
    if (rp) {
      const seen = new Set<string>();
      for (const im of rp.impacts) {
        const color = im.own ? "#e67e22" : "#b03a2e";
        const q = S(im);
        const r = Math.max(6, im.radiusM * cam.scale);
        if (replaying) {
          const age = replayT - im.t;
          if (age < -stepSec || age > stepSec) continue;
          const k = 1 - Math.abs(age) / stepSec;
          g.globalAlpha = 0.25 + 0.35 * k;
          g.fillStyle = color;
          g.beginPath();
          g.arc(q.x, q.y, r, 0, Math.PI * 2);
          g.fill();
          g.globalAlpha = 0.9;
          g.fillStyle = "#fff2b0";
          burst(g, q.x, q.y, r, Math.floor(replayT / 7) + im.x, k);
          g.globalAlpha = 1;
          g.fillStyle = color;
          g.font = "bold 12px sans-serif";
          g.fillText(`${im.kind === "artillery" ? "砲撃" : "空襲"}${im.own ? "" : "(敵)"}`, q.x + r + 4, q.y - 4);
          g.font = "12px sans-serif";
        } else {
          const key = `${im.kind}:${Math.round(im.x)}:${Math.round(im.y)}:${im.own}`;
          if (seen.has(key)) continue;
          seen.add(key);
          g.globalAlpha = 0.18;
          g.fillStyle = color;
          g.beginPath();
          g.arc(q.x, q.y, r, 0, Math.PI * 2);
          g.fill();
          g.globalAlpha = 0.7;
          g.strokeStyle = color;
          g.setLineDash([3, 3]);
          g.stroke();
          g.setLineDash([]);
          g.fillStyle = color;
          const label = `${im.kind === "artillery" ? "砲撃" : "空襲"}の着弾(前のターン・${im.own ? "味方" : "敵"})`;
          g.fillText(label, q.x - g.measureText(label).width / 2, q.y + r + 16);
          g.globalAlpha = 1;
        }
      }
    }

    // 敵(見えているもの・ゴースト)
    const drawContact = (c: ContactView, pos: Vec2, alpha: number) => {
      const p = S(pos);
      if (!c.destroyed && c.facing !== undefined && c.frontageM) drawFront(pos, c.facing, c.frontageM, enemyColor, alpha * 0.55);
      g.globalAlpha = alpha;
      g.fillStyle = enemyColor;
      g.strokeStyle = "#111";
      g.lineWidth = 1;
      if (c.destroyed) {
        g.strokeStyle = enemyColor;
        g.beginPath();
        g.moveTo(p.x - 7, p.y - 7);
        g.lineTo(p.x + 7, p.y + 7);
        g.moveTo(p.x + 7, p.y - 7);
        g.lineTo(p.x - 7, p.y + 7);
        g.stroke();
      } else if (c.bestLevel <= 1) {
        // 反応のみ:位置だけ
        g.beginPath();
        g.arc(p.x, p.y, 6, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = "#fff";
        g.fillText("?", p.x - 3, p.y + 4);
      } else {
        g.fillRect(p.x - 12, p.y - 8, 24, 16);
        g.strokeRect(p.x - 12, p.y - 8, 24, 16);
        g.fillStyle = "#fff";
        g.fillText((info.branchNames[c.branch ?? ""] ?? "?").slice(0, 2), p.x - 10, p.y + 4);
        if (c.estimatedStrength !== undefined) {
          g.fillStyle = "#111";
          g.fillText(`${Math.round(c.estimatedStrength * 100)}%`, p.x + 14, p.y + 4);
        }
      }
      // 潰走している敵(兵種まで見えているときだけ分かる)
      if (c.routed && !c.destroyed) {
        g.fillStyle = "#555";
        g.fillRect(p.x - 13, p.y - 24, 28, 13);
        g.fillStyle = "#fff";
        g.fillText("潰走", p.x - 11, p.y - 13);
      }
      g.globalAlpha = 1;
    };
    if (replaying) {
      for (const [, track] of Object.entries(s.last!.replay.contacts)) {
        const seen = track.filter((pt) => pt.t <= replayT);
        const last = seen[seen.length - 1];
        if (last) drawContact({ contactId: "", currentLevel: last.level, bestLevel: last.level, pos: last, lastSeenTime: last.t }, last, 1);
      }
    } else {
      for (const c of view.contacts) {
        const age = (view.time - c.lastSeenTime) / 3600;
        drawContact(c, c.pos, c.currentLevel > 0 ? 1 : Math.max(0.2, 0.7 - age * 0.15));
      }
    }

    // 撃ち合いの線
    if (rp && replaying) {
      // 再生中:撃った瞬間の曳光(自軍が撃った=黄、撃たれた=赤)
      const window = stepSec * 1.5;
      for (const sh of rp.shots) {
        const age = replayT - sh.t;
        if (age < 0 || age > window) continue;
        const k = 1 - age / window;
        const a = S(sh.from);
        const b = S(sh.to);
        g.globalAlpha = 0.25 + 0.6 * k;
        g.strokeStyle = sh.dir === "out" ? "#ffd400" : "#ff4d4d";
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
        g.fillStyle = g.strokeStyle;
        g.beginPath();
        g.arc(b.x, b.y, 2 + 3 * k, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    } else if (rp) {
      // 作戦フェイズ:前のターンの終わりまで撃ち合っていた相手との「交戦中」の線
      const engaged = new Map<string, { ownId: string; contactId: string }>();
      for (const sh of rp.shots) {
        if (sh.t < tEnd - stepSec * 2 || !sh.contactId) continue;
        engaged.set(`${sh.ownId}|${sh.contactId}`, { ownId: sh.ownId, contactId: sh.contactId });
      }
      for (const { ownId, contactId } of engaged.values()) {
        const u = view.own.find((x) => x.id === ownId);
        const c = view.contacts.find((x) => x.contactId === contactId);
        if (!u || !c || c.destroyed) continue;
        const a = S(u.pos);
        const b = S(c.pos);
        g.strokeStyle = "#d35400";
        g.lineWidth = 2.5;
        g.setLineDash([8, 5]);
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = "#d35400";
        g.font = "bold 14px sans-serif";
        g.fillText("⚔", (a.x + b.x) / 2 - 6, (a.y + b.y) / 2 + 5);
        g.font = "12px sans-serif";
      }
    }

    // 斥候の地点を選んでいる間は、出す部隊から届く範囲を示す
    if (s.targeting?.kind === "patrol") {
      const src = view.own.find((x) => x.id === (s.targeting as { unitId: string }).unitId);
      if (src) {
        const p = S(src.pos);
        g.strokeStyle = "#00838f";
        g.setLineDash([6, 4]);
        g.beginPath();
        g.arc(p.x, p.y, info.ranges.patrolRangeM * cam.scale, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }
    }

    // 選んでいるユニットの阻止圏と射程(作戦フェイズ)
    const sel = !replaying && s.selected ? view.own.find((u) => u.id === s.selected) : undefined;
    if (sel) {
      const p = S(sel.pos);
      const range = info.directRanges[sel.id];
      if (range) {
        g.strokeStyle = myColor;
        g.globalAlpha = 0.6;
        g.lineWidth = 1;
        g.setLineDash([2, 4]);
        g.beginPath();
        g.arc(p.x, p.y, range * cam.scale, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = myColor;
        g.fillText(`射程 ${(range / 1000).toFixed(1)}km`, p.x + range * cam.scale * 0.72, p.y - range * cam.scale * 0.72);
        g.globalAlpha = 1;
      }
      if (sel.formation === "deployed" && !sel.routed) {
        // 阻止圏:帯(正面幅)から zoneRadiusM の範囲(幅0なら円)
        const zr = info.ranges.zoneRadiusM * cam.scale;
        const [a, b] = frontEnds(sel.pos, sel.facing, ownFrontage(sel)).map(S) as [Vec2, Vec2];
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        g.fillStyle = myColor + "22";
        g.strokeStyle = myColor;
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(b.x, b.y, zr, ang - Math.PI / 2, ang + Math.PI / 2);
        g.arc(a.x, a.y, zr, ang + Math.PI / 2, ang + (Math.PI * 3) / 2);
        g.closePath();
        g.fill();
        g.stroke();
        g.fillStyle = myColor;
        g.fillText("阻止圏", p.x - 16, Math.min(a.y, b.y) - zr - 4);
      }
    }

    // 自軍ユニット
    for (const u of view.own) {
      let pos: Vec2 = u.pos;
      let facing = u.facing;
      if (replaying) {
        const tr = s.last!.replay.own[u.id];
        const q = tr ? along(tr, replayT) : null;
        if (q) {
          pos = q;
          facing = q.facing ?? facing;
        }
      }
      const p = S(pos);
      const order = s.orders[u.id];
      drawFront(pos, facing, ownFrontage(u), u.routed ? "#888" : myColor, 0.55);
      // 追撃の相手への線(下書きの追撃、なければ今の追撃)
      const chase = order?.pursue !== undefined ? order.pursue : (u.pursuing ?? null);
      const chased = !replaying && chase !== null && !order?.waypoints ? view.contacts.find((c) => c.contactId === chase) : undefined;
      if (chased) {
        const q = S(chased.pos);
        g.strokeStyle = "#c0392b";
        g.setLineDash([8, 4]);
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(q.x, q.y);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = "#c0392b";
        g.fillText("追撃", (p.x + q.x) / 2 + 4, (p.y + q.y) / 2 - 4);
      }
      // 経路(今の経路と下書きの行き先)
      if (!replaying) {
        const route: Vec2[] = order?.waypoints ?? u.route;
        if (route.length > 0) {
          g.strokeStyle = order?.waypoints ? "#e67e22" : myColor;
          g.setLineDash(order?.waypoints ? [] : [6, 4]);
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(p.x, p.y);
          for (const w of route) {
            const q = S(w);
            g.lineTo(q.x, q.y);
          }
          g.stroke();
          g.setLineDash([]);
        }
      }
      const selected = s.selected === u.id;
      const column = u.formation === "column";
      const [bw, bh] = column ? [14, 22] : [26, 16];
      g.fillStyle = u.routed ? "#888" : myColor;
      g.strokeStyle = selected ? "#ffd400" : "#111";
      g.lineWidth = selected ? 3 : 1;
      g.fillRect(p.x - bw / 2, p.y - bh / 2, bw, bh);
      g.strokeRect(p.x - bw / 2, p.y - bh / 2, bw, bh);
      if (u.formation === "deploying") {
        g.setLineDash([2, 2]);
        g.strokeRect(p.x - 15, p.y - 10, 30, 20);
        g.setLineDash([]);
      }
      // 向き
      const rad = (facing * Math.PI) / 180;
      g.strokeStyle = "#111";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x + Math.sin(rad) * 20, p.y - Math.cos(rad) * 20);
      g.stroke();
      // 名前と戦力
      g.fillStyle = "#111";
      g.fillText(u.id.replace(/^[a-z]+-/, ""), p.x + 15, p.y - 2);
      g.fillStyle = u.strength < 0.5 ? "#c0392b" : "#333";
      g.fillText(`${Math.round(u.strength * 100)}%${u.entrenchment > 0 ? ` 陣${u.entrenchment}` : ""}`, p.x + 15, p.y + 11);
      // 3つのゲージ(戦力・制圧・士気)を小さな棒で
      const bars: [number, string][] = [
        [u.strength, "#2e8b57"],
        [u.suppression, "#e67e22"],
        [u.morale, "#2f6db5"],
      ];
      bars.forEach(([v, color], i) => {
        const y = p.y + bh / 2 + 3 + i * 4;
        g.fillStyle = "#0006";
        g.fillRect(p.x - 13, y, 26, 3);
        g.fillStyle = color;
        g.fillRect(p.x - 13, y, 26 * Math.max(0, Math.min(1, v)), 3);
      });
      // 状態の札(潰走・動揺・補給切れ・弾薬切れ・燃料切れ)
      const tags: [string, string][] = [];
      if (u.routed) tags.push(["潰走", "#555"]);
      else if (u.morale < info.shakenBelow) tags.push(["動揺", "#c79100"]);
      if (u.suppression >= 0.5) tags.push(["制圧", "#e67e22"]);
      if (!u.supplied) tags.push(["補給×", "#c0392b"]);
      if (u.ammo <= 0) tags.push(["弾切", "#c0392b"]);
      if (u.fuel <= 0) tags.push(["燃切", "#c0392b"]);
      let tx = p.x - 13;
      for (const [label, color] of tags) {
        const tw = g.measureText(label).width + 6;
        g.fillStyle = color;
        g.fillRect(tx, p.y - bh / 2 - 16, tw, 13);
        g.fillStyle = "#fff";
        g.fillText(label, tx + 3, p.y - bh / 2 - 5);
        tx += tw + 2;
      }
      // 再生中:撃たれた瞬間に赤く光らせる
      if (replaying && rp) {
        const hit = rp.events.some((e) => e.unitId === u.id && e.type === "hit" && replayT - e.t >= 0 && replayT - e.t < stepSec);
        if (hit) {
          g.strokeStyle = "#ff3b30";
          g.lineWidth = 3;
          g.strokeRect(p.x - bw / 2 - 4, p.y - bh / 2 - 4, bw + 8, bh + 8);
        }
        // 出来事を短い文字で浮かべる(ゲーム内で10分間)
        const ev = [...rp.events].reverse().find((e) => e.unitId === u.id && EVENT_POPUPS[e.type] && replayT - e.t >= 0 && replayT - e.t < 600);
        if (ev) {
          const label = EVENT_POPUPS[ev.type]!;
          const rise = ((replayT - ev.t) / 600) * 14;
          g.font = "bold 13px sans-serif";
          const tw = g.measureText(label).width + 8;
          g.fillStyle = "#000a";
          g.fillRect(p.x - tw / 2, p.y - bh / 2 - 36 - rise, tw, 17);
          g.fillStyle = ev.type === "breakthrough" || ev.type === "rallied" ? "#7dff9a" : "#ffd27d";
          g.fillText(label, p.x - tw / 2 + 4, p.y - bh / 2 - 23 - rise);
          g.font = "12px sans-serif";
        }
      }
    }

    // ドラッグ中の向き
    if (dragFacing) {
      const p = S(dragFacing.at);
      g.fillStyle = "#e67e22";
      g.beginPath();
      g.arc(p.x, p.y, 5, 0, Math.PI * 2);
      g.fill();
      if (dragFacing.facing !== null) {
        const rad = (dragFacing.facing * Math.PI) / 180;
        g.strokeStyle = "#e67e22";
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.lineTo(p.x + Math.sin(rad) * 30, p.y - Math.cos(rad) * 30);
        g.stroke();
      }
    }

    // 縮尺バー(右下。左下は凡例のボタン)
    {
      const m = scaleBarM(cam.scale, 140);
      const px = m * cam.scale;
      const x0 = w - px - 18;
      const y0 = h - 16;
      g.fillStyle = "#fffc";
      g.fillRect(x0 - 6, y0 - 18, px + 12, 26);
      g.strokeStyle = "#111";
      g.lineWidth = 2;
      g.lineCap = "butt";
      g.beginPath();
      g.moveTo(x0, y0 - 5);
      g.lineTo(x0, y0);
      g.lineTo(x0 + px, y0);
      g.lineTo(x0 + px, y0 - 5);
      g.stroke();
      g.fillStyle = "#111";
      g.fillText(m >= 1000 ? `${m / 1000}km` : `${m}m`, x0 + 2, y0 - 7);
    }
  }, [s, cam, size, terrain, dragFacing, showSupply]);

  // ---- 操作 ----
  const unitAt = (sx: number, sy: number): OwnUnitView | null => {
    for (const u of view.own) {
      const p = toScreen(cam, u.pos, size.w, size.h);
      if (Math.abs(p.x - sx) < 15 && Math.abs(p.y - sy) < 13) return u;
    }
    return null;
  };
  /** 押した位置にある敵の印(撃破を確かめたものは除く) */
  const contactAt = (sx: number, sy: number): ContactView | null => {
    for (const c of view.contacts) {
      if (c.destroyed) continue;
      const p = toScreen(cam, c.pos, size.w, size.h);
      if (Math.abs(p.x - sx) < 14 && Math.abs(p.y - sy) < 12) return c;
    }
    return null;
  };
  const local = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = local(e);
    // 右・中ボタンのドラッグは、ユニットを選んでいても照準中でも、いつでもスクロール
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      drag.current = { kind: "pan", start: toWorld(cam, p.x, p.y, size.w, size.h), sx: p.x, sy: p.y, cam, shift: false };
      return;
    }
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), scale: cam.scale };
      drag.current = null;
      setDragFacing(null);
      return;
    }
    const world = toWorld(cam, p.x, p.y, size.w, size.h);
    const planning = s.phase === "planning";
    if (planning && s.targeting) {
      const t = s.targeting;
      if (t.kind === "fireMission") game.addHq({ side: info.mySide, type: "fireMission", unitId: t.unitId, target: world });
      else if (t.kind === "airborneDrop") game.addHq({ side: info.mySide, type: "airborneDrop", unitId: t.unitId, target: world });
      else if (t.kind === "navalGunfire") game.addHq({ side: info.mySide, type: "navalGunfire", target: world });
      else if (t.kind === "airRecon") game.addHq({ side: info.mySide, type: "airRecon", target: world });
      else if (t.kind === "patrol") game.addHq({ side: info.mySide, type: "patrol", unitId: t.unitId, target: world });
      else game.addHq({ side: info.mySide, type: t.kind, target: world });
      return;
    }
    const hit = unitAt(p.x, p.y);
    if (hit && e.button === 0) {
      game.select(hit.id);
      return;
    }
    // 敵の印を押すと追撃(目的地として敵の部隊を選ぶ。経由点・到着後の向きは使わない)
    const enemy = planning && s.selected && e.button === 0 ? contactAt(p.x, p.y) : null;
    if (enemy && s.selected) {
      const u = view.own.find((x) => x.id === s.selected);
      const moveMode = u ? intendedMode(u, s.orders[s.selected]) : undefined;
      game.setOrder(s.selected, { pursue: enemy.contactId, waypoints: undefined, facingOnArrival: undefined, ...(moveMode ? { moveMode } : {}) });
      return;
    }
    if (planning && s.selected && e.button === 0) {
      drag.current = { kind: "order", start: world, sx: p.x, sy: p.y, cam, shift: e.shiftKey };
      setDragFacing({ at: world, facing: null });
      return;
    }
    drag.current = { kind: "pan", start: world, sx: p.x, sy: p.y, cam, shift: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = local(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p);
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      setCam((c) => clampCam({ ...c, scale: pinch.current!.scale * (d / pinch.current!.d) }));
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (d.kind === "pan") {
      setCam(panBy(d.cam, -(p.x - d.sx), -(p.y - d.sy)));
    } else if (Math.hypot(p.x - d.sx, p.y - d.sy) > 10) {
      setDragFacing({ at: d.start, facing: bearingDeg(d.start, toWorld(cam, p.x, p.y, size.w, size.h)) });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "order" && s.selected) {
      const existing = s.orders[s.selected]?.waypoints ?? [];
      const waypoints = d.shift ? [...existing, d.start] : [d.start];
      const u = view.own.find((x) => x.id === s.selected);
      // 移動のしかたは隊形から決めて、毎回はっきり送る(前のターンの移動モードを引き継がない)
      const moveMode = u ? intendedMode(u, s.orders[s.selected]) : undefined;
      game.setOrder(s.selected, { waypoints, pursue: undefined, facingOnArrival: dragFacing?.facing ?? null, ...(moveMode ? { moveMode } : {}) });
    }
    setDragFacing(null);
  };

  return (
    <div ref={wrapRef} className="map">
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h, cursor: s.targeting ? "crosshair" : "default", touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="map"
      />
      {s.targeting && <div className="hint">地図を押して地点を指定(Esc で取り消し)</div>}
      <div className="map-tools">
        <button title="拡大(+ キー / Ctrl+ホイール / ピンチ)" onClick={() => setCam((c) => zoomAt(c, ZOOM_STEP, size.w / 2, size.h / 2))}>
          ＋
        </button>
        <button title="縮小(- キー)" onClick={() => setCam((c) => zoomAt(c, 1 / ZOOM_STEP, size.w / 2, size.h / 2))}>
          －
        </button>
        <button title="マップ全体を表示" onClick={() => setCam(fitCamera(widthM, heightM, size.w, size.h))}>
          全体
        </button>
        <label title="自軍の補給路(集積所から道路をたどって各部隊へ)を表示">
          <input type="checkbox" checked={showSupply} onChange={(e) => setShowSupply(e.target.checked)} />
          補給路
        </label>
      </div>
      <details className="legend">
        <summary>凡例</summary>
        <ul>
          <li><span className="sw" style={{ background: "#2e8b57" }} />戦力 <span className="sw" style={{ background: "#e67e22" }} />制圧 <span className="sw" style={{ background: "#2f6db5" }} />士気(ユニットの下の棒)</li>
          <li><span className="line" style={{ borderColor: "#d35400" }} />⚔ 交戦中(前のターンの終わりまで撃ち合っていた相手)</li>
          <li><span className="line solid" style={{ borderColor: "#ffd400" }} />自軍の射撃 <span className="line solid" style={{ borderColor: "#ff4d4d" }} />敵の射撃(再生中)</li>
          <li><span className="dot" style={{ background: "#e67e22" }} />味方の砲撃・空襲 <span className="dot" style={{ background: "#b03a2e" }} />敵の砲撃・空襲(見えたものだけ)</li>
          <li>⊕ 照準:このターンに着弾する砲撃・空襲(茶・紫)/要請中(橙)</li>
          <li><span className="line" style={{ borderColor: "#c0392b" }} />追撃(ユニットを選んで敵の印を押す。見失えば最後に見た位置まで行って止まる)</li>
          <li>ユニットの下の帯:正面幅(展開して受け持つ幅。戦力が5割を割ると縮む)。敵は規模まで見えていれば表示</li>
          <li>ユニットを選ぶと、阻止圏(帯のまわりの塗り)と射程(点線)を表示</li>
          <li><span className="line solid" style={{ borderColor: "#2ecc71" }} />補給路(太いほど多くの部隊が使う。選んだ部隊の補給路は濃い緑)◆ 自軍の集積所</li>
          <li><span className="dot" style={{ background: "transparent", border: "2px dashed #c0392b" }} />補給路を断たれた部隊</li>
          <li>スクロール:ホイール/2本指・右ドラッグ・矢印キー/WASD 拡大縮小:Ctrl+ホイール/ピンチ・+/-</li>
        </ul>
      </details>
    </div>
  );
}
