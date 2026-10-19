import { applyBundle, toeCost, USER_PREFIX, type CustomBundle } from "./development.js";
import { parseWith, type ParseResult } from "./rulepack.js";
import { buildScenario, ScenarioFileSchema, type LoadedScenario, type PackSet, type ScenarioFile } from "./scenarioFile.js";

/** 差し替え:部隊ID → 連隊テンプレートのID(持ち込みの templates のキー) */
export type Substitutions = Record<string, string>;

/** 持ち込みのパックの置き場所(PackSet のキー。シナリオのパックの後ろに重ねる) */
const USER_PACK = "user";

/** 陣営が差し替えてよい部隊のID(初めからいる部隊と増援) */
export function customizableUnits(def: ScenarioFile, side: string): string[] {
  const c = def.customization[side];
  if (!c) return [];
  const all = [...def.units.filter((u) => u.side === side).map((u) => u.id), ...def.rules.reinforcements.filter((r) => r.side === side).map((r) => r.id)];
  return c.units === "all" ? all : all.filter((id) => c.units.includes(id));
}

/** 差し替えの点数(差し替えてよい部隊の、差し替え後の点数の合計と上限) */
export interface CustomizationBudget {
  used: number;
  limit: number;
}

/** 1つの陣営の持ち込みと差し替え */
export interface SideCustomization {
  bundle: CustomBundle;
  subs: Substitutions;
}

/**
 * シナリオに、ある陣営の装備編成(開発した武器と連隊テンプレート)と部隊の差し替えを入れて読み込み直す。
 * 差し替えられるのは、シナリオの customization で許された部隊だけ。テンプレートの兵科は元の部隊の兵科と同じでなければならない。
 * 差し替え後の点数の合計が上限を超えれば誤り。ハッシュには持ち込みの中身も入る(記録の照合に使う)
 */
export function customizeScenario(
  input: unknown,
  packs: PackSet,
  side: string,
  bundle: CustomBundle,
  subs: Substitutions,
): ParseResult<{ scenario: LoadedScenario; budget: CustomizationBudget }> {
  const r = customizeSides(input, packs, { [side]: { bundle, subs } }, () => USER_PREFIX);
  return r.ok ? { ok: true, value: { scenario: r.value.scenario, budget: r.value.budgets[side]! } } : r;
}

/**
 * 複数の陣営の装備編成を入れて読み込み直す(オンライン対戦)。陣営ごとの持ち込みは "user:<陣営>:<ID>" になり、IDが重ならない
 */
export function customizeScenarioSides(
  input: unknown,
  packs: PackSet,
  perSide: Record<string, SideCustomization>,
): ParseResult<{ scenario: LoadedScenario; budgets: Record<string, CustomizationBudget> }> {
  return customizeSides(input, packs, perSide, (side) => `${USER_PREFIX}${side}:`);
}

function customizeSides(
  input: unknown,
  packs: PackSet,
  perSide: Record<string, SideCustomization>,
  prefixOf: (side: string) => string,
): ParseResult<{ scenario: LoadedScenario; budgets: Record<string, CustomizationBudget> }> {
  const parsed = parseWith(ScenarioFileSchema, input);
  if (!parsed.ok) return parsed;
  const def = parsed.value;
  const base = buildScenario(def, packs);
  if (!base.ok) return base;
  const { ctx } = base.value;
  const dev = ctx.rules.development;
  if (!dev) return { ok: false, errors: ["このシナリオのルールパックでは装備編成ができません"] };

  let weapons = ctx.weapons;
  let toes = ctx.toes;
  const errors: string[] = [];
  for (const [side, c] of Object.entries(perSide)) {
    if (!def.customization[side]) {
      errors.push(`陣営 "${side}" はこのシナリオで部隊を差し替えられません`);
      continue;
    }
    // テンプレートの元の編成表はシナリオの編成表だけ(相手の持ち込みを元にはできない)
    const applied = applyBundle(c.bundle, dev, weapons, { ...ctx.toes, toes: { ...ctx.toes.toes } }, ctx.branches, prefixOf(side));
    if (!applied.ok) {
      errors.push(...applied.errors);
      continue;
    }
    weapons = applied.value.weapons;
    toes = { ...toes, toes: { ...toes.toes, ...Object.fromEntries(Object.entries(applied.value.toes.toes).filter(([k]) => k.startsWith(prefixOf(side)))) } };
  }
  if (errors.length > 0) return { ok: false, errors };

  const placements = new Map<string, { toe: string; side: string }>([
    ...def.units.map((u) => [u.id, { toe: u.toe, side: u.side }] as const),
    ...def.rules.reinforcements.map((r) => [r.id, { toe: r.toe, side: r.side }] as const),
  ]);
  const toeOf = new Map<string, string>();
  const budgets: Record<string, CustomizationBudget> = {};
  for (const [side, { subs }] of Object.entries(perSide)) {
    const allowed = new Set(customizableUnits(def, side));
    for (const [unitId, tplId] of Object.entries(subs)) {
      const orig = placements.get(unitId);
      if (!orig || orig.side !== side || !allowed.has(unitId)) {
        errors.push(`${unitId}: この部隊は差し替えられません`);
        continue;
      }
      const t = toes.toes[prefixOf(side) + tplId];
      if (!t) {
        errors.push(`${unitId}: テンプレート "${tplId}" がありません`);
        continue;
      }
      if (t.branch !== ctx.toes.toes[orig.toe]!.branch) errors.push(`${unitId}: 兵科が違うテンプレートには差し替えられません(${ctx.branches.branches[t.branch]?.name ?? t.branch})`);
      toeOf.set(unitId, prefixOf(side) + tplId);
    }
    // 点数:差し替えてよい部隊の元の点数の合計 × 倍率が上限
    const costOf = (toeId: string) => toeCost(toes.toes[toeId]!, weapons, dev.cost);
    let before = 0;
    let after = 0;
    for (const id of allowed) {
      const orig = placements.get(id)!.toe;
      before += costOf(orig);
      after += costOf(toeOf.get(id) ?? orig);
    }
    budgets[side] = { used: after, limit: before * def.customization[side]!.budgetMultiplier };
    if (after > budgets[side]!.limit + 1e-9) errors.push(`${side}: 点数が上限を超えています(${after.toFixed(1)} / ${budgets[side]!.limit.toFixed(1)})`);
  }
  if (errors.length > 0) return { ok: false, errors };

  // 持ち込みの武器・編成表だけを別のパックにして、シナリオのパックの後ろに重ねる
  const pick = <T>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).filter(([k]) => k.startsWith(USER_PREFIX)));
  const list = (x: string | string[]) => (typeof x === "string" ? [x] : x);
  const next: ScenarioFile = {
    ...def,
    packs: { ...def.packs, weapons: [...list(def.packs.weapons), USER_PACK], toe: [...list(def.packs.toe), USER_PACK] },
    units: def.units.map((u) => (toeOf.has(u.id) ? { ...u, toe: toeOf.get(u.id)! } : u)),
    rules: { ...def.rules, reinforcements: def.rules.reinforcements.map((r) => (toeOf.has(r.id) ? { ...r, toe: toeOf.get(r.id)! } : r)) },
  };
  const userPacks: PackSet = {
    ...packs,
    weapons: { ...packs.weapons, [USER_PACK]: { id: USER_PACK, weapons: pick(weapons.weapons) } },
    toes: { ...packs.toes, [USER_PACK]: { id: USER_PACK, toes: pick(toes.toes) } },
  };
  const built = buildScenario(next, userPacks);
  if (!built.ok) return built;
  return { ok: true, value: { scenario: built.value, budgets } };
}
