import type { BranchPack } from "./branch.js";
import { buildTemplate, designWeapon, toeCost, USER_PREFIX, type CustomBundle, type WeaponDesign } from "./development.js";
import type { DevelopmentRules } from "./rulepack.js";
import { toeFire, toeHitPoints, type Toe, type ToeElement, type ToePack } from "./toe.js";
import { weaponMaxRange, type Weapon, type WeaponPack } from "./weapon.js";

/**
 * おまかせ編成:点数の上限の中で、陣営の差し替えられる部隊を、方針(ルールパックの development.autoStyles)の重みで良くなるように組む。
 * 良さは部隊ごとの導出値の伸び(対数)を重みで足したもの(陣営の合計ではなく部隊ごとに見るので、1つの部隊を潰してほかを太らせる組み方にならない)。
 * 中隊の数の増減は元の数の autoMaxChange の割合まで(少なくとも±1)。
 * 1歩ずつの変更(中隊の数を1つ増減、武器を重い型・軽い型に付け替える)を試し、良くなる変更を選んでいく(上限を超えるなら、
 * 損の少ない軽量化と組にする)。乱数は使わない(同じ条件なら同じ編成)。結果は持ち込み(CustomBundle)と差し替えなので、
 * 人間が手で組んだものと同じ道(サーバーの検証)を通る
 */

export interface AutoComposeResult {
  bundle: CustomBundle;
  substitutions: Record<string, string>;
  budget: { used: number; limit: number };
}

/** 何歩まで変えるか(1歩は中隊1つ・武器1種の付け替え) */
const MAX_STEPS = 40;
/** 上限を超える変更を、軽量化と組にして試すときの候補の数 */
const PAIR_CANDIDATES = 15;
/** 武器の型に当てはめる近さ:最大射程の比(対数)と、装甲・非装甲の効き目の比(対数)の差がこれ未満 */
const MATCH_RANGE_LOG = 0.5;
const MATCH_RATIO_LOG = 1.2;

type Metrics = { soft: number; armored: number; long: number; hitPoints: number };
const METRICS = ["soft", "armored", "long", "hitPoints"] as const;

function metricsOf(t: Toe, w: WeaponPack): Metrics {
  return {
    soft: toeFire(t, w, 300, 0, false).firepower,
    armored: toeFire(t, w, 300, 1, false).firepower,
    long: toeFire(t, w, 1000, 0.5, false).firepower + toeFire(t, w, 5000, 0.5, true).firepower,
    hitPoints: toeHitPoints(t),
  };
}

const ratioLog = (w: { effectiveness: { soft: number; armored: number } }) => Math.log((w.effectiveness.armored + 0.01) / (w.effectiveness.soft + 0.01));

/** パックの武器に近い武器の型(なければ null)。付け替えの候補にする */
export function archetypeOf(w: Weapon, dev: DevelopmentRules): string | null {
  let best: { id: string; d: number } | null = null;
  for (const [id, a] of Object.entries(dev.archetypes)) {
    if (a.reference.indirect !== w.indirect) continue;
    const range = Math.abs(Math.log(weaponMaxRange(w) / a.reference.bands[a.reference.bands.length - 1]!.maxRangeM));
    const ratio = Math.abs(ratioLog(w) - ratioLog(a.reference));
    if (range >= MATCH_RANGE_LOG || ratio >= MATCH_RATIO_LOG) continue;
    const d = range + ratio;
    if (!best || d < best.d) best = { id, d };
  }
  return best?.id ?? null;
}

/** 型ごとの重い型・軽い型の設計(基準から上限・下限まで autoWeaponStep の割合だけ動かす) */
function autoDesigns(dev: DevelopmentRules): Record<string, WeaponDesign> {
  const out: Record<string, WeaponDesign> = {};
  for (const [id, a] of Object.entries(dev.archetypes)) {
    for (const [kind, label] of [
      ["heavy", "重い"],
      ["light", "軽い"],
    ] as const) {
      const params: Record<string, number> = {};
      for (const [k, p] of Object.entries(a.params)) {
        const v = kind === "heavy" ? p.default + (p.max - p.default) * dev.autoWeaponStep : p.default - (p.default - p.min) * dev.autoWeaponStep;
        params[k] = Math.round(v / p.step) * p.step;
      }
      out[`auto-${id}-${kind}`] = { name: `${label}${a.name}(おまかせ)`, archetype: id, params };
    }
  }
  return out;
}

export function autoCompose(
  dev: DevelopmentRules,
  weapons: WeaponPack,
  toes: ToePack,
  branches: BranchPack,
  units: readonly { id: string; toe: string }[],
  budgetMultiplier: number,
  styleId: string,
): AutoComposeResult | null {
  const style = dev.autoStyles[styleId];
  if (!style) return null;
  const designs = autoDesigns(dev);
  const W: WeaponPack = { id: `${weapons.id}+auto`, weapons: { ...weapons.weapons } };
  for (const [id, d] of Object.entries(designs)) {
    const r = designWeapon(d, dev);
    if (r.ok) W.weapons[USER_PREFIX + id] = r.value;
  }
  const kindOf = new Map<string, string | null>();
  const archOf = (wid: string) => {
    if (!kindOf.has(wid)) kindOf.set(wid, wid.startsWith(USER_PREFIX) ? null : archetypeOf(W.weapons[wid]!, dev));
    return kindOf.get(wid)!;
  };

  // 部隊ごとの、いまの要素と、要素ごと・武器ごとの元の武器
  const sorted = [...units].sort((a, b) => (a.id < b.id ? -1 : 1));
  const current = new Map<string, ToeElement[]>(sorted.map((u) => [u.id, structuredClone(toes.toes[u.toe]!.elements)]));
  const origWeapon = new Map<string, string>();
  for (const u of sorted) toes.toes[u.toe]!.elements.forEach((e, i) => e.weapons.forEach((r, j) => origWeapon.set(`${u.id}/${i}/${j}`, r.weapon)));
  const toeWith = (unitId: string, els: ToeElement[]): Toe => ({ ...toes.toes[sorted.find((u) => u.id === unitId)!.toe]!, elements: els });
  const valid = (unitId: string, els: ToeElement[]) =>
    buildTemplate({ name: "x", baseToe: sorted.find((u) => u.id === unitId)!.toe, elements: els }, toes, W, branches, dev).ok;

  const eval0 = new Map(sorted.map((u) => [u.id, { m: metricsOf(toes.toes[u.toe]!, W), cost: toeCost(toes.toes[u.toe]!, W, dev.cost) }]));
  let limit = 0;
  for (const v of eval0.values()) limit += v.cost;
  limit *= budgetMultiplier;
  const now = new Map(eval0);
  /** 部隊の良さ:元の値からの伸び(対数)を重みで足したもの。元の値が0の項目は数えない */
  const unitScore = (unitId: string, m: Metrics) => {
    const b = eval0.get(unitId)!.m;
    return METRICS.reduce((s, k) => {
      if (b[k] <= 0) return s;
      const g = Math.log(Math.max(m[k], 1e-9) / b[k]);
      // 下がる分は autoLossWeight 倍に数える(1つの値を大きく削ってほかを伸ばす、極端な引き換えにしない)
      return s + style.weights[k] * (g < 0 ? g * dev.autoLossWeight : g);
    }, 0);
  };
  const costNow = () => [...now.values()].reduce((s, v) => s + v.cost, 0);

  type Move = { unitId: string; els: ToeElement[]; m: Metrics; cost: number; dScore: number; dCost: number };
  const moves = (): Move[] => {
    const out: Move[] = [];
    for (const u of sorted) {
      const els = current.get(u.id)!;
      const cands: ToeElement[][] = [];
      const orig = toes.toes[u.toe]!.elements;
      els.forEach((e, i) => {
        const o = orig[i]!.count;
        const span = Math.max(1, Math.floor(o * dev.autoMaxChange));
        for (const d of [1, -1]) {
          if (e.count + d < Math.max(1, o - span) || e.count + d > o + span) continue;
          const c = structuredClone(els);
          c[i]!.count += d;
          cands.push(c);
        }
        e.weapons.forEach((r, j) => {
          const ow = origWeapon.get(`${u.id}/${i}/${j}`);
          const arch = ow ? archOf(ow) : null;
          if (!ow || !arch) return;
          for (const to of [ow, `${USER_PREFIX}auto-${arch}-heavy`, `${USER_PREFIX}auto-${arch}-light`]) {
            if (to === r.weapon || !W.weapons[to]) continue;
            const c = structuredClone(els);
            c[i]!.weapons[j]!.weapon = to;
            cands.push(c);
          }
        });
      });
      const prev = now.get(u.id)!;
      for (const c of cands) {
        if (!valid(u.id, c)) continue;
        const toe = toeWith(u.id, c);
        const m = metricsOf(toe, W);
        const cost = toeCost(toe, W, dev.cost);
        out.push({ unitId: u.id, els: c, m, cost, dScore: unitScore(u.id, m) - unitScore(u.id, prev.m), dCost: cost - prev.cost });
      }
    }
    return out;
  };
  const apply = (mv: Move) => {
    current.set(mv.unitId, mv.els);
    now.set(mv.unitId, { m: mv.m, cost: mv.cost });
  };

  for (let step = 0; step < MAX_STEPS; step++) {
    const all = moves();
    const spent = costNow();
    // 上限の中で良くなる変更:点数が減る(浮く)ものを先に、増えるものは1点あたりの伸びで選ぶ
    const eff = (mv: Move) => (mv.dCost <= 0 ? 1e6 + mv.dScore : mv.dScore / mv.dCost);
    const single = all.filter((mv) => mv.dScore > 1e-6 && spent + mv.dCost <= limit + 1e-9).sort((a, b) => eff(b) - eff(a))[0];
    if (single) {
      apply(single);
      continue;
    }
    // 上限を超える変更は、損の少ない軽量化(別の部隊)と組にする
    const ups = all.filter((mv) => mv.dScore > 1e-6 && mv.dCost > 0).sort((a, b) => b.dScore / b.dCost - a.dScore / a.dCost).slice(0, PAIR_CANDIDATES);
    const downs = all.filter((mv) => mv.dCost < 0).sort((a, b) => a.dScore / a.dCost - b.dScore / b.dCost).slice(0, PAIR_CANDIDATES);
    let best: { up: Move; down: Move; gain: number } | null = null;
    for (const up of ups)
      for (const down of downs) {
        if (up.unitId === down.unitId || spent + up.dCost + down.dCost > limit + 1e-9) continue;
        const gain = up.dScore + down.dScore;
        if (gain > 1e-6 && (!best || gain > best.gain)) best = { up, down, gain };
      }
    if (!best) break;
    // 別の部隊どうしなので、それぞれの変更はそのまま重ねられる
    apply(best.down);
    apply(best.up);
  }

  // 変わった部隊だけをテンプレートにする。使った設計だけを持ち込む
  const bundle: CustomBundle = { version: 1, designs: {}, templates: {} };
  const substitutions: Record<string, string> = {};
  for (const u of sorted) {
    const els = current.get(u.id)!;
    if (JSON.stringify(els) === JSON.stringify(toes.toes[u.toe]!.elements)) continue;
    const tid = `auto-${u.id}`;
    bundle.templates[tid] = { name: `${toes.toes[u.toe]!.name}(おまかせ・${style.name})`, baseToe: u.toe, elements: els };
    substitutions[u.id] = tid;
    for (const e of els) for (const r of e.weapons) if (r.weapon.startsWith(USER_PREFIX)) bundle.designs[r.weapon.slice(USER_PREFIX.length)] = designs[r.weapon.slice(USER_PREFIX.length)]!;
  }
  return { bundle, substitutions, budget: { used: costNow(), limit } };
}
