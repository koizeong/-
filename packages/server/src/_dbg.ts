import { decide, DEFAULT_AI } from "@brigade/ai";
import { resolveTurn, viewForSide, isGameOver } from "@brigade/sim-core";
import { loadAll } from "./boot.js";
const id = process.argv[2]!;
const all = loadAll("/home/user/-/data/", ["/home/user/-/mods"]);
const sc = all.scenarios.get(id)!;
let s = sc.start(Number(process.argv[3] ?? 1));
const sides = Object.keys(sc.ctx.scenario.victory);
for (let t = 1; t <= sc.ctx.scenario.maxTurns && !isGameOver(s, sc.ctx); t++) {
  const ds = sides.map((x) => decide(viewForSide(s, x), sc.ctx, DEFAULT_AI));
  const r = resolveTurn(s, ds.flatMap((d) => d.orders), sc.ctx, ds.flatMap((d) => d.hqCommands));
  s = r.state;
  console.log(t, s.units.map(u=>`${u.id}@${Math.round(u.pos.x/100)/10},${Math.round(u.pos.y/100)/10} s${u.strength.toFixed(2)}${u.routed?"R":""}${u.formation==="column"?"c":""}`).join(" "));
}
console.log(JSON.stringify(s.result ?? null).slice(0,300));
