import type { GameState, LoadedScenario, TurnResult, Unit } from "@brigade/sim-core";
import type { Debrief, DebriefUnit } from "@brigade/protocol";

type Fate = DebriefUnit["fate"];
const FATE_OF_EVENT: Record<string, Fate> = {
  destroyed: "destroyed",
  shipLostRetiring: "destroyed",
  surrendered: "surrendered",
  shipScuttled: "scuttled",
  shipLeft: "left",
  withdrawn: "withdrawn",
  retreated: "retreated",
};

/** 航空隊の分遣(「隊の ID~番号」)は元の隊にまとめる */
const baseId = (id: string) => id.replace(/~\d+$/, "");

/**
 * 戦闘詳報の材料を、ターンごとに集める(試合・オンライン対戦の部屋の両方で使う)。
 * 部隊が加わったときの戦力・最後に見た状態・最後の様子(撃破・投降・自沈・戦場を去った)を覚えておき、勝敗がついたら全部隊を明かす
 */
export class DebriefTracker {
  private readonly first = new Map<string, number>();
  private readonly last = new Map<string, Unit>();
  private readonly fate = new Map<string, Fate>();

  constructor(start: GameState) {
    for (const u of start.units) this.see(u);
  }

  private see(u: Unit) {
    const id = baseId(u.id);
    if (id !== u.id) return;
    if (!this.first.has(id)) this.first.set(id, u.strength);
    this.last.set(id, u);
  }

  observe(r: TurnResult): void {
    for (const u of r.destroyed) this.see(u);
    for (const u of r.state.units) this.see(u);
    for (const e of r.events) {
      const f = FATE_OF_EVENT[e.type];
      if (f && !this.fate.has(e.unitId)) this.fate.set(e.unitId, f);
    }
  }

  build(scenario: LoadedScenario, state: GameState): Debrief {
    const { ctx, def } = scenario;
    const names = new Map([...def.units, ...def.rules.reinforcements, ...def.rules.airborne].filter((u) => u.name).map((u) => [u.id, u.name!]));
    const alive = new Map(state.units.map((u) => [u.id, u]));
    const credit = new Map<string, { dealt: number; kills: number }>();
    for (const [id, c] of Object.entries(state.ledger ?? {})) {
      const k = baseId(id);
      const x = credit.get(k) ?? { dealt: 0, kills: 0 };
      x.dealt += c.dealt;
      x.kills += c.kills;
      credit.set(k, x);
    }
    const units: DebriefUnit[] = [...this.last.values()].map((u) => {
      const toe = ctx.toes.toes[u.toe];
      const now = alive.get(u.id);
      const fate: Fate = now && now.strength > 0 ? "active" : (this.fate.get(u.id) ?? "destroyed");
      const kept = fate === "left" || fate === "withdrawn" || fate === "retreated";
      const c = credit.get(u.id) ?? { dealt: 0, kills: 0 };
      return {
        id: u.id,
        side: u.side,
        name: names.get(u.id) ?? toe?.name ?? u.id,
        toeName: toe?.name ?? u.toe,
        kind: toe?.air ? "air" : toe?.ship || toe?.naval ? "sea" : "land",
        start: this.first.get(u.id) ?? u.strength,
        end: now ? Math.max(0, now.strength) : kept ? Math.max(0, u.strength) : 0,
        fate,
        dealt: Math.round(c.dealt * 10) / 10,
        kills: c.kills,
      };
    });
    units.sort((a, b) => (a.side < b.side ? -1 : a.side > b.side ? 1 : b.dealt - a.dealt || (a.id < b.id ? -1 : 1)));
    const mvp: Debrief["mvp"] = [];
    for (const side of def.sides.map((s) => s.id)) {
      for (const kind of ["land", "sea", "air"] as const) {
        const best = units.filter((u) => u.side === side && u.kind === kind && u.dealt > 0).sort((a, b) => b.dealt - a.dealt || b.kills - a.kills || (a.id < b.id ? -1 : 1))[0];
        if (best) mvp.push({ side, kind, unitId: best.id });
      }
    }
    return { units, mvp };
  }
}
