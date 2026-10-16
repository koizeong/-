import { describe, expect, it } from "vitest";
import { replayForSide, resolveTurn, viewForSide } from "../src/index.js";
import { ger, inf, rules, state, wideCtx } from "./helpers.js";

const base = rules.detection.baseRangeM;

describe("霧のフィルタ", () => {
  it("自軍は全情報、敵は段階に応じた情報だけで、敵の本当のIDは出さない", () => {
    const s0 = state(
      inf("us-501", 1000, 1000),
      ger("de-near", 1300, 1000, { branch: "armor" }), // 規模まで判明
      ger("de-far", 1000 + base * 0.9, 1000), // 反応のみ
      ger("de-hidden", 9000, 9000), // 未探知
    );
    const r = resolveTurn(s0, [], wideCtx);
    const v = viewForSide(r.state, "us");
    expect(v.own.map((u) => u.id)).toEqual(["us-501"]);
    expect(v.contacts).toHaveLength(2);

    const near = v.contacts.find((c) => c.currentLevel === 3)!;
    expect(near.branch).toBe("armor");
    expect(near.estimatedStrength).toBeDefined();
    expect(near.formation).toBe("deployed"); // 縦隊だったが接敵で展開した

    const far = v.contacts.find((c) => c.currentLevel === 1)!;
    expect(far.branch).toBeUndefined();
    expect(far.estimatedStrength).toBeUndefined();

    const json = JSON.stringify(v);
    for (const id of ["de-near", "de-far", "de-hidden"]) expect(json).not.toContain(id);
  });

  it("再生データ:敵の軌跡は見えていた区間だけ。イベントは自軍のものだけ", () => {
    // 敵は見える位置から東へ行軍して視界外へ
    const s0 = state(inf("us-1", 1000, 5000), ger("de-1", 1000 + base - 300, 5000, { formation: "deployed" }));
    const r = resolveTurn(s0, [{ unitId: "de-1", waypoints: [{ x: 9900, y: 5000 }] }, { unitId: "us-1", deployAfterStop: true }], wideCtx);
    const rep = replayForSide(r, "us");

    expect(Object.keys(rep.own)).toEqual(["us-1"]);
    const tracks = Object.values(rep.contacts);
    expect(tracks).toHaveLength(1);
    const seen = tracks[0]!;
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.length).toBeLessThan(r.tracks["de-1"]!.length);
    // 動いている目標は見つかりやすい(探知距離 × movingSignatureMultiplier)
    for (const p of seen) expect(p.x - 1000).toBeLessThanOrEqual(base * rules.detection.movingSignatureMultiplier);
    // 反応のみの段階では向きを渡さない
    for (const p of seen) if (p.level < 3) expect(p.facing).toBeUndefined();

    expect(rep.events.every((e) => e.unitId === "us-1")).toBe(true);
    expect(r.events.some((e) => e.unitId === "de-1")).toBe(true);
    expect(JSON.stringify(rep)).not.toContain("de-1");
  });
});

describe("敵の潰走が見えるか", () => {
  it("兵種まで見えている(探知段階2以上)敵なら、潰走していることが分かる。反応だけ(段階1)では分からない", () => {
    const routedAt = (x: number) => {
      const s0 = state(inf("a", 1000, 1000), ger("g", x, 1000));
      const g = s0.units.find((u) => u.id === "g")!;
      g.routed = true;
      g.morale = 0.05;
      const s = resolveTurn(s0, [], wideCtx).state;
      return viewForSide(s, "us").contacts[0];
    };
    const near = routedAt(1500);
    expect(near!.currentLevel).toBeGreaterThanOrEqual(2);
    expect(near!.routed).toBe(true);
    const far = routedAt(1000 + base * 0.8);
    expect(far!.currentLevel).toBe(1);
    expect(far!.routed).toBeUndefined();
  });
});
