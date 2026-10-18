import { describe, expect, it } from "vitest";
import { createUnit, newGameState, resolveTurn, trainingOf, unitModifiers } from "../src/index.js";
import { inf, wideCtx, withoutFatigue } from "./helpers.js";

const ctx = withoutFatigue(wideCtx);

describe("練度による命令の遅れ", () => {
  it("期待挙動:未熟な部隊は、命令が届いて動き出すまでに時間がかかる(その間は前の命令のまま)", () => {
    const delay = ctx.rules.training.levels["green"]!.orderDelayMinutes;
    expect(delay).toBeGreaterThan(0);
    const move = (training: string) => {
      const s = newGameState([createUnit(inf("a", 1000, 1000, { formation: "column", moveMode: "march", training }))], 1);
      const r = resolveTurn(s, [{ unitId: "a", waypoints: [{ x: 9000, y: 1000 }] }], ctx);
      const track = r.tracks["a"]!;
      // 遅れの時刻までは、ほとんど動かない
      const at = track.find((p) => p.t - s.time >= delay * 60 - 1)!;
      return { early: at.x - 1000, total: r.state.units[0]!.pos.x - 1000 };
    };
    const green = move("green");
    const regular = move("regular");
    expect(green.early).toBeLessThan(1);
    expect(regular.early).toBeGreaterThan(100);
    expect(green.total).toBeLessThan(regular.total);
  });

  it("遅れは画面にも出す(ユニットの補正の欄)", () => {
    const u = createUnit(inf("a", 1000, 1000, { training: "green" }));
    expect(unitModifiers(u, ctx).orderDelayMinutes).toBe(trainingOf(u, ctx.rules).orderDelayMinutes);
  });
});
