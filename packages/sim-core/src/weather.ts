import type { SimContext } from "./context.js";
import type { Rng } from "./rng.js";

/** 今の天候と、その天候になった時刻(秒) */
export interface WeatherState {
  current: string;
  since: number;
}

export function initialWeather(ctx: SimContext): WeatherState {
  return { current: ctx.scenario.weather.initial, since: 0 };
}

/**
 * ターンの終わりに、次のターンの天候を決める(weather を書き換え、変わったら true)。
 * 前の変化から minHoursBetweenChanges 経っていれば、このターンの長さに応じた確率で、隣の状態へ変わる。
 * 変化の確率が0なら乱数を引かない(乱数列を変えない)。
 */
export function advanceWeather(weather: WeatherState, now: number, hours: number, ctx: SimContext, rng: Rng): boolean {
  const s = ctx.scenario.weather;
  if (s.changeChancePerHour <= 0) return false;
  if (now - weather.since < s.minHoursBetweenChanges * 3600) return false;
  const p = 1 - Math.pow(1 - s.changeChancePerHour, hours);
  if (rng.next() >= p) return false;
  const order = ctx.rules.weather.order;
  const i = order.indexOf(weather.current);
  const improve = rng.next() < s.improveChance;
  // 端にいるときは、内側へ動く
  const j = i === 0 ? 1 : i === order.length - 1 ? i - 1 : improve ? i + 1 : i - 1;
  const next = order[Math.max(0, Math.min(order.length - 1, j))]!;
  if (next === weather.current) return false;
  // シナリオがその日の天候の幅を決めていれば、その外へは変わらない
  if (s.allowed && !s.allowed.includes(next)) return false;
  weather.current = next;
  weather.since = now;
  return true;
}

/** 天候による視程の倍率 */
export function weatherVisibility(weather: WeatherState, ctx: SimContext): number {
  return ctx.rules.weather.types[weather.current]!.visibilityMultiplier;
}

export function airAllowed(weather: WeatherState, ctx: SimContext): boolean {
  return ctx.rules.weather.types[weather.current]!.airAllowed;
}
