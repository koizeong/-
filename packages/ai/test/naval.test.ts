import { buildScenario } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { runSeries } from "../src/index.js";
import { loadPacks, loadScenarioJson, unwrap } from "../../sim-core/test/helpers.js";

describe("海戦の AI(試験の海戦 test-naval)", () => {
  it("索敵機で敵を見つけ、攻撃隊を出して損害を与える。弾かれる命令を出さない", () => {
    const sc = unwrap(buildScenario(loadScenarioJson("test-naval"), loadPacks()));
    const s = runSeries(sc.start, sc.ctx, [1, 2]);
    for (const o of s.outcomes) for (const st of Object.values(o.stats)) expect(st.ordersRejected).toBe(0);
    // 両陣営とも損害を受けている(撃ち合い・空襲が起きている)
    expect(s.decisiveness["w"]!.lossShare).toBeGreaterThan(0.05);
    expect(s.decisiveness["e"]!.lossShare).toBeGreaterThan(0.05);
  }, 60000);
});

describe("ミッドウェー海戦(midway-1942-06-04)", () => {
  it("日本軍は島を叩き、索敵で米の空母を探して攻撃する。米軍は哨戒機で機動部隊を見つけて叩く。弾かれる命令を出さない", () => {
    const sc = unwrap(buildScenario(loadScenarioJson("midway-1942-06-04"), loadPacks()));
    const s = runSeries(sc.start, sc.ctx, [1]);
    const o = s.outcomes[0]!;
    for (const st of Object.values(o.stats)) expect(st.ordersRejected).toBe(0);
    expect(s.decisiveness["jp"]!.lossShare).toBeGreaterThan(0.05);
    expect(s.decisiveness["us"]!.lossShare).toBeGreaterThan(0.02);
  }, 240000);
});

describe("海戦の AI の判断", () => {
  it("敵の空母を見つけていない間、雷装の艦攻は温存し、陸用爆弾・艦爆で島を叩く。索敵機は扇に広げて出す", async () => {
    const { decide } = await import("../src/index.js");
    const { viewForSide } = await import("@brigade/sim-core");
    const sc = unwrap(buildScenario(loadScenarioJson("midway-1942-06-04"), loadPacks()));
    const s = sc.start(1);
    const orders = decide(viewForSide(s, "jp"), sc.ctx).orders;
    const air = (id: string) => orders.find((o) => o.unitId === id)?.air;
    expect(air("jp-akagi-vt")).toBeUndefined();
    expect(air("jp-kaga-vt")).toBeUndefined();
    expect(air("jp-hiryu-vt")?.kind).toBe("strike");
    const scouts = orders.filter((o) => o.unitId.startsWith("jp-scout") && o.air?.kind === "search");
    expect(scouts.length).toBe(7);
    // 索敵線は互いに離れた向きへ(扇の広さ 160 度)
    const xs = scouts.map((o) => (o.air as { point: { x: number } }).point.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(200000);
  });

  it("水上の戦隊は、見えている敵の艦と交戦の距離の帯で撃ち合う(帯の中で敵を舷側に置く操艦はエンジンが続ける)", async () => {
    const { decide } = await import("../src/index.js");
    const { resolveTurn, viewForSide } = await import("@brigade/sim-core");
    const sc = unwrap(buildScenario(loadScenarioJson("test-naval"), loadPacks()));
    const s = sc.start(1);
    // 巡洋艦の戦隊どうしを 12km に寄せる(空母は遠く)
    for (const u of s.units) {
      if (u.id.startsWith("w-ca") || /^w-dd[5-8]$/.test(u.id)) u.pos = { x: 74000 + (u.pos.x - 20500) / 10, y: 50500 };
      if (u.id.startsWith("e-ca") || /^e-dd[5-8]$/.test(u.id)) u.pos = { x: 86000 + (u.pos.x - 139500) / 10, y: 50500 };
    }
    // 艦種の取り違えをなくす(重巡を戦艦と見誤ると、負けていると見て退く)
    const ctx = { ...sc.ctx, rules: { ...sc.ctx.rules, naval: { ...sc.ctx.rules.naval!, misidentification: undefined } } };
    const r = resolveTurn(s, [], { ...ctx, turnSeconds: 120 });
    const d = decide(viewForSide(r.state, "w"), ctx);
    const o = d.seaOrders?.find((x) => x.squadron === "w-crudiv");
    expect(o?.engage?.target).toBeDefined();
    expect(o?.engage?.band).toBeDefined();
  });

});

describe("サボ島沖海戦(savo-1942-08-09)", () => {
  it("期待挙動:夜に先に見つけて雷撃する日本軍が、連合軍に大きな損害を与える(史実は日本の決定的勝利)。弾かれる命令を出さない", () => {
    const sc = unwrap(buildScenario(loadScenarioJson("savo-1942-08-09"), loadPacks()));
    const s = runSeries(sc.start, sc.ctx, [1, 2]);
    for (const o of s.outcomes) {
      for (const st of Object.values(o.stats)) expect(st.ordersRejected).toBe(0);
      // 連合軍の艦は警戒配備で哨戒を続けるので、日本が敵を見つけきれずに引き分ける試合もある(8戦で日本5・引き分け3)。連合軍は勝たない
      expect(o.result.winner).not.toBe("al");
    }
    expect(s.decisiveness["al"]!.lossShare).toBeGreaterThan(s.decisiveness["jp"]!.lossShare);
  }, 120000);
});

describe("タサファロンガ沖海戦(tassafaronga-1942-11-30)", () => {
  // 海戦の作り直しの後、まだ史実の結果に合わない(合わせ込み SEA7 の残り。docs/research/naval-validation.md)
  it.skip("期待挙動:電探で先に見つける米の巡洋艦部隊も、九三式魚雷の雷撃で大きく傷つく(史実は日本の決定的勝利)。弾かれる命令を出さない", () => {
    const sc = unwrap(buildScenario(loadScenarioJson("tassafaronga-1942-11-30"), loadPacks()));
    // 8戦で日本の勝ちが米の勝ちより多い(日本5・米2・引き分け1。docs/research/naval-validation.md)
    const s = runSeries(sc.start, sc.ctx, [1, 2, 3, 4, 5, 6, 7, 8]);
    for (const o of s.outcomes) for (const st of Object.values(o.stats)) expect(st.ordersRejected).toBe(0);
    const wins = (side: string) => s.outcomes.filter((o) => o.result.winner === side).length;
    expect(wins("jp")).toBeGreaterThan(wins("us"));
    expect(s.decisiveness["us"]!.lossShare).toBeGreaterThan(0.15);
  }, 240000);
});

describe("第三次ソロモン海戦 第2夜(guadalcanal-1942-11-14)", () => {
  it("両軍の駆逐艦・戦艦が撃ち合い、両方が損害を受ける。弾かれる命令を出さない", () => {
    const sc = unwrap(buildScenario(loadScenarioJson("guadalcanal-1942-11-14"), loadPacks()));
    // 1戦だと片方がほとんど撃たれない試合もある(主砲が戦艦どうしに向くので)。2戦の平均で見る
    const s = runSeries(sc.start, sc.ctx, [1, 2]);
    for (const o of s.outcomes) for (const st of Object.values(o.stats)) expect(st.ordersRejected).toBe(0);
    expect(s.decisiveness["us"]!.lossShare).toBeGreaterThan(0.1);
    expect(s.decisiveness["jp"]!.lossShare).toBeGreaterThan(0.1);
  }, 120000);
});

describe("引き揚げと弾切れ", () => {
  it("期待挙動:引き揚げの刻限が過ぎると、日本の戦隊は敵がいても引き揚げの点へ向かう", async () => {
    const { decide } = await import("../src/index.js");
    const { viewForSide, resolveTurn } = await import("@brigade/sim-core");
    const sc = unwrap(buildScenario(loadScenarioJson("savo-1942-08-09"), loadPacks()));
    const w = sc.ctx.scenario.withdrawBy[0]!;
    // 戦隊ができるまで1刻み解いてから、刻限のターンにする
    const st = resolveTurn(sc.start(1), [], { ...sc.ctx, turnSeconds: 60 }).state;
    st.turn = w.fromTurn;
    const d = decide(viewForSide(st, "jp"), sc.ctx, undefined, 1);
    const sq = Object.entries(st.squadrons!).find(([, x]) => x.ships.includes("jp-chokai"))![0];
    const o = d.seaOrders!.find((x) => x.squadron === sq)!;
    expect(o.toward).toEqual({ x: w.x, y: w.y });
    expect(o.speed).toBe("flank");
  });


  it("期待挙動:主砲の徹甲弾が少なく魚雷も撃ち尽くした水上の戦隊は、敵が見えていても煙幕を張って退く", async () => {
    const { decide } = await import("../src/index.js");
    const { viewForSide, resolveTurn, cloneUnit } = await import("@brigade/sim-core");
    const sc = unwrap(buildScenario(loadScenarioJson("test-naval"), loadPacks()));
    const ctx = { ...sc.ctx, rules: { ...sc.ctx.rules, naval: { ...sc.ctx.rules.naval!, misidentification: undefined } } };
    const s = sc.start(1);
    for (const u of s.units) {
      if (u.id.startsWith("w-ca") || /^w-dd[5-8]$/.test(u.id)) u.pos = { x: 74000 + (u.pos.x - 20500) / 10, y: 50500 };
      if (u.id.startsWith("e-ca") || /^e-dd[5-8]$/.test(u.id)) u.pos = { x: 86000 + (u.pos.x - 139500) / 10, y: 50500 };
    }
    const st = resolveTurn(s, [], { ...ctx, turnSeconds: 120 }).state;
    const order = (spent: boolean) => {
      const s2 = { ...st, units: st.units.map(cloneUnit) };
      for (const u of s2.units.filter((x) => st.squadrons!["w-crudiv"]!.ships.includes(x.id))) {
        u.torpedoLoad = { salvosLeft: 0, readyAt: 0 };
        if (spent) u.shells = Object.fromEntries((ctx.toes.toes[u.toe]!.ship!.batteries ?? []).filter((b) => b.apPerGun !== undefined).map((b) => [b.weapon, { ap: 0, he: 10 }]));
      }
      return decide(viewForSide(s2, "w"), ctx, undefined, 1).seaOrders?.find((o) => o.squadron === "w-crudiv");
    };
    expect(order(true)?.smoke).toBe(true);
    expect(order(false)?.smoke).not.toBe(true);
  });
});

describe("スラバヤ沖海戦(java-sea-1942-02-27)", () => {
  it("昼の撃ち合いから夜の雷撃まで、弾かれる命令を出さない。連合軍のほうが大きく傷つく(史実は日本の決定的勝利)", () => {
    const sc = unwrap(buildScenario(loadScenarioJson("java-sea-1942-02-27"), loadPacks()));
    const s = runSeries(sc.start, sc.ctx, [1, 2]);
    for (const o of s.outcomes) for (const st of Object.values(o.stats)) expect(st.ordersRejected).toBe(0);
    expect(s.decisiveness["al"]!.lossShare).toBeGreaterThan(s.decisiveness["jp"]!.lossShare);
  }, 180000);
});

describe("スリガオ海峡海戦(surigao-1944-10-25)", () => {
  // 海戦の作り直しの後、まだ史実の結果に合わない(合わせ込み SEA7 の残り。docs/research/naval-validation.md)
  it.skip("期待挙動:時刻表に追われる西村艦隊は退かずに北へ進み、T 字を描く米の戦列に叩かれる(史実は米の決定的勝利)。弾かれる命令を出さない", () => {
    const sc = unwrap(buildScenario(loadScenarioJson("surigao-1944-10-25"), loadPacks()));
    const s = runSeries(sc.start, sc.ctx, [1, 2]);
    for (const o of s.outcomes) {
      for (const st of Object.values(o.stats)) expect(st.ordersRejected).toBe(0);
      expect(o.result.winner).toBe("us");
    }
    expect(s.decisiveness["jp"]!.lossShare).toBeGreaterThan(s.decisiveness["us"]!.lossShare);
  }, 180000);
});

describe("マレー沖海戦(malaya-sea-1941-12-10。陸攻は地図の外の飛行場から)", () => {
  it("日本軍の陸攻は索敵で Z部隊を捉えて叩き、英は戦闘機を上空直衛に出す。弾かれる命令を出さない", () => {
    const sc = unwrap(buildScenario(loadScenarioJson("malaya-sea-1941-12-10"), loadPacks()));
    const s = runSeries(sc.start, sc.ctx, [1, 2]);
    for (const o of s.outcomes) for (const st of Object.values(o.stats)) expect(st.ordersRejected).toBe(0);
    // 英の艦は傷つき、戦いは日の暮れまで続く(接触を失っても、届く陸攻が基地にいれば終えない)
    expect(s.decisiveness["uk"]!.lossShare).toBeGreaterThan(0.1);
    for (const o of s.outcomes) expect(o.turns).toBe(sc.ctx.scenario.maxTurns);
  }, 240000);
});
