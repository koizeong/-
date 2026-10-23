import type { UnitSymbols } from "@brigade/protocol";
import { useEffect, useRef } from "react";
import { drawSymbol, specOf, type Affiliation } from "./symbols.js";

/** 文の中に置く小さな兵科記号(戦闘序列・ユニットの欄) */
export function SymbolIcon({ symbols, branch, toe, color, affiliation = "friend", size = 1 }: { symbols: UnitSymbols | undefined; branch: string; toe?: string; color: string; affiliation?: Affiliation; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.round(38 * size);
  const h = Math.round(30 * size);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr;
    c.height = h * dpr;
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    drawSymbol(g, w / 2, h / 2 + 4 * size, specOf(symbols, branch, toe, affiliation), { color }, size);
  }, [symbols, branch, toe, color, affiliation, size, w, h]);
  return <canvas ref={ref} className="symbol-icon" style={{ width: w, height: h }} aria-hidden />;
}
