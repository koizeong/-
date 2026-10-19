import { applyBundle, toeCost, USER_PREFIX, type CustomBundle } from "./development.js";
import type { Toe } from "./toe.js";
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
 * 配属:部隊 from の編成表の要素 element(中隊など)を1つ、部隊 to に付ける(戦いの前に決める。途中の付け替えはない)。
 * 付けた中隊は to の編成表の要素になり、同じ部隊として動き撃ち合う(歩兵連隊に突撃砲中隊を付けるなど)。
 * 補給の携行備蓄・燃料の消費も、中隊の耐久の割合だけ移る
 */
export interface Attachment {
  from: string;
  element: number;
  to: string;
}

/** 1つの陣営の持ち込みと差し替え・配属 */
export interface SideCustomization {
  bundle: CustomBundle;
  subs: Substitutions;
  attachments?: readonly Attachment[];
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
  attachments: readonly Attachment[] = [],
): ParseResult<{ scenario: LoadedScenario; budget: CustomizationBudget }> {
  const r = customizeSides(input, packs, { [side]: { bundle, subs, attachments } }, () => USER_PREFIX);
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
  /** 中隊をすべて配属に出して、地図からいなくなる部隊 */
  const removed = new Set<string>();
  const budgets: Record<string, CustomizationBudget> = {};
  const startIds = new Set(def.units.map((u) => u.id));
  const att = dev.attachment;
  /** 配属を当てる。誤りがあれば errors に足して false */
  const attach = (list: readonly Attachment[], side: string, allowed: ReadonlySet<string>): boolean => {
    if (list.length === 0) return true;
    if (!att) {
      errors.push("このルールパックでは配属ができません");
      return false;
    }
    const n0 = errors.length;
    const current = (id: string) => toes.toes[toeOf.get(id) ?? placements.get(id)!.toe]!;
    const work = new Map<string, Toe>();
    const get = (id: string) => work.get(id) ?? structuredClone(current(id));
    const perHost = new Map<string, number>();
    for (const [i, a] of list.entries()) {
      const where = `attachments.${i}(${a.from} → ${a.to})`;
      const pf = placements.get(a.from);
      const pt = placements.get(a.to);
      if (!pf || !pt || pf.side !== side || pt.side !== side || !allowed.has(a.from) || !allowed.has(a.to)) {
        errors.push(`${where}: 自陣営の、差し替えてよい部隊どうしでだけ配属できます`);
        continue;
      }
      if (!startIds.has(a.from) || !startIds.has(a.to) || a.from === a.to) {
        errors.push(`${where}: 初めからいる別の部隊どうしでだけ配属できます(増援は配属できません)`);
        continue;
      }
      const src = get(a.from);
      const host = get(a.to);
      if (!att.fromBranches.includes(src.branch) || !att.toBranches.includes(host.branch)) {
        errors.push(`${where}: ${ctx.branches.branches[src.branch]?.name ?? src.branch}から${ctx.branches.branches[host.branch]?.name ?? host.branch}へは配属できません`);
        continue;
      }
      const e = src.elements[a.element];
      if (!e || e.count < 1) {
        errors.push(`${where}: 配属に出せる中隊がありません`);
        continue;
      }
      const n = (perHost.get(a.to) ?? 0) + 1;
      if (n > att.maxPerHost) {
        errors.push(`${where}: 1つの部隊に配属できるのは ${att.maxPerHost} 個中隊までです`);
        continue;
      }
      perHost.set(a.to, n);
      // 補給は中隊の耐久の割合だけ移す
      const share = e.hitPoints / src.elements.reduce((s, x) => s + x.count * x.hitPoints, 0);
      const moved = { ammoCapacityT: src.supply.ammoCapacityT * share, fuelCapacityT: src.supply.fuelCapacityT * share, fuelPerKmT: src.supply.fuelPerKmT * share };
      e.count -= 1;
      src.supply = { ammoCapacityT: src.supply.ammoCapacityT - moved.ammoCapacityT, fuelCapacityT: src.supply.fuelCapacityT - moved.fuelCapacityT, fuelPerKmT: src.supply.fuelPerKmT - moved.fuelPerKmT };
      const name = `${e.name}(${a.from}から配属)`;
      const same = host.elements.find((x) => x.name === name);
      if (same) same.count += 1;
      else host.elements.push({ ...structuredClone(e), name, count: 1 });
      host.supply = {
        ammoCapacityT: host.supply.ammoCapacityT + moved.ammoCapacityT,
        fuelCapacityT: host.supply.fuelCapacityT + moved.fuelCapacityT,
        fuelPerKmT: host.supply.fuelPerKmT + moved.fuelPerKmT,
      };
      work.set(a.from, src);
      work.set(a.to, host);
    }
    if (errors.length > n0) return false;
    for (const [id, t] of work) {
      if (t.elements.every((x) => x.count === 0) || t.elements.length === 0) {
        removed.add(id);
        continue;
      }
      t.elements = t.elements.filter((x) => x.count > 0);
      const key = `${prefixOf(side)}att-${id}`;
      toes = { ...toes, toes: { ...toes.toes, [key]: t } };
      toeOf.set(id, key);
    }
    return true;
  };
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
    // 配属:差し替えの後の編成表から、中隊を移す
    const attached = attach(perSide[side]!.attachments ?? [], side, allowed);
    if (!attached) continue;
    // 点数:差し替えてよい部隊の元の点数の合計 × 倍率が上限(配属は移すだけなので、合計はほぼ変わらない)
    const costOf = (toeId: string) => toeCost(toes.toes[toeId]!, weapons, dev.cost);
    let before = 0;
    let after = 0;
    for (const id of allowed) {
      const orig = placements.get(id)!.toe;
      before += costOf(orig);
      if (!removed.has(id)) after += costOf(toeOf.get(id) ?? orig);
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
    // 差し替えた後のシナリオでは、編成の選択はもう使えない(選択は元の編成表に対して書かれている)
    presets: {},
    packs: { ...def.packs, weapons: [...list(def.packs.weapons), USER_PACK], toe: [...list(def.packs.toe), USER_PACK] },
    units: def.units.filter((u) => !removed.has(u.id)).map((u) => (toeOf.has(u.id) ? { ...u, toe: toeOf.get(u.id)! } : u)),
    formations: Object.fromEntries(Object.entries(def.formations).map(([id, f]) => [id, { ...f, units: f.units.filter((u) => !removed.has(u)) }])),
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
