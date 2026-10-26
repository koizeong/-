import { buildScenario, contentHash, toeHitPoints, type LoadedScenario } from "@brigade/sim-core";
import { campaignOrders } from "./ai.js";
import {
  battleScenarioFile,
  campaignToes,
  checkOrders,
  planStage,
  resolveStage,
  stageDate,
  startCampaign,
  suppliedRegions,
  type BattleOutcome,
  type CampaignBattle,
  type CampaignEnv,
  type CampaignOrder,
  type CampaignState,
  type StagePlan,
  type StageReport,
} from "./campaign.js";
import type { CampaignDef } from "./schema.js";

/**
 * 人間1人 対 作戦の AI のキャンペーンの進み具合(セーブデータ)。サーバーは持たず、画面がブラウザに残して毎回送る。
 * orders:この段階に確定した人間の命令(確定したら変えられない)。battleId:この段階に指揮すると選んだ戦闘(1段階に1つ)
 */
export interface CampaignSnapshot {
  version: 1;
  campaignId: string;
  side: string;
  state: CampaignState;
  orders?: CampaignOrder[];
  battleId?: string;
}

type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function newSnapshot(def: CampaignDef, env: CampaignEnv, side: string, seed: number): Result<CampaignSnapshot> {
  if (!def.sides.some((s) => s.id === side)) return { ok: false, errors: [`陣営 "${side}" はこのキャンペーンにありません`] };
  return { ok: true, value: { version: 1, campaignId: def.id, side, state: startCampaign(def, env, seed) } };
}

/** 送られてきた進み具合を確かめる(キャンペーン・陣営・確定した命令と選んだ戦闘がこの状態に合うか) */
export function checkSnapshot(def: CampaignDef, env: CampaignEnv, snap: CampaignSnapshot): string[] {
  if (snap.version !== 1) return ["キャンペーンの記録の版が違います"];
  if (snap.campaignId !== def.id) return [`キャンペーン "${snap.campaignId}" の記録ではありません`];
  if (!def.sides.some((s) => s.id === snap.side)) return [`陣営 "${snap.side}" はこのキャンペーンにありません`];
  if (snap.orders) {
    const errors = checkOrders(def, snap.state, snap.side, snap.orders);
    if (errors.length) return errors;
  }
  if (snap.battleId && !playableBattles(def, snap, env).some((b) => b.id === snap.battleId)) return [`戦闘 "${snap.battleId}" はこの段階で指揮できません`];
  return [];
}

/** 人間でない陣営の命令(作戦の AI。状態だけから決まるので、何度割り出しても同じ) */
export function aiOrders(def: CampaignDef, state: CampaignState, human: string, env: CampaignEnv): Record<string, CampaignOrder[]> {
  return Object.fromEntries(def.sides.filter((s) => s.id !== human).map((s) => [s.id, campaignOrders(def, state, s.id, env)]));
}

/** 確定した命令での段階の割り出し(命令を確定する前は null) */
export function snapshotPlan(def: CampaignDef, snap: CampaignSnapshot, env: CampaignEnv): StagePlan | null {
  if (!snap.orders || snap.state.result) return null;
  return planStage(def, snap.state, { ...aiOrders(def, snap.state, snap.side, env), [snap.side]: snap.orders });
}

/** 人間の陣営が出る戦闘(指揮できる戦闘) */
export function playableBattles(def: CampaignDef, snap: CampaignSnapshot, env: CampaignEnv): CampaignBattle[] {
  return (snapshotPlan(def, snap, env)?.battles ?? []).filter((b) => (b.sides[snap.side]?.units.length ?? 0) > 0);
}

/** この段階の命令を確定する(もう確定していれば誤り) */
export function commitOrders(def: CampaignDef, env: CampaignEnv, snap: CampaignSnapshot, orders: CampaignOrder[]): Result<CampaignSnapshot> {
  if (snap.state.result) return { ok: false, errors: ["キャンペーンは終わっています"] };
  if (snap.orders) return { ok: false, errors: ["この段階の命令はもう確定しています"] };
  const seen = new Set<string>();
  for (const o of orders) {
    if (seen.has(o.formation)) return { ok: false, errors: [`"${o.formation}" に命令が2つあります`] };
    seen.add(o.formation);
  }
  const errors = checkOrders(def, snap.state, snap.side, orders);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { ...snap, orders: structuredClone(orders) } };
}

/** 指揮する戦闘を選ぶ(1段階に1つ。選び直しはできない) */
export function chooseBattle(def: CampaignDef, env: CampaignEnv, snap: CampaignSnapshot, battleId: string): Result<CampaignSnapshot> {
  if (!snap.orders) return { ok: false, errors: ["先に命令を確定してください"] };
  if (snap.battleId && snap.battleId !== battleId) return { ok: false, errors: ["この段階で指揮する戦闘はもう選んであります"] };
  if (!playableBattles(def, snap, env).some((b) => b.id === battleId)) return { ok: false, errors: [`戦闘 "${battleId}" はこの段階で指揮できません`] };
  return { ok: true, value: { ...snap, battleId } };
}

/**
 * 指揮する戦闘の戦術シナリオ。ID は camp:キャンペーン:段階:地域:中身のハッシュ
 * (キャンペーンの状態ごとに違う戦場になるので、記録・続きからが別の戦いと取り違えないように)
 */
export function playedScenario(def: CampaignDef, env: CampaignEnv, snap: CampaignSnapshot): LoadedScenario | null {
  const battle = playableBattles(def, snap, env).find((b) => b.id === snap.battleId);
  if (!battle) return null;
  const file = battleScenarioFile(def, snap.state, battle, env);
  const units = Object.values(battle.sides).flatMap((x) => x.units.map((id) => [id, snap.state.units[id]]));
  file.id = `${String(file.id)}:${contentHash({ seed: snap.state.seed, battle, units }).slice(0, 12)}`;
  const r = buildScenario(file, env.packs);
  if (!r.ok) throw new Error(`戦闘 ${battle.id} のシナリオが作れません:\n${r.errors.join("\n")}`);
  return r.value;
}

/**
 * 段階を進める:指揮した戦闘は played の決着(終わっていなければ AI 同士で解く)、残りは AI 同士で解いて、次の段階へ
 */
export function advanceSnapshot(def: CampaignDef, env: CampaignEnv, snap: CampaignSnapshot, played?: BattleOutcome): Result<{ snapshot: CampaignSnapshot; report: StageReport }> {
  const plan = snapshotPlan(def, snap, env);
  if (!plan) return { ok: false, errors: [snap.state.result ? "キャンペーンは終わっています" : "先に命令を確定してください"] };
  const next = resolveStage(def, snap.state, plan, env, played && snap.battleId ? { [snap.battleId]: played } : {});
  return { ok: true, value: { snapshot: { version: 1, campaignId: def.id, side: snap.side, state: next }, report: next.history[next.history.length - 1]! } };
}

/** 画面に出す、師団・旅団の様子 */
export interface FormationView {
  id: string;
  name: string;
  side: string;
  region: string;
  /** 戦力の目安(編成表の耐久 × 戦力 × 士気の半分) */
  power: number;
  supplied: boolean;
  units: { id: string; toe: string; toeName: string; strength: number; morale: number; ammo: number; fuel: number; training: string; xp: number }[];
}

/** 画面に出す段階の戦闘(陣営ごとの師団・旅団と戦力) */
export interface BattleView {
  id: string;
  region: string;
  mission: CampaignBattle["mission"];
  attacker: string | null;
  sides: Record<string, { formations: string[]; units: number; power: number }>;
  playable: boolean;
}

export interface CampaignView {
  stage: number;
  stages: number;
  date: string;
  formations: FormationView[];
  /** 陣営ごとの補給の届く地域 */
  supplied: Record<string, string[]>;
  /** 陣営ごとの勝利点(今の地域の持ち主での見込み)と損耗率 */
  score: Record<string, { points: number; lossRatio: number }>;
  /** 確定した命令での段階の割り出し(相手の動きと、起きる戦闘・無血の奪取) */
  plan: { positions: Record<string, string>; battles: BattleView[]; captures: StagePlan["captures"] } | null;
}

/** 画面に出す様子(今は作戦の層の霧はなく、相手の師団・旅団も見える) */
export function campaignView(def: CampaignDef, env: CampaignEnv, snap: CampaignSnapshot): CampaignView {
  const toes = campaignToes(def, env);
  const { state } = snap;
  const supplied = Object.fromEntries(def.sides.map((s) => [s.id, [...suppliedRegions(def, state, s.id)].sort()]));
  const unitsOf = (f: string) => Object.entries(state.units).filter(([, u]) => u.formation === f);
  const power = (f: string) => unitsOf(f).reduce((t, [, u]) => t + (toes[u.toe] ? toeHitPoints(toes[u.toe]!) * u.strength * (0.5 + 0.5 * u.morale) : 0), 0);
  const formations = def.formations
    .filter((f) => state.formations[f.id])
    .map((f): FormationView => {
      const region = state.formations[f.id]!.region;
      return {
        id: f.id,
        name: f.name,
        side: f.side,
        region,
        power: Math.round(power(f.id)),
        supplied: supplied[f.side]!.includes(region),
        units: unitsOf(f.id).map(([id, u]) => ({ id, toe: u.toe, toeName: toes[u.toe]?.name ?? u.toe, strength: u.strength, morale: u.morale, ammo: u.ammo, fuel: u.fuel, training: u.training, xp: u.xp })),
      };
    });
  const ratio = (s: string) => (state.forceTotals[s] ? Math.max(0, state.lost[s] ?? 0) / state.forceTotals[s]! : 0);
  const score = Object.fromEntries(
    def.sides.map((s) => [
      s.id,
      { points: (def.victory[s.id]?.conditions ?? []).reduce((t, c) => t + (c.type === "region" && state.control[c.region] === s.id ? c.points : 0), 0), lossRatio: ratio(s.id) },
    ]),
  );
  const plan = snapshotPlan(def, snap, env);
  const playable = new Set(playableBattles(def, snap, env).map((b) => b.id));
  return {
    stage: state.stage,
    stages: def.calendar.stages,
    date: stageDate(def, Math.min(state.stage, def.calendar.stages)),
    formations,
    supplied,
    score,
    plan: plan && {
      positions: plan.positions,
      captures: plan.captures,
      battles: plan.battles.map((b) => ({
        id: b.id,
        region: b.region,
        mission: b.mission,
        attacker: b.attacker,
        playable: playable.has(b.id),
        sides: Object.fromEntries(Object.entries(b.sides).map(([s, x]) => [s, { formations: x.formations, units: x.units.length, power: Math.round(x.formations.reduce((t, f) => t + power(f), 0)) }])),
      })),
    },
  };
}
