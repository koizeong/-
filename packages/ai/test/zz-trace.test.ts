import { it } from "vitest";
import { buildScenario, isGameOver, resolveTurn, viewForSide, type GameState } from "@brigade/sim-core";
import { decide, DEFAULT_AI } from "../src/index.js";
import { loadPacks, loadScenarioJson, unwrap } from "../../sim-core/test/helpers.js";
it("trace", () => {
  const id = process.env.SC!;
  const sc = unwrap(buildScenario(loadScenarioJson(id), loadPacks()));
  const ctx = sc.ctx;
  let s: GameState = sc.start(Number(process.env.SEED ?? 1));
  const sides = Object.keys(ctx.scenario.victory);
  const watch = (process.env.W ?? "").split(",");
  while (!isGameOver(s, ctx)) {
    const ds = sides.map((side) => decide(viewForSide(s, side), ctx, DEFAULT_AI, 1));
    let orders = ds.flatMap((d) => d.orders);
    if (process.env.FORCE) {
      const [uid, x, y, mode] = process.env.FORCE.split(",");
      orders = orders.filter((o) => o.unitId !== uid);
      orders.push({ unitId: uid!, waypoints: [{ x: Number(x), y: Number(y) }], moveMode: mode as "march" | "combat", stance: "attack" });
    }
    const r = resolveTurn(s, orders, ctx, ds.flatMap((d) => d.hqCommands));
    const line = [`T${s.turn}`];
    for (const u of r.state.units) if (watch.some((w) => u.id.startsWith(w))) {
      const o = ds.flatMap((d) => d.orders).find((x) => x.unitId === u.id);
      line.push(`${u.id}(${Math.round(u.pos.x)},${Math.round(u.pos.y)}) ${u.formation} st${u.strength.toFixed(2)} sup${u.suppression.toFixed(2)} mo${u.morale.toFixed(2)} ${u.moraleState ?? ""} ${o ? "->" + JSON.stringify(o.waypoints ?? o.destination ?? "").slice(0, 40) + (o.moveMode ?? "") + (o.stance ?? "") : ""}`);
    }
    console.log(line.join("\n  "));
    s = r.state;
  }
  console.log(JSON.stringify(s.objectives));
});
