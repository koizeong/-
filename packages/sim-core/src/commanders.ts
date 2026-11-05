import { z } from "zod";
import type { SimContext } from "./context.js";
import type { CommanderTrait } from "./rulepack.js";
import type { Unit } from "./unit.js";

/**
 * 指揮官。部隊(連隊長・大隊長・戦隊司令・飛行隊長)か上級部隊(師団長・軍司令官・艦隊司令長官)に付く。
 * 特性(ルールパックの commanders.traits)の効果は数%ほどの小さなもので、フレーバーが主。
 * 部隊の指揮官はその部隊に、上級部隊の指揮官は隷下すべてに formationShare の割合で効く。
 * 部隊の指揮官は、部隊が大きな損害を受けると倒れることがある(効果が消える)
 */
export const CommanderSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    /** 階級(表示用) */
    rank: z.string().optional(),
    side: z.string().min(1),
    /** 指揮する部隊 */
    unitId: z.string().optional(),
    /** 指揮する上級部隊(シナリオの formations の ID) */
    formationId: z.string().optional(),
    traits: z.array(z.string()).max(3).default([]),
    /** 架空の人物(史実で確かめられなかった所に、自動で付けた名前など) */
    fictional: z.boolean().default(false),
    /** 人物の短い説明(表示用) */
    note: z.string().optional(),
  })
  .refine((c) => c.unitId !== undefined || c.formationId !== undefined, { message: "unitId か formationId のどちらかを書いてください" });
export type Commander = z.infer<typeof CommanderSchema>;

type Domain = "land" | "naval" | "air";
function domainOf(u: Pick<Unit, "toe">, ctx: Pick<SimContext, "toes">): Domain {
  const t = ctx.toes.toes[u.toe];
  return t?.air ? "air" : t?.naval ? "naval" : "land";
}

/** 部隊に効いている指揮官(倒れた人は除く)と、効く割合 */
export function commandersOf(u: Pick<Unit, "id" | "side" | "toe">, ctx: Pick<SimContext, "commanders" | "formations" | "lostCommanders" | "rules">): { commander: Commander; share: number }[] {
  const all = ctx.commanders ?? [];
  if (all.length === 0) return [];
  const lost = ctx.lostCommanders;
  const out: { commander: Commander; share: number }[] = [];
  const share = ctx.rules.commanders?.formationShare ?? 0.5;
  // 部隊が属する上級部隊(上へたどる)
  const chain = new Set<string>();
  const fs = ctx.formations ?? {};
  let cur = Object.entries(fs).find(([, f]) => f.units.includes(u.id))?.[0];
  for (let depth = 0; cur !== undefined && depth < 16; depth++) {
    chain.add(cur);
    cur = fs[cur]?.parent;
  }
  for (const c of all) {
    if (c.side !== u.side || lost?.has(c.id)) continue;
    if (c.unitId === u.id) out.push({ commander: c, share: 1 });
    else if (c.formationId !== undefined && chain.has(c.formationId)) out.push({ commander: c, share });
  }
  return out;
}

type Effect = "firepower" | "damageTaken" | "moraleDamageTaken" | "moraleRecovery" | "speed" | "vision" | "airCombat";

/** 部隊に効いている指揮官の特性の効果(倍率の積。上級部隊の指揮官は share の割合で効く) */
export function commanderEffect(u: Pick<Unit, "id" | "side" | "toe">, effect: Effect, ctx: SimContext): number {
  const traits = ctx.rules.commanders?.traits;
  if (!traits || !ctx.commanders?.length) return 1;
  const d = domainOf(u, ctx);
  let k = 1;
  for (const { commander, share } of commandersOf(u, ctx)) {
    for (const id of commander.traits) {
      const t: CommanderTrait | undefined = traits[id];
      if (!t || (t.domains && !t.domains.includes(d))) continue;
      k *= 1 + (t[effect] - 1) * share;
    }
  }
  return k;
}

/** 陣営の最上位の指揮官(上級部隊のうち、親のないものの指揮官。なければ部隊の指揮官のうち最初の人) */
export function topCommander(side: string, ctx: Pick<SimContext, "commanders" | "formations" | "lostCommanders">): Commander | undefined {
  const list = (ctx.commanders ?? []).filter((c) => c.side === side && !ctx.lostCommanders?.has(c.id));
  const fs = ctx.formations ?? {};
  return list.find((c) => c.formationId !== undefined && fs[c.formationId] && fs[c.formationId]!.parent === undefined) ?? list.find((c) => c.formationId !== undefined) ?? list[0];
}

/** AI の癖:最上位の指揮官の特性の、慎重さへの足し算 */
export function commanderAiCaution(side: string, ctx: Pick<SimContext, "commanders" | "formations" | "lostCommanders" | "rules">): number {
  const top = topCommander(side, ctx);
  const traits = ctx.rules.commanders?.traits;
  if (!top || !traits) return 0;
  return top.traits.reduce((s, id) => s + (traits[id]?.aiCaution ?? 0), 0);
}

/** 部隊を直接指揮している指揮官(倒れる対象) */
export function unitCommander(unitId: string, ctx: Pick<SimContext, "commanders" | "lostCommanders">): Commander | undefined {
  return (ctx.commanders ?? []).find((c) => c.unitId === unitId && !ctx.lostCommanders?.has(c.id));
}
