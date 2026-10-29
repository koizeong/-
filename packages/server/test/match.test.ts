import { fileURLToPath } from "node:url";
import { parseClientMessage, type ServerMessage } from "@brigade/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { catalogOf, developmentInfo, generatedScenario, loadBiomes, loadDataDir, loadGeneratorData, Match, scenarioDetail, scenarioSummary, startScenario, startServer } from "../src/index.js";

const { scenarios } = loadDataDir(fileURLToPath(new URL("../../../data/", import.meta.url)));
const bastogne = scenarios.get("bastogne-1944-12-19")!;

describe("シナリオの詳しい情報(シナリオ選択・部隊編成の画面)", () => {
  it("地図・目標と、選んだ陣営の部隊(増援も)だけを返す。敵の部隊は含めない(霧)", () => {
    const d = scenarioDetail(bastogne, "us");
    expect(d.map.rows.length).toBeGreaterThan(0);
    expect(d.objectives.length).toBeGreaterThan(0);
    expect(d.units.length).toBeGreaterThan(0);
    expect(d.units.some((u) => u.id === "us-501-pir")).toBe(true);
    expect(d.units.some((u) => u.id.startsWith("de-"))).toBe(false);
    expect(Object.values(d.formations).every((f) => f.units.every((id) => !id.startsWith("de-")))).toBe(true);
  });

  it("史実の結末(結果の画面で比べる)を試合の情報に入れる。演習のシナリオにはない", () => {
    const slim = new Match(scenarios.get("slim-river-1942-01-07")!, "uk", 1);
    expect(slim.info().historicalOutcome).toMatchObject({ winner: "jp", level: "decisive" });
    expect(new Match(scenarios.get("test-symmetric")!, "us", 1).info().historicalOutcome).toBeUndefined();
  });

  it("兵科記号の材料:兵科ごとの印と、編成表ごとの規模・重ねる印(地図・戦闘序列で使う)。暗い時間のターンも", () => {
    const info = new Match(bastogne, "us", 1).info();
    expect(info.symbols.branches).toMatchObject({ infantry: "infantry", armor: "armor", tank_destroyer: "antitank", artillery: "artillery" });
    expect(info.symbols.toes["airborne_regiment"]).toEqual({ echelon: "regiment", modifiers: ["airborne"] });
    expect(info.symbols.toes["tank_destroyer_battalion"]?.modifiers).toContain("armored");
    expect(scenarioDetail(bastogne, "us").symbols.toes["armored_task_force"]?.echelon).toBe("battalion");
    expect(new Match(scenarios.get("slim-river-1942-01-07")!, "uk", 1).info().darkTurns.length).toBeGreaterThan(0);
  });
});

describe("試合の情報", () => {
  it("後から来る部隊(空挺降下・増援)の砲兵も、砲撃の要請に使えるよう射程を渡す(ナイメーヘンの第376落下傘野砲大隊)", () => {
    const m = new Match(scenarios.get("nijmegen-1944-09-17")!, "us", 1);
    expect(m.view().own.some((u) => u.id === "us-376-pfab")).toBe(false);
    expect(m.info().artilleryRanges["us-376-pfab"]).toBeGreaterThan(0);
    expect(m.info().artilleryRanges["us-82-divarty"]).toBeGreaterThan(0);
    const inchon = new Match(scenarios.get("inchon-1950-09-15")!, "us", 1);
    expect(inchon.info().artilleryRanges["us-11mar"]).toBeGreaterThan(0);
  });
});

describe("試合(人間 対 AI)", () => {
  it("命令を受けて1ターン進み、自陣営のビューと再生データを返す", () => {
    const m = new Match(bastogne, "us", 1);
    expect(m.aiSides).toEqual(["de"]);
    const out = m.submit(1, [{ unitId: "us-501-pir", waypoints: [{ x: 17125, y: 12625 }], moveMode: "march" }], []);
    expect(out.turn).toBe(1);
    expect(out.rejectedOrders).toEqual([]);
    expect(Object.keys(out.replay.own)).toContain("us-501-pir");
    expect(m.turn).toBe(2);
  });

  it("他陣営のユニットへの命令と他陣営の司令部コマンドは弾く。ターン番号が違えば受け付けない", () => {
    const m = new Match(bastogne, "us", 1);
    const out = m.submit(1, [{ unitId: "de-lehr-902", stance: "defense" }], [{ side: "de", type: "airStrike", target: { x: 1, y: 1 } }]);
    expect(out.rejectedOrders).toEqual([{ unitId: "de-lehr-902", reason: "自陣営のユニットではありません" }]);
    expect(out.rejectedHqCommands.map((x) => x.reason)).toEqual(["自陣営の司令部コマンドではありません"]);
    expect(() => m.submit(5, [], [])).toThrow("今は 2 ターン目");
  });

  it("経路の見積もり:自軍のユニットだけ。見積もりは実際の解決と同じ位置になり、試合は進まない", () => {
    const m = new Match(bastogne, "us", 1);
    const wp = [{ x: 17125, y: 12625 }];
    const p = m.preview("us-501-pir", wp, "march")!;
    expect(p.reachable).toBe(true);
    expect(p.path.length).toBeGreaterThan(1);
    expect(m.preview("de-lehr-902", wp)).toBeNull();
    expect(m.turn).toBe(1);
    const out = m.submit(1, [{ unitId: "us-501-pir", waypoints: wp, moveMode: "march" }], []);
    const track = out.replay.own["us-501-pir"]!;
    const end = track[track.length - 1]!;
    // 接敵・阻止圏がなければ、このターンの終わりの位置は見積もりと同じ
    if (!out.replay.events.some((e) => e.unitId === "us-501-pir" && (e.type === "contact" || e.type === "blocked"))) {
      expect(end.x).toBeCloseTo(p.turnEnds[0]!.x, 0);
      expect(end.y).toBeCloseTo(p.turnEnds[0]!.y, 0);
    }
  });

  it("霧:返すビューと再生データに、敵の本当のIDは含まれない", () => {
    const m = new Match(bastogne, "us", 1);
    let text = JSON.stringify(m.view());
    for (let t = 1; t <= 4; t++) text += JSON.stringify(m.submit(t, [], [])) + JSON.stringify(m.view());
    for (const id of ["de-lehr-902", "de-2pz-kg-north", "de-26vgd-77"]) expect(text).not.toContain(id);
  });

  it("最後まで遊べて、勝敗が出る", () => {
    const m = new Match(bastogne, "us", 3);
    let last = null;
    while (!m.over) last = m.submit(m.turn, [], []);
    expect(last!.result).not.toBeNull();
    expect(() => m.submit(m.turn, [], [])).toThrow("試合は終わっています");
  }, 60000);

  it("試合の情報には、自陣営の砲兵の射程が入る", () => {
    const info = new Match(bastogne, "us", 1).info();
    expect(info.mySide).toBe("us");
    expect(Object.keys(info.artilleryRanges)).toEqual(["us-101-divarty"]);
    expect(info.map.rows.length).toBe(100);
  });
});

describe("通信", () => {
  const port = 18000 + Math.floor(Math.random() * 1000);
  let server: ReturnType<typeof startServer>;
  beforeAll(() => {
    server = startServer({ port, scenarios, defaultScenario: "bastogne-1944-12-19", defaultSide: "us" });
  });
  afterAll(() => new Promise<void>((done) => server.wss.close(() => server.http.close(() => done()))));

  const connect = () =>
    new Promise<{ ws: WebSocket; next: () => Promise<ServerMessage> }>((resolve) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      const queue: ServerMessage[] = [];
      const waiters: ((m: ServerMessage) => void)[] = [];
      ws.on("message", (d) => {
        const m = JSON.parse(d.toString()) as ServerMessage;
        const w = waiters.shift();
        if (w) w(m);
        else queue.push(m);
      });
      ws.on("open", () => resolve({ ws, next: () => (queue.length ? Promise.resolve(queue.shift()!) : new Promise((r) => waiters.push(r))) }));
    });

  it("参加して1ターン解決できる", async () => {
    const { ws, next } = await connect();
    ws.send(JSON.stringify({ type: "join", seed: 1 }));
    const welcome = await next();
    expect(welcome.type).toBe("welcome");
    ws.send(JSON.stringify({ type: "submitTurn", turn: 1, orders: [], hqCommands: [] }));
    const resolved = await next();
    expect(resolved.type).toBe("turnResolved");
    if (resolved.type === "turnResolved") expect(resolved.view.turn).toBe(2);
    ws.close();
  });

  it("壊れたメッセージにはエラーを返す", async () => {
    const { ws, next } = await connect();
    ws.send("not json");
    expect(await next()).toMatchObject({ type: "error" });
    ws.send(JSON.stringify({ type: "submitTurn", turn: 1, orders: [], hqCommands: [] }));
    expect(await next()).toEqual({ type: "error", message: "先に join してください" });
    ws.send(JSON.stringify({ type: "submitTurn", turn: 1, orders: [{ unitId: 3 }], hqCommands: [] }));
    expect(await next()).toMatchObject({ type: "error" });
    ws.close();
  });

  it("クライアントのメッセージの検証(座標が数値でない命令を弾く)", () => {
    expect(parseClientMessage(JSON.stringify({ type: "submitTurn", turn: 1, orders: [{ unitId: "a", waypoints: [{ x: "1", y: 2 }] }], hqCommands: [] })).ok).toBe(false);
  });
});

describe("試合の記録と続きから", () => {
  it("期待挙動:記録を再生すると、保存したときとまったく同じ状態に戻る(AIの命令も同じになる)", () => {
    const m = new Match(bastogne, "us", 7);
    m.submit(1, [{ unitId: "us-501-pir", waypoints: [{ x: 17125, y: 12625 }], moveMode: "march" }], []);
    m.submit(2, [], []);
    const last = m.submit(3, [{ unitId: "us-501-pir", stance: "defense" }], []);
    const rec = m.record();
    expect(rec.turns).toHaveLength(3);
    const r = Match.resume(bastogne, JSON.parse(JSON.stringify(rec)));
    expect(r.sameData).toBe(true);
    expect(r.match.turn).toBe(m.turn);
    expect(r.match.view()).toEqual(m.view());
    expect(r.last).toEqual(last);
    // 続きから進めても、元の試合と同じに進む
    expect(r.match.submit(4, [], [])).toEqual(m.submit(4, [], []));
  });

  it("データが変わっていれば、そのことを知らせる(再生はする)", () => {
    const m = new Match(bastogne, "us", 7);
    m.submit(1, [], []);
    const r = Match.resume(bastogne, { ...m.record(), scenarioHash: "old" });
    expect(r.sameData).toBe(false);
    expect(r.match.turn).toBe(2);
  });

  it("開始画面の概要:陣営ごとの部隊の数・日数・勝利条件", async () => {
    const { scenarioSummary } = await import("../src/index.js");
    const eight = scenarios.get("bastogne-1944-12")!;
    const s = scenarioSummary(eight);
    expect(s.days).toBe(8);
    expect(s.sides.map((x) => x.id)).toEqual(["us", "de"]);
    expect(s.sides.every((x) => x.units > 0)).toBe(true);
    expect(Object.keys(s.victory)).toContain("us");
  });
});

describe("装備編成で始める", () => {
  const data = loadDataDir(fileURLToPath(new URL("../../../data/", import.meta.url)));
  const sym = data.scenarios.get("test-symmetric")!;
  const custom = {
    bundle: {
      version: 1 as const,
      designs: { mg: { name: "高速機関銃", archetype: "machine_gun", params: { rateRpm: 1000 } } },
      templates: { light: { name: "軽歩兵連隊", baseToe: "infantry_regiment", elements: [{ name: "小銃中隊", count: 9, hitPoints: 100, weapons: [{ weapon: "user:mg", count: 2 }] }] } },
    },
    substitutions: { "us-inf1": "light" },
  };

  it("差し替えた部隊で始まり、記録に持ち込みが残り、記録から同じ状態に戻る", () => {
    const sc = startScenario(sym, data.packs, "us", { custom });
    expect(sc.ok).toBe(true);
    if (!sc.ok) return;
    const m = new Match(sc.value, "us", 3, undefined, { custom });
    expect(m.view().own.find((u) => u.id === "us-inf1")!.toe).toBe("user:light");
    m.submit(1, [], []);
    const rec = JSON.parse(JSON.stringify(m.record()));
    expect(rec.custom).toEqual(custom);
    const again = startScenario(sym, data.packs, rec.side, { custom: rec.custom });
    if (!again.ok) throw new Error(again.errors.join());
    const r = Match.resume(again.value, rec);
    expect(r.sameData).toBe(true);
    expect(r.match.view()).toEqual(m.view());
  });

  it("配属した中隊は、試合の情報の配属の内訳に出る(自陣営だけ)", () => {
    const att = { bundle: { version: 1 as const, designs: {}, templates: {} }, substitutions: {}, attachments: [{ from: "us-arm", element: 0, to: "us-inf1" }] };
    const sc = startScenario(sym, data.packs, "us", { custom: att });
    if (!sc.ok) throw new Error(sc.errors.join());
    const m = new Match(sc.value, "us", 3, undefined, { custom: att });
    const toe = m.view().own.find((u) => u.id === "us-inf1")!.toe;
    expect(m.info().attachments[toe]).toEqual([expect.objectContaining({ from: "us-arm", branch: "armor", armored: true, count: 1 })]);
    expect(m.info().attachments[toe]![0]!.share).toBeGreaterThan(0);
    // 相手(AI)の陣営から見た情報には出ない
    const enemy = new Match(sc.value, "de", 3, undefined, { custom: att });
    expect(enemy.info().attachments[toe]).toBeUndefined();
  });

  it("相手の陣営の部隊は差し替えられない(サーバーが弾く)", () => {
    const r = startScenario(sym, data.packs, "us", { custom: { ...custom, substitutions: { "de-inf1": "light" } } });
    expect(r.ok).toBe(false);
  });

  it("装備編成の画面の情報:ルールパックの開発の決まりと、差し替えられる部隊", () => {
    const info = developmentInfo(sym)!;
    expect(Object.keys(info.development.archetypes)).toContain("gun");
    expect(info.sides["us"]!.units.map((u) => u.id)).toContain("us-inf1");
    expect(scenarioSummary(sym).customizableSides).toEqual(["us", "de"]);
  });
});

describe("AIの陣営のおまかせ編成", () => {
  const data = loadDataDir(fileURLToPath(new URL("../../../data/", import.meta.url)));
  const sym = data.scenarios.get("test-symmetric")!;

  it("AIの陣営の部隊がおまかせ編成に差し替わり、記録から同じ状態に戻る", () => {
    const sc = startScenario(sym, data.packs, "us", { aiAuto: "balanced" });
    if (!sc.ok) throw new Error(sc.errors.join());
    const toes = sc.value.units.filter((u) => u.side === "de").map((u) => u.toe);
    expect(toes.some((t) => t.startsWith("user:de:auto-"))).toBe(true);
    expect(sc.value.units.filter((u) => u.side === "us").every((u) => !u.toe.startsWith("user:"))).toBe(true);
    const m = new Match(sc.value, "us", 2, undefined, { aiAuto: "balanced" });
    m.submit(1, [], []);
    const rec = JSON.parse(JSON.stringify(m.record()));
    expect(rec.aiAuto).toBe("balanced");
    const again = startScenario(sym, data.packs, rec.side, { ...(rec.custom ? { custom: rec.custom } : {}), aiAuto: rec.aiAuto });
    if (!again.ok) throw new Error(again.errors.join());
    const r = Match.resume(again.value, rec);
    expect(r.sameData).toBe(true);
    expect(r.match.view()).toEqual(m.view());
  });

  it("ない方針は断る", () => {
    expect(startScenario(sym, data.packs, "us", { aiAuto: "nope" }).ok).toBe(false);
  });
});

describe("編成の選択(史実の編成)", () => {
  const data = loadDataDir(fileURLToPath(new URL("../../../data/", import.meta.url)));
  const bas = data.scenarios.get("bastogne-1944-12")!;

  it("史実の編成を選ぶと、部隊が1944年の編成表になり、記録から同じ状態に戻る", () => {
    expect(scenarioSummary(bas).presets.map((p) => p.id)).toEqual(["historical", "real"]);
    const sc = startScenario(bas, data.packs, "us", { preset: "historical" });
    if (!sc.ok) throw new Error(sc.errors.join());
    const toeOf = (id: string) => sc.value.units.find((u) => u.id === id)!.toe;
    expect(toeOf("us-705-td")).toBe("us_tank_destroyer_battalion_m18");
    expect(toeOf("de-lehr-130")).toBe("de_panzer_regiment_1944");
    expect(sc.value.ctx.toes.toes["de_panzer_regiment_1944"]!.elements.some((e) => e.armorMm)).toBe(true);
    const m = new Match(sc.value, "us", 4, undefined, { preset: "historical" });
    m.submit(1, [], []);
    const rec = JSON.parse(JSON.stringify(m.record()));
    expect(rec.preset).toBe("historical");
    const again = startScenario(bas, data.packs, rec.side, { preset: rec.preset });
    if (!again.ok) throw new Error(again.errors.join());
    expect(Match.resume(again.value, rec).match.view()).toEqual(m.view());
  });

  it("史実の編成(実数・定数)を選ぶと、部隊が人員・装備品の実数の編成表になり、1ターン進められる", () => {
    const sc = startScenario(bas, data.packs, "us", { preset: "real" });
    if (!sc.ok) throw new Error(sc.errors.join());
    const toeOf = (id: string) => sc.value.units.find((u) => u.id === id)!.toe;
    expect(toeOf("us-501-pir")).toBe("us-pir-1944");
    expect(toeOf("de-lehr-130")).toBe("de-pz-lehr-130-1944");
    expect(sc.value.ctx.toes.toes["us-pir-1944"]!.elements.every((e) => e.personnel !== undefined)).toBe(true);
    const m = new Match(sc.value, "us", 4, undefined, { preset: "real" });
    m.submit(1, [], []);
    expect(m.view().turn).toBe(2);
  });

  it("史実の編成の上に、装備編成・AIのおまかせ編成も重ねられる。ない選択は断る", () => {
    const sc = startScenario(bas, data.packs, "us", { preset: "historical", aiAuto: "balanced" });
    expect(sc.ok).toBe(true);
    expect(startScenario(bas, data.packs, "us", { preset: "nope" }).ok).toBe(false);
  });
});

describe("自動生成の戦場", () => {
  const dataDir = fileURLToPath(new URL("../../../data/", import.meta.url));
  const setup = { data: loadGeneratorData(dataDir)!, biomes: loadBiomes(dataDir) };
  const { packs: gp } = loadDataDir(dataDir);
  it("ID から戦場を作って試合ができ、同じ ID なら同じ戦場(記録・続きからが ID だけで済む)", () => {
    const id = "gen:encounter:steppe:s:generic:5";
    const a = generatedScenario(id, setup, gp)!;
    expect(a.def.id).toBe(id);
    const m = new Match(a, "blue", 1);
    const out = m.submit(1, [], []);
    expect(out.turn).toBe(1);
    expect(m.view().turn).toBe(2);
    expect(scenarioSummary(a).sides.map((s) => s.id)).toEqual(["blue", "red"]);
    expect(generatedScenario("gen:encounter:nowhere:s:generic:5", setup, gp)).toBeUndefined();
    // 霧:相手の秘密の副目標の候補の中身は送らない
    const info = m.info();
    expect(info.victory.red!.secretPool?.options).toEqual([]);
  });

  it("霧:輸送の護衛で、撃破を狙う側には、狙う相手の部隊の本当の ID を送らない", () => {
    const sc = generatedScenario("gen:escort:western-farmland:s:generic:3", setup, gp)!;
    const esc = sc.units.find((u) => u.id.endsWith("-convoy"))!;
    const amb = sc.def.sides.find((s) => s.id !== esc.side)!.id;
    const info = new Match(sc, amb, 1).info();
    expect(JSON.stringify(info.victory)).not.toContain(esc.id);
    expect(info.victory[amb]!.conditions.find((c) => c.type === "unitLoss")).toMatchObject({ unit: "enemy" });
    // 護送する側には自分の部隊の ID のまま
    expect(new Match(sc, esc.side, 1).info().victory[esc.side]!.conditions.find((c) => c.type === "unitReach")).toMatchObject({ unit: esc.id });
  });
});

describe("装備と編制の図鑑", () => {
  const { packs } = loadDataDir(fileURLToPath(new URL("../../../data/", import.meta.url)));
  it("装備品(使っている編成表つき)・武器・編成表(実数のものは人員・装備品・所属つき)を返す", () => {
    const c = catalogOf(packs);
    expect(c.equipment["de-panther"]).toMatchObject({ nation: "de", category: "tank", armored: true, });
    expect(c.equipment["de-panther"]!.usedBy).toContain("de-panther-abt-1944");
    expect(c.toes["de-ir-1939"]).toMatchObject({ nation: "de", real: true });
    expect(c.toes["de-ir-1939"]!.elements.find((e) => e.name === "小銃中隊")).toMatchObject({ count: 9, groupCount: 3, group: "大隊", personnel: 216 });
    expect(c.toes["infantry_regiment"]).toMatchObject({ nation: "generic", real: false });
    expect(c.weapons["de-kwk42"]!.bands[0]!.penetrationMm).toBe(138);
  });
});

