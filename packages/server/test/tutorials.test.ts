import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadDataDir, loadTutorials } from "../src/index.js";

const dataDir = fileURLToPath(new URL("../../../data/", import.meta.url));
const { scenarios } = loadDataDir(dataDir);

describe("手引き", () => {
  it("data/tutorials の手引きは、形式と参照(シナリオ・陣営・ユニット・地図の印)が正しい", () => {
    const list = loadTutorials(dataDir, scenarios);
    expect(list.map((t) => t.id)).toContain("bastogne-basics");
    // 最後の段は条件なし(自由に遊ぶ前の締めくくり)
    for (const t of list) expect(t.steps.at(-1)!.until).toBeUndefined();
  });

  it("ないユニットを指す手引きは、どこが悪いかを書いて弾く", () => {
    const dir = mkdtempSync(join(tmpdir(), "tut-"));
    mkdirSync(join(dir, "tutorials"));
    const t = JSON.parse(readFileSync(join(dataDir, "tutorials/bastogne-basics.json"), "utf-8")) as { steps: { until?: { unitId?: string } }[] };
    t.steps.find((s) => s.until?.unitId)!.until!.unitId = "us-nobody";
    writeFileSync(join(dir, "tutorials/bad.json"), JSON.stringify(t));
    expect(() => loadTutorials(dir, scenarios)).toThrow(/us-nobody/);
  });

  it("手引きのディレクトリがなければ空", () => {
    expect(loadTutorials(mkdtempSync(join(tmpdir(), "tut-")), scenarios)).toEqual([]);
  });
});
