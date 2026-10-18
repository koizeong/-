import { describe, expect, it } from "vitest";
import { createUnit, distance, newGameState, resolveTurn, viewForSide, type GameState, type NewUnit } from "../src/index.js";
import { ger, inf, unitOf, wideCtx, withoutFatigue } from "./helpers.js";

const ctx = withoutFatigue(wideCtx);

/** 米軍の機甲(追う側)と、独軍の歩兵(追われる側)。1ターン進めて、米軍から敵が見えている状態にする */
function seen(target: Partial<NewUnit> = {}): { s: GameState; contactId: string } {
  const s0 = newGameState(
    [
      createUnit(inf("p", 2000, 2000, { branch: "armor", toe: "armor_combat_command", formation: "column", moveMode: "march" })),
      createUnit(ger("t", 3000, 2000, { formation: "column", ...target })),
    ],
    1,
  );
  const s = resolveTurn(s0, [], ctx).state;
  const contactId = viewForSide(s, "us").contacts[0]!.contactId;
  return { s, contactId };
}

describe("追撃(目的地として敵の部隊を選ぶ)", () => {
  it("期待挙動:動いている敵を、ターンの途中も経路を引き直して追い、追いつく", () => {
    const { s, contactId } = seen();
    // 敵は北へ行軍する。追う側は追撃を命じる
    const r = resolveTurn(s, [{ unitId: "t", waypoints: [{ x: 3000, y: 9000 }] }, { unitId: "p", pursue: contactId }], ctx);
    const track = r.tracks["p"]!;
    const t = unitOf(r.state, "t");
    const p = unitOf(r.state, "p");
    // 敵の動きに合わせて北へ曲がっていく(最初の行き先=敵のいた地点のままではない)
    expect(track.some((pt) => pt.y > 2500)).toBe(true);
    // 追いつく(縦隊の敵は阻止圏を持たないので、すぐそばまで寄る)
    expect(distance(p.pos, t.pos)).toBeLessThan(200);
    expect(p.pursuing).toBe(contactId);
  });

  it("阻止圏を持つ敵には、肉薄の距離の手前まで詰めて、敵の方を向いて止まる", () => {
    // 相手は大隊(撃ち合いで追う側が崩れずに、止まる位置を確かめられる大きさ)
    const { s, contactId } = seen({ formation: "deployed", facing: 270, toe: "infantry_battalion" });
    let st = resolveTurn(s, [{ unitId: "p", pursue: contactId, moveMode: "combat" }], ctx).state;
    for (let i = 0; i < 3; i++) st = resolveTurn(st, [], ctx).state;
    const p = unitOf(st, "p");
    const t = st.units.find((u) => u.id === "t");
    if (t && !t.routed) {
      const d = distance(p.pos, t.pos);
      expect(d).toBeLessThanOrEqual(ctx.rules.breakthrough.closeAssaultM + 60);
      expect(Math.abs(((p.facing - 90 + 540) % 360) - 180)).toBeLessThan(5); // 東(敵の方)を向く
    }
  });

  it("見失った敵は、最後に見た位置まで行って見つからなければ、追撃をやめて止まる", () => {
    const { s, contactId } = seen();
    // 敵は見えないところへ消えた(最後に見たのは x=3000)
    unitOf(s, "t").pos = { x: 9500, y: 9500 };
    const r = resolveTurn(s, [{ unitId: "p", pursue: contactId }], ctx);
    const p = unitOf(r.state, "p");
    expect(distance(p.pos, { x: 3000, y: 2000 })).toBeLessThan(100);
    expect(p.pursuing).toBeUndefined();
    expect(p.route).toEqual([]);
  });

  it("知らない敵は追撃できない。経由点と同時にも指定できない。経由点を命じれば追撃はやめる", () => {
    const { s, contactId } = seen();
    const bad = resolveTurn(s, [{ unitId: "p", pursue: "us:nope" }], ctx);
    expect(bad.rejectedOrders.map((x) => x.reason)).toEqual(["追撃する敵が見つかりません"]);
    const both = resolveTurn(s, [{ unitId: "p", pursue: contactId, waypoints: [{ x: 2000, y: 3000 }] }], ctx);
    expect(both.rejectedOrders).toHaveLength(1);
    const chasing = resolveTurn(s, [{ unitId: "p", pursue: contactId }], ctx).state;
    const stop = resolveTurn(chasing, [{ unitId: "p", waypoints: [] }], ctx).state;
    expect(unitOf(stop, "p").pursuing).toBeUndefined();
  });

  it("相手から見た contactId だけを使う(敵の本当のIDは使えない)", () => {
    const { s } = seen();
    const r = resolveTurn(s, [{ unitId: "p", pursue: "t" }], ctx);
    expect(r.rejectedOrders).toHaveLength(1);
  });
});
