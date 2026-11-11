import { describe, expect, it } from "vitest";
import { canAttachFrom, createUnit, newGameState, resolveTurn, type SimContext } from "../src/index.js";
import { branches, ctx, loadPacks, rules } from "./helpers.js";

/** 自走砲の呼び分け(docs/research/sp-guns.md):突撃砲・駆逐戦車・対戦車砲(牽引)・自走砲兵 */
const packs = loadPacks();
const toe = (id: string) => {
  for (const p of Object.values(packs.toes)) if (p.toes[id]) return p.toes[id]!;
  throw new Error(id);
};

describe("自走砲の兵科の呼び分け", () => {
  it("III号突撃砲・SU-76M は突撃砲、IV号駆逐戦車・SU-85・M10 は駆逐戦車、牽引の対戦車砲は対戦車砲", () => {
    expect(toe("de-stug-brigade-1944").branch).toBe("assault_gun");
    expect(toe("de-stug-abt-1942").branch).toBe("assault_gun");
    expect(toe("su-sp-regt-su76").branch).toBe("assault_gun");
    expect(toe("de-jgpz-abt-1944").branch).toBe("tank_destroyer");
    expect(toe("su-sp-regt-su85").branch).toBe("tank_destroyer");
    expect(toe("us-td-bn-m10").branch).toBe("tank_destroyer");
    for (const id of ["de-flak88-bty-1940", "uk-atk-regt-1944", "jp-at-bn-1944"]) expect(toe(id).branch).toBe("antitank");
    expect(branches.branches["assault_gun"]!.name).toBe("突撃砲");
    expect(branches.branches["tank_destroyer"]!.name).toBe("駆逐戦車");
  });

  it("期待挙動:歩兵へ配属できるのは機甲と突撃砲(分散)。駆逐戦車は集中が基本だが、米の戦車駆逐大隊は史実どおり配属できる。牽引の対戦車砲はできない", () => {
    const rule = rules.development!.attachment!;
    expect(canAttachFrom(toe("de-stug-brigade-1944"), rule)).toBe(true);
    expect(canAttachFrom(toe("su-sp-regt-su76"), rule)).toBe(true);
    expect(canAttachFrom(toe("de-jgpz-abt-1944"), rule)).toBe(false);
    expect(canAttachFrom(toe("su-sp-regt-su85"), rule)).toBe(false);
    expect(canAttachFrom(toe("us-td-bn-m18"), rule)).toBe(true);
    expect(canAttachFrom(toe("uk-atk-regt-1944"), rule)).toBe(false);
  });

  it("期待挙動:自走砲兵は縦隊から1ターンより早く展開しきる(車上の砲をすぐ撃てる)。牽引の砲兵は1ターンかかる", () => {
    const c: SimContext = { ...ctx, toes: { ...ctx.toes, toes: { ...ctx.toes.toes, sp: toe("sp_artillery_battalion"), towed: toe("artillery_battalion") } } };
    const unit = (id: string, t: string) => createUnit({ id, side: "us", branch: toe(t === "sp" ? "sp_artillery_battalion" : "artillery_battalion").branch, toe: t, pos: { x: 1000 + (id === "a" ? 0 : 3000), y: 1000 }, facing: 0, stance: "standard", formation: "column" });
    let s = newGameState([unit("a", "sp"), unit("b", "towed")], 1);
    const orders = [
      { unitId: "a", moveMode: "combat" as const, deployAfterStop: true },
      { unitId: "b", moveMode: "combat" as const, deployAfterStop: true },
    ];
    const r = resolveTurn(s, orders, c);
    const deployedAt = (id: string) => r.events.find((e) => e.unitId === id && e.type === "formationChanged" && (e as { to?: string }).to === "deployed")?.t;
    expect(deployedAt("a")).toBeDefined();
    expect(deployedAt("a")!).toBeLessThan(deployedAt("b") ?? Infinity);
    s = r.state;
    expect(s.units.find((u) => u.id === "a")!.formation).toBe("deployed");
  });
});
