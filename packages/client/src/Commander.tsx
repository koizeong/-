import type { CommanderInfo } from "@brigade/protocol";

/** 指揮官の1行:階級・名前(架空の印)・特性の札(説明は札に重ねると出る)。倒れた人は線で消す */
export function CommanderLine({ c, lost, share }: { c: CommanderInfo; lost?: boolean; share?: "unit" | "formation" }) {
  return (
    <span className={`commander${lost ? " lost" : ""}`} data-testid={`commander-${c.id}`} title={c.note ?? (c.fictional ? "架空の人物" : undefined)}>
      {share === "formation" && <span className="muted">上級:</span>}
      {c.rank && <span className="rank">{c.rank}</span>}
      <span className="name">{c.name}</span>
      {c.fictional && <span className="fictional" title="架空の人物(史実の指揮官が分からない所に、自動で付けた名前)">架</span>}
      {lost && <span className="note">倒れた</span>}
      {c.traits.map((t) => (
        <span key={t.id} className="trait" title={t.description}>
          {t.name}
        </span>
      ))}
    </span>
  );
}

/** 部隊を指揮している人(部隊の指揮官)と、上級部隊の指揮官(上へたどる) */
export function commandersFor(
  unitId: string,
  commanders: readonly CommanderInfo[],
  formations: Readonly<Record<string, { parent?: string | undefined; units: readonly string[] }>>,
): { c: CommanderInfo; share: "unit" | "formation" }[] {
  const out: { c: CommanderInfo; share: "unit" | "formation" }[] = [];
  const own = commanders.find((c) => c.unitId === unitId);
  if (own) out.push({ c: own, share: "unit" });
  let cur = Object.entries(formations).find(([, f]) => f.units.includes(unitId))?.[0];
  for (let d = 0; cur !== undefined && d < 16; d++) {
    const fc = commanders.find((c) => c.formationId === cur);
    if (fc) out.push({ c: fc, share: "formation" });
    cur = formations[cur]?.parent;
  }
  return out;
}
