import type { ScenarioDetail, TaskOrg } from "@brigade/protocol";
import { useEffect, useMemo, useState } from "react";

const NEW = ["new:1", "new:2", "new:3"] as const;
const NEW_NAME: Record<string, string> = { "new:1": "新しい任務部隊 甲", "new:2": "新しい任務部隊 乙", "new:3": "新しい任務部隊 丙" };

/**
 * 出撃前の任務部隊の編成(作戦命令)。戦隊ごとに、入れる任務部隊(シナリオの任務部隊・新しい任務部隊・独立)を選ぶ。
 * 2つ以上の戦隊の入ったものだけが任務部隊になる。試合が始まってからは、分離と合同でしか組み直せない(史実でも編成は作戦命令で前もって決めた)
 */
export function TaskOrgEditor({ fleet, onChange }: { fleet: NonNullable<ScenarioDetail["fleet"]>; onChange: (org: TaskOrg | undefined) => void }) {
  const initial = useMemo(() => {
    const a: Record<string, string> = {};
    for (const q of fleet.squadrons) a[q.id] = fleet.taskForces.find((t) => t.squadrons.includes(q.id))?.id ?? "";
    return a;
  }, [fleet]);
  const [assign, setAssign] = useState<Record<string, string>>(initial);
  useEffect(() => setAssign(initial), [initial]);
  const groups = new Map<string, string[]>();
  for (const q of fleet.squadrons) {
    const g = assign[q.id] ?? "";
    if (g) groups.set(g, [...(groups.get(g) ?? []), q.id]);
  }
  const changed = fleet.squadrons.some((q) => (assign[q.id] ?? "") !== initial[q.id]);
  useEffect(() => {
    if (!changed) return onChange(undefined);
    onChange({ taskForces: [...groups.entries()].map(([g, ids]) => ({ ...(g.startsWith("new:") ? {} : { id: g }), squadrons: ids })) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assign]);
  const options = [...fleet.taskForces.map((t) => ({ id: t.id, name: t.name })), ...NEW.map((id) => ({ id, name: NEW_NAME[id]! }))];
  const nameOf = (g: string) => options.find((o) => o.id === g)?.name ?? g;
  return (
    <div className="task-org" data-testid="task-org">
      <p className="muted">
        戦隊をどの任務部隊に入れるかを決めます。2つ以上の戦隊の入ったものが任務部隊になり、配備・基準の戦隊・役割でまとめて動かせます。
        試合が始まってからは、分離と合同(近くにいて、信号が届いてから)でしか組み直せません。
      </p>
      <table>
        <tbody>
          {fleet.squadrons.map((q) => (
            <tr key={q.id} data-testid={`task-org-${q.id}`}>
              <td>{q.name}</td>
              <td className="muted">
                {q.ships}隻{q.carrier ? "・空母" : ""}
              </td>
              <td>
                <select value={assign[q.id] ?? ""} data-testid={`task-org-select-${q.id}`} onChange={(e) => setAssign((p) => ({ ...p, [q.id]: e.target.value }))}>
                  <option value="">独立</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        {[...groups.entries()].map(([g, ids]) => `${nameOf(g)}:${ids.length >= 2 ? `${ids.length}戦隊` : "1戦隊だけなので任務部隊にならない"}`).join(" / ") || "任務部隊なし(全部独立)"}
        {changed && (
          <button className="link" data-testid="task-org-reset" onClick={() => setAssign(initial)}>
            シナリオの編成に戻す
          </button>
        )}
      </p>
    </div>
  );
}

/** 試合の前に任務部隊の編成を決める小窓(戦役の海戦・オンライン対戦の部屋) */
export function TaskOrgModal({ fleet, onStart, onClose }: { fleet: NonNullable<ScenarioDetail["fleet"]>; onStart: (org: TaskOrg | undefined) => void; onClose: () => void }) {
  const [org, setOrg] = useState<TaskOrg | undefined>(undefined);
  return (
    <div className="overlay org-modal" data-testid="task-org-modal">
      <div className="card paper">
        <h3>任務部隊の編成(出撃の前に)</h3>
        <TaskOrgEditor fleet={fleet} onChange={setOrg} />
        <div className="row">
          <button className="primary" data-testid="task-org-go" onClick={() => onStart(org)}>
            この編成で始める
          </button>
          <button onClick={onClose}>やめる</button>
        </div>
      </div>
    </div>
  );
}

/** シナリオの陣営の艦隊(組める戦隊がなければ null) */
export async function fetchFleet(scenarioId: string, side: string, preset?: string): Promise<NonNullable<ScenarioDetail["fleet"]> | null> {
  const r = await fetch(`/api/scenario?${new URLSearchParams({ id: scenarioId, side, ...(preset ? { preset } : {}) }).toString()}`);
  if (!r.ok) return null;
  const d = (await r.json()) as ScenarioDetail;
  return d.fleet ?? null;
}
