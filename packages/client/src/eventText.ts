import type { ScenarioInfo } from "@brigade/protocol";
import type { TurnEvent } from "@brigade/sim-core";
import { unitLabel as label } from "./names.js";
import { taskForceName } from "./TaskForce.js";

/** 出来事の短い文(出来事の記録と、地図の再生の速報で使う) */
export function describe(e: TurnEvent, info: ScenarioInfo): string | null {
  const u = label(e.unitId);
  switch (e.type) {
    case "arrived":
      return `${u} が目的地に到着`;
    case "contact":
      return `${u} が敵と接触`;
    case "conditionalTriggered":
      return e.condition === "enemyAirNear" ? `${u} が敵機の接近に反応して迎撃に上がる` : e.condition === "enemyCarrierSeen" ? `${u} が敵の空母を見つけて攻撃に出る` : `${u} の条件付き命令が発動`;
    case "seaReaction":
      return `${u} の戦隊が${e.when === "shipDamaged" ? "損害を受けて" : "敵の艦を見て"}${e.then === "withdraw" ? "退避する" : e.then === "torpedoAttack" ? "雷撃に向かう" : "交戦に入る"}(反応)`;
    case "routed":
      return `${u} が潰走`;
    case "rallied":
      return `${u} が立ち直った`;
    case "overrun":
      return `${u} が取りつかれたまま崩れ、逃げ遅れ・捕虜を出した`;
    case "encircled":
      return `${u} が包囲されている(士気 ${Math.round(e.morale * 100)}%)`;
    case "surrendered":
      return `${u} が包囲され投降した`;
    case "destroyed":
      return `${u} が壊滅`;
    case "outOfFuel":
      return `${u} が燃料切れで動けない`;
    case "fireHalted":
      return `${u} が撃たれ、砲撃をやめた`;
    case "blocked":
      return `${u} が敵の阻止圏で止められた`;
    case "breakthrough":
      return `${u} が敵の阻止圏を突破`;
    case "breached":
      return `${u} の阻止圏が突破された`;
    case "assault":
      return e.success ? `${u} が肉薄し、敵を陣地から追い出した` : `${u} の肉薄が撃退された`;
    case "stormed":
      return e.success ? `${u} が肉薄され、陣地を追い出された` : `${u} が肉薄を撃退した`;
    case "depotCaptured":
      return `${u} が敵の集積所を奪取`;
    case "supplyStatus":
      return e.supplied ? `${u} の補給路が回復` : `${u} の補給路が断たれた`;
    case "reinforced":
      return `${u} が増援として到着`;
    case "withdrawn":
      return `${u} が別の方面へ転用され、戦場を去った`;
    case "retreated":
      return `${u} が脱出路から撤退した(戦力を保って戦場を去る)`;
    case "nightStrain":
      return `${u} が夜間行動で消耗(士気 ${Math.round(e.morale * 100)}%)`;
    case "stanceSpent":
      return `${u} の${info.stances.find((x) => x.id === e.stance)?.name ?? e.stance}が息切れ(効果が切れた。別の姿勢に切り替えると、また使える)`;
    case "commanderLost":
      return `${u} の指揮官 ${e.name} が倒れた(部隊の士気が下がり、指揮官の特性は効かなくなる)`;
    case "navalFormationChanged":
      return `${u} が${info.fleet?.formations.find((f) => f.id === e.to)?.name ?? e.to}になった`;
    case "torpedoLaunched":
      return `${u} が魚雷 ${e.count} 本を発射`;
    case "torpedoHit":
      return `${u} に魚雷が ${e.hits} 本命中`;
    case "shipBrokeOff":
      return `${u} が大破して戦列を離れた`;
    case "torpedoEvaded":
      return `${u} が雷跡を見つけて回避`;
    case "shipDetached":
      return e.reason === "breakOff" ? `${u} が大破して戦隊を離れた` : `${u} が遅れて戦隊から落伍した`;
    case "shipDamage":
      return `${u} ${SHIP_DAMAGE[e.kind] ?? e.kind}${e.weapon ? `(${info.fleet?.gunNames?.[e.weapon] ?? e.weapon})` : ""}`;
    case "shipScuttled":
      return `${u} を自沈させた`;
    case "shipLostRetiring":
      return `${u} が退く途中で沈んだ`;
    case "shipLeft":
      return `${u} が脱出路から戦場を去った`;
    case "shipRejoined":
      return `${u} が戦隊に戻った`;
    case "tfSortie":
      return `${info.formations[e.squadron]?.name ?? e.squadron} が持ち場を離れて雷撃に向かう`;
    case "tfReturn":
      return `${info.formations[e.squadron]?.name ?? e.squadron} が持ち場へ戻る`;
    case "tfSeparated":
      return `${taskForceName(e.taskForce, info)}から ${e.squadrons.map((k) => info.formations[k]?.name ?? k).join("・")} が分離した${e.newTaskForce ? `(${taskForceName(e.newTaskForce, info)})` : ""}`;
    case "tfMerged":
      return `${e.squadrons.map((k) => info.formations[k]?.name ?? k).join("・")} が${taskForceName(e.taskForce, info)}に合同した`;
    case "tfMergeFailed":
      return `${e.squadrons.map((k) => info.formations[k]?.name ?? k).join("・")} は${taskForceName(e.taskForce, info)}から遠く、合同できなかった`;
    case "tfSignal":
      return `${taskForceName(e.taskForce, info)}:${e.what === "disposition" ? "配備の信号が隷下に届いた" : "変針の信号が隷下に届いた"}`;
    case "flagshipChanged":
      return `${u} が旗艦を継いだ`;
    case "airLaunched":
      return `${u} が発進`;
    case "airStrikeBegan":
      return `${u} が攻撃を始めた`;
    case "airReturned":
      return `${u} が帰投(積み直しに ${info.fleet?.turnaroundMinutes ?? 0} 分)`;
    case "airReady":
      return `${u} が再び出られるようになった`;
    case "airLost":
      return `${u} が降りる所をなくして失われた`;
    case "airMissed":
      return `${u} が目標を見つけられずに引き返した`;
    case "airDiverted":
      return `${u} が帰り道に敵(${label(e.targetId)})を見つけ、向かい直した`;
    case "airMerged":
      return `${u} が元の隊(${label(e.into)})に戻った`;
    default:
      return null;
  }
}

const SHIP_DAMAGE: Record<string, string> = {
  magazine: "の弾薬庫が誘爆した",
  torpedoMount: "の甲板の魚雷が誘爆した",
  mountLost: "の砲塔が使えなくなった",
  engine: "の機関に被弾(速力が落ちる)",
  powerOut: "の動力が止まった",
  director: "の射撃指揮所に被弾",
  radar: "の電探が壊れた",
  conningTower: "の司令塔に被弾(しばらく指揮が乱れる)",
  rudderJam: "の舵が故障した(回り続ける)",
  fire: "で火災",
  capsized: "が転覆した",
};
