import type { UnitSymbols } from "@brigade/protocol";

/**
 * NATO式(APP-6 風)の兵科記号を Canvas に描く。
 * 枠:自軍=長方形、敵=菱形、正体不明=四つ葉。枠の中に兵科の印(歩兵=×、機甲=楕円、対戦車=逆V、砲兵=黒丸、偵察=斜線、対空=弧)と
 * 重ねる印(空挺=翼、機械化・装甲=楕円、自動車化=縦線、水陸両用=波)、枠の上に規模(中隊 I・大隊 II・連隊 III・旅団 X)
 */

export type Affiliation = "friend" | "hostile" | "unknown";

export interface SymbolSpec {
  affiliation: Affiliation;
  /** 兵科の基本の印(兵科パックの symbol)。不明なら描かない */
  icon?: string | undefined;
  modifiers?: string[] | undefined;
  echelon?: string | undefined;
}

export interface SymbolStyle {
  /** 陣営の色(枠の線と、薄めた塗り) */
  color: string;
  /** 塗りを灰色にする(潰走など) */
  muted?: boolean;
  /** 枠を点線に(展開中) */
  dashed?: boolean;
  /** 枠の線を太く・この色に(選択中) */
  highlight?: string | undefined;
  /** 撃破を確認した(枠に × をかぶせる) */
  destroyed?: boolean;
}

/** 枠の大きさ(px)。長方形は幅 w・高さ h。菱形は外接の四角が h×1.4 */
export const SYMBOL_W = 30;
export const SYMBOL_H = 20;

const ECHELON_MARK: Record<string, string> = { company: "I", battalion: "II", regiment: "III", brigade: "X" };

/** 編成表と兵科から記号の材料を引く */
export function specOf(symbols: UnitSymbols | undefined, branch: string | undefined, toe: string | undefined, affiliation: Affiliation): SymbolSpec {
  const t = toe ? symbols?.toes[toe] : undefined;
  return {
    affiliation,
    icon: branch ? (symbols?.branches[branch] ?? "infantry") : undefined,
    modifiers: t?.modifiers ?? [],
    echelon: t?.echelon,
  };
}

/** 色を白に寄せる(枠の塗り。NATOの淡い色のように) */
export function tint(hex: string, k = 0.55): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) + (255 - ((n >> s) & 255)) * k);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/** 枠の外形のパス(中心 x,y、倍率 k) */
function framePath(g: CanvasRenderingContext2D, aff: Affiliation, x: number, y: number, k: number) {
  const w = SYMBOL_W * k;
  const h = SYMBOL_H * k;
  g.beginPath();
  if (aff === "friend") {
    g.rect(x - w / 2, y - h / 2, w, h);
  } else if (aff === "hostile") {
    const r = h * 0.72;
    g.moveTo(x, y - r);
    g.lineTo(x + r, y);
    g.lineTo(x, y + r);
    g.lineTo(x - r, y);
    g.closePath();
  } else {
    // 四つ葉(正体不明)
    const r = h * 0.3;
    g.arc(x, y - r, r, Math.PI * 0.75, Math.PI * 2.25);
    g.arc(x + r, y, r, Math.PI * 1.25, Math.PI * 2.75);
    g.arc(x, y + r, r, Math.PI * 1.75, Math.PI * 3.25);
    g.arc(x - r, y, r, Math.PI * 0.25, Math.PI * 1.75);
    g.closePath();
  }
}

/** 枠の中で印を描ける四角(中心からの半幅・半高) */
function iconBox(aff: Affiliation, k: number): [number, number] {
  if (aff === "friend") return [(SYMBOL_W / 2) * k, (SYMBOL_H / 2) * k];
  const r = SYMBOL_H * 0.72 * k;
  return [r * 0.5, r * 0.5];
}

/** 枠の上端(規模の印を置く高さ)の、中心からの距離 */
export function symbolTop(aff: Affiliation, k = 1): number {
  return aff === "friend" ? (SYMBOL_H / 2) * k : SYMBOL_H * 0.72 * k;
}

/** 記号を描く。k は大きさの倍率 */
export function drawSymbol(g: CanvasRenderingContext2D, x: number, y: number, spec: SymbolSpec, style: SymbolStyle, k = 1) {
  const line = style.muted ? "#555" : "#111";
  g.save();
  g.lineJoin = "round";
  // 塗り
  framePath(g, spec.affiliation, x, y, k);
  g.fillStyle = style.muted ? "#c8c8c8" : tint(style.color);
  g.fill();
  // 兵科の印(枠の内側に切り抜いて描く)
  g.save();
  framePath(g, spec.affiliation, x, y, k);
  g.clip();
  g.strokeStyle = line;
  g.fillStyle = line;
  g.lineWidth = Math.max(1, 1.3 * k);
  const [bw, bh] = iconBox(spec.affiliation, k);
  if (spec.icon) drawIcon(g, x, y, bw, bh, spec.icon, spec.modifiers ?? []);
  else if (spec.affiliation === "unknown") {
    g.font = `bold ${Math.round(13 * k)}px sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("?", x, y + 0.5);
  }
  g.restore();
  // 枠の線
  framePath(g, spec.affiliation, x, y, k);
  g.strokeStyle = style.highlight ?? (style.muted ? "#666" : style.color);
  g.lineWidth = style.highlight ? 3 : Math.max(1.2, 2 * k);
  if (style.dashed) g.setLineDash([3, 2]);
  g.stroke();
  g.setLineDash([]);
  // 規模
  const mark = spec.echelon ? ECHELON_MARK[spec.echelon] : undefined;
  if (mark) {
    const top = y - symbolTop(spec.affiliation, k);
    g.fillStyle = line;
    g.font = `bold ${Math.round(9 * k + 1)}px sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.fillText(mark, x, top - 2 * k);
  }
  if (style.destroyed) {
    const r = symbolTop(spec.affiliation, k) + 3;
    g.strokeStyle = "#222";
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(x - r, y - r);
    g.lineTo(x + r, y + r);
    g.moveTo(x + r, y - r);
    g.lineTo(x - r, y + r);
    g.stroke();
  }
  g.restore();
}

/** 兵科の印と重ねる印(半幅 bw・半高 bh の四角の中) */
function drawIcon(g: CanvasRenderingContext2D, x: number, y: number, bw: number, bh: number, icon: string, mods: string[]) {
  const oval = (rw: number, rh: number) => {
    g.beginPath();
    g.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
    g.stroke();
  };
  switch (icon) {
    case "infantry":
      g.beginPath();
      g.moveTo(x - bw, y - bh);
      g.lineTo(x + bw, y + bh);
      g.moveTo(x + bw, y - bh);
      g.lineTo(x - bw, y + bh);
      g.stroke();
      break;
    case "armor":
      oval(bw * 0.7, bh * 0.5);
      break;
    case "antitank":
      g.beginPath();
      g.moveTo(x - bw, y + bh);
      g.lineTo(x, y - bh);
      g.lineTo(x + bw, y + bh);
      g.stroke();
      break;
    case "artillery":
      g.beginPath();
      g.arc(x, y, Math.max(2, bh * 0.32), 0, Math.PI * 2);
      g.fill();
      break;
    case "recon":
      g.beginPath();
      g.moveTo(x - bw, y + bh);
      g.lineTo(x + bw, y - bh);
      g.stroke();
      break;
    case "air_defense":
      g.beginPath();
      g.ellipse(x, y + bh, bw * 0.85, bh * 0.75, 0, Math.PI, Math.PI * 2);
      g.stroke();
      break;
  }
  for (const m of mods) {
    if ((m === "mechanized" || m === "armored") && icon !== "armor") oval(bw * 0.55, bh * 0.4);
    else if (m === "motorized") {
      g.beginPath();
      g.moveTo(x, y - bh);
      g.lineTo(x, y + bh);
      g.stroke();
    } else if (m === "airborne" || m === "glider") {
      // 翼(下の縁に、上へ反った2つの弧)。グライダーは翼を点線で
      const r = bw * 0.32;
      const yy = y + bh * 0.82;
      if (m === "glider") g.setLineDash([2, 1.5]);
      for (const cx of [x - r, x + r]) {
        g.beginPath();
        g.arc(cx, yy, r, Math.PI * 1.05, Math.PI * 1.95);
        g.stroke();
      }
      g.setLineDash([]);
    } else if (m === "amphibious") {
      const yy = y + bh * 0.72;
      g.beginPath();
      for (let i = 0; i <= 12; i++) {
        const px = x - bw * 0.7 + (bw * 1.4 * i) / 12;
        const py = yy + Math.sin((i / 12) * Math.PI * 4) * bh * 0.12;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();
    }
  }
}
