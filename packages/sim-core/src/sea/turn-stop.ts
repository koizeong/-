import type { SimContext } from "../context.js";
import type { IntelState } from "../intel.js";
import { isShip } from "../naval.js";
import type { SeaTurnRules } from "../rulepack.js";
import type { Unit } from "../unit.js";

/** 可変長のターンが途中で止まった理由(docs/naval-design.md の1) */
export type SeaStopReason = "newContact" | "torpedoSighted" | "heavyHit" | "shipLost" | "airAttack";

/**
 * 可変長のターンの見張り番。ターン(の続き)の始めの様子を覚え、小ステップごとに、止める出来事が起きたかを返す。
 * 出来事が minSeconds より前に起きたら、minSeconds に達したステップで止める。units と intel は解いている最中のもの(書き換わっていく)を渡す
 */
export function seaStopWatch(
  rules: SeaTurnRules,
  units: readonly Unit[],
  intel: IntelState,
  tStart: number,
  ctx: SimContext,
): (tEnd: number, stepEvents: readonly { type: string; unitId?: string; targetId?: string }[]) => SeaStopReason | undefined {
  const byId = new Map(units.map((u) => [u.id, u]));
  const ship = (id: string | undefined) => {
    const u = id === undefined ? undefined : byId.get(id);
    return !!u && isShip(u, ctx);
  };
  const strengthAtStart = new Map(units.filter((u) => isShip(u, ctx)).map((u) => [u.id, u.strength]));
  // 陣営ごとの、ターンの始めに知っていた敵の艦(今見えているか、見失ってから reacquireMinutes 以内)
  const known = new Map<string, Set<string>>();
  for (const [side, si] of Object.entries(intel)) {
    const set = new Set<string>();
    for (const [id, e] of Object.entries(si.entries)) {
      if (!ship(id)) continue;
      if (e.currentLevel > 0 || e.lastSeenTime >= tStart - rules.reacquireMinutes * 60) set.add(id);
    }
    known.set(side, set);
  }
  let pending: SeaStopReason | undefined;
  return (tEnd, stepEvents) => {
    if (!pending) pending = check(stepEvents);
    return pending && tEnd - tStart >= rules.minSeconds ? pending : undefined;
  };

  function check(stepEvents: readonly { type: string; unitId?: string; targetId?: string }[]): SeaStopReason | undefined {
    for (const u of units) {
      if (!strengthAtStart.has(u.id)) continue;
      if (rules.shipLost && u.strength <= 0) return "shipLost";
      if (rules.heavyHit !== undefined && strengthAtStart.get(u.id)! - u.strength >= rules.heavyHit) return "heavyHit";
    }
    if (rules.torpedoSighted && stepEvents.some((e) => e.type === "torpedoEvaded" || e.type === "torpedoSighted")) return "torpedoSighted";
    if (rules.airAttack && stepEvents.some((e) => e.type === "airStrikeBegan" && ship(e.targetId))) return "airAttack";
    if (rules.newContact) {
      let found = false;
      for (const [side, si] of Object.entries(intel)) {
        const set = known.get(side) ?? new Set<string>();
        known.set(side, set);
        for (const [id, e] of Object.entries(si.entries)) {
          if (e.currentLevel <= 0 || set.has(id) || !ship(id) || byId.get(id)!.side === side) continue;
          set.add(id);
          found = true;
        }
      }
      if (found) return "newContact";
    }
    return undefined;
  }
}
