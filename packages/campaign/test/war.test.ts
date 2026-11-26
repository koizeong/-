import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyCampaignOutcome,
  buildable,
  campaignStrengthScale,
  campaignWindow,
  designCap,
  designTemplate,
  startFrontCampaign,
  frontPower,
  monthDate,
  parseWarDef,
  resolveMonth,
  startWar,
  warOrders,
  type WarDef,
  type WarOrders,
  type WarState,
} from "../src/index.js";

/** 戦争モード(docs/war-design.md):欧州の第二次大戦 1941〜45 v0 */
const raw = JSON.parse(readFileSync(new URL("../../../data/wars/europe-1941.json", import.meta.url), "utf-8"));
const parsed = parseWarDef(raw);
if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
const def: WarDef = parsed.value;
const none: Record<string, WarOrders> = {};
const ai = (s: WarState) => Object.fromEntries(def.sides.map((x) => [x.id, warOrders(def, s, x.id)]));

describe("戦争の定義", () => {
  it("欧州1941〜45を読み込め、参照の誤りがない", () => {
    expect(def.calendar.months).toBe(48);
    expect(Object.keys(def.fronts)).toEqual(expect.arrayContaining(["east_center", "africa", "italy", "west"]));
  });

  it("参照の誤りを並べる", () => {
    const bad = structuredClone(raw);
    bad.fronts.africa.regions.push("atlantis");
    bad.templates.ax_inf41.requires = "nothing";
    const r = parseWarDef(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/atlantis[\s\S]*nothing|nothing[\s\S]*atlantis/);
  });
});

describe("1か月の解決", () => {
  const s0 = startWar(def, 1);

  it("押さえた地域から資源が入り、奪った地域は半分", () => {
    const s1 = resolveMonth(def, s0, none);
    expect(s1.history[0]!.income.ax!.industry).toBeGreaterThan(50);
    const taken = { ...s0, owners: { ...s0.owners, donbas: "ax" } };
    const s2 = resolveMonth(def, taken, none);
    expect(s2.history[0]!.income.ax!.industry - s1.history[0]!.income.ax!.industry).toBeCloseTo(def.regions.donbas!.yields.industry * 0.5, 5);
  });

  it("期待挙動:軍団を注文すると資源を払い、決まった月数の後に予備に入る", () => {
    const t = def.templates.ax_pz41!;
    const s1 = resolveMonth(def, s0, { ax: { produce: ["ax_pz41"] } });
    expect(s1.queue.filter((q) => q.side === "ax").length).toBe(1);
    let s = s1;
    for (let i = 1; i < t.months; i++) s = resolveMonth(def, s, none);
    expect(s.units.filter((u) => u.side === "ax" && u.template === "ax_pz41" && u.front === null).length).toBe(0);
    s = resolveMonth(def, s, none);
    expect(s.units.filter((u) => u.side === "ax" && u.template === "ax_pz41" && u.front === null).length).toBe(1);
  });

  it("期待挙動:研究を終えると、新しい軍団の型が作れるようになる(史実の時期より前には始められない)", () => {
    expect(buildable(def, s0, "al")).not.toContain("su_tank43");
    let s: WarState = { ...s0, month: 9 }; // 1942-03
    expect(monthDate(def, s.month)).toBe("1942-03");
    s = resolveMonth(def, s, { al: { research: "su_t_t34mass", researchShare: 0.4 } });
    for (let i = 0; i < 6 && !s.research.al!.done.includes("su_t_t34mass"); i++) s = resolveMonth(def, s, none);
    expect(s.research.al!.done).toContain("su_t_t34mass");
    expect(buildable(def, s, "al")).toContain("su_tank43");
    const early = resolveMonth(def, s0, { ax: { research: "ax_t_panther" } });
    expect(early.history[0]!.rejected.some((x) => x.side === "ax")).toBe(true);
  });

  it("期待挙動:戦線を移る軍団は、移動の月数のあいだ戦えない", () => {
    const u = s0.units.find((x) => x.side === "al" && x.front === null)!;
    const s1 = resolveMonth(def, s0, { al: { moves: [{ unitId: u.id, to: "east_center" }] } });
    const moved = s1.units.find((x) => x.id === u.id)!;
    expect(moved.moving).toBeDefined();
    const s2 = resolveMonth(def, s1, none);
    expect(s2.units.find((x) => x.id === u.id)!.front).toBe("east_center");
  });

  it("期待挙動:力で大きく勝る攻勢は前線を進め、地域を奪う。守勢どうしは動かない", () => {
    const s1 = resolveMonth(def, s0, { ax: { postures: { east_center: "attack" } } });
    const fr = s1.history[0]!.fronts.find((f) => f.front === "east_center")!;
    expect(fr.ratio).toBeGreaterThan(def.rules.advanceRatio);
    expect(fr.captured).toContain("belorussia");
    expect(s1.owners.belorussia).toBe("ax");
    const quiet = resolveMonth(def, s0, none).history[0]!.fronts.find((f) => f.front === "east_center")!;
    expect(quiet.moved).toBe(0);
  });

  it("期待挙動:開く前の戦線(西部は1944年6月から)では戦いが起きない", () => {
    const s1 = resolveMonth(def, s0, { al: { postures: { west: "attack" } } });
    expect(s1.history[0]!.fronts.find((f) => f.front === "west")!.open).toBe(false);
  });

  it("期待挙動:燃料が足りなければ、攻勢の機甲は弱る", () => {
    const dry = { ...s0, stock: { ...s0.stock, ax: { ...s0.stock.ax!, fuel: 0 } } };
    expect(frontPower(def, dry, "east_center", "ax", "attack", false)).toBeLessThan(frontPower(def, dry, "east_center", "ax", "attack", true) * 0.8);
  });

  it("期待挙動:首都を取られた陣営は決定的な負け", () => {
    const s = { ...s0, owners: { ...s0.owners, moscow: "ax" } };
    const s1 = resolveMonth(def, s, none);
    expect(s1.result).toMatchObject({ winner: "ax", level: "decisive" });
  });
});

describe("AI 同士の戦争", () => {
  it("48か月を最後まで解け、同じ種なら同じ結果になる", () => {
    const play = (seed: number) => {
      let s = startWar(def, seed);
      while (!s.result) s = resolveMonth(def, s, ai(s));
      return s;
    };
    const a = play(1);
    const b = play(1);
    expect(a.result).toEqual(b.result);
    expect(a.month).toBeGreaterThan(3);
    expect(a.history.some((h) => h.produced.length > 0)).toBe(true);
    expect(a.history.some((h) => h.researched.length > 0)).toBe(true);
  });
});

describe("史実の戦役とのつなぎ(W3)", () => {
  const s0 = startWar(def, 1);

  it("戦役の時期の戦線は、人間の陣営が戦役の地図で戦える(1941年6月の東部・中央はバルバロッサ作戦)", () => {
    expect(campaignWindow(def, s0, "east_center", "ax")?.campaignId).toBe("barbarossa-1941");
    expect(campaignWindow(def, s0, "africa", "ax")).toBeNull();
  });

  it("期待挙動:戦役を戦っている間は戦争を進められず、結果が戻ると前線が動き、戦役の時期の終わりまでその戦線は大まかには解かない", () => {
    const s1 = startFrontCampaign(def, s0, "east_center", "ax");
    expect(() => resolveMonth(def, s1, none)).toThrow(/戦役の結果/);
    expect(campaignWindow(def, s1, "east_center", "ax")).toBeNull();
    const before = s1.units.filter((u) => u.front === "east_center" && u.side === "al").reduce((t, u) => t + u.strength, 0);
    const s2 = applyCampaignOutcome(def, s1, "east_center", { winner: "ax", level: "decisive", losses: { ax: 0.1, al: 0.4 } });
    expect(s2.fronts.east_center!.boundary).toBe(s1.fronts.east_center!.boundary + 2);
    expect(s2.owners.belorussia).toBe("ax");
    expect(s2.owners.smolensk).toBe("ax");
    const after = s2.units.filter((u) => u.front === "east_center" && u.side === "al").reduce((t, u) => t + u.strength, 0);
    expect(after).toBeLessThan(before * 0.7);
    const s3 = resolveMonth(def, s2, { ax: { postures: { east_center: "attack" } } });
    expect(s3.history[0]!.fronts.find((f) => f.front === "east_center")!.attacker).toBeNull();
    // 同じ戦役は2度戦えない
    expect(campaignWindow(def, s3, "east_center", "ax")).toBeNull();
  });

  it("戦争の戦線の力の比が史実より開いていれば、劣る側の戦役の始めの戦力を下げる", () => {
    const k = campaignStrengthScale(def, s0, "east_center", { de: 100, su: 100 }, { ax: "de", al: "su" });
    expect(k.ax).toBe(1);
    expect(k.al).toBeLessThan(1);
    expect(k.al).toBeGreaterThanOrEqual(0.35);
  });
});

describe("世代の中の設計(W4)", () => {
  const s0 = startWar(def, 1);
  // 長砲身のIV号(機甲の力を上げる項目)を研究済みにした枢軸
  const s1: WarState = { ...s0, research: { ...s0.research, ax: { ...s0.research.ax!, done: ["ax_t_longpz"] } }, stock: { ...s0.stock, ax: { industry: 500, manpower: 200, fuel: 200 } } };

  it("世代の上限は、その種類に効く系統樹の項目を研究した分だけ上がる", () => {
    expect(designCap(def, s0, "ax", "armor")).toBe(0);
    expect(designCap(def, s1, "ax", "armor")).toBeCloseTo(0.1, 5);
    expect(designCap(def, s1, "ax", "infantry")).toBe(0);
  });

  it("期待挙動:設計すると工業力を払い、2か月後から作れ、質を上げた分だけ強く高い", () => {
    const order = { name: "IV号長砲身の装甲軍団", base: "ax_pz41", quality: 0.1, shift: 0.1 };
    const t = designTemplate(def, s1, "ax", order);
    if (typeof t === "string") throw new Error(t);
    const base = def.templates.ax_pz41!;
    expect(t.attack).toBeGreaterThan(base.attack * 1.15);
    expect(t.defense).toBeCloseTo(base.defense, 5);
    expect(t.cost.industry).toBeGreaterThan(base.cost.industry);
    let s = resolveMonth(def, s1, { ax: { design: order } });
    const id = Object.keys(s.designs ?? {})[0]!;
    expect(id).toBeDefined();
    expect(s.history[0]!.rejected.filter((r) => r.side === "ax")).toEqual([]);
    expect(buildable(def, s, "ax")).not.toContain(id);
    s = resolveMonth(def, s, none);
    s = resolveMonth(def, s, none);
    expect(buildable(def, s, "ax")).toContain(id);
    s = resolveMonth(def, s, { ax: { produce: [id] } });
    expect(s.queue.some((q) => q.template === id)).toBe(true);
  });

  it("世代の上限を超える質は設計できない", () => {
    const r = resolveMonth(def, s1, { ax: { design: { name: "", base: "ax_pz41", quality: 0.3, shift: 0 } } });
    expect(r.history[0]!.rejected.some((x) => x.side === "ax" && /上限/.test(x.reason))).toBe(true);
    expect(r.designs ?? {}).toEqual({});
  });
});
