import { useEffect } from "react";
import { useGame } from "./game.js";
import { MapView } from "./MapView.js";
import { EventLog, HqPanel, ResultOverlay, TopBar, UnitList, UnitPanel } from "./Panels.js";
import { BattleReport } from "./Report.js";
import { Menu } from "./Menu.js";
import { TutorialCoach } from "./Tutorial.js";

export function App() {
  const game = useGame();
  const { s } = game;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") game.setTargeting(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game]);

  if (s.phase === "menu") return <Menu game={game} />;
  if (!s.info || !s.view) {
    return <div className="loading">{s.error ?? "サーバーに接続しています…(サーバーは pnpm dev で起動します)"}</div>;
  }
  return (
    <div className="app">
      <TopBar game={game} />
      {s.resumed && !s.resumed.sameData && (
        <div className="note banner">
          保存したときからゲームのデータ(ルール・編成・シナリオ)が変わっています。続きから再開しましたが、保存したときと展開が違うことがあります。
        </div>
      )}
      <main>
        <MapView game={game} />
        <TutorialCoach game={game} />
        <aside>
          <UnitList game={game} />
          <UnitPanel game={game} />
          <BattleReport game={game} />
          <HqPanel game={game} />
          <EventLog game={game} />
        </aside>
      </main>
      {s.error && (
        <div className="toast" onClick={game.dismissError}>
          {s.error}
        </div>
      )}
      <ResultOverlay game={game} />
    </div>
  );
}
