import { buildScenario, type Depot, type GameState, type NewUnit, type SimContext } from "@brigade/sim-core";
import { loadPacks, loadScenarioJson, unwrap } from "../../sim-core/test/helpers.js";

/**
 * 左右対称の試験シナリオ(data/scenarios/test-symmetric.json)。史実ではない。
 * 対称軸 x=4875 で鏡写し。目標は中央・北・南、昼14ターン + 夜間フェイズ。
 */
const loaded = unwrap(buildScenario(loadScenarioJson("test-symmetric"), loadPacks()));

export const AXIS = loaded.ctx.terrain.widthM / 2;
export const mirrorX = (x: number) => 2 * AXIS - x;

export const symCtx: SimContext = loaded.ctx;
export const symDepots: Depot[] = loaded.depots;

/** 初期配置(テストで一部だけを使うため、作成前の形で返す) */
export function symUnits(): NewUnit[] {
  return loaded.units.map((u) => ({
    id: u.id,
    side: u.side,
    branch: u.branch,
    toe: u.toe,
    pos: { ...u.pos },
    facing: u.facing,
    stance: u.stance,
  }));
}

export function symStart(seed: number): GameState {
  return loaded.start(seed);
}
