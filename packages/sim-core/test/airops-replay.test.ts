import { describe, expect, it } from "vitest";
import { buildScenario, replayForSide, resolveTurn, type LoadedScenario } from "../src/index.js";
import { loadPacks, loadScenarioJson } from "./helpers.js";

const packs = loadPacks();

/** 左右対称の試験シナリオに、両陣営の航空司令部を足す */
function load(): LoadedScenario {
  const file = structuredClone(loadScenarioJson("test-symmetric")) as { packs: { weapons: string | string[]; toe: string | string[] }; sides: { id: string }[]; rules: Record<string, unknown> };
  const arr = (x: string | string[]) => (Array.isArray(x) ? x : [x]);
  file.packs.weapons = [...arr(file.packs.weapons), "air-generic"];
  file.packs.toe = [...arr(file.packs.toe), "air-generic"];
  file.rules.airForces = file.sides.map((s) => ({
    id: `${s.id}-af`,
    side: s.id,
    name: `${s.id} の航空軍団`,
    bases: [{ id: "b1", name: "基地", distanceM: 60000 }],
    squadrons: [
      { id: "fg", name: "戦闘機隊", toe: "gen_air_fighter", base: "b1", aircraft: 8 },
      { id: "fb", name: "戦闘爆撃機隊", toe: "gen_air_fighter_bomber", base: "b1", aircraft: 16 },
    ],
  }));
  const r = buildScenario(file as unknown as Record<string, unknown>, packs);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
}

describe("航空司令部の編隊の再生(アニメーションの元)", () => {
  it("期待挙動:ターンの結果に編隊の小ステップごとの軌跡が入り、自陣営の編隊は全部・敵の編隊は見えていた刻みだけ再生に渡る", () => {
    const sc = load();
    const [a, b] = sc.def.sides.map((x) => x.id) as [string, string];
    let s = sc.start(1);
    let found = false;
    for (let turn = 0; turn < 4 && !found; turn++) {
      const r = resolveTurn(s, [], sc.ctx, []);
      const tracks = Object.entries(r.flightTracks ?? {});
      if (tracks.length) {
        found = true;
        const ownA = tracks.filter(([, tr]) => tr.side === a);
        const rpA = replayForSide(r, a);
        // 自陣営の編隊は、軌跡の点を全部持って本当の ID で渡る
        for (const [id, tr] of ownA) {
          const f = rpA.flights!.find((x) => x.id === id)!;
          expect(f.own).toBe(true);
          expect(f.points).toHaveLength(tr.points.length);
        }
        // 敵の編隊は、見えていた点だけ・本当の ID は渡らない
        for (const f of rpA.flights!.filter((x) => !x.own)) {
          expect(tracks.some(([id]) => id === f.id)).toBe(false);
          const tr = tracks.find(([, x]) => x.side === b && x.points.filter((p) => p.seen.includes(a)).length === f.points.length);
          expect(tr).toBeDefined();
        }
        // 見えていない刻みは敵の再生に入らない
        const hidden = tracks.filter(([, tr]) => tr.side === a && tr.points.every((p) => !p.seen.includes(b)));
        const rpB = replayForSide(r, b);
        expect((rpB.flights ?? []).filter((f) => !f.own).length).toBe(tracks.filter(([, tr]) => tr.side === a).length - hidden.length);
        // 攻撃した編隊には攻撃の出来事がつく
        const attacks = r.hqEvents.filter((e) => e.type === "airAttack" && e.side === a);
        if (attacks.length) expect(rpA.flights!.some((f) => f.fx.some((x) => x.kind === "attack"))).toBe(true);
      }
      s = r.state;
    }
    expect(found).toBe(true);
  });
});
