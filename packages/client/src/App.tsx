import { useEffect } from "react";
import { useGame } from "./game.js";
import { MapView } from "./MapView.js";
import { EventLog, HqPanel, ResultOverlay, TopBar, UnitList, UnitPanel } from "./Panels.js";
import { BattleReport } from "./Report.js";

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

  if (!s.info || !s.view) {
    return <div className="loading">{s.error ?? "サーバーに接続しています…(サーバーは pnpm dev で起動します)"}</div>;
  }
  return (
    <div className="app">
      <TopBar game={game} />
      <main>
        <MapView game={game} />
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
