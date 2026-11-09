import { fileURLToPath } from "node:url";
import { decide } from "@brigade/ai";
import { resolveTurn, viewForSide } from "@brigade/sim-core";
import { loadAll } from "./boot.js";
const all = loadAll(fileURLToPath(new URL("../../../data/", import.meta.url)), [fileURLToPath(new URL("../../../mods/", import.meta.url))], []);
const sc = all.scenarios.get(process.argv[2]!)!;
let st = sc.start(Number(process.argv[3] ?? 1));
let n = 0;
while (!(st.ended || st.turn > sc.ctx.scenario.maxTurns) && n++ < 200) {
  const d = Object.keys(sc.ctx.scenario.victory).map((s) => decide(viewForSide(st, s), sc.ctx, undefined, 1));
  const r = resolveTurn(st, d.flatMap((x) => x.orders), sc.ctx, d.flatMap((x) => x.hqCommands), d.flatMap((x) => x.seaOrders ?? []));
  const ty: Record<string, number> = {};
  for (const e of r.events as any[]) ty[e.type === "shipDamage" ? "dmg:" + e.kind : e.type] = (ty[e.type === "shipDamage" ? "dmg:" + e.kind : e.type] ?? 0) + 1;
  delete ty.arrived; delete ty.supplyStatus;
  const prev = new Map(st.units.map((u) => [u.id, u]));
  st = r.state;
  console.log(`T${st.turn} +${Math.round((st.time) / 60)}min ${st.stoppedBy ?? ""}`, JSON.stringify(ty), (r.rejectedSeaOrders ?? []).map((x) => x.reason).join("|"));
  if (process.argv[4]) for (const u of st.units) {
    const p = prev.get(u.id);
    if (!p || !u.hull && p.strength === u.strength && !process.argv[5]) continue;
    const h = u.hull;
    console.log(`   ${u.id.padEnd(18)} ${u.strength.toFixed(2)} @${(u.pos.x / 1000).toFixed(1)},${(u.pos.y / 1000).toFixed(1)} hdg ${Math.round(u.facing)} ${((u.speedMps ?? 0) * 1.94).toFixed(0)}kn ${h ? `fire${h.fire.toFixed(2)} fl${(h.floodPort + h.floodStbd).toFixed(2)} str${h.structure.toFixed(2)} eng${h.engine.toFixed(2)} out${JSON.stringify(h.gunsOut)}` : ""}`);
  }
}
console.log(JSON.stringify(st.ended ?? {}), Object.fromEntries(Object.keys(sc.ctx.scenario.victory).map((s) => [s, st.units.filter((u) => u.side === s).length])));
