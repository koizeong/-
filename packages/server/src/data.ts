import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildScenario,
  parseBranchPack,
  parseRulePack,
  parseToePack,
  parseWeaponPack,
  type LoadedScenario,
  type PackSet,
  type ParseResult,
} from "@brigade/sim-core";

/** data/ 以下のパックとシナリオを読む(ファイルの読み込みはサーバー側の役目。sim-core は読まない) */
export function loadDataDir(dataDir: string): { packs: PackSet; scenarios: Map<string, LoadedScenario> } {
  const json = (path: string): unknown => JSON.parse(readFileSync(path, "utf-8"));
  const list = (sub: string) =>
    readdirSync(join(dataDir, sub))
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => join(dataDir, sub, f));
  const load = <T extends { id: string }>(sub: string, parse: (x: unknown) => ParseResult<T>): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const path of list(sub)) {
      const r = parse(json(path));
      if (!r.ok) throw new Error(`${path}:\n${r.errors.join("\n")}`);
      out[r.value.id] = r.value;
    }
    return out;
  };
  const packs: PackSet = {
    rules: load("rulepacks", parseRulePack),
    branches: load("branches", parseBranchPack),
    weapons: load("weapons", parseWeaponPack),
    toes: load("toe", parseToePack),
  };
  const scenarios = new Map<string, LoadedScenario>();
  for (const path of list("scenarios")) {
    const r = buildScenario(json(path), packs);
    if (!r.ok) throw new Error(`${path}:\n${r.errors.join("\n")}`);
    scenarios.set(r.value.def.id, r.value);
  }
  return { packs, scenarios };
}
