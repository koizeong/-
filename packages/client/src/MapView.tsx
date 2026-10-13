import type { ContactView, OwnUnitView, Vec2 } from "@brigade/sim-core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Game } from "./game.js";
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

/** 再生中の位置(軌跡を時刻で補間) */
function along(track: { t: number; x: number; y: number; facing?: number }[], t: number) {
  if (track.length === 0) return null;
  if (t <= track[0]!.t) return track[0]!;
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1]!;
    const b = track[i]!;
    if (t <= b.t) {
      const k = (t - a.t) / (b.t - a.t || 1);
      return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, facing: b.facing ?? a.facing };
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
    const ring = (p: Vec2, r: number, color: string, label: string) => {
      const q = S(p);
      g.beginPath();
      g.arc(q.x, q.y, Math.max(5, r * cam.scale), 0, Math.PI * 2);
      g.fillStyle = color + "33";
      g.fill();
      g.strokeStyle = color;
      g.stroke();
      g.fillStyle = color;
      g.fillText(label, q.x + 6, q.y + 14);
    };
    for (const m of view.fireMissions) ring(m.target, info.ranges.indirectImpactRadiusM, "#a35200", "砲撃(予約)");
    for (const m of view.airMissions) ring(m.target, m.kind === "airStrike" ? info.ranges.strikeRadiusM : info.ranges.dropRadiusM, "#5a3ea8", m.kind === "airStrike" ? "空襲(予約)" : "空輸(予約)");
    for (const c of s.hq) {
      const r = c.type === "fireMission" ? info.ranges.indirectImpactRadiusM : c.type === "airStrike" ? info.ranges.strikeRadiusM : info.ranges.dropRadiusM;
      ring(c.target, r, "#e67e22", c.type === "fireMission" ? "砲撃" : c.type === "airStrike" ? "空襲" : "空輸");
    }

    const replaying = s.phase === "replay" && s.last;
    const replayT = replaying ? (() => {
      const tracks = Object.values(s.last!.replay.own);
      const t0 = tracks[0]?.[0]?.t ?? 0;
      const t1 = tracks[0]?.[tracks[0].length - 1]?.t ?? t0;
      return t0 + (t1 - t0) * s.replayProgress;
    })() : 0;

    // 敵(見えているもの・ゴースト)
    const drawContact = (c: ContactView, pos: Vec2, alpha: number) => {
      const p = S(pos);
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
  }, [s, cam, size, terrain, dragFacing]);

  // ---- 操作 ----
  const unitAt = (sx: number, sy: number): OwnUnitView | null => {
    for (const u of view.own) {
      const p = toScreen(cam, u.pos, size.w, size.h);
      if (Math.abs(p.x - sx) < 15 && Math.abs(p.y - sy) < 13) return u;
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
      else game.addHq({ side: info.mySide, type: t.kind, target: world });
      return;
    }
    const hit = unitAt(p.x, p.y);
    if (hit && e.button === 0) {
      game.select(hit.id);
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
      setCam((c) => ({ ...c, scale: Math.min(0.5, Math.max(0.005, pinch.current!.scale * (d / pinch.current!.d))) }));
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (d.kind === "pan") {
      setCam({ ...d.cam, cx: d.cam.cx - (p.x - d.sx) / d.cam.scale, cy: d.cam.cy + (p.y - d.sy) / d.cam.scale });
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
      game.setOrder(s.selected, { waypoints, facingOnArrival: dragFacing?.facing ?? null });
    }
    setDragFacing(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    const p = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
    const before = toWorld(cam, p.x, p.y, size.w, size.h);
    const scale = Math.min(0.5, Math.max(0.005, cam.scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    // カーソルの下の地点を動かさずに拡大縮小する
    setCam({ scale, cx: before.x - (p.x - size.w / 2) / scale, cy: before.y + (p.y - size.h / 2) / scale });
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
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
        data-testid="map"
      />
      {s.targeting && <div className="hint">地図を押して地点を指定(Esc で取り消し)</div>}
    </div>
  );
}
