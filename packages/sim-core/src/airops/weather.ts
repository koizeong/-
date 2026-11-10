import type { SimContext } from "../context.js";
import { Rng, type RngState } from "../rng.js";
import { advanceWeather, airAllowed, type WeatherState } from "../weather.js";
import type { AirForce } from "./rules.js";
import type { AirForceState, AirOpsState } from "./plan.js";

/**
 * 基地の天候と予報(docs/air-design.md の6・AIR5)。
 * - 基地の天候は戦場と別(シナリオの基地に weather を書いたときだけ。書かなければ戦場と同じ)。どちらかが悪いと飛べない
 * - 予報は航空司令部ごと(陣営の気象班)。leadTurns ターン先まで。先ほど外れやすい。予報の乱数は主の乱数列を使わない(試合の結果を変えない)
 * - 航空司令部は、予報で飛べない時間帯に出撃を割り当てない(外れれば、晴れても飛ばない・荒れても割り当ててある)
 */
export interface AirForecast {
  /** 予報を出したターン。battlefield[i]・bases[id][i] は madeTurn + 1 + i ターンの予報 */
  madeTurn: number;
  battlefield: string[];
  bases: Record<string, string[]>;
}

type BaseWeatherDef = NonNullable<AirForce["bases"][number]["weather"]>;

/** 基地の天候を、戦場の天候の決まり(変わる確率・間隔)で動かすための文脈 */
function baseCtx(def: BaseWeatherDef, ctx: SimContext): SimContext {
  const { allowed, schedule } = def;
  const { allowed: _a, schedule: _s, ...rest } = ctx.scenario.weather;
  return { ...ctx, scenario: { ...ctx.scenario, weather: { ...rest, initial: def.initial, ...(allowed ? { allowed } : {}), ...(schedule ? { schedule } : {}) } } };
}

/** 試合の始めの基地の天候(weather を書いた基地だけ) */
export function initialBaseWeather(force: AirForce): Record<string, WeatherState> | undefined {
  const out: Record<string, WeatherState> = {};
  for (const b of force.bases) if (b.weather) out[b.id] = { current: b.weather.initial, since: 0 };
  return Object.keys(out).length ? out : undefined;
}

/** ターンの終わりに、基地の天候を次のターンへ進める(変わった基地の ID を返す) */
export function advanceBaseWeather(airOps: AirOpsState, now: number, hours: number, nextTurn: number, ctx: SimContext, rng: Rng): void {
  for (const force of ctx.scenario.airForces) {
    const st = airOps[force.id];
    if (!st?.baseWeather) continue;
    for (const b of force.bases) {
      const w = st.baseWeather[b.id];
      if (!w || !b.weather) continue;
      advanceWeather(w, now, hours, baseCtx(b.weather, ctx), rng, nextTurn);
    }
  }
}

/** 基地から飛び立てるか(基地の天候を書いていなければ、戦場の天候だけで決まる) */
export function baseFlyable(airOps: AirOpsState, forceId: string, baseId: string, ctx: SimContext): boolean {
  const w = airOps[forceId]?.baseWeather?.[baseId];
  return !w || airAllowed(w, ctx);
}

/** 予定から見込む天候(そのターンまでの最後の予定。予定のないところは今の天候が続く) */
function expected(current: WeatherState, schedule: readonly { turn: number; weather: string }[] | undefined, nowTurn: number, turn: number): string {
  const last = (schedule ?? []).filter((e) => e.turn > nowTurn && e.turn <= turn).sort((a, b) => b.turn - a.turn)[0];
  return last?.weather ?? current.current;
}

/** 予報の乱数の種(主の乱数の状態から、航空司令部ごとに別の列を作る) */
function forecastRng(state: RngState, turn: number, k: number): Rng {
  return Rng.fromSeed((state[0] ^ Math.imul(state[3], 0x85ebca6b) ^ Math.imul(turn + 1, 0x9e3779b9) ^ Math.imul(k + 1, 0xc2b2ae35)) >>> 0);
}

/** 外れ:確率 p で、天候の並びの隣へずらす(並びにない天候はずらさない) */
function blur(w: string, p: number, order: readonly string[], rng: Rng): string {
  if (rng.next() >= p) return w;
  const i = order.indexOf(w);
  if (i < 0) return w;
  const j = i === 0 ? 1 : i === order.length - 1 ? i - 1 : rng.next() < 0.5 ? i - 1 : i + 1;
  return order[Math.max(0, Math.min(order.length - 1, j))] ?? w;
}

/** 航空司令部ごとの予報を出し直す(nowTurn は予報を出すターン。そのターンの天候は current) */
export function updateForecasts(airOps: AirOpsState, nowTurn: number, battlefield: WeatherState, ctx: SimContext, rngState: RngState): void {
  const rules = ctx.rules.airOps?.forecast;
  if (!rules) return;
  const order = ctx.scenario.weather.order ?? ctx.rules.weather.order;
  ctx.scenario.airForces.forEach((force, k) => {
    const st = airOps[force.id];
    if (!st) return;
    const rng = forecastRng(rngState, nowTurn, k);
    const fc: AirForecast = { madeTurn: nowTurn, battlefield: [], bases: {} };
    for (let i = 0; i < rules.leadTurns && nowTurn + 1 + i <= ctx.scenario.maxTurns; i++) {
      const turn = nowTurn + 1 + i;
      const p = Math.min(rules.maxError, rules.errorPerTurn * (i + 1));
      fc.battlefield.push(blur(expected(battlefield, ctx.scenario.weather.schedule, nowTurn, turn), p, order, rng));
      for (const b of force.bases) {
        const w = st.baseWeather?.[b.id];
        if (!w || !b.weather) continue;
        (fc.bases[b.id] ??= []).push(blur(expected(w, b.weather.schedule, nowTurn, turn), p, order, rng));
      }
    }
    st.forecast = fc;
  });
}

/**
 * 計画に使う、そのターンに飛べる見込み(今のターンは今の天候、先のターンは予報。予報の先は今の天候が続くとみる)
 */
export function forecastFlyable(st: AirForceState | undefined, baseId: string, nowTurn: number, battlefield: WeatherState, turn: number, ctx: SimContext): boolean {
  const types = ctx.rules.weather.types;
  const ok = (w: string | undefined) => w === undefined || types[w]?.airAllowed !== false;
  const fc = st?.forecast;
  const i = fc ? turn - fc.madeTurn - 1 : -1;
  if (turn <= nowTurn || !fc || i < 0) {
    return ok(battlefield.current) && ok(st?.baseWeather?.[baseId]?.current);
  }
  const bf = fc.battlefield[i] ?? fc.battlefield.at(-1) ?? battlefield.current;
  const bw = st?.baseWeather?.[baseId] ? (fc.bases[baseId]?.[i] ?? fc.bases[baseId]?.at(-1) ?? st.baseWeather[baseId]!.current) : undefined;
  return ok(bf) && ok(bw);
}
