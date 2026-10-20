import type { ScenarioDetail } from "@brigade/protocol";
import { useEffect, useRef } from "react";
import { terrainImage } from "./MapView.js";

/**
 * シナリオの地図の縮図(シナリオ選択・部隊編成の画面)。地形・道路・目標と、選んだ陣営の部隊の初期配置を描く。
 * 増援は白抜き。敵の部隊は描かない(霧)。highlight の部隊は太く描く
 */
export function MapThumb({ detail, color, highlight, height = 360 }: { detail: ScenarioDetail; color: string; highlight?: string | null; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const { map } = detail;
    const rows = map.rows.length;
    const cols = [...(map.rows[0] ?? "")].length;
    const widthM = cols * map.cellSizeM;
    const heightM = rows * map.cellSizeM;
    // 高さを決めて、地図の縦横比に合わせた幅にする(親より広ければ幅に合わせる)
    const maxW = canvas.parentElement?.clientWidth ?? 600;
    const scale = Math.min(height / heightM, maxW / widthM);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(widthM * scale * dpr);
    canvas.height = Math.round(heightM * scale * dpr);
    canvas.style.width = `${Math.round(widthM * scale)}px`;
    canvas.style.height = `${Math.round(heightM * scale)}px`;
    const g = canvas.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(terrainImage(map.rows, map.legend), 0, 0, widthM * scale, heightM * scale);
    // 少し紙の色をかぶせて、作戦地図らしく落ち着かせる
    g.fillStyle = "rgba(236, 227, 204, 0.28)";
    g.fillRect(0, 0, widthM * scale, heightM * scale);
    const S = (p: { x: number; y: number }) => ({ x: p.x * scale, y: (heightM - p.y) * scale });

    // 道路
    g.strokeStyle = "#5b4a35";
    g.lineWidth = 1.5;
    for (const e of detail.roads.edges) {
      const a = S(detail.roads.nodes[e.from]!);
      const b = S(detail.roads.nodes[e.to]!);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }

    // 目標
    g.font = "bold 11px serif";
    g.textAlign = "center";
    for (const o of detail.objectives) {
      const p = S(o);
      const r = Math.max(5, o.radiusM * scale);
      g.strokeStyle = "#8b1a1a";
      g.lineWidth = 2;
      g.setLineDash([4, 3]);
      g.beginPath();
      g.arc(p.x, p.y, r, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = "#3b2a1a";
      g.strokeStyle = "rgba(255, 250, 235, 0.9)";
      g.lineWidth = 3;
      g.strokeText(o.name, p.x, p.y - r - 3);
      g.fillText(o.name, p.x, p.y - r - 3);
    }

    // 自軍の部隊(増援は白抜き)
    for (const u of detail.units) {
      if (u.x === undefined || u.y === undefined) continue;
      const p = S({ x: u.x, y: u.y });
      const w = highlight === u.id ? 14 : 10;
      const h = w * 0.66;
      g.lineWidth = highlight === u.id ? 2.5 : 1.5;
      g.strokeStyle = color;
      g.fillStyle = u.reinforcementTurn !== undefined ? "rgba(255, 252, 240, 0.9)" : color;
      g.fillRect(p.x - w / 2, p.y - h / 2, w, h);
      g.strokeRect(p.x - w / 2, p.y - h / 2, w, h);
    }
  }, [detail, color, highlight, height]);

  return <canvas ref={ref} className="map-thumb" />;
}
