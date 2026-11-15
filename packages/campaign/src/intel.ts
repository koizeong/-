import { Rng } from "@brigade/sim-core";
import { neighbors, stageFlyable, type CampaignEnv, type CampaignState } from "./campaign.js";
import { distanceKm, wingDef } from "./air.js";
import type { CampaignDef } from "./schema.js";
import type { BattleView, FormationView } from "./session.js";

/**
 * 作戦地図の霧(人間の陣営に出す様子だけ。作戦の AI は使わない。決まりはキャンペーンの rules.intel)。
 * 見える地域:自軍の師団・旅団のいる地域とその隣、自陣営の地域、飛べる段階なら航空隊(編隊の残っているもの)の届く地域
 */
export function visibleRegions(def: CampaignDef, state: CampaignState, side: string, env: CampaignEnv, positions?: Record<string, string>): Set<string> {
  const out = new Set<string>();
  for (const [fid, f] of Object.entries(state.formations)) {
    if (f.side !== side) continue;
    const r = positions?.[fid] ?? f.region;
    out.add(r);
    for (const n of neighbors(def, r)) out.add(n);
  }
  for (const [r, owner] of Object.entries(state.control)) if (owner === side) out.add(r);
  if (stageFlyable(def, state.stage, env)) {
    for (const [wid, w] of Object.entries(state.wings ?? {})) {
      if (w.side !== side || w.fighters + w.strike <= 0) continue;
      const d = wingDef(def, wid);
      if (!d) continue;
      for (const r of Object.keys(def.regions)) if (distanceKm(def, w.base, r) <= d.rangeKm + 1e-9) out.add(r);
    }
  }
  return out;
}

/** 段階の終わりに、陣営ごとに見えた敵の師団・旅団の居場所を覚える(戦った相手も見えたことにする) */
export function updateIntel(def: CampaignDef, state: CampaignState, env: CampaignEnv, fought: readonly { sides: Record<string, { formations: string[] }>; region: string }[] = []): void {
  const intel = (state.intel ??= {});
  for (const side of def.sides.map((s) => s.id)) {
    const mem = (intel[side] ??= {});
    const seen = visibleRegions(def, state, side, env);
    for (const [fid, f] of Object.entries(state.formations)) if (f.side !== side && seen.has(f.region)) mem[fid] = { region: f.region, stage: state.stage };
    for (const b of fought) for (const [s, x] of Object.entries(b.sides)) if (s !== side) for (const fid of x.formations) if (state.formations[fid]) mem[fid] = { region: state.formations[fid]!.region, stage: state.stage };
    for (const fid of Object.keys(mem)) if (!state.formations[fid]) delete mem[fid];
  }
}

/** 決まった種の乱数(キャンペーンの種・段階・陣営・名前から。同じ段階で何度見ても同じ報告になる) */
function rngFor(state: CampaignState, side: string, key: string): Rng {
  let h = state.seed * 2654435761 + state.stage * 97;
  for (const ch of `${side}:${key}`) h = (Math.imul(h ^ ch.charCodeAt(0), 16777619) + 1) >>> 0;
  return Rng.fromSeed(h >>> 0);
}

/** 敵の情報:今見えているか(now)・前に見た古い情報か(stale)、見た段階、報告の戦力・火力の幅 */
export interface IntelReport {
  seen: "now" | "stale";
  stage: number;
  powerRange: [number, number];
  firepowerRange?: [number, number];
}

/**
 * 人間の陣営に出す師団・旅団の一覧に霧をかける:自軍はそのまま。敵は見える地域なら今の位置、外なら最後に見た位置(見たことがなければ出さない)。
 * 敵の戦力・火力は幅で出し、ときどき過大・過小に報告し、師団名を取り違える。段階ごとに、いない敵の部隊の誤報が混じる。敵の部隊の内訳は出さない
 */
export function fogFormations(def: CampaignDef, state: CampaignState, side: string, env: CampaignEnv, formations: readonly FormationView[]): FormationView[] {
  const rule = def.rules.intel;
  if (!rule.enabled) return [...formations];
  const seen = visibleRegions(def, state, side, env);
  const mem = state.intel?.[side] ?? {};
  const enemies = formations.filter((f) => f.side !== side);
  const names = enemies.map((f) => f.name);
  const band = (v: number, k: number): [number, number] => [Math.max(0, Math.round(v * k * (1 - rule.spread))), Math.round(v * k * (1 + rule.spread))];
  const out: FormationView[] = [];
  for (const f of formations) {
    if (f.side === side) {
      out.push(f);
      continue;
    }
    const now = seen.has(f.region);
    const last = mem[f.id];
    if (!now && !last) continue;
    const rng = rngFor(state, side, f.id);
    const k = rng.next() < rule.misreportChance ? (rng.next() < 0.5 ? rule.misreportLow : rule.misreportHigh) : 0.85 + rng.next() * 0.3;
    const others = names.filter((n) => n !== f.name);
    const name = rng.next() < rule.misidentifyChance ? (others.length ? others[Math.floor(rng.next() * others.length)]! : "所属不明の部隊") : f.name;
    const intel: IntelReport = { seen: now ? "now" : "stale", stage: now ? state.stage : last!.stage, powerRange: band(f.power, k), ...(f.firepower !== undefined ? { firepowerRange: band(f.firepower, k) } : {}) };
    out.push({
      ...f,
      name,
      region: now ? f.region : last!.region,
      power: Math.round(f.power * k),
      ...(f.firepower !== undefined ? { firepower: Math.round(f.firepower * k) } : {}),
      supplied: true,
      units: [],
      intel,
    });
  }
  // 誤報:見える地域のうち敵のいない陸の地域(自軍のいない所)に、いない敵の部隊の報告が混じる
  const rng = rngFor(state, side, "phantom");
  if (enemies.length && rng.next() < rule.phantomChance) {
    const occupied = new Set(Object.values(state.formations).map((f) => f.region));
    const spots = [...seen].filter((r) => !occupied.has(r) && !def.regions[r]?.sea && state.control[r] !== side).sort();
    if (spots.length) {
      const like = enemies.filter((f) => !f.naval);
      const model = like.length ? like[Math.floor(rng.next() * like.length)]! : enemies[0]!;
      const k = 0.6 + rng.next() * 0.8;
      out.push({
        id: `phantom:${state.stage}`,
        name: model.name,
        side: model.side,
        region: spots[Math.floor(rng.next() * spots.length)]!,
        naval: false,
        power: Math.round(model.power * k),
        supplied: true,
        units: [],
        intel: { seen: "now", stage: state.stage, powerRange: band(model.power, k) },
      });
    }
  }
  return out;
}

/** 戦闘の一覧の敵の戦力・火力も報告の値に(戦う相手の師団・旅団は見えている) */
export function fogBattles(side: string, battles: readonly BattleView[], fogged: readonly FormationView[]): BattleView[] {
  const byId = new Map(fogged.map((f) => [f.id, f]));
  return battles.map((b) => ({
    ...b,
    sides: Object.fromEntries(
      Object.entries(b.sides).map(([s, x]) => {
        if (s === side) return [s, x];
        const fs = x.formations.map((id) => byId.get(id)).filter((f): f is FormationView => !!f);
        const lo = fs.reduce((t, f) => t + (f.intel?.powerRange[0] ?? f.power), 0);
        const hi = fs.reduce((t, f) => t + (f.intel?.powerRange[1] ?? f.power), 0);
        const fps = fs.map((f) => f.firepower).filter((v): v is number => v !== undefined);
        return [s, { ...x, power: Math.round((lo + hi) / 2), powerRange: [lo, hi] as [number, number], ...(fps.length ? { firepower: fps.reduce((a, c) => a + c, 0) } : {}) }];
      }),
    ),
  }));
}
