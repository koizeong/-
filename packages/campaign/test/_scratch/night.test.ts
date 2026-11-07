import { readFileSync } from "node:fs";
import { BiomePackSchema, GeneratorDataSchema } from "@brigade/generator";
import { buildScenario } from "@brigade/sim-core";
import { runMatch } from "@brigade/ai";
import { it } from "vitest";
import { loadPacks } from "../../../sim-core/test/helpers.js";
import { CampaignDefSchema, planStage, startCampaign, type CampaignEnv } from "../../src/index.js";
import { navalBattleFile } from "../../src/naval.js";
const json = (p: string) => JSON.parse(readFileSync(new URL(`../../../../data/${p}`, import.meta.url), "utf-8"));
const env: CampaignEnv = { packs: loadPacks(), generator: GeneratorDataSchema.parse(json("generators/missions.json")), biomes: BiomePackSchema.parse(json("generators/biomes.json")).biomes };
const def = CampaignDefSchema.parse(json("campaigns/exercise-strait.json"));
it("night", () => {
  const s = startCampaign(def, env, 1);
  const plan = planStage(def, s, { blue: [{ formation: "blue-fleet", to: "mid-sea" }], red: [{ formation: "red-fleet", to: "mid-sea" }] });
  const b = structuredClone(plan.battles.find((x) => x.region === "mid-sea")!);
  for (const side of Object.values(b.sides)) side.units = side.units.filter((id) => !s.units[id]!.base && !/cv/.test(id));
  for (let seed = 1; seed <= Number(process.env.N ?? 6); seed++) {
    const f = navalBattleFile(def, s, b, env, seed) as any;
    if (process.env.NOCMD) f.autoCommanders = false;
    if (process.env.MIRROR) for (const u of f.units) { u.x = 140000 - u.x; u.facing = (360 - u.facing) % 360; if (process.env.MIRROR === "2") u.y = 80000 - u.y; }
    const r = buildScenario(f, env.packs);
    if (!r.ok) throw new Error(r.errors.join());
    const o = runMatch(r.value.start(seed), r.value.ctx, {}, seed);
    const ev = { torp: 0, hit: 0, evaded: 0 };
    console.log(seed, f.name, o.result.winner, (o.result as any).level, Object.entries(o.stats).map(([k, v]: any) => `${k}:${v.lossShare.toFixed(2)} rej=${v.ordersRejected}`).join(" "));
  }
}, 600000);
