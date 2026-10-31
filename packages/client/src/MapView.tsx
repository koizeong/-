import type { ContactView, OwnUnitView, Vec2 } from "@brigade/sim-core";
import { useEffect, useMemo, useRef, useState } from "react";
import { intendedMode, type Game } from "./game.js";
import { bearingDeg, clockOf, fitCamera, toScreen, toWorld, type Camera } from "./geo.js";
import { drawPreview } from "./preview.js";
import { BAND, minus, pairingBalance, pairings } from "./Report.js";
import { drawSymbol, specOf, symbolTop } from "./symbols.js";
import { buildSorties, drawDarkness, drawFlak, drawGround, drawImpactSmoke, drawMuzzleFlashes, drawHaze, drawPrecipitation, drawSorties, drawWreck, h01 } from "./flavor.js";
import { unitLabel } from "./names.js";

export const TERRAIN_COLORS: Record<string, string> = {
  plain: "#e3e7c9",
  forest: "#7aa262",
  town: "#b8a48c",
  hill: "#cdb88e",
  river: "#8fb6d9",
  large_river: "#5d8fc4",
  tidal_flat: "#a9b7a0",
  jungle: "#3f7a3a",
  plantation: "#9cbf7a",
  volcanic_sand: "#9a9488",
  fortified_slope: "#8a7560",
  impassable_high: "#8a7a6a",
};
export const SIDE_COLORS: Record<number, string> = { 0: "#2f6db5", 1: "#c0392b" };
/** 地図の倍率の範囲(1m あたりのピクセル)と、ボタン・キー1回の拡大率 */
const MIN_SCALE = 0.005;
const MAX_SCALE = 0.5;
const ZOOM_STEP = 1.25;

/** 地形の画像(1セル = 1ピクセル)。拡大して描く */
export function terrainImage(rows: string[], legend: Record<string, string>): HTMLCanvasElement {
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
  assault: "肉薄",
  stormed: "肉薄された",
  encircled: "包囲",
  surrendered: "投降",
  routed: "潰走",
  rallied: "立ち直り",
  overrun: "蹂躙された",
  destroyed: "壊滅",
  outOfFuel: "燃料切れ",
  fireHalted: "砲撃中止",
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
  const drag = useRef<{ kind: "pan" | "order" | "box"; start: Vec2; sx: number; sy: number; cam: Camera; shift: boolean } | null>(null);
  /** 範囲選択の枠(画面の座標) */
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [dragFacing, setDragFacing] = useState<{ at: Vec2; facing: number | null } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; scale: number } | null>(null);
  const [showSupply, setShowSupply] = useState(true);
  // 演出(航空機・煙・天候・夜の暗さ・残骸の炎)。ブラウザに覚えておく
  const [flavor, setFlavor] = useState(() => {
    try {
      return localStorage.getItem("brigade.flavor") !== "off";
    } catch {
      return true;
    }
  });
  const [, setTick] = useState(0);
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

  // 再生で飛ばす編隊(ターンごとに1回組み立てる)。自軍の機は自軍の後方(敵から離れる向き)から来る
  const sorties = useMemo(() => {
    const rp = s.last?.replay;
    if (!rp) return [];
    const anyTrack = Object.values(rp.own)[0];
    const tStart = anyTrack?.[0]?.t ?? 0;
    const tEnd = anyTrack?.[anyTrack.length - 1]?.t ?? tStart;
    const mean = (ps: Vec2[]) => (ps.length ? { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length } : null);
    const mine = mean(view.own.map((u) => u.pos)) ?? { x: widthM / 2, y: heightM / 2 };
    const theirs = mean(view.contacts.filter((c) => !c.destroyed).map((c) => c.pos)) ?? { x: widthM / 2, y: heightM / 2 };
    let home = { x: mine.x - theirs.x, y: mine.y - theirs.y };
    const l = Math.hypot(home.x, home.y);
    home = l > 1 ? { x: home.x / l, y: home.y / l } : { x: 0, y: -1 };
    const { cols, rows } = info.airSectors;
    const sector = (key: string) => {
      const [c, r] = key.split(",").map(Number) as [number, number];
      const w0 = widthM / cols;
      const h0 = heightM / rows;
      return { c: { x: (c + 0.5) * w0, y: (r + 0.5) * h0 }, w: w0, h: h0 };
    };
    return buildSorties({ rp, tStart, tEnd, home, widthM, heightM, sector });
  }, [s.last]);

  // 作戦フェイズでも、降るもの・霧・燃える残骸があれば少しずつ動かす(1秒に12回ほど描き直す)
  const ambient = flavor && s.phase !== "replay" && (["rain", "snow", "fog"].includes(view.weather) || view.contacts.some((c) => c.destroyed) || (s.last?.replay.events.some((e) => e.type === "destroyed") ?? false));
  useEffect(() => {
    if (!ambient) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 80);
    return () => window.clearInterval(id);
  }, [ambient]);

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
    /** 効果の出ている姿勢(切替中は標準) */
    const stanceNow = (u: OwnUnitView) => info.stances.find((x) => x.id === (u.pendingStance !== null ? info.defaultStance : u.stance));
    const ownFrontage = (u: OwnUnitView) =>
      u.formation !== "deployed"
        ? 0
        : (fr.byToe[u.toe] ?? 0) * (u.strength < fr.reducedBelowStrength ? fr.reducedMultiplier : 1) * (stanceNow(u)?.frontageMultiplier ?? 1);
    /** 空域の四角(世界座標)。キーは "列,行"(西・南から0) */
    const sectorRect = (key: string) => {
      const [c, r] = key.split(",").map(Number) as [number, number];
      const { cols, rows } = info.airSectors;
      const w0 = widthM / cols;
      const h0 = heightM / rows;
      const a = S({ x: c * w0, y: (r + 1) * h0 });
      const b = S({ x: (c + 1) * w0, y: r * h0 });
      return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
    };
    const sectorKeyOf = (p: Vec2) => {
      const { cols, rows } = info.airSectors;
      const c = Math.min(cols - 1, Math.max(0, Math.floor((p.x / widthM) * cols)));
      const r = Math.min(rows - 1, Math.max(0, Math.floor((p.y / heightM) * rows)));
      return `${c},${r}`;
    };
    /** 帯(正面幅)を描く。shape が wedge なら正面へ尖った小さな三角形(突撃隊形)、ring なら円(全周防御) */
    const drawFront = (pos: Vec2, facing: number, width: number, color: string, alpha: number, shape: "line" | "wedge" | "ring" = "line") => {
      if (width <= 0) return;
      if (shape !== "line") {
        // 塗りつぶして描く(縁は細く濃く)
        g.globalAlpha = alpha * 0.75;
        g.fillStyle = color;
        g.strokeStyle = color;
        g.lineWidth = 1.5;
        g.beginPath();
        if (shape === "ring") {
          const c = S(pos);
          g.arc(c.x, c.y, Math.max(6, (width / 2) * cam.scale), 0, Math.PI * 2);
        } else {
          const r = (facing * Math.PI) / 180;
          const ahead = { x: Math.sin(r), y: Math.cos(r) };
          const side = { x: Math.cos(r), y: -Math.sin(r) };
          const len = width * 0.9;
          const tip = S({ x: pos.x + ahead.x * len * 0.6, y: pos.y + ahead.y * len * 0.6 });
          const l = S({ x: pos.x - ahead.x * len * 0.4 - side.x * width / 2, y: pos.y - ahead.y * len * 0.4 - side.y * width / 2 });
          const rr = S({ x: pos.x - ahead.x * len * 0.4 + side.x * width / 2, y: pos.y - ahead.y * len * 0.4 + side.y * width / 2 });
          g.moveTo(tip.x, tip.y);
          g.lineTo(l.x, l.y);
          g.lineTo(rr.x, rr.y);
          g.closePath();
        }
        g.fill();
        g.globalAlpha = Math.min(1, alpha * 1.4);
        g.stroke();
        g.globalAlpha = 1;
        return;
      }
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

    const replaying = s.phase === "replay" && s.last;
    const rp = s.last?.replay;
    const anyTrack = rp ? Object.values(rp.own)[0] : undefined;
    const tStart = anyTrack?.[0]?.t ?? 0;
    const tEnd = anyTrack?.[anyTrack.length - 1]?.t ?? tStart;
    /** 小ステップの長さ(秒)。昼は1分、夜は5分 */
    const stepSec = anyTrack && anyTrack.length > 1 ? anyTrack[1]!.t - anyTrack[0]!.t : 60;
    const replayT = replaying ? tStart + (tEnd - tStart) * s.replayProgress : 0;
    /** 演出の時計(ミリ秒) */
    const now = performance.now();
    const fx = { g, S, t: replayT, ownColor: myColor, enemyColor };

    // 地形
    const tl = S({ x: 0, y: heightM });
    g.imageSmoothingEnabled = false;
    g.drawImage(terrain, tl.x, tl.y, widthM * cam.scale, heightM * cam.scale);
    // 地面の積雪・ぬかるみ
    if (flavor) drawGround(g, tl.x, tl.y, widthM * cam.scale, heightM * cam.scale, view.ground);
    // 霧・曇り・雨のかすみ(地形の上だけ。部隊と印は読めるままに)
    if (flavor) drawHaze(g, w, h, view.weather, now);
    // 夜・暗い時間の暗さ(地形の上だけ)。再生中は、発砲・着弾・照明弾の光で周りが明るく見える
    const dark = view.phase === "night" ? 0.45 : info.darkTurns.some((d) => view.turn >= d.from && view.turn <= d.to) ? 0.35 : 0;
    if (flavor && dark > 0) {
      const lights: { x: number; y: number; r: number; k: number }[] = [];
      if (rp && replaying) {
        for (const sh of rp.shots) {
          const age = replayT - sh.t;
          if (age < 0 || age > stepSec * 0.6) continue;
          const k = 1 - age / (stepSec * 0.6);
          lights.push({ ...S(sh.from), r: 26, k: 0.6 * k });
          // 照明弾:撃ち合いのところどころで打ち上がり、しばらく広く照らす
          if (h01(sh.t * 0.37 + sh.from.x) < 0.06) lights.push({ ...S(sh.to), r: Math.max(40, 600 * cam.scale), k: 0.9 * k });
        }
        for (const im of rp.impacts) {
          const age = replayT - im.t;
          if (age < 0 || age > stepSec) continue;
          lights.push({ ...S(im), r: Math.max(30, im.radiusM * cam.scale * 1.8), k: 1 - age / stepSec });
        }
      }
      drawDarkness(g, w, h, dark, lights);
    }


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

    // 橋:無事は茶の欄干、壊れた橋は赤い×、自陣営が修理中なら進み具合。爆破・修理の要請中は橙の丸
    const pendingBridge = new Map(s.hq.filter((c) => c.type === "demolishBridge" || c.type === "repairBridge").map((c) => [(c as { bridgeId: string }).bridgeId, c.type]));
    for (const b of info.bridges) {
      const p = S(b);
      const st = view.bridges[b.id];
      const r = Math.max(5, 90 * cam.scale);
      g.lineWidth = 2;
      if (st?.destroyed) {
        g.strokeStyle = "#c0392b";
        g.beginPath();
        g.moveTo(p.x - r, p.y - r);
        g.lineTo(p.x + r, p.y + r);
        g.moveTo(p.x + r, p.y - r);
        g.lineTo(p.x - r, p.y + r);
        g.stroke();
        if (st.repairSec !== undefined) {
          g.fillStyle = "#d35400";
          g.font = "11px sans-serif";
          g.fillText(`修理 ${Math.round((st.repairSec / (info.bridgeRules.repairHours * 3600)) * 100)}%`, p.x + r + 3, p.y + 4);
        }
      } else {
        g.strokeStyle = "#3e2f1f";
        g.strokeRect(p.x - r, p.y - r * 0.6, r * 2, r * 1.2);
      }
      const pend = pendingBridge.get(b.id);
      if (pend) {
        g.strokeStyle = "#e67e22";
        g.setLineDash([3, 2]);
        g.beginPath();
        g.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = "#e67e22";
        g.font = "11px sans-serif";
        g.fillText(pend === "demolishBridge" ? "爆破(要請中)" : "修理(要請中)", p.x + r + 8, p.y - r - 2);
      }
    }

    // 空域ごとの制空権(航空戦力があり、空が争われているときだけ):自陣営の割合を、空域の隅に。劣勢の空域は赤く薄く塗る。
    // どの空域も自陣営が握っている(100%)あいだは、区切りも数字も出さない(地図が見づらくなるため。平均は上の帯に出る)
    const contestedAir = view.airControl.some((ctl) => ctl < 0.995);
    if ((info.air.fighters || info.air.strike) && contestedAir) {
      const { cols, rows } = info.airSectors;
      g.font = "11px sans-serif";
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const q = sectorRect(`${c},${r}`);
          const ctl = view.airControl[r * cols + c] ?? 0;
          if (ctl < 0.5) {
            g.fillStyle = `rgba(192,57,43,${(0.5 - ctl) * 0.25})`;
            g.fillRect(q.x, q.y, q.w, q.h);
          }
          g.strokeStyle = "#0002";
          g.lineWidth = 1;
          g.setLineDash([4, 6]);
          g.strokeRect(q.x, q.y, q.w, q.h);
          g.setLineDash([]);
          if (ctl < 0.995) {
            g.fillStyle = ctl >= 0.5 ? "#1565c0" : "#c0392b";
            g.fillText(`制空 ${Math.round(ctl * 100)}%`, q.x + 6, q.y + 15);
          }
        }
      }
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
    /** 斥候の扇形:部隊を要に、選んだ地点の方向へ(長さ・半角はルールパック) */
    const sector = (from: Vec2, toward: Vec2, color: string, label: string) => {
      const q = S(from);
      const b = Math.atan2(toward.x - from.x, toward.y - from.y);
      const half = (info.ranges.patrolHalfAngleDeg * Math.PI) / 180;
      const r = info.ranges.patrolRangeM * cam.scale;
      // 画面の角度は東が0で時計回り(北の方位0は −90度)
      const mid = b - Math.PI / 2;
      g.beginPath();
      g.moveTo(q.x, q.y);
      g.arc(q.x, q.y, r, mid - half, mid + half);
      g.closePath();
      g.fillStyle = color + "22";
      g.fill();
      g.strokeStyle = color;
      g.stroke();
      g.fillStyle = color;
      g.fillText(label, q.x + Math.cos(mid) * r * 0.6, q.y + Math.sin(mid) * r * 0.6);
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
    const markSector = (p: Vec2, color: string, label: string) => {
      const q = sectorRect(sectorKeyOf(p));
      g.strokeStyle = color;
      g.lineWidth = 3;
      g.setLineDash([10, 6]);
      g.strokeRect(q.x + 3, q.y + 3, q.w - 6, q.h - 6);
      g.setLineDash([]);
      g.fillStyle = color;
      g.fillText(label, q.x + 8, q.y + q.h - 10);
    };
    for (const it of view.interdictions) ring(it.target, info.ranges.interdictionRadiusM, "#6d4c41", "補給線への攻撃(効果が続いている)");
    for (const m of view.airMissions) {
      if (m.kind === "airSuperiority") {
        markSector(m.target, "#1565c0", "制空任務(このターン)");
        continue;
      }
      if (m.kind === "interdiction") {
        ring(m.target, info.ranges.interdictionRadiusM, "#5a3ea8", "補給線への攻撃(このターン)");
        continue;
      }
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
      // 橋の爆破・修理は橋の印のところに描いた
      if (c.type === "demolishBridge" || c.type === "repairBridge") continue;
      // 近接航空支援は支援する味方のまわりに、制空任務は地図には出さない
      if (c.type === "closeAirSupport") {
        const u = view.own.find((x) => x.id === c.unitId);
        if (u) ring(u.pos, info.ranges.closeSupportRadiusM, "#5a3ea8", "近接航空支援(要請中・このターン)");
        continue;
      }
      if (c.type === "airSuperiority") {
        markSector(c.target, "#e67e22", "制空任務(要請中・次ターン)");
        continue;
      }
      if (c.type === "interdiction") {
        ring(c.target, info.ranges.interdictionRadiusM, "#e67e22", "補給線への攻撃(要請中・次ターン)");
        continue;
      }
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
        if (u) sector(u.pos, c.target, "#00838f", "斥候(このターン)");
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
    // 敵の記号:兵種まで見えていれば菱形の枠に兵科の印、反応だけなら四つ葉の枠に「?」。撃破を確認したら × をかぶせる
    const drawContact = (c: ContactView, pos: Vec2, alpha: number) => {
      const p = S(pos);
      if (!c.destroyed && c.facing !== undefined && c.frontageM) drawFront(pos, c.facing, c.frontageM, enemyColor, alpha * 0.55);
      g.globalAlpha = alpha;
      const known = c.bestLevel > 1 && c.branch !== undefined;
      const aff = known ? "hostile" : "unknown";
      drawSymbol(g, p.x, p.y, specOf(info.symbols, known ? c.branch : undefined, undefined, aff), { color: enemyColor, muted: !!c.routed || !!c.destroyed, destroyed: !!c.destroyed }, known ? 1 : 0.85);
      if (!c.destroyed && c.estimatedStrength !== undefined) {
        g.fillStyle = "#111";
        g.fillText(`${Math.round(c.estimatedStrength * 100)}%`, p.x + 17, p.y + 4);
      }
      // 潰走している敵(兵種まで見えているときだけ分かる)
      if (c.routed && !c.destroyed) {
        const top = p.y - symbolTop(aff) - 16;
        g.fillStyle = "#555";
        g.fillRect(p.x - 14, top, 28, 13);
        g.fillStyle = "#fff";
        g.fillText("潰走", p.x - 12, top + 11);
      }
      g.globalAlpha = 1;
    };
    if (replaying) {
      for (const [id, track] of Object.entries(s.last!.replay.contacts)) {
        const seen = track.filter((pt) => pt.t <= replayT);
        const last = seen[seen.length - 1];
        // 兵種は、前から知っている敵ならその兵種で描く(軌跡の点は見えた段階だけを持つ)
        const known = view.contacts.find((c) => c.contactId === id);
        const branch = last && last.level > 1 ? known?.branch : undefined;
        if (last) drawContact({ contactId: id, currentLevel: last.level, bestLevel: last.level, pos: last, lastSeenTime: last.t, ...(branch ? { branch } : {}) }, last, 1);
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
      // 作戦フェイズ:前のターンに撃ち合った相手との線。色はどちらが押していたか(緑=押した・赤=押された・橙=互角)、
      // 太さは激しさ。線の上に「与えた損害の段階 / 受けた損害」を出す。終わりまで撃ち合っていた相手は破線(交戦中)
      const engagedNow = new Set<string>();
      for (const sh of rp.shots) if (sh.t >= tEnd - stepSec * 2 && sh.contactId) engagedNow.add(`${sh.ownId}|${sh.contactId}`);
      for (const p of pairings(rp.engagements ?? [])) {
        if (!p.contactId) continue;
        const u = view.own.find((x) => x.id === p.ownId);
        const c = view.contacts.find((x) => x.contactId === p.contactId);
        if (!u || !c || c.destroyed) continue;
        const { balance, intensity } = pairingBalance(p);
        const color = balance > 0.2 ? "#2e8b57" : balance < -0.2 ? "#c0392b" : "#d35400";
        const a = S(u.pos);
        const b = S(c.pos);
        g.strokeStyle = color;
        g.lineWidth = 1.5 + Math.min(5, intensity * 60);
        g.setLineDash(engagedNow.has(`${p.ownId}|${p.contactId}`) ? [8, 5] : [2, 4]);
        g.globalAlpha = 0.85;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
        g.setLineDash([]);
        g.globalAlpha = 1;
        // 数字は、目立つ撃ち合い(与えた損害が「小」以上か、受けた損害が0.3%以上)と、選んでいるユニットのものだけ(地図が文字で埋まらないように)
        const notable = (p.dealt !== undefined && BAND[p.dealt].rank >= 1) || p.received >= 0.003;
        if (!notable && s.selected !== p.ownId) continue;
        const text = `与${p.dealt ? BAND[p.dealt].name : "—"} / 受${p.received > 0 ? minus(p.received) : "—"}`;
        g.font = "bold 11px sans-serif";
        const tw = g.measureText(text).width + 8;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        g.fillStyle = "#fffffff0";
        g.fillRect(mx - tw / 2, my - 8, tw, 15);
        g.strokeStyle = color;
        g.lineWidth = 1;
        g.strokeRect(mx - tw / 2, my - 8, tw, 15);
        g.fillStyle = color;
        g.fillText(text, mx - tw / 2 + 4, my + 3);
        g.font = "12px sans-serif";
      }
    }

    // 再生中の演出:着弾の煙、発砲の閃光、対空砲火
    if (flavor && rp && replaying) {
      drawImpactSmoke(fx, rp, cam.scale, 900);
      drawMuzzleFlashes(fx, rp, stepSec);
      drawFlak(fx, rp, tStart, tEnd);
    }
    // 燃える残骸:撃破を確認した敵と、前のターンに失った自軍の部隊(最後にいた所)
    if (flavor) {
      for (const c of view.contacts) {
        if (!c.destroyed) continue;
        const p = S(c.pos);
        drawWreck(g, p.x + 10, p.y + 6, now, c.pos.x);
      }
      for (const e of rp?.events ?? []) {
        if (e.type !== "destroyed" || (replaying && replayT < e.t)) continue;
        const tr = rp!.own[e.unitId];
        const last = tr?.[tr.length - 1];
        if (!last) continue;
        const p = S(last);
        drawWreck(g, p.x, p.y, now, last.x);
      }
    }

    // 作戦フェイズ:前のターンの自軍の砲撃・空襲の結果を、着弾の中心に札で(いちばん大きく与えた損害の段階。誤射があれば赤)
    if (rp && !replaying) {
      const NAME: Record<string, string> = { artillery: "砲撃", airStrike: "空襲", interdiction: "補給線攻撃", closeAirSupport: "近接支援", naval: "艦砲" };
      for (const x of rp.strikes ?? []) {
        if (!x.own) continue;
        const best = x.enemyHits.reduce<string | null>((b, h) => (!b || BAND[h.dealt].rank > BAND[b as keyof typeof BAND].rank ? h.dealt : b), null);
        const text = `${NAME[x.kind] ?? x.kind}:${best ? BAND[best as keyof typeof BAND].name : x.unobservedHits ? "命中(見えず)" : "効果なし"}${x.ownHits.length ? "・誤射" : ""}`;
        const q = S(x.target);
        g.font = "bold 11px sans-serif";
        const tw = g.measureText(text).width + 8;
        g.fillStyle = x.ownHits.length ? "#c0392bdd" : best ? "#2e8b57dd" : "#555d";
        g.fillRect(q.x - tw / 2, q.y - 22, tw, 15);
        g.fillStyle = "#fff";
        g.fillText(text, q.x - tw / 2 + 4, q.y - 11);
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

    // 自軍ユニット。名前と戦力の文字は、先に描いた記号・文字と重なるなら出さない(選んだユニットは必ず出す)
    const labelBoxes: { x: number; y: number; w: number; h: number }[] = [];
    const overlaps = (a: { x: number; y: number; w: number; h: number }) =>
      labelBoxes.some((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h);
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
      drawFront(pos, facing, ownFrontage(u), u.routed ? "#888" : myColor, 0.55, stanceNow(u)?.shape ?? "line");
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
      const preview = !replaying && order?.waypoints?.length ? s.previews[u.id]?.preview : undefined;
      if (preview) {
        drawPreview(g, S, preview, "#e67e22", (sec) => clockOf(info.startHour, view.time + sec, info.startDate), s.selected === u.id);
      } else if (!replaying) {
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
      const selected = s.selected === u.id || s.group.includes(u.id);
      const column = u.formation === "column";
      // 縦隊は少し小さく描き、後ろに薄い枠を2つ連ねる(道を連なって進む形)
      const k = column ? 0.8 : 1;
      const bw = 30 * k;
      const bh = symbolTop("friend", k) * 2;
      const spec = specOf(info.symbols, u.branch, u.toe, "friend");
      const rad = (facing * Math.PI) / 180;
      if (column) {
        for (const i of [2, 1]) {
          g.globalAlpha = 0.3 + 0.15 * (2 - i);
          drawSymbol(g, p.x - Math.sin(rad) * 8 * i, p.y + Math.cos(rad) * 8 * i, { ...spec, echelon: undefined }, { color: myColor, muted: u.routed }, k);
        }
        g.globalAlpha = 1;
      }
      // 向き(記号の縁から外へ)
      g.strokeStyle = "#111";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(p.x + Math.sin(rad) * 10, p.y - Math.cos(rad) * 10);
      g.lineTo(p.x + Math.sin(rad) * 26, p.y - Math.cos(rad) * 26);
      g.stroke();
      drawSymbol(g, p.x, p.y, spec, { color: myColor, muted: u.routed, dashed: u.formation === "deploying", highlight: selected ? "#ffd400" : undefined }, k);
      // 配属された中隊(歩兵直協の戦車・突撃砲など):記号の右上に小さな記号を重ね、数を添える
      const att = info.attachments[u.toe];
      if (att) {
        att.forEach((a, i) => {
          const ax = p.x + bw / 2 - 2 - i * 13 * k;
          const ay = p.y - bh / 2 - 3 * k;
          drawSymbol(g, ax, ay, { affiliation: "friend", icon: info.symbols.branches[a.branch] ?? "armor", modifiers: [] }, { color: myColor, muted: u.routed }, 0.42 * k);
          if (a.count > 1) {
            g.fillStyle = "#111";
            g.font = "bold 9px sans-serif";
            g.fillText(`×${a.count}`, ax + 7 * k, ay - 3 * k);
            g.font = "12px sans-serif";
          }
        });
      }
      // 名前と戦力(重なるなら出さない)
      const nameText = unitLabel(u.id);
      const strengthText = `${Math.round(u.strength * 100)}%${u.entrenchment > 0 ? ` 陣${u.entrenchment}` : ""}`;
      const labelBox = { x: p.x + bw / 2 + 2, y: p.y - 14, w: Math.max(g.measureText(nameText).width, g.measureText(strengthText).width) + 6, h: 28 };
      const showLabel = selected || !overlaps(labelBox);
      labelBoxes.push({ x: p.x - bw / 2, y: p.y - bh / 2, w: bw, h: bh });
      if (showLabel) {
        labelBoxes.push(labelBox);
        g.fillStyle = "#111";
        g.fillText(nameText, p.x + bw / 2 + 4, p.y - 2);
        g.fillStyle = u.strength < 0.5 ? "#c0392b" : "#333";
        g.fillText(strengthText, p.x + bw / 2 + 4, p.y + 11);
      }
      // 前のターンに失った戦力(作戦フェイズ)
      const before = !replaying ? s.before[u.id] : undefined;
      if (showLabel && before && before.strength - u.strength >= 0.005) {
        const x = p.x + bw / 2 + 8 + g.measureText(strengthText).width;
        g.fillStyle = "#c0392b";
        g.font = "bold 12px sans-serif";
        g.fillText(`▼${Math.round((before.strength - u.strength) * 100) || "<1"}`, x, p.y + 11);
        g.font = "12px sans-serif";
      }
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
      if (info.fireBlockedUnderFire && u.underFire && info.artilleryRanges[u.id]) tags.push(["砲撃不可", "#8e44ad"]);
      let tx = p.x - 13;
      for (const [label, color] of tags) {
        const tw = g.measureText(label).width + 6;
        g.fillStyle = color;
        g.fillRect(tx, p.y - bh / 2 - 26, tw, 13);
        g.fillStyle = "#fff";
        g.fillText(label, tx + 3, p.y - bh / 2 - 15);
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
          g.fillRect(p.x - tw / 2, p.y - bh / 2 - 46 - rise, tw, 17);
          g.fillStyle = ev.type === "breakthrough" || ev.type === "rallied" ? "#7dff9a" : "#ffd27d";
          g.fillText(label, p.x - tw / 2 + 4, p.y - bh / 2 - 33 - rise);
          g.font = "12px sans-serif";
        }
      }
    }

    // 再生中の航空機(ユニットの上を飛ぶ)
    if (flavor && replaying) drawSorties(fx, sorties);
    // 降るもの(雨・雪)
    if (flavor) drawPrecipitation(g, w, h, view.weather, now);

    // 範囲選択の枠
    if (box) {
      g.save();
      g.strokeStyle = "#1b8a3a";
      g.fillStyle = "rgba(46, 204, 113, 0.12)";
      g.lineWidth = 1.5;
      g.setLineDash([5, 4]);
      const x = Math.min(box.x0, box.x1);
      const y = Math.min(box.y0, box.y1);
      g.fillRect(x, y, Math.abs(box.x1 - box.x0), Math.abs(box.y1 - box.y0));
      g.strokeRect(x, y, Math.abs(box.x1 - box.x0), Math.abs(box.y1 - box.y0));
      g.restore();
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

    // 手引きの印(いまの段が指す地点)
    const tut = s.tutorial;
    const mark = tut?.def.steps[tut.step]?.mark;
    if (mark) {
      const p = S(mark);
      g.save();
      g.strokeStyle = "#ffb300";
      g.lineWidth = 4;
      g.setLineDash([]);
      for (const r of [16, 26]) {
        g.globalAlpha = r === 16 ? 1 : 0.5;
        g.beginPath();
        g.arc(p.x, p.y, r, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
      if (mark.label) {
        g.font = "bold 13px sans-serif";
        const tw = g.measureText(mark.label).width + 10;
        g.fillStyle = "#ffb300";
        g.fillRect(p.x + 28, p.y - 34, tw, 18);
        g.fillStyle = "#111";
        g.fillText(mark.label, p.x + 33, p.y - 20);
      }
      g.restore();
    }
  });

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
      else if (t.kind === "airSuperiority") game.addHq({ side: info.mySide, type: "airSuperiority", target: world });
      else if (t.kind === "airStrike" || t.kind === "interdiction") game.addHq({ side: info.mySide, type: t.kind, target: world, ...(t.escort ? { escort: t.escort } : {}) });
      else if (t.kind === "patrol") game.addHq({ side: info.mySide, type: "patrol", unitId: t.unitId, target: world });
      else if (t.kind === "demolishBridge" || t.kind === "repairBridge") {
        // 押した所にいちばん近い橋(画面で 30px 以内)
        const near = info.bridges
          .map((b) => ({ b, d: Math.hypot(b.x - world.x, b.y - world.y) * cam.scale }))
          .filter((x) => x.d <= 30)
          .sort((p, q) => p.d - q.d)[0];
        if (near) game.addHq({ side: info.mySide, type: t.kind, bridgeId: near.b.id });
        else game.setTargeting(t);
      }
      else game.addHq({ side: info.mySide, type: t.kind, target: world });
      return;
    }
    const hit = unitAt(p.x, p.y);
    // Shift+クリックで、まとめた選択に加える・外す
    if (hit && e.button === 0 && e.shiftKey && planning) {
      game.toggleGroup(hit.id);
      return;
    }
    if (hit && e.button === 0) {
      game.select(hit.id);
      return;
    }
    const grouped = s.group.length >= 2;
    // 何も選んでいないか、まとめて選んでいるときの Shift+ドラッグは範囲選択
    if (planning && e.button === 0 && e.shiftKey && (!s.selected || grouped)) {
      drag.current = { kind: "box", start: world, sx: p.x, sy: p.y, cam, shift: true };
      setBox({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      return;
    }
    if (planning && grouped && e.button === 0) {
      drag.current = { kind: "order", start: world, sx: p.x, sy: p.y, cam, shift: false };
      setDragFacing({ at: world, facing: null });
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
    } else if (d.kind === "box") {
      setBox({ x0: d.sx, y0: d.sy, x1: p.x, y1: p.y });
    } else if (Math.hypot(p.x - d.sx, p.y - d.sy) > 10) {
      setDragFacing({ at: d.start, facing: bearingDeg(d.start, toWorld(cam, p.x, p.y, size.w, size.h)) });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "box") {
      const p = local(e);
      const [x0, x1] = [Math.min(d.sx, p.x), Math.max(d.sx, p.x)];
      const [y0, y1] = [Math.min(d.sy, p.y), Math.max(d.sy, p.y)];
      const inside = view.own.filter((u) => {
        const q = toScreen(cam, u.pos, size.w, size.h);
        return q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
      });
      game.setGroup(inside.map((u) => u.id));
      setBox(null);
      return;
    }
    if (d?.kind === "order" && s.group.length >= 2) {
      game.orderGroup(d.start, dragFacing?.facing ?? null);
    } else if (d?.kind === "order" && s.selected) {
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
      {s.targeting && (
        <div className="hint">
          {s.targeting.kind === "demolishBridge" || s.targeting.kind === "repairBridge" ? "橋の印を押して指定" : "地図を押して地点を指定"}(Esc で取り消し)
        </div>
      )}
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
        <label title="演出(再生中の航空機・着弾の煙・発砲の閃光・天候・夜の暗さ・燃える残骸)。ルールには関わらない">
          <input
            type="checkbox"
            checked={flavor}
            onChange={(e) => {
              setFlavor(e.target.checked);
              try {
                localStorage.setItem("brigade.flavor", e.target.checked ? "on" : "off");
              } catch {
                /* 覚えられなくても表示は切り替わる */
              }
            }}
          />
          演出
        </label>
      </div>
      <details className="legend">
        <summary>凡例</summary>
        <ul>
          <li>兵科記号(NATO式):自軍=長方形・敵=菱形・正体不明=四つ葉の枠。中の印は 歩兵=× 機甲=楕円 対戦車=Λ 砲兵=● 偵察=/ 対空=弧、重ねる印は 機械化・装甲=楕円 空挺=翼(グライダーは点線) 水陸両用=波。枠の上は規模(I 中隊・II 大隊・III 連隊・X 旅団)。縦隊は小さく連なり、展開中は点線の枠</li>
          <li>記号の右上の小さな記号:戦いの前に配属された中隊(歩兵直協の戦車・突撃砲など。×2 は2個中隊)。中隊は部隊の一部として撃ち、撃たれる。装甲の中隊は近くの敵から歩兵が護衛する。内訳と残りはユニットの欄</li>
          <li><span className="sw" style={{ background: "#2e8b57" }} />戦力 <span className="sw" style={{ background: "#e67e22" }} />制圧 <span className="sw" style={{ background: "#2f6db5" }} />士気(ユニットの下の棒)</li>
          <li><span className="line" style={{ borderColor: "#2e8b57" }} /><span className="line" style={{ borderColor: "#c0392b" }} />前のターンの撃ち合い(緑=押した・赤=押された・橙=互角。太いほど激しい。破線は終わりまで撃ち合っていた相手。数字は 与えた損害の段階 / 受けた損害)</li>
          <li>▼12:前のターンに失った戦力(%)</li>
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
