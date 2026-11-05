import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PackManifestSchema, type ModPackInfo, type PackManifest } from "@brigade/protocol";
import {
  buildScenario,
  equipmentCatalog,
  parseBranchPack,
  parseRulePack,
  parseToePack,
  parseWeaponPack,
  type LoadedScenario,
  type PackSet,
  type ParseResult,
} from "@brigade/sim-core";

/** 読み込んだパックの、フォルダと名札(キャンペーン・手引きを後から読むのに使う) */
export interface LoadedMod {
  manifest: PackManifest;
  dir: string;
  info: ModPackInfo;
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf-8"));
const jsonFiles = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => join(dir, f)) : []);

/** MOD のフォルダ(の並び)にある、pack.json を持つ下のフォルダ */
export function findPackDirs(modsDirs: readonly string[]): string[] {
  const out: string[] = [];
  for (const root of modsDirs) {
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root).sort()) {
      const dir = join(root, name);
      try {
        if (statSync(dir).isDirectory() && existsSync(join(dir, "pack.json"))) out.push(dir);
      } catch {
        // 読めないものは飛ばす
      }
    }
  }
  return out;
}

/**
 * シナリオパックを読み込んで、基本のデータに重ねる(packs・scenarios を書き換える)。
 * パックの中に1つでも誤りがあれば(形・参照・ID の重なり・要るパックがない)、そのパックは丸ごと外し、誤りを info.errors に書く。
 * 要るパック(requires)を先に読むよう、読める順に読む。sourceOf:シナリオの ID → パックの ID
 */
export function loadMods(
  packDirs: readonly string[],
  packs: PackSet,
  scenarios: Map<string, LoadedScenario>,
): { mods: LoadedMod[]; sourceOf: Map<string, string> } {
  const sourceOf = new Map<string, string>();
  const pending: { dir: string; manifest: PackManifest | null; errors: string[] }[] = packDirs.map((dir) => {
    const folder = dir.split(/[\\/]/).pop()!;
    try {
      const r = PackManifestSchema.safeParse(readJson(join(dir, "pack.json")));
      if (!r.success) return { dir, manifest: null, errors: r.error.issues.map((i) => `${folder}/pack.json ${i.path.join(".")}: ${i.message}`) };
      return { dir, manifest: r.data, errors: [] };
    } catch (e) {
      return { dir, manifest: null, errors: [`${folder}/pack.json: ${e instanceof Error ? e.message : String(e)}`] };
    }
  });
  const mods: LoadedMod[] = [];
  const done = new Set<string>();
  const info = (dir: string, m: PackManifest | null, errors: string[], ok: boolean, sc: string[] = []): ModPackInfo => ({
    id: m?.id ?? dir.split(/[\\/]/).pop()!,
    name: m?.name ?? dir.split(/[\\/]/).pop()!,
    version: m?.version ?? "?",
    ...(m?.author ? { author: m.author } : {}),
    ...(m?.description ? { description: m.description } : {}),
    folder: dir.split(/[\\/]/).pop()!,
    ok,
    errors,
    scenarios: sc,
    campaigns: [],
    tutorials: [],
  });
  // 要るパックがそろったものから順に読む
  let queue = [...pending];
  for (let progress = true; progress && queue.length; ) {
    progress = false;
    const rest: typeof queue = [];
    for (const p of queue) {
      if (!p.manifest) {
        mods.push({ manifest: { id: info(p.dir, null, [], false).id, name: "", version: "?", requires: [] }, dir: p.dir, info: info(p.dir, null, p.errors, false) });
        progress = true;
        continue;
      }
      if (!p.manifest.requires.every((r) => done.has(r))) {
        rest.push(p);
        continue;
      }
      progress = true;
      const m = p.manifest;
      const errors = done.has(m.id) || mods.some((x) => x.manifest.id === m.id) ? [`pack.json id: パック "${m.id}" はすでにあります`] : [];
      const added = errors.length ? null : tryPack(p.dir, m, packs, scenarios, errors);
      if (added) {
        for (const id of added.scenarioIds) sourceOf.set(id, m.id);
        done.add(m.id);
      }
      mods.push({ manifest: m, dir: p.dir, info: info(p.dir, m, errors, !!added, added?.scenarioIds ?? []) });
    }
    queue = rest;
  }
  for (const p of queue) mods.push({ manifest: p.manifest!, dir: p.dir, info: info(p.dir, p.manifest, [`pack.json requires: 要るパック ${p.manifest!.requires.filter((r) => !done.has(r)).map((r) => `"${r}"`).join("・")} がない(か、誤りがあって外れた)`], false) });
  return { mods, sourceOf };
}

/** 1つのパックを試しに重ねる。誤りがなければ packs・scenarios に足して、足したシナリオの ID を返す。誤りがあれば何も変えない */
function tryPack(dir: string, m: PackManifest, packs: PackSet, scenarios: Map<string, LoadedScenario>, errors: string[]): { scenarioIds: string[] } | null {
  const folder = dir.split(/[\\/]/).pop()!;
  const rel = (path: string) => `${folder}/${path.slice(dir.length).replace(/^[\\/]+/, "").replace(/\\/g, "/")}`;
  const load = <T extends { id: string }>(sub: string, existing: Record<string, T>, parse: (x: unknown) => ParseResult<T>): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const path of jsonFiles(join(dir, sub))) {
      try {
        const r = parse(readJson(path));
        if (!r.ok) errors.push(...r.errors.map((e) => `${rel(path)}: ${e}`));
        else if (r.value.id in existing || r.value.id in out) errors.push(`${rel(path)}: ID "${r.value.id}" はほかのパックと重なっています`);
        else out[r.value.id] = r.value;
      } catch (e) {
        errors.push(`${rel(path)}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return out;
  };
  const rules = load("rulepacks", packs.rules, parseRulePack);
  const branches = load("branches", packs.branches, parseBranchPack);
  const weapons = load("weapons", packs.weapons, parseWeaponPack);
  const allWeapons = { ...packs.weapons, ...weapons };
  const catalog = equipmentCatalog(Object.values(allWeapons));
  const toes = load("toe", packs.toes, (x) => parseToePack(x, catalog));
  const merged: PackSet = { rules: { ...packs.rules, ...rules }, branches: { ...packs.branches, ...branches }, weapons: allWeapons, toes: { ...packs.toes, ...toes } };
  const built = new Map<string, LoadedScenario>();
  for (const path of jsonFiles(join(dir, "scenarios"))) {
    try {
      const r = buildScenario(readJson(path), merged);
      if (!r.ok) errors.push(...r.errors.map((e) => `${rel(path)}: ${e}`));
      else if (scenarios.has(r.value.def.id) || built.has(r.value.def.id)) errors.push(`${rel(path)}: シナリオの ID "${r.value.def.id}" はほかと重なっています`);
      else built.set(r.value.def.id, r.value);
    } catch (e) {
      errors.push(`${rel(path)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (errors.length) return null;
  Object.assign(packs.rules, rules);
  Object.assign(packs.branches, branches);
  Object.assign(packs.weapons, weapons);
  Object.assign(packs.toes, toes);
  for (const [id, sc] of built) scenarios.set(id, sc);
  return { scenarioIds: [...built.keys()] };
}
