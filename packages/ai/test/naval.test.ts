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
  }, 60000);
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

  it("水上の戦隊は、主砲の射程の内の敵を舷側に置くように回り込む(まっすぐ突っ込まない)", async () => {
    const { decide } = await import("../src/index.js");
    const { resolveTurn, viewForSide } = await import("@brigade/sim-core");
    const sc = unwrap(buildScenario(loadScenarioJson("test-naval"), loadPacks()));
    const s = sc.start(1);
    // 巡洋艦の戦隊どうしを 12km に寄せる(空母は遠く)
    for (const u of s.units) {
      if (u.id.startsWith("w-ca") || /^w-dd[5-8]$/.test(u.id)) u.pos = { x: 74000 + (u.pos.x - 20500) / 10, y: 50500 };
      if (u.id.startsWith("e-ca") || /^e-dd[5-8]$/.test(u.id)) u.pos = { x: 86000 + (u.pos.x - 139500) / 10, y: 50500 };
    }
    const r = resolveTurn(s, [], sc.ctx);
    const o = decide(viewForSide(r.state, "w"), sc.ctx).orders.find((x) => x.unitId === "w-ca1");
    expect(o?.waypoints?.length).toBe(1);
    expect(o?.pursue).toBeUndefined();
  });
});

describe("サボ島沖海戦(savo-1942-08-09)", () => {
  it("期待挙動:夜に先に見つけて雷撃する日本軍が、連合軍に大きな損害を与える(史実は日本の決定的勝利)。弾かれる命令を出さない", () => {
    const sc = unwrap(buildScenario(loadScenarioJson("savo-1942-08-09"), loadPacks()));
    const s = runSeries(sc.start, sc.ctx, [1, 2]);
    for (const o of s.outcomes) {
      for (const st of Object.values(o.stats)) expect(st.ordersRejected).toBe(0);
      expect(o.result.winner).toBe("jp");
    }
    expect(s.decisiveness["al"]!.lossShare).toBeGreaterThan(s.decisiveness["jp"]!.lossShare);
  }, 120000);
});

describe("タサファロンガ沖海戦(tassafaronga-1942-11-30)", () => {
  it("期待挙動:電探で先に見つける米の巡洋艦部隊も、九三式魚雷の雷撃で大きく傷つく(史実は日本の決定的勝利)。弾かれる命令を出さない", () => {
    const sc = unwrap(buildScenario(loadScenarioJson("tassafaronga-1942-11-30"), loadPacks()));
    const s = runSeries(sc.start, sc.ctx, [1, 2]);
    for (const o of s.outcomes) {
      for (const st of Object.values(o.stats)) expect(st.ordersRejected).toBe(0);
      expect(o.result.winner).not.toBe("us");
    }
    expect(s.decisiveness["us"]!.lossShare).toBeGreaterThan(0.15);
  }, 120000);
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
