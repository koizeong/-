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
  const parsed = parseWith(ScenarioFileSchema, input);
  if (!parsed.ok) return parsed;
  const def = parsed.value;
  const base = buildScenario(def, packs);
  if (!base.ok) return base;
  const { ctx } = base.value;
  const dev = ctx.rules.development;
  if (!dev) return { ok: false, errors: ["このシナリオのルールパックでは装備編成ができません"] };
  if (!def.customization[side]) return { ok: false, errors: [`陣営 "${side}" はこのシナリオで部隊を差し替えられません`] };

  const applied = applyBundle(bundle, dev, ctx.weapons, ctx.toes, ctx.branches);
  if (!applied.ok) return applied;
  const { weapons, toes } = applied.value;

  const allowed = new Set(customizableUnits(def, side));
  const placements = new Map<string, string>([...def.units.map((u) => [u.id, u.toe] as const), ...def.rules.reinforcements.map((r) => [r.id, r.toe] as const)]);
  const errors: string[] = [];
  for (const [unitId, tplId] of Object.entries(subs)) {
    const orig = placements.get(unitId);
    if (!orig || !allowed.has(unitId)) {
      errors.push(`${unitId}: この部隊は差し替えられません`);
      continue;
    }
    const t = toes.toes[USER_PREFIX + tplId];
    if (!t) {
      errors.push(`${unitId}: テンプレート "${tplId}" がありません`);
      continue;
    }
    if (t.branch !== ctx.toes.toes[orig]!.branch) errors.push(`${unitId}: 兵科が違うテンプレートには差し替えられません(${ctx.branches.branches[t.branch]?.name ?? t.branch})`);
  }
  // 点数:差し替えてよい部隊の元の点数の合計 × 倍率が上限
  const costOf = (toeId: string) => toeCost(toes.toes[toeId]!, weapons, dev.cost);
  let before = 0;
  let after = 0;
  for (const id of allowed) {
    const orig = placements.get(id)!;
    before += costOf(orig);
    after += costOf(id in subs ? USER_PREFIX + subs[id]! : orig);
  }
  const budget = { used: after, limit: before * def.customization[side]!.budgetMultiplier };
  if (after > budget.limit + 1e-9) errors.push(`点数が上限を超えています(${after.toFixed(1)} / ${budget.limit.toFixed(1)})`);
  if (errors.length > 0) return { ok: false, errors };

  // 持ち込みの武器・編成表だけを別のパックにして、シナリオのパックの後ろに重ねる
  const pick = <T>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).filter(([k]) => k.startsWith(USER_PREFIX)));
  const list = (x: string | string[]) => (typeof x === "string" ? [x] : x);
  const next: ScenarioFile = {
    ...def,
    packs: { ...def.packs, weapons: [...list(def.packs.weapons), USER_PACK], toe: [...list(def.packs.toe), USER_PACK] },
    units: def.units.map((u) => (u.id in subs ? { ...u, toe: USER_PREFIX + subs[u.id]! } : u)),
    rules: { ...def.rules, reinforcements: def.rules.reinforcements.map((r) => (r.id in subs ? { ...r, toe: USER_PREFIX + subs[r.id]! } : r)) },
  };
  const userPacks: PackSet = {
    ...packs,
    weapons: { ...packs.weapons, [USER_PACK]: { id: USER_PACK, weapons: pick(weapons.weapons) } },
    toes: { ...packs.toes, [USER_PACK]: { id: USER_PACK, toes: pick(toes.toes) } },
  };
  const built = buildScenario(next, userPacks);
  if (!built.ok) return built;
  return { ok: true, value: { scenario: built.value, budget } };
}
