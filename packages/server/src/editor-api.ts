import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import type { EditablePackKind, PackFile, PacksResponse, SaveRequest, SaveResponse } from "@brigade/protocol";
import { checkToe, parseToePack, parseWeaponPack, type LoadedScenario, type PackSet } from "@brigade/sim-core";
import { loadDataDir } from "./data.js";

/**
 * 編成エディターの HTTP の口(開発用)。
 * - GET  /api/packs:data/ のパック(ルールパック・兵科・武器・編成表)を、ファイルに書かれたままの JSON で返す
 * - POST /api/save :編成表・武器のパックを検証してから data/ に書く。localhost からだけ受け付ける。
 *   書く前に、保存後の内容で全シナリオが読み込めることを確かめる(武器を消して編成表の参照が切れる、などを防ぐ)
 */

/** エディターで書き換えられるパックの種類と、そのディレクトリ */
const EDITABLE: Record<EditablePackKind, string> = { toe: "toe", weapons: "weapons" };
type EditableKind = EditablePackKind;

/** ファイル名に使える文字(ディレクトリの外へ出られないように) */
const FILE_NAME = /^[a-z0-9][a-z0-9._-]*\.json$/;
/** 受け付ける本文の上限(バイト) */
const MAX_BODY = 2 * 1024 * 1024;

export type { PackFile, PacksResponse, SaveRequest, SaveResponse };

function listPacks(dataDir: string, sub: string): PackFile[] {
  return readdirSync(join(dataDir, sub))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => ({ file, pack: JSON.parse(readFileSync(join(dataDir, sub, file), "utf-8")) as unknown }));
}

export function readPacks(dataDir: string): PacksResponse {
  return { rules: listPacks(dataDir, "rulepacks"), branches: listPacks(dataDir, "branches"), weapons: listPacks(dataDir, "weapons"), toe: listPacks(dataDir, "toe") };
}

/**
 * 保存の検証。誤りがあれば理由の一覧を返し、なければ空。
 * スキーマ → 編成表の参照(武器・兵科)→ 保存後の内容で全シナリオが読み込めるか、の順に調べる
 */
export function validateSave(dataDir: string, req: SaveRequest): string[] {
  if (!(req.kind in EDITABLE)) return [`保存できない種類です: ${String(req.kind)}`];
  if (typeof req.file !== "string" || !FILE_NAME.test(req.file)) return [`ファイル名が不正です: ${String(req.file)}`];
  const parsed = req.kind === "toe" ? parseToePack(req.pack) : parseWeaponPack(req.pack);
  if (!parsed.ok) return parsed.errors;
  const current = readPacks(dataDir);
  const replace = (list: PackFile[], kind: EditableKind) => (req.kind === kind ? [...list.filter((p) => p.file !== req.file), { file: req.file, pack: req.pack }] : list);
  const weaponPacks = replace(current.weapons, "weapons").map((p) => parseWeaponPack(p.pack));
  const toePacks = replace(current.toe, "toe").map((p) => parseToePack(p.pack));
  const errors: string[] = [];
  // 編成表の参照:どの武器パックにもない武器、兵科パックにない兵科
  const allWeapons = { id: "*", weapons: Object.assign({}, ...weaponPacks.map((p) => (p.ok ? p.value.weapons : {}))) };
  const branchPacks = current.branches.map((p) => p.pack as { branches?: Record<string, unknown> });
  const allBranches = { id: "*", branches: Object.assign({}, ...branchPacks.map((p) => p.branches ?? {})) };
  for (const tp of toePacks) {
    if (!tp.ok) continue;
    for (const [id, toe] of Object.entries(tp.value.toes)) {
      for (const issue of checkToe(toe, allWeapons, allBranches)) if (issue.level === "error") errors.push(`編成表 ${id}:${issue.message}`);
    }
  }
  if (errors.length) return errors;
  // 保存後の内容で、全シナリオが読み込めるか
  try {
    loadDataDir(dataDir, { [`${EDITABLE[req.kind]}/${req.file}`]: req.pack });
  } catch (e) {
    return [`保存すると読み込めなくなるシナリオがあります:\n${e instanceof Error ? e.message : String(e)}`];
  }
  return [];
}

const loopback = (a: string) => a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";

/**
 * localhost からの要求か。Vite の中継(同じマシン)を通った要求は、中継が付ける x-forwarded-for の元の送り主も確かめる
 * (オンライン対戦のために Vite を同じネットワークに公開しても、ほかのマシンからは保存できないように)
 */
function isLocal(req: IncomingMessage): boolean {
  if (!loopback(req.socket.remoteAddress ?? "")) return false;
  const fwd = req.headers["x-forwarded-for"];
  const list = (Array.isArray(fwd) ? fwd.join(",") : (fwd ?? "")).split(",").map((x) => x.trim()).filter(Boolean);
  return list.every(loopback);
}

function readBody(req: IncomingMessage): Promise<string> {
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
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

/**
 * HTTP の要求を処理する。扱ったら true(扱わない道なら false)。
 * onSaved は保存の後に呼ぶ(サーバーのシナリオを読み直すため)
 */
export async function handleEditorRequest(req: IncomingMessage, res: ServerResponse, dataDir: string, onSaved: (scenarios: Map<string, LoadedScenario>, packs: PackSet) => void): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/api/packs" && req.method === "GET") {
    json(res, 200, readPacks(dataDir));
    return true;
  }
  if (url.pathname === "/api/save" && req.method === "POST") {
    if (!isLocal(req)) {
      json(res, 403, { ok: false, errors: ["保存は localhost からだけ受け付けます"] } satisfies SaveResponse);
      return true;
    }
    let body: SaveRequest;
    try {
      body = JSON.parse(await readBody(req)) as SaveRequest;
    } catch (e) {
      json(res, 400, { ok: false, errors: [e instanceof Error ? e.message : "JSONとして読めません"] } satisfies SaveResponse);
      return true;
    }
    const errors = validateSave(dataDir, body);
    if (errors.length) {
      json(res, 422, { ok: false, errors } satisfies SaveResponse);
      return true;
    }
    writeFileSync(join(dataDir, EDITABLE[body.kind], body.file), `${JSON.stringify(body.pack, null, 2)}\n`, "utf-8");
    const fresh = loadDataDir(dataDir);
    onSaved(fresh.scenarios, fresh.packs);
    json(res, 200, { ok: true } satisfies SaveResponse);
    return true;
  }
  return false;
}
