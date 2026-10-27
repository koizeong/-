import { existsSync, readdirSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { runMatch } from "@brigade/ai";
import {
  advanceSnapshot,
  campaignView,
  CampaignDefSchema,
  checkSnapshot,
  chooseBattle,
  commitOrders,
  newSnapshot,
  outcomeOf,
  playedScenario,
  startCampaign,
  type BattleOutcome,
  type CampaignDef,
  type CampaignGenerator,
  CampaignGeneratorSchema,
  generateCampaign,
  parseCampaignSpecId,
  type CampaignEnv,
  type CampaignOrder,
  type CampaignSnapshot,
} from "@brigade/campaign";
import type { GameRecord } from "@brigade/protocol";
import type { LoadedScenario } from "@brigade/sim-core";
import { Match } from "./match.js";

/**
 * キャンペーン(作戦の層)の HTTP の口。サーバーは進み具合を持たず、画面が送ってくる記録(CampaignSnapshot)から毎回割り出す。
 * - GET  /api/campaigns:キャンペーンの一覧
 * - GET  /api/campaign?id=:1つのキャンペーンの作戦地図・師団・旅団・勝利条件
 * - POST /api/campaign/start {campaignId, side, seed?}
 * - POST /api/campaign/view {snapshot}
 * - POST /api/campaign/orders {snapshot, orders}:この段階の命令を確定する
 * - POST /api/campaign/battle {snapshot, battleId}:指揮する戦闘を選び、その戦術シナリオの ID を返す(WebSocket の join で遊ぶ)
 * - POST /api/campaign/advance {snapshot, record?}:段階を進める。record は指揮した戦闘の記録(サーバーが再生して結果を出す)
 * 返すのは { snapshot, view }(advance は report も)。誤りは { errors }
 */

export interface CampaignSetup {
  defs: Map<string, CampaignDef>;
  /** 自動生成のキャンペーンの決まり。あれば gencamp: で始まる ID のキャンペーンを作って遊べる */
  generator?: CampaignGenerator;
  env: CampaignEnv;
}

/** data/campaigns のキャンペーンを読む(なければ空)。始めの状態が作れるか(編成表があるか)まで確かめる */
export function loadCampaigns(dataDir: string, env: CampaignEnv): Map<string, CampaignDef> {
  const dir = join(dataDir, "campaigns");
  const out = new Map<string, CampaignDef>();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const path = join(dir, f);
    const r = CampaignDefSchema.safeParse(JSON.parse(readFileSync(path, "utf-8")));
    if (!r.success) throw new Error(`${path}:\n${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n")}`);
    try {
      startCampaign(r.data, env, 1);
    } catch (e) {
      throw new Error(`${path}: ${e instanceof Error ? e.message : String(e)}`);
    }
    out.set(r.data.id, r.data);
  }
  return out;
}

/** data/generators/campaigns.json(自動生成のキャンペーンの決まり)。なければ null */
export function loadCampaignGenerator(dataDir: string): CampaignGenerator | null {
  const path = join(dataDir, "generators", "campaigns.json");
  if (!existsSync(path)) return null;
  const r = CampaignGeneratorSchema.safeParse(JSON.parse(readFileSync(path, "utf-8")));
  if (!r.success) throw new Error(`${path}:\n${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n")}`);
  return r.data;
}

/** 作ったキャンペーンを少しだけ覚えておく */
const generated = new Map<string, CampaignDef>();

/** キャンペーンを探す:data/ のキャンペーンか、自動生成の ID なら作る(作れなければ undefined) */
export function findCampaign(setup: CampaignSetup, id: string): CampaignDef | undefined {
  const hit = setup.defs.get(id) ?? generated.get(id);
  if (hit) return hit;
  const spec = parseCampaignSpecId(id);
  const era = spec ? setup.env.generator.eras[spec.era] : undefined;
  if (!spec || !setup.generator || !era || !setup.generator.sizes[spec.size] || !setup.generator.eras[spec.era]) return undefined;
  const def = generateCampaign(spec, setup.generator, era.sides, Object.keys(setup.env.biomes));
  generated.set(id, def);
  if (generated.size > 16) generated.delete(generated.keys().next().value!);
  return def;
}

/** 一覧の札 */
export function campaignSummary(def: CampaignDef) {
  return {
    id: def.id,
    name: def.name,
    ...(def.description ? { description: def.description } : {}),
    sides: def.sides,
    startDate: def.calendar.startDate,
    stages: def.calendar.stages,
    daysPerStage: def.calendar.daysPerStage,
    formations: Object.fromEntries(def.sides.map((s) => [s.id, def.formations.filter((f) => f.side === s.id).length])),
  };
}

/** 作戦地図と勝利条件(両陣営に公開の情報) */
export function campaignDetail(def: CampaignDef) {
  return {
    ...campaignSummary(def),
    regions: def.regions,
    links: def.links,
    control: def.control,
    victory: def.victory,
    formationList: def.formations.map((f) => ({ id: f.id, name: f.name, side: f.side })),
    ...(def.historicalOutcome ? { historicalOutcome: def.historicalOutcome } : {}),
  };
}

/** 指揮した戦闘の記録を再生して、決着を出す。最後まで戦っていなければ、残りを AI 同士で解く */
export function playedOutcome(scenario: LoadedScenario, record: GameRecord): BattleOutcome {
  if (record.scenarioId !== scenario.def.id) throw new Error("指揮した戦闘の記録が、この段階の戦闘のものではありません");
  const { match, last } = Match.resume(scenario, record);
  if (match.over && last?.result) return outcomeOf(last.result, match.fullState().units, true);
  const out = runMatch(match.fullState(), scenario.ctx, {}, record.seed);
  return outcomeOf(out.result, out.final.units, true);
}

const MAX_BODY = 4 * 1024 * 1024;

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("本文が大きすぎます"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as unknown;
        resolve(v && typeof v === "object" ? (v as Record<string, unknown>) : {});
      } catch {
        reject(new Error("JSON として読めません"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * キャンペーンの口を受け付ける(受け付けたら true)。register:指揮する戦闘の戦術シナリオを、join で探せるように覚えさせる
 */
export async function handleCampaignRequest(req: IncomingMessage, res: ServerResponse, setup: CampaignSetup | undefined, register: (sc: LoadedScenario) => void): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/campaign")) return false;
  const reply = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
    return true;
  };
  const fail = (errors: string[], status = 400) => reply(status, { errors });
  if (!setup) return fail(["このサーバーではキャンペーンを遊べません"], 404);
  const { defs, env } = setup;
  const find = (id: string) => {
    try {
      return findCampaign(setup, id);
    } catch {
      return undefined;
    }
  };

  if (req.method === "GET" && url.pathname === "/api/campaigns") return reply(200, [...defs.values()].map(campaignSummary));
  // 自動生成のキャンペーンで選べる大きさと編成
  if (req.method === "GET" && url.pathname === "/api/campaigns/options") {
    const g = setup.generator;
    return reply(200, {
      sizes: Object.entries(g?.sizes ?? {}).map(([id, z]) => ({ id, name: z.name })),
      eras: Object.keys(g?.eras ?? {})
        .filter((id) => env.generator.eras[id])
        .map((id) => ({ id, name: env.generator.eras[id]!.name, sides: env.generator.eras[id]!.sides.map((s) => ({ id: s.id, name: s.name })) })),
    });
  }
  if (req.method === "GET" && url.pathname === "/api/campaign") {
    const def = find(url.searchParams.get("id") ?? "");
    return def ? reply(200, campaignDetail(def)) : fail([`キャンペーン "${url.searchParams.get("id")}" がありません`], 404);
  }
  if (req.method !== "POST") return false;

  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch (e) {
    return fail([e instanceof Error ? e.message : String(e)]);
  }
  const ok = (def: CampaignDef, snapshot: CampaignSnapshot, extra: Record<string, unknown> = {}) => reply(200, { snapshot, view: campaignView(def, env, snapshot), ...extra });

  if (url.pathname === "/api/campaign/start") {
    const def = find(String(body.campaignId ?? ""));
    if (!def) return fail([`キャンペーン "${String(body.campaignId)}" がありません`], 404);
    const seed = Number.isInteger(body.seed) ? (body.seed as number) : Math.floor(Math.random() * 2 ** 31);
    const r = newSnapshot(def, env, String(body.side ?? ""), seed);
    return r.ok ? ok(def, r.value) : fail(r.errors);
  }

  // ここから先は、送られてきた記録を確かめてから
  const snap = body.snapshot as CampaignSnapshot | undefined;
  const def = snap && typeof snap === "object" ? find(String(snap.campaignId)) : undefined;
  if (!snap || !def || !snap.state || typeof snap.state !== "object") return fail(["キャンペーンの記録が読めません"]);
  let errors: string[];
  try {
    errors = checkSnapshot(def, env, snap);
  } catch (e) {
    errors = [`キャンペーンの記録が壊れています:${e instanceof Error ? e.message : String(e)}`];
  }
  if (errors.length) return fail(errors);

  try {
    if (url.pathname === "/api/campaign/view") return ok(def, snap);
    if (url.pathname === "/api/campaign/orders") {
      const orders = Array.isArray(body.orders) ? (body.orders as unknown[]) : [];
      const valid = orders.filter((o): o is CampaignOrder => !!o && typeof o === "object" && typeof (o as CampaignOrder).formation === "string" && typeof (o as CampaignOrder).to === "string");
      if (valid.length !== orders.length) return fail(["命令の形が違います"]);
      const r = commitOrders(def, env, snap, valid);
      return r.ok ? ok(def, r.value) : fail(r.errors);
    }
    if (url.pathname === "/api/campaign/battle") {
      const r = chooseBattle(def, env, snap, String(body.battleId ?? ""));
      if (!r.ok) return fail(r.errors);
      const sc = playedScenario(def, env, r.value);
      if (!sc) return fail(["戦闘のシナリオが作れません"]);
      register(sc);
      return ok(def, r.value, { scenarioId: sc.def.id, side: snap.side });
    }
    if (url.pathname === "/api/campaign/advance") {
      let played: BattleOutcome | undefined;
      const record = body.record as GameRecord | undefined;
      if (record && snap.battleId) {
        const sc = playedScenario(def, env, snap);
        if (!sc) return fail(["指揮した戦闘のシナリオが作れません"]);
        if (record.scenarioId !== sc.def.id) return fail(["指揮した戦闘の記録が、この段階の戦闘のものではありません"]);
        played = playedOutcome(sc, record);
      }
      const r = advanceSnapshot(def, env, snap, played);
      return r.ok ? ok(def, r.value.snapshot, { report: r.value.report }) : fail(r.errors);
    }
  } catch (e) {
    return fail([e instanceof Error ? e.message : String(e)], 500);
  }
  return false;
}
