import type { Vec2 } from "@brigade/sim-core";

/** マップの表示位置。center はマップ座標(m)、scale は 1m あたりのピクセル数。y は北が上 */
export interface Camera {
  cx: number;
  cy: number;
  scale: number;
}

export function toScreen(cam: Camera, p: Vec2, w: number, h: number): { x: number; y: number } {
  return { x: w / 2 + (p.x - cam.cx) * cam.scale, y: h / 2 - (p.y - cam.cy) * cam.scale };
}

export function toWorld(cam: Camera, sx: number, sy: number, w: number, h: number): Vec2 {
  return { x: cam.cx + (sx - w / 2) / cam.scale, y: cam.cy - (sy - h / 2) / cam.scale };
}

/** マップ全体が収まる表示 */
export function fitCamera(widthM: number, heightM: number, w: number, h: number): Camera {
  return { cx: widthM / 2, cy: heightM / 2, scale: Math.min(w / widthM, h / heightM) * 0.95 };
}

/** 方位(度、北0・時計回り) */
export function bearingDeg(a: Vec2, b: Vec2): number {
  const d = (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI;
  return (d + 360) % 360;
}

/** 時刻の表示(ターンの開始時刻) */
/** 開始からの経過秒(time)の時刻。startDate があれば日付も付ける(夜のターンは長いので、ターン数からは計算しない) */
export function clockOf(startHour: number, time: number, startDate?: string): string {
  const minutes = Math.round(startHour * 60 + time / 60);
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const hm = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  if (!startDate) return hm;
  const d = new Date(`${startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.floor(minutes / 1440));
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${hm}`;
}
