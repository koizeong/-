import { describe, expect, it } from "vitest";
import { checkToe, checkWeapon, toeDirectMaxRange, toeFire, toeHitPoints, toeSummary, weaponUsage, type Toe } from "../src/index.js";
import { branches, frontToes, rules, weapons } from "./helpers.js";

const inf = frontToes.toes["infantry_regiment"]!;

describe("編成表の導出値(編成エディター用)", () => {
  it("耐久・射程・距離ごとの火力は、ゲームの計算と同じ関数から出る", () => {
    const s = toeSummary(inf, weapons, branches, rules)!;
    expect(s.hitPoints).toBe(toeHitPoints(inf));
    expect(s.direct.maxRangeM).toBe(toeDirectMaxRange(inf, weapons));
    const p = s.direct.curve[5]!;
    expect(p.soft).toBeCloseTo(toeFire(inf, weapons, p.distanceM, 0, false).firepower);
    expect(p.armored).toBeLessThan(p.soft);
    expect(s.indirect.maxRangeM).toBe(0);
    expect(s.fuelRangeKm).toBeNull();
    expect(s.deployedKmh).toBeCloseTo(s.marchKmh * rules.combatMoveSpeedRatio);
  });

  it("期待挙動:中隊を増やすと火力と耐久が増え、弾薬の持ち時間は短くなる", () => {
    const more: Toe = { ...inf, elements: inf.elements.map((e, i) => (i === 0 ? { ...e, count: e.count * 2 } : e)) };
    const a = toeSummary(inf, weapons, branches, rules)!;
    const b = toeSummary(more, weapons, branches, rules)!;
    expect(b.hitPoints).toBeGreaterThan(a.hitPoints);
    expect(b.direct.curve[2]!.soft).toBeGreaterThan(a.direct.curve[2]!.soft);
    expect(b.direct.ammoMinutes!).toBeLessThan(a.direct.ammoMinutes!);
  });

  it("存在しない武器・兵科は誤り、正面幅0は注意。誤りがあれば導出値は出さない", () => {
    const bad: Toe = { ...inf, branch: "nope", frontageM: 0, elements: [{ ...inf.elements[0]!, weapons: [{ weapon: "laser", count: 1 }] }] };
    const issues = checkToe(bad, weapons, branches);
    expect(issues.filter((x) => x.level === "error").map((x) => x.path).sort()).toEqual(["branch", "elements.0.weapons.0.weapon"]);
    expect(checkToe({ ...inf, frontageM: 0 }, weapons, branches).map((x) => x.path)).toContain("frontageM");
    expect(toeSummary(bad, weapons, branches, rules)).toBeNull();
    expect(checkToe(inf, weapons, branches).filter((x) => x.level === "error")).toEqual([]);
  });

  it("武器のチェックと、武器を使っている編成表の一覧", () => {
    const mg = weapons.weapons["machine_gun"]!;
    expect(checkWeapon(mg)).toEqual([]);
    expect(checkWeapon({ ...mg, bands: mg.bands.map((b) => ({ ...b, power: 0 })) }).map((x) => x.path)).toContain("bands");
    expect(weaponUsage("machine_gun", [frontToes]).some((x) => x.toe === "infantry_regiment")).toBe(true);
    expect(weaponUsage("naval_gun", [frontToes])).toEqual([]);
  });
});
