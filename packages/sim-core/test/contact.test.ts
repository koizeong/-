import { describe, expect, it } from "vitest";
import { canAttack, resolveTurn, viewForSide } from "../src/index.js";
import { ger, inf, rules, state, unitOf, wideCtx } from "./helpers.js";

const contactR = rules.contactRangeM;

describe("接敵", () => {
  it("期待挙動:行軍中に接敵したユニットは停止し、展開が完了するまでの1ターン攻撃できない", () => {
    // 東へ行軍する縦隊の前方に、展開済みの敵
    const s0 = state(inf("a", 1000, 5000), ger("g", 1000 + contactR + 600, 5000, { formation: "deployed" }));
    const r1 = resolveTurn(s0, [{ unitId: "a", waypoints: [{ x: 9000, y: 5000 }] }], wideCtx);
    const contact = r1.events.find((e) => e.unitId === "a" && e.type === "contact")!;
    expect(contact).toBeDefined();
    const a1 = unitOf(r1.state, "a");
    expect(a1.route).toEqual([]);
    expect(a1.formation).toBe("deploying");
    expect(canAttack(a1)).toBe(false);
    // 停止した位置は、接敵距離に入った直後
    expect(a1.pos.x).toBeGreaterThan(1000 + 600 - 60);
    expect(a1.pos.x).toBeLessThanOrEqual(1000 + 600 + 60);
    // 相手は最初から展開済みなので攻撃できる
    expect(canAttack(unitOf(r1.state, "g"))).toBe(true);

    const r2 = resolveTurn(r1.state, [], wideCtx);
    const deployed = r2.events.find((e) => e.unitId === "a" && e.type === "formationChanged" && e.to === "deployed")!;
    expect(deployed.t - contact.t).toBe(wideCtx.turnSeconds);
    expect(canAttack(unitOf(r2.state, "a"))).toBe(true);
  });

  it("展開済みで戦闘移動中なら、接敵しても止まらない", () => {
    const s0 = state(
      inf("a", 1000, 5000, { formation: "deployed" }),
      ger("g", 1000 + contactR + 300, 5000, { formation: "deployed" }),
    );
    const r = resolveTurn(s0, [{ unitId: "a", waypoints: [{ x: 1700, y: 5000 }], moveMode: "combat" }], wideCtx);
    expect(r.events.some((e) => e.unitId === "a" && e.type === "contact")).toBe(true);
    expect(unitOf(r.state, "a").pos).toEqual({ x: 1700, y: 5000 });
    expect(unitOf(r.state, "a").formation).toBe("deployed");
  });

  it("接触中の敵からは再び止められない(次ターンの行軍命令はそのまま通る)", () => {
    const s0 = state(inf("a", 1000, 5000), ger("g", 1000 + contactR - 200, 5000, { formation: "deployed" }));
    const r1 = resolveTurn(s0, [], wideCtx);
    expect(unitOf(r1.state, "a").formation).toBe("deployed");
    const r2 = resolveTurn(r1.state, [{ unitId: "a", waypoints: [{ x: 1000, y: 4000 }] }], wideCtx);
    expect(unitOf(r2.state, "a").pos).toEqual({ x: 1000, y: 4000 });
    expect(r2.events.some((e) => e.unitId === "a" && e.type === "contact")).toBe(false);
  });

  it("探知できない敵(夜の森に潜む伏撃)には接敵しない", () => {
    const night = { ...wideCtx, visibilityMultiplier: 0.3 };
    // g は森林の縁(5500, 5125)に潜む(展開途中で撃たないので、伏撃の見つかりにくさが保たれる)。敵まで 425m(接敵距離内)。森の奥からは外が見えないので、縁に置く
    const s0 = state(inf("a", 5500, 4700), ger("g", 5500, 5125, { stance: "ambush", formation: "deploying" }));
    const r = resolveTurn(s0, [], night);
    expect(r.events.some((e) => e.unitId === "a" && e.type === "contact")).toBe(false);
    expect(unitOf(r.state, "a").formation).toBe("column");
    // 敵側は平地の a を見つけて接触している
    expect(r.events.some((e) => e.unitId === "g" && e.type === "contact")).toBe(true);
  });

  it("自軍ビューには接触中の敵のIDが出ない", () => {
    const s0 = state(inf("a", 1000, 5000), ger("de-secret", 1500, 5000));
    const r = resolveTurn(s0, [], wideCtx);
    expect(unitOf(r.state, "a").inContactWith).toEqual(["de-secret"]);
    expect(JSON.stringify(viewForSide(r.state, "us"))).not.toContain("de-secret");
  });
});
