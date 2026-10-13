import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// 設計ルール1:sim-core は決定論的。非決定的なAPIの混入をここで防ぐ。
const FORBIDDEN = [/Math\.random\s*\(/, /Date\.now\s*\(/, /new Date\s*\(/, /performance\.now\s*\(/];

function listTs(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return listTs(p);
    return p.endsWith(".ts") ? [p] : [];
  });
}

describe("決定論", () => {
  it("sim-core/src に Math.random・Date などの非決定的APIがない", () => {
    const src = fileURLToPath(new URL("../src", import.meta.url));
    const hits = listTs(src).flatMap((file) =>
      readFileSync(file, "utf-8")
        .split("\n")
        .flatMap((line, i) => (FORBIDDEN.some((re) => re.test(line)) ? [`${file}:${i + 1}: ${line.trim()}`] : [])),
    );
    expect(hits).toEqual([]);
  });
});
