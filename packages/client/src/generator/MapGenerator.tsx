import type { GeneratedMap } from "@brigade/generator";
import { useEffect, useRef, useState } from "react";
import { SIDE_COLORS, terrainImage } from "../MapView.js";

type Biome = { id: string; name: string; description?: string };
type Shown = Omit<GeneratedMap, "roles">;

const SIZES: Record<string, [number, number]> = { 小: [10000, 8000], 中: [14000, 10000], 大: [20000, 15000] };
/** 水の地形の文字(生成器の legend の文字。橋の数え方に使う) */
const WATER = new Set(["~", "W"]);

/**
 * 地図の生成の確認画面(generator.html)。地形の傾向・大きさ・シードを選んで、生成した地図を見比べる。
 * 町・道路・橋・両軍の配置帯の入口を描き、数(町・道路の長さ・橋)を出す
 */
export function MapGenerator() {
  const [biomes, setBiomes] = useState<Biome[]>([]);
  const [biome, setBiome] = useState("western-farmland");
  const [size, setSize] = useState("中");
  const [axis, setAxis] = useState<"" | "ew" | "ns">("");
  const [seed, setSeed] = useState(() => Number(new URLSearchParams(location.search).get("seed") ?? 1));
  const [map, setMap] = useState<Shown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    fetch("/api/generate/biomes")
      .then((r) => r.json() as Promise<Biome[]>)
      .then(setBiomes)
      .catch(() => setError("サーバーにつながりません(pnpm dev で起動します)"));
  }, []);

  useEffect(() => {
    const [w, h] = SIZES[size]!;
    const q = new URLSearchParams({ biome, seed: String(seed), w: String(w), h: String(h), ...(axis ? { axis } : {}) });
    let live = true;
    fetch(`/api/generate/map?${q.toString()}`)
      .then((r) => r.json() as Promise<Shown & { error?: string }>)
      .then((m) => {
        if (!live) return;
        if (m.error) setError(m.error);
        else {
          setError(null);
          setMap(m);
        }
      })
      .catch(() => live && setError("地図を作れませんでした"));
    return () => {
      live = false;
    };
  }, [biome, size, seed, axis]);

  // 橋:水の文字のマスを横切る道路の区間
  const rows = map?.map.rows ?? [];
  const cell = map?.map.cellSizeM ?? 250;
  const heightM = rows.length * cell;
  const charAt = (x: number, y: number) => [...(rows[rows.length - 1 - Math.floor(y / cell)] ?? "")][Math.floor(x / cell)] ?? ".";
  const bridges = (map?.roads.edges ?? []).filter((e) => {
    const a = map!.roads.nodes[e.from]!;
    const b = map!.roads.nodes[e.to]!;
    for (let i = 1; i < 12; i++) if (WATER.has(charAt(a.x + ((b.x - a.x) * i) / 12, a.y + ((b.y - a.y) * i) / 12))) return true;
    return false;
  });
  const roadKm = (map?.roads.edges ?? []).reduce((s, e) => {
    const a = map!.roads.nodes[e.from]!;
    const b = map!.roads.nodes[e.to]!;
    return s + Math.hypot(a.x - b.x, a.y - b.y) / 1000;
  }, 0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !map) return;
    const widthM = [...(rows[0] ?? "")].length * cell;
    const maxW = Math.min(1100, (canvas.parentElement?.clientWidth ?? 900) - 8);
    const scale = Math.min(maxW / widthM, 720 / heightM);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(widthM * scale * dpr);
    canvas.height = Math.round(heightM * scale * dpr);
    canvas.style.width = `${Math.round(widthM * scale)}px`;
    canvas.style.height = `${Math.round(heightM * scale)}px`;
    const g = canvas.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(terrainImage(map.map.rows, map.map.legend), 0, 0, widthM * scale, heightM * scale);
    const S = (p: { x: number; y: number }) => ({ x: p.x * scale, y: (heightM - p.y) * scale });
    // 道路(幹線は太く)
    const mainCap = Math.max(...map.roads.edges.map((e) => e.capacityTPerHour));
    for (const e of map.roads.edges) {
      const a = S(map.roads.nodes[e.from]!);
      const b = S(map.roads.nodes[e.to]!);
      g.strokeStyle = "#5b4a35";
      g.lineWidth = e.capacityTPerHour >= mainCap ? 2.5 : 1.3;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    // 橋
    for (const e of bridges) {
      const a = S(map.roads.nodes[e.from]!);
      const b = S(map.roads.nodes[e.to]!);
      g.strokeStyle = "#111";
      g.lineWidth = 1;
      g.strokeRect((a.x + b.x) / 2 - 4, (a.y + b.y) / 2 - 3, 8, 6);
    }
    // 町
    g.font = "bold 12px serif";
    g.textAlign = "center";
    for (const t of map.towns) {
      const p = S(t);
      g.fillStyle = "#3b2a1a";
      g.strokeStyle = "rgba(255, 250, 235, 0.9)";
      g.lineWidth = 3;
      g.strokeText(t.name, p.x, p.y - 8);
      g.fillText(t.name, p.x, p.y - 8);
    }
    // 配置帯の入口(陣営の色の三角)
    for (const e of map.entries) {
      const p = S(e);
      g.fillStyle = SIDE_COLORS[e.side]!;
      g.beginPath();
      g.arc(p.x, p.y, 7, 0, Math.PI * 2);
      g.fill();
    }
  }, [map]);

  return (
    <div className="paper generator-page">
      <h2>地図の生成</h2>
      <div className="row">
        <label>
          地形の傾向{" "}
          <select value={biome} onChange={(e) => setBiome(e.target.value)} data-testid="gen-biome">
            {biomes.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          大きさ{" "}
          <select value={size} onChange={(e) => setSize(e.target.value)}>
            {Object.entries(SIZES).map(([k, [w, h]]) => (
              <option key={k} value={k}>
                {k}({w / 1000}×{h / 1000}km)
              </option>
            ))}
          </select>
        </label>
        <label>
          向き{" "}
          <select value={axis} onChange={(e) => setAxis(e.target.value as "" | "ew" | "ns")}>
            <option value="">おまかせ</option>
            <option value="ew">東西に向き合う</option>
            <option value="ns">南北に向き合う</option>
          </select>
        </label>
        <label>
          シード <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} style={{ width: 90 }} data-testid="gen-seed" />
        </label>
        <button onClick={() => setSeed((s) => s - 1)}>前</button>
        <button onClick={() => setSeed((s) => s + 1)} data-testid="gen-next">
          次
        </button>
        <button onClick={() => setSeed(Math.floor(Math.random() * 1e6))}>おまかせ</button>
      </div>
      {biomes.find((b) => b.id === biome)?.description && <p className="muted">{biomes.find((b) => b.id === biome)!.description}</p>}
      {error && <p className="error">{error}</p>}
      {map && (
        <p data-testid="gen-stats">
          町 {map.towns.length}・道路 {roadKm.toFixed(0)}km・橋 {bridges.length}・配置帯の入口 青{map.entries.filter((e) => e.side === 0).length}/赤
          {map.entries.filter((e) => e.side === 1).length}({map.axis === "ew" ? "西と東" : "南と北"}に向き合う)
        </p>
      )}
      <canvas ref={ref} data-testid="gen-map" />
    </div>
  );
}
