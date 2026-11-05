import { runMatch } from "@brigade/ai";
import { loadAll } from "./boot.js";
const all = loadAll("/home/user/-/data/", ["/home/user/-/mods"]);
const sc = all.scenarios.get(process.argv[2]!)!;
for (const seed of [1, 2, 3]) {
  const m = runMatch(sc.start(seed), sc.ctx, {}, seed);
  console.log(seed, m.result.winner, m.result.level, JSON.stringify(m.final.objectives), m.final.units.filter(u=>Math.hypot(u.pos.x-8000,u.pos.y-6000)<900).map(u=>`${u.id}:${u.strength.toFixed(2)}${u.routed?"R":""} m${u.morale.toFixed(2)}`).join(" "));
}
