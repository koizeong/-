import { describe, expect, it } from "vitest";
import { buildScenario, resolveTurn, toeHitPoints, viewForSide, type GameState, type LoadedScenario, type SeaOrder } from "../src/index.js";
import { loadPacks, loadScenarioJson } from "./helpers.js";

const packs = loadPacks();
type File = { units: { id: string; x: number; y: number; facing: number }[]; rules: Record<string, unknown> };
function load(edit: (f: File) => void = () => {}): LoadedScenario {
  const file = structuredClone(loadScenarioJson("test-naval")) as File;
  edit(file);
  const r = buildScenario(file as unknown as Record<string, unknown>, packs);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
}

describe("部隊ごとの戦果(戦闘詳報の MVP)", () => {
  it("期待挙動:撃ち合いで相手が失った戦力は、撃った側の部隊の戦果(dealt)に数えられ、相手陣営には見せない", () => {
    // 東の巡洋艦の戦隊を西の巡洋艦の戦隊の 12km 東に置き、互いに見えるようにして撃ち合わせる
    const sc = load((f) => {
      for (const u of f.units) if (/^e-(ca|dd[5-8])/.test(u.id)) u.x -= 107000;
      f.rules.knownAtStart = f.units.filter((u) => /^(w|e)-(ca|dd[5-8])/.test(u.id)).map((u) => ({ side: u.id.startsWith("w") ? "e" : "w", unitId: u.id }));
    });
    const ctx = { ...sc.ctx, rules: { ...sc.ctx.rules, naval: { ...sc.ctx.rules.naval!, turn: undefined } } };
    const start = sc.start(1);
    let s: GameState = start;
    const target = (side: "w" | "e", id: string) => s.intel[side]!.entries[id]!.contactId;
    const orders: SeaOrder[] = [
      { squadron: "w-crudiv", engage: { target: target("w", "e-ca1"), band: "hold" }, speed: "battle" },
      { squadron: "e-crudiv", engage: { target: target("e", "w-ca1"), band: "hold" }, speed: "battle" },
    ];
    const gone: GameState["units"] = [];
    for (let i = 0; i < 4; i++) {
      const r = resolveTurn(s, [], ctx, [], i === 0 ? orders : []);
      gone.push(...r.destroyed);
      s = r.state;
    }
    const lost = (side: string) =>
      start.units
        .filter((u) => u.side === side && ctx.toes.toes[u.toe]?.ship)
        .reduce((t, u0) => {
          const now = s.units.find((x) => x.id === u0.id) ?? gone.find((x) => x.id === u0.id);
          const end = s.units.some((x) => x.id === u0.id) ? (now?.strength ?? 0) : 0;
          return t + (u0.strength - end) * toeHitPoints(ctx.toes.toes[u0.toe]!);
        }, 0);
    const dealt = (side: string) => Object.values(s.ledger ?? {}).filter((c) => c.side === side).reduce((t, c) => t + c.dealt, 0);
    expect(lost("e")).toBeGreaterThan(0);
    // 撃った部隊の分からない損害がなければ、戦果の合計は相手の失った戦力に合う
    expect(dealt("w")).toBeGreaterThan(lost("e") * 0.9);
    expect(dealt("w")).toBeLessThan(lost("e") * 1.01 + 1e-6);
    // 沈んだ艦があれば、撃沈の数は沈んだ艦の数と合う
    const sunkE = gone.filter((u) => u.side === "e" && ctx.toes.toes[u.toe]?.ship).length;
    const killsW = Object.values(s.ledger ?? {}).filter((c) => c.side === "w").reduce((t, c) => t + c.kills, 0);
    expect(killsW).toBe(sunkE);
    // 霧:陣営の見る様子には戦果の記録を載せない
    expect(JSON.stringify(viewForSide(s, "w"))).not.toContain("ledger");
  });
});
