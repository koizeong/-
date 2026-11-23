import { describe, expect, it } from "vitest";
import { buildScenario, PHANTOM, photographWholeMap, Rng, type LoadedScenario, type Unit } from "../src/index.js";
import { loadPacks, loadScenarioJson } from "./helpers.js";

const packs = loadPacks();

function load(): LoadedScenario {
  const file = structuredClone(loadScenarioJson("test-symmetric")) as { packs: { weapons: string | string[]; toe: string | string[] }; sides: { id: string }[]; rules: Record<string, unknown> };
  const arr = (x: string | string[]) => (Array.isArray(x) ? x : [x]);
  file.packs.weapons = [...arr(file.packs.weapons), "air-generic"];
  file.packs.toe = [...arr(file.packs.toe), "air-generic"];
  const r = buildScenario(file as unknown as Record<string, unknown>, packs);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
}

describe("写真偵察は地図全体を撮る(ユーザー判断:誤報も含めて)", () => {
  const sc = load();
  const pr = sc.ctx.rules.airOps!.photoRecon!;
  const [a, b] = sc.def.sides.map((x) => x.id) as [string, string];

  it("期待挙動:偵察機の見張りの距離に関係なく、地図全体の敵の地上の部隊が写る見込みがある", () => {
    const units = sc.start(1).units;
    const enemies = units.filter((u) => u.side === b);
    let seen = 0;
    for (let k = 0; k < 40; k++) seen += photographWholeMap(a, units, `f${k}`, { ...pr, falseReports: 0 }, sc.ctx, Rng.fromSeed(k + 1)).filter((x) => !x.phantom).length;
    // 平地の部隊は見込み0.7ほどで写る(地図の端どうしでも)
    expect(seen / (40 * enemies.length)).toBeGreaterThan(0.4);
  });

  it("期待挙動:深い陣地の部隊は、動いている部隊より写りにくい", () => {
    const base = sc.start(1).units;
    const pick = (entrenchment: number, moved: boolean): Unit[] => base.map((u) => (u.side === b ? { ...u, entrenchment, movedLastTurn: moved } : u));
    const count = (us: Unit[]) => {
      let n = 0;
      for (let k = 0; k < 60; k++) n += photographWholeMap(a, us, `f${k}`, { ...pr, falseReports: 0 }, sc.ctx, Rng.fromSeed(k + 7)).length;
      return n;
    };
    expect(count(pick(3, false))).toBeLessThan(count(pick(0, true)) * 0.75);
  });

  it("期待挙動:誤報を含む:位置がずれ、兵種を取り違え、いない部隊を報告することがある", () => {
    const units = sc.start(1).units;
    const byId = new Map(units.map((u) => [u.id, u] as const));
    let moved = 0;
    let wrongBranch = 0;
    let phantoms = 0;
    for (let k = 0; k < 60; k++) {
      for (const x of photographWholeMap(a, units, `f${k}`, pr, sc.ctx, Rng.fromSeed(k + 99))) {
        if (x.phantom) {
          phantoms++;
          expect(x.id.startsWith(PHANTOM)).toBe(true);
          continue;
        }
        const u = byId.get(x.id)!;
        if (Math.hypot(u.pos.x - x.pos.x, u.pos.y - x.pos.y) > 1) moved++;
        expect(Math.hypot(u.pos.x - x.pos.x, u.pos.y - x.pos.y)).toBeLessThanOrEqual(pr.positionErrorM + 1e-6);
        if (x.branch !== u.branch) wrongBranch++;
      }
    }
    expect(moved).toBeGreaterThan(0);
    expect(wrongBranch).toBeGreaterThan(0);
    expect(phantoms).toBeGreaterThan(0);
  });
});
