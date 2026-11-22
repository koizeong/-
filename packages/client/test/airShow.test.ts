import type { SideReplay } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { BOMB_U, buildAirShow, retimeAirImpacts } from "../src/flavor.js";

type Flight = NonNullable<SideReplay["flights"]>[number];
const pt = (t: number, x: number, y: number, phase: string) => ({ t, x, y, aircraft: 4, phase });
/** 地図の縁(x=0)から入り、(5000,5000) の上にいて、帰る編隊 */
function flight(id: string, own: boolean, mission: string, fx: Flight["fx"], t0 = 600): Flight {
  return { id, own, mission, points: [pt(t0, 0, 5000, "inbound"), pt(t0 + 60, 5000, 5000, "station"), pt(t0 + 120, 5000, 5000, "station"), pt(t0 + 180, 2000, 5000, "outbound")], fx };
}
const replay = (flights: Flight[]) => ({ flights }) as unknown as SideReplay;
const label = (own: boolean, mission: string, n: number) => `${own ? mission : "敵"} ${n}`;

describe("航空の演出:出来事ごとの場面(ユーザー判断)", () => {
  it("期待挙動:攻撃した編隊は、入ってきた向きから目標の上を一直線に通り抜ける場面になる", () => {
    const show = buildAirShow(replay([flight("a", true, "armedRecon", [{ t: 700, kind: "attack" }])]), 0, 3600, label);
    expect(show.vignettes).toHaveLength(1);
    const v = show.vignettes[0]!;
    expect(v.kind).toBe("pass");
    expect(v.at).toEqual({ x: 5000, y: 5000 });
    expect(v.dir.x).toBeCloseTo(1, 6);
    expect(v.strafe).toBe(true);
  });

  it("期待挙動:何も起こさなかった自軍の飛行は描かず、速報に1行だけ。護衛は何も出さない", () => {
    const show = buildAirShow(replay([flight("a", true, "armedRecon", []), flight("e", true, "escort", []), flight("x", false, "armedRecon", [])]), 0, 3600, label);
    expect(show.vignettes).toHaveLength(0);
    expect(show.notes.map((n) => n.text)).toEqual(["武装偵察 4機:会敵せず帰投"]);
  });

  it("期待挙動:空戦は敵味方の出来事をまとめて1つの場面にし、落ちた機を数える。回るのは空戦の場面だけ", () => {
    const show = buildAirShow(replay([flight("a", true, "intercept", [{ t: 700, kind: "dogfight", lost: 1 }]), flight("b", false, "escort", [{ t: 720, kind: "dogfight", lost: 2 }])]), 0, 3600, label);
    expect(show.vignettes.map((v) => v.kind)).toEqual(["dogfight"]);
    expect(show.vignettes[0]!.ownLost).toBe(1);
    expect(show.vignettes[0]!.enemyLost).toBe(2);
  });

  it("期待挙動:同時に見せる場面は3つまで。多いときは後ろへずらす", () => {
    const fs = Array.from({ length: 8 }, (_, i) => {
      const f = flight(`f${i}`, true, "support", [{ t: 700, kind: "attack" }]);
      for (const p of f.points) p.y += i * 10000;
      return f;
    });
    const show = buildAirShow(replay(fs), 0, 3600, label);
    expect(show.vignettes).toHaveLength(8);
    for (const v of show.vignettes) {
      const overlap = show.vignettes.filter((w) => w.start < v.start + v.dur && v.start < w.start + w.dur);
      expect(overlap.length).toBeLessThanOrEqual(3);
    }
  });

  it("近い所・近い時刻に同じ陣営が攻めた編隊は、1回の通り抜けにまとめて機数を足す", () => {
    const show = buildAirShow(replay([flight("a", true, "support", [{ t: 700, kind: "attack" }]), flight("b", true, "support", [{ t: 760, kind: "attack" }])]), 0, 3600, label);
    expect(show.vignettes).toHaveLength(1);
    expect(show.vignettes[0]!.aircraft).toBe(8);
  });

  it("期待挙動:場面はターン全体に散らす(起きた順のまま、最初の場面は前半・最後の場面は後半に)", () => {
    const fs = Array.from({ length: 4 }, (_, i) => {
      const f = flight(`f${i}`, true, "support", [{ t: 700 + i * 60, kind: "attack" }], 600 + i * 60);
      for (const p of f.points) p.y += i * 10000;
      return f;
    });
    const show = buildAirShow(replay(fs), 0, 3600, label);
    const starts = show.vignettes.map((v) => v.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(starts[0]!).toBeLessThan(600);
    expect(starts[starts.length - 1]! + show.vignettes[0]!.dur).toBeGreaterThan(3000);
  });

  it("期待挙動:盤上の機の攻撃の着弾は、その攻撃の場面の投弾の時刻に合わせ直す(機が来る前に爆発しない)", () => {
    const fs = Array.from({ length: 4 }, (_, i) => {
      const f = flight(`f${i}`, true, "support", [{ t: 700, kind: "attack" }]);
      for (const p of f.points) p.y += i * 10000;
      return f;
    });
    const rp = { ...replay(fs), impacts: [{ t: 700, kind: "air", own: true, x: 5000, y: 35000, radiusM: 300, onMap: true }, { t: 700, kind: "artillery", own: true, x: 5000, y: 5000, radiusM: 300 }] } as unknown as SideReplay;
    const show = buildAirShow(rp, 0, 3600, label);
    const v = show.vignettes.find((x) => x.at.y === 35000)!;
    const [air, arty] = retimeAirImpacts(rp, show);
    expect(air!.t).toBeCloseTo(v.start + v.dur * BOMB_U, 6);
    expect(arty!.t).toBe(700);
  });
});
