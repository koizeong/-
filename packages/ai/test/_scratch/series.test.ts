import { buildScenario } from "@brigade/sim-core";
import { it } from "vitest";
import { runMatch } from "../../src/index.js";
import { loadPacks, loadScenarioJson, unwrap } from "../../../sim-core/test/helpers.js";

const ID = process.env.SC ?? "midway-1942-06-04";
const N = Number(process.env.N ?? 6);
it("series", () => {
  const sc = unwrap(buildScenario(loadScenarioJson(ID), loadPacks()));
  for (let seed = 1; seed <= N; seed++) {
    const o = runMatch(sc.start(seed), sc.ctx, {}, seed);
    const sunk = o.final.units.filter((u) => u.strength <= 0.05 || !o.final.units.includes(u)).map((u) => u.id); const gone = sc.start(seed).units.filter((u) => !o.final.units.some((f) => f.id === u.id)).map((u) => u.id);
    console.log(seed, `${o.result.winner}:${(o.result as any).level ?? ""}`, Object.entries(o.stats).map(([s, st]: any) => `${s}:loss=${(st.lossShare ?? 0).toFixed?.(2)} rej=${st.ordersRejected}`).join(" "), [...sunk, ...gone].filter((x) => !/-(v[tbf]|scout|f)\d*$/.test(x)).join(","));
  }
}, 600000);
