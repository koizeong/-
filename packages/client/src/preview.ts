import type { MovePreview } from "@brigade/protocol";
import type { Vec2 } from "@brigade/sim-core";

type ToScreen = (p: Vec2) => { x: number; y: number };

/** 秒を「1時間20分」のように */
export function durationText(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}時間${m % 60}分` : `${h}時間`;
}

/** 経路の上で、出発点から alongM の地点までの折れ線(このターンに進む分を描くのに使う) */
function splitPath(path: readonly Vec2[], alongM: number): [Vec2[], Vec2[]] {
  const head: Vec2[] = [path[0]!];
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + d >= alongM) {
      const k = d > 0 ? (alongM - acc) / d : 0;
      const cut = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      head.push(cut);
      return [head, [cut, ...path.slice(i)]];
    }
    head.push(b);
    acc += d;
  }
  return [head, []];
}

function polyline(g: CanvasRenderingContext2D, S: ToScreen, pts: readonly Vec2[]) {
  if (pts.length < 2) return;
  g.beginPath();
  const p0 = S(pts[0]!);
  g.moveTo(p0.x, p0.y);
  for (const p of pts.slice(1)) {
    const q = S(p);
    g.lineTo(q.x, q.y);
  }
  g.stroke();
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, bg: string, fg = "#fff") {
  const w = g.measureText(text).width + 8;
  g.fillStyle = bg;
  g.fillRect(x, y - 11, w, 15);
  g.fillStyle = fg;
  g.fillText(text, x + 4, y);
}

/**
 * 経路の見積もりを地図に描く:このターンに進む分は太い実線、その先は点線。
 * 各ターンの終わりの位置に番号(1 = このターンの終わり)、着く所に到着時刻、止まりそうな所に注意の印
 */
export function drawPreview(g: CanvasRenderingContext2D, S: ToScreen, p: MovePreview, color: string, clock: (sec: number) => string, selected: boolean) {
  if (!p.reachable) return;
  const thisTurn = p.turnEnds[0]?.alongM ?? 0;
  const [head, tail] = splitPath(p.path, thisTurn);
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = color;
  g.lineWidth = selected ? 4 : 3;
  polyline(g, S, head);
  g.setLineDash([6, 5]);
  g.lineWidth = selected ? 2.5 : 1.5;
  polyline(g, S, tail);
  g.setLineDash([]);
  g.font = "11px sans-serif";

  // ターンの終わりの位置(着いたターンは到着の印で示す)
  p.turnEnds.forEach((m, i) => {
    if (p.arrival && m.turn >= p.arrival.turn) return;
    if (i > 0 && m.alongM === p.turnEnds[i - 1]!.alongM) return;
    const q = S(m);
    g.fillStyle = "#fff";
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(q.x, q.y, i === 0 ? 7 : 5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = "#111";
    g.textAlign = "center";
    g.fillText(String(i + 1), q.x, q.y + 4);
    g.textAlign = "left";
    if (i === 0 && selected) label(g, "このターンはここまで", q.x + 9, q.y + 16, color);
  });

  // 到着
  if (p.arrival) {
    const q = S(p.arrival);
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(q.x, q.y);
    g.lineTo(q.x, q.y - 18);
    g.lineTo(q.x + 10, q.y - 14);
    g.lineTo(q.x, q.y - 10);
    g.closePath();
    g.fill();
    g.strokeStyle = "#111";
    g.lineWidth = 1;
    g.stroke();
    if (selected) label(g, `到着 ${clock(p.arrival.atSeconds)}`, q.x + 12, q.y - 10, "#222");
  } else if (p.fuelOut) {
    const q = S(p.fuelOut);
    label(g, "燃料切れ", q.x + 6, q.y - 6, "#c0392b");
  }

  // 止まりそうな所:知っている敵の阻止圏・足が鈍る地形
  for (const z of p.zones) {
    const q = S(z.at);
    warnMark(g, q.x, q.y, "#c0392b");
    if (selected) label(g, "阻止圏", q.x + 10, q.y - 8, "#c0392b");
  }
  for (const w of p.slow) {
    const q = S(w);
    warnMark(g, q.x, q.y, "#d68910");
    if (selected) label(g, w.name.replace(/(.*)/, ""), q.x + 10, q.y - 8, "#d68910");
  }
  g.restore();
}

function warnMark(g: CanvasRenderingContext2D, x: number, y: number, color: string) {
  g.fillStyle = color;
  g.strokeStyle = "#fff";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x, y - 9);
  g.lineTo(x + 8, y + 5);
  g.lineTo(x - 8, y + 5);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.font = "bold 10px sans-serif";
  g.fillText("!", x, y + 3);
  g.font = "11px sans-serif";
  g.textAlign = "left";
}

/** 見積もりの要約(ユニットの欄に出す行) */
export function previewLines(p: MovePreview, currentTurn: number, clock: (sec: number) => string): { text: string; tone?: "warn" | "bad" }[] {
  if (!p.reachable) return [{ text: "到達できない地点です", tone: "bad" }];
  const out: { text: string; tone?: "warn" | "bad" }[] = [];
  const km = (m: number) => `${(m / 1000).toFixed(1)}km`;
  out.push({ text: `道のり ${km(p.totalM)}${p.onRoadShare > 0.05 ? `(道路 ${Math.round(p.onRoadShare * 100)}%)` : ""}・このターンに ${km(p.turnEnds[0]?.alongM ?? 0)}` });
  if (p.immobile) {
    out.push({ text: `姿勢が「${p.immobile}」なので動きません`, tone: "bad" });
    return out;
  }
  if (p.arrival) {
    const turns = p.arrival.turn - currentTurn;
    out.push({ text: `到着 ${clock(p.arrival.atSeconds)}(${turns === 0 ? "このターン中" : `${turns}ターン後`})` });
  } else if (p.fuelOut) {
    out.push({ text: `途中で燃料が尽きます(${km(p.fuelOut.alongM)}地点)`, tone: "bad" });
  } else {
    out.push({ text: `${p.turnEnds.length}ターンでは着きません`, tone: "warn" });
  }
  const delays: string[] = [];
  if (p.startDelay.orderSeconds > 0) delays.push(`命令の遅れ ${durationText(p.startDelay.orderSeconds)}`);
  if (p.startDelay.deploySeconds > 0) delays.push(`展開に ${durationText(p.startDelay.deploySeconds)}`);
  if (delays.length) out.push({ text: `動き出すまで:${delays.join("・")}`, tone: "warn" });
  if (p.nightIdleTurns.length && p.arrival && p.nightIdleTurns.some((t) => t < p.arrival!.turn)) out.push({ text: "途中の夜は止まります(夜は夜間行動の命令が要る)", tone: "warn" });
  if (p.zones.length) out.push({ text: `知っている敵の阻止圏に入ります(${p.zones.length}か所)。突破できなければ止まります`, tone: "bad" });
  for (const w of p.slow) out.push({ text: `${w.name.replace(/(.*)/, "")}で足が鈍ります`, tone: "warn" });
  return out;
}
