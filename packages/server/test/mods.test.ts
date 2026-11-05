import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findPackDirs, loadDataDir, loadMods } from "../src/index.js";

const dataDir = fileURLToPath(new URL("../../../data/", import.meta.url));
const base = JSON.parse(readFileSync(join(dataDir, "scenarios", "test-symmetric.json"), "utf-8")) as Record<string, unknown>;

/** 試験用の MOD のフォルダを作る(パック名 → pack.json と scenarios の中身) */
function modsDir(packs: Record<string, { manifest: unknown; scenarios?: Record<string, unknown>; toe?: Record<string, unknown> }>): string {
  const root = mkdtempSync(join(tmpdir(), "brigade-mods-"));
  for (const [folder, p] of Object.entries(packs)) {
    const dir = join(root, folder);
    mkdirSync(join(dir, "scenarios"), { recursive: true });
    writeFileSync(join(dir, "pack.json"), JSON.stringify(p.manifest));
    for (const [f, sc] of Object.entries(p.scenarios ?? {})) writeFileSync(join(dir, "scenarios", f), JSON.stringify(sc));
    if (p.toe) {
      mkdirSync(join(dir, "toe"));
      for (const [f, t] of Object.entries(p.toe)) writeFileSync(join(dir, "toe", f), JSON.stringify(t));
    }
  }
  return root;
}

describe("シナリオパック(MOD)", () => {
  it("パックのシナリオを足し、出どころを覚える", () => {
    const root = modsDir({ good: { manifest: { id: "good", name: "よいパック", version: "1.0" }, scenarios: { "a.json": { ...base, id: "good-a" } } } });
    const { packs, scenarios } = loadDataDir(dataDir);
    const r = loadMods(findPackDirs([root]), packs, scenarios);
    expect(r.mods[0]!.info).toMatchObject({ id: "good", ok: true, errors: [], scenarios: ["good-a"] });
    expect(scenarios.has("good-a")).toBe(true);
    expect(r.sourceOf.get("good-a")).toBe("good");
  });

  it("誤りのあるパックは丸ごと外し、どのファイルの何が悪いかを知らせる(ほかのパックは読む)", () => {
    const root = modsDir({
      bad: { manifest: { id: "bad", name: "壊れたパック", version: "1.0" }, scenarios: { "ok.json": { ...base, id: "bad-ok" }, "broken.json": { ...base, id: "bad-broken", units: [{ id: "x", side: "us", toe: "no_such_toe", x: 1, y: 1, facing: 0 }] } } },
      good: { manifest: { id: "good", name: "よいパック", version: "1.0" }, scenarios: { "a.json": { ...base, id: "good-a" } } },
    });
    const { packs, scenarios } = loadDataDir(dataDir);
    const { mods } = loadMods(findPackDirs([root]), packs, scenarios);
    const bad = mods.find((m) => m.info.id === "bad")!.info;
    expect(bad.ok).toBe(false);
    expect(bad.errors.join("\n")).toContain("bad/scenarios/broken.json");
    // 壊れたパックの、正しいシナリオも入れない(丸ごと外す)
    expect(scenarios.has("bad-ok")).toBe(false);
    expect(scenarios.has("good-a")).toBe(true);
  });

  it("基本のデータやほかのパックと ID が重なるパック、要るパックがないパックは外す。要るパックは先に読む", () => {
    const root = modsDir({
      a1: { manifest: { id: "dup", name: "重なり", version: "1" }, scenarios: { "s.json": { ...base, id: "test-symmetric" } } },
      b1: { manifest: { id: "child", name: "子", version: "1", requires: ["parent"] }, scenarios: { "s.json": { ...base, id: "child-s" } } },
      c1: { manifest: { id: "orphan", name: "親なし", version: "1", requires: ["nowhere"] } },
      z9: { manifest: { id: "parent", name: "親", version: "1" }, scenarios: { "s.json": { ...base, id: "parent-s" } } },
    });
    const { packs, scenarios } = loadDataDir(dataDir);
    const { mods } = loadMods(findPackDirs([root]), packs, scenarios);
    const by = (id: string) => mods.find((m) => m.info.id === id)!.info;
    expect(by("dup").ok).toBe(false);
    expect(by("dup").errors.join()).toContain("重なっています");
    expect(by("parent").ok).toBe(true);
    expect(by("child").ok).toBe(true);
    expect(by("orphan").ok).toBe(false);
    expect(by("orphan").errors.join()).toContain("nowhere");
  });

  it("pack.json が正しくなければ外す", () => {
    const root = modsDir({ x: { manifest: { id: "Bad ID", version: "1" } } });
    const { packs, scenarios } = loadDataDir(dataDir);
    const { mods } = loadMods(findPackDirs([root]), packs, scenarios);
    expect(mods[0]!.info.ok).toBe(false);
    expect(mods[0]!.info.errors.join()).toContain("pack.json");
  });
});
