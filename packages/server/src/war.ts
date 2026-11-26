import { existsSync, readdirSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import {
  designCap,
  designPrice,
  designTemplate,
  applyCampaignOutcome,
  buildable,
  campaignStrengthScale,
  campaignWindow,
  newSnapshot,
  startFrontCampaign,
  type CampaignSnapshot,
  frontOpen,
  frontPower,
  monthDate,
  monthIndex,
  parseWarDef,
  researchable,
  resolveMonth,
  startWar,
  warOrders,
  warVp,
  type WarDef,
  type WarOrders,
  type WarSnapshot,
  type WarState,
} from "@brigade/campaign";
import type { CampaignSetup } from "./campaign.js";

/**
 * 戦争モードの HTTP の口(docs/war-design.md)。サーバーは進み具合を持たず、画面が送ってくる記録(WarSnapshot)から毎回解く(戦役と同じ作り)。
 * - GET  /api/wars:戦争の一覧
 * - GET  /api/war?id=:1つの戦争の定義(地域・戦線・型・系統樹)
 * - POST /api/war/start {warId, side, seed?}
 * - POST /api/war/advance {snapshot, orders}:人間の陣営の命令と、相手の AI の命令で1か月を解く
 * 返すのは { snapshot, view }(advance は report も)。誤りは { errors }
 */

export type { WarSnapshot } from "@brigade/campaign";

/** data/wars の戦争を読む(なければ空) */
export function loadWars(dataDir: string): Map<string, WarDef> {
  const dir = join(dataDir, "wars");
  const out = new Map<string, WarDef>();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const r = parseWarDef(JSON.parse(readFileSync(join(dir, f), "utf-8")));
    if (!r.ok) throw new Error(`data/wars/${f}:\n${r.errors.join("\n")}`);
    out.set(r.value.id, r.value);
  }
  return out;
}

/** 画面に出す様子(戦争の層は霧なし) */
export function warView(def: WarDef, snap: WarSnapshot, campaignNames: Record<string, string> = {}) {
  const s = snap.state;
  const side = snap.side;
  const enemy = def.sides.find((x) => x.id !== side)!.id;
  const m = s.month;
  return {
    date: monthDate(def, Math.min(m, def.calendar.months - 1)),
    month: m,
    months: def.calendar.months,
    result: s.result,
    vp: warVp(def, s),
    stock: s.stock[side],
    enemyStock: s.stock[enemy],
    research: s.research[side],
    researchable: researchable(def, s, side),
    buildable: buildable(def, s, side),
    queue: s.queue.filter((q) => q.side === side).map((q) => ({ template: q.template, done: monthDate(def, q.done) })),
    owners: s.owners,
    fronts: Object.entries(def.fronts).map(([id, f]) => {
      const fs = s.fronts[id]!;
      return {
        id,
        open: frontOpen(def, id, m),
        opens: f.opens && monthIndex(def, f.opens) > m ? f.opens : undefined,
        boundary: fs.boundary,
        posture: fs.posture[side],
        enemyPosture: fs.posture[enemy],
        power: {
          own: { attack: frontPower(def, s, id, side, "attack"), defend: frontPower(def, s, id, side, "defend") },
          enemy: { attack: frontPower(def, s, id, enemy, "attack"), defend: frontPower(def, s, id, enemy, "defend") },
        },
        enemyUnits: s.units.filter((u) => u.side === enemy && u.front === id && !u.moving).length,
        campaigns: f.campaigns.filter((c) => monthIndex(def, c.from) <= m + 2 && monthIndex(def, c.to) >= m),
        /** 今、戦役の地図で戦える史実の戦役 */
        window: campaignWindow(def, s, id, side),
        /** 戦役の地図で戦っている・戦った(その時期の間) */
        campaign: fs.campaign && (fs.campaign.pending || fs.campaign.until >= m) ? fs.campaign : undefined,
      };
    }),
    units: s.units.filter((u) => u.side === side),
    last: s.history[s.history.length - 1] ?? null,
    campaignResults: s.campaignResults ?? [],
    /** 世代の上限(設計の質の上限。種類ごと)と、自陣営が設計した型 */
    designCaps: { infantry: designCap(def, s, side, "infantry"), armor: designCap(def, s, side, "armor"), air: designCap(def, s, side, "air") },
    designs: Object.fromEntries(Object.entries(s.designs ?? {}).filter(([, d]) => d.side === side).map(([id, d]) => [id, { ...d, ready: monthDate(def, d.availableMonth) }])),
    /** 戦役の ID → 名前(このサーバーにある戦役だけ) */
    campaignNames: Object.fromEntries(Object.values(def.fronts).flatMap((f) => f.campaigns.map((c) => [c.campaignId, campaignNames[c.campaignId] ?? c.campaignId]))),
  };
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString("utf-8");
  const v = text ? JSON.parse(text) : {};
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("JSON のオブジェクトを送ってください");
  return v as Record<string, unknown>;
}

/** 戦争の口を受け付ける(受け付けたら true) */
export async function handleWarRequest(
  req: IncomingMessage,
  res: ServerResponse,
  wars: Map<string, WarDef> | undefined,
  /** 戦線の史実の戦役を戦役の地図で戦うのに使う(なければ戦役では戦えない) */
  campaigns?: CampaignSetup,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/war")) return false;
  const reply = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
    return true;
  };
  const fail = (errors: string[], status = 400) => reply(status, { errors });
  if (!wars || wars.size === 0) return fail(["このサーバーには戦争がありません(data/wars)"], 404);
  const names = Object.fromEntries([...(campaigns?.defs.values() ?? [])].map((d) => [d.id, d.name]));

  if (req.method === "GET" && url.pathname === "/api/wars") {
    return reply(200, [...wars.values()].map((d) => ({ id: d.id, name: d.name, description: d.description, sides: d.sides, start: d.calendar.start, months: d.calendar.months })));
  }
  if (req.method === "GET" && url.pathname === "/api/war") {
    const def = wars.get(url.searchParams.get("id") ?? "");
    return def ? reply(200, def) : fail([`戦争 "${url.searchParams.get("id")}" がありません`], 404);
  }
  if (req.method !== "POST") return false;
  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch (e) {
    return fail([e instanceof Error ? e.message : String(e)]);
  }
  if (url.pathname === "/api/war/start") {
    const def = wars.get(String(body.warId ?? ""));
    if (!def) return fail([`戦争 "${String(body.warId)}" がありません`], 404);
    const side = String(body.side ?? "");
    if (!def.sides.some((s) => s.id === side)) return fail([`陣営 "${side}" がありません`]);
    const seed = Number.isInteger(body.seed) ? (body.seed as number) : Math.floor(Math.random() * 2 ** 31);
    const snapshot: WarSnapshot = { warId: def.id, side, state: startWar(def, seed) };
    return reply(200, { snapshot, view: warView(def, snapshot, names) });
  }
  const snap = body.snapshot as WarSnapshot | undefined;
  const def = snap ? wars.get(snap.warId) : undefined;
  if (!snap || !def || !snap.state || snap.state.warId !== def.id || !def.sides.some((s) => s.id === snap.side)) return fail(["戦争の記録が読めません"]);
  if (url.pathname === "/api/war/view") return reply(200, { snapshot: snap, view: warView(def, snap, names) });
  // 戦線の史実の戦役を戦役の地図で戦い始める:戦役の記録を作り、戦争の戦線の力の比に合わせて始めの戦力を下げる
  if (url.pathname === "/api/war/campaign/start") {
    const front = String(body.front ?? "");
    const w = def.fronts[front] ? campaignWindow(def, snap.state, front, snap.side) : null;
    if (!w) return fail(["この戦線は今、戦役の地図では戦えません"]);
    const cdef = campaigns?.defs.get(w.campaignId);
    if (!campaigns || !cdef) return fail([`戦役 "${w.campaignId}" がこのサーバーにありません`], 404);
    const r = newSnapshot(cdef, campaigns.env, w.sides[snap.side]!, snap.state.month * 7919 + (snap.state.rng[3] ?? 0));
    if (!r.ok) return fail(r.errors);
    const camp: CampaignSnapshot = r.value;
    const scale = campaignStrengthScale(def, snap.state, front, camp.state.forceTotals, w.sides);
    for (const [warSide, k] of Object.entries(scale)) {
      const cs = w.sides[warSide];
      if (!cs || k >= 1) continue;
      for (const u of Object.values(camp.state.units)) if (u.side === cs) u.strength *= k;
      camp.state.forceTotals[cs] = (camp.state.forceTotals[cs] ?? 0) * k;
    }
    const next: WarSnapshot = { ...snap, state: startFrontCampaign(def, snap.state, front, snap.side) };
    return reply(200, {
      snapshot: next,
      view: warView(def, next, names),
      campaign: camp,
      campaignName: cdef.name,
      sideName: cdef.sides.find((x) => x.id === w.sides[snap.side])?.name ?? snap.side,
      scale,
    });
  }
  // 戦役の結果を戦争へ戻す
  if (url.pathname === "/api/war/campaign/result") {
    const front = String(body.front ?? "");
    const camp = body.campaign as CampaignSnapshot | undefined;
    const fs = snap.state.fronts[front];
    if (!fs?.campaign?.pending) return fail(["この戦線は戦役の結果を待っていません"]);
    if (!camp || camp.campaignId !== fs.campaign.campaignId || !camp.state?.result) return fail(["戦役がまだ終わっていないか、別の戦役の記録です"]);
    const w = def.fronts[front]!.campaigns.find((c) => c.campaignId === camp.campaignId)!;
    const toWar = Object.fromEntries(Object.entries(w.sides).map(([ws, cs]) => [cs, ws]));
    const res = camp.state.result;
    const losses = Object.fromEntries(Object.entries(w.sides).map(([ws, cs]) => [ws, (camp.state.lost[cs] ?? 0) / Math.max(1e-9, camp.state.forceTotals[cs] ?? 0)]));
    const state = applyCampaignOutcome(def, snap.state, front, { winner: res.winner ? (toWar[res.winner] ?? null) : null, level: res.level, losses });
    const next: WarSnapshot = { ...snap, state };
    return reply(200, { snapshot: next, view: warView(def, next, names) });
  }
  // 設計の見込み(性能・値段・設計にかかる工業力)
  if (url.pathname === "/api/war/design/preview") {
    const o = body.design as { name?: string; base?: string; quality?: number; shift?: number } | undefined;
    const order = { name: String(o?.name ?? ""), base: String(o?.base ?? ""), quality: Number(o?.quality ?? 0), shift: Number(o?.shift ?? 0) };
    const t = designTemplate(def, snap.state, snap.side, order);
    return typeof t === "string" ? fail([t]) : reply(200, { template: t, price: designPrice(def, order) });
  }
  if (url.pathname === "/api/war/advance") {
    if (snap.state.result) return fail(["戦争は終わっています"]);
    const enemy = def.sides.find((s) => s.id !== snap.side)!.id;
    const mine = (body.orders ?? {}) as WarOrders;
    let state: WarState;
    try {
      state = resolveMonth(def, snap.state, { [snap.side]: mine, [enemy]: warOrders(def, snap.state, enemy) });
    } catch (e) {
      return fail([e instanceof Error ? e.message : String(e)]);
    }
    const next: WarSnapshot = { ...snap, state };
    return reply(200, { snapshot: next, view: warView(def, next, names), report: state.history[state.history.length - 1] });
  }
  return false;
}
