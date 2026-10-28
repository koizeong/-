import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDataDir, startServer, type PacksResponse, type SaveResponse } from "../src/index.js";

// 本物の data/ を書き換えないよう、写しを相手に試す
const source = fileURLToPath(new URL("../../../data/", import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), "brigade-data-"));
cpSync(source, dataDir, { recursive: true });

describe("編成エディターの HTTP の口", () => {
  const port = 19000 + Math.floor(Math.random() * 1000);
  const { scenarios } = loadDataDir(dataDir);
  let server: ReturnType<typeof startServer>;
  beforeAll(() => {
    server = startServer({ port, scenarios, defaultScenario: "bastogne-1944-12-19", defaultSide: "us", dataDir });
  });
  afterAll(async () => {
    await new Promise<void>((done) => server.wss.close(() => server.http.close(() => done())));
    rmSync(dataDir, { recursive: true, force: true });
  });
  const base = `http://localhost:${port}`;
  const packs = async () => (await (await fetch(`${base}/api/packs`)).json()) as PacksResponse;
  /** 汎用のパック(ファイル名の並びの先頭とは限らない) */
  const generic = <T extends { file: string }>(list: T[]) => list.find((x) => x.file === "ww1-korea-generic.json")!;
  const save = async (body: unknown) => {
    const r = await fetch(`${base}/api/save`, { method: "POST", body: JSON.stringify(body) });
    return { status: r.status, body: (await r.json()) as SaveResponse };
  };

  it("中継(Vite)を通ったほかのマシンからの保存は断る(x-forwarded-for の元の送り主を見る)", async () => {
    const r = await fetch(`${base}/api/save`, { method: "POST", headers: { "x-forwarded-for": "192.168.1.20" }, body: JSON.stringify({}) });
    expect(r.status).toBe(403);
  });

  it("data/ のパックを、ファイル名つきで返す", async () => {
    const p = await packs();
    expect(p.toe.map((x) => x.file)).toContain("ww1-korea-generic.json");
    expect(p.weapons.length).toBeGreaterThan(0);
    expect(p.rules.length).toBeGreaterThan(0);
    expect(p.branches.length).toBeGreaterThan(0);
  });

  it("検証を通った編成表は data/ に書き、サーバーのシナリオも読み直す", async () => {
    const p = await packs();
    const toe = structuredClone(generic(p.toe).pack) as { toes: Record<string, { name: string }> };
    toe.toes["infantry_regiment"]!.name = "歩兵連隊(書き換え)";
    const r = await save({ kind: "toe", file: generic(p.toe).file, pack: toe });
    expect(r).toEqual({ status: 200, body: { ok: true } });
    const written = JSON.parse(readFileSync(join(dataDir, "toe", generic(p.toe).file), "utf-8")) as typeof toe;
    expect(written.toes["infantry_regiment"]!.name).toBe("歩兵連隊(書き換え)");
    expect(scenarios.get("test-symmetric")!.ctx.toes.toes["infantry_regiment"]!.name).toBe("歩兵連隊(書き換え)");
  });

  it("編成表が使っている武器を消す保存は弾く(参照が切れる)", async () => {
    const p = await packs();
    const w = structuredClone(generic(p.weapons).pack) as { weapons: Record<string, unknown> };
    delete w.weapons["machine_gun"];
    const r = await save({ kind: "weapons", file: generic(p.weapons).file, pack: w });
    expect(r.status).toBe(422);
    expect(!r.body.ok && r.body.errors.join("\n")).toContain("machine_gun");
  });

  it("スキーマ違反・不正なファイル名は弾く", async () => {
    const p = await packs();
    const toe = structuredClone(generic(p.toe).pack) as { toes: Record<string, { armorRatio: number }> };
    toe.toes["infantry_regiment"]!.armorRatio = 3;
    expect((await save({ kind: "toe", file: generic(p.toe).file, pack: toe })).status).toBe(422);
    expect((await save({ kind: "toe", file: "../rulepacks/x.json", pack: generic(p.toe).pack })).status).toBe(422);
    expect((await save({ kind: "scenarios", file: "a.json", pack: {} })).status).toBe(422);
  });
});
