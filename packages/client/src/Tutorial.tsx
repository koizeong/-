import { useEffect } from "react";
import { tutorialDone, type Game } from "./game.js";

/**
 * 手引きの札(地図の上に出す)。段の説明と、進む条件(満たすと自動で次へ)。条件のない段は「次へ」で進む。
 * 段が指す画面の部品(data-testid)を光らせる
 */
export function TutorialCoach({ game }: { game: Game }) {
  const t = game.s.tutorial;
  const step = t?.def.steps[t.step];
  const highlight = step?.highlight;

  useEffect(() => {
    if (!highlight) return;
    // 部品は後から現れることがある(部隊を選ぶと出る欄など)ので、少しおきに探し直す
    let el: Element | null = null;
    const mark = () => {
      const next = document.querySelector(`[data-testid="${CSS.escape(highlight)}"]`);
      if (next === el) return;
      el?.classList.remove("tut-highlight");
      el = next;
      el?.classList.add("tut-highlight");
      // 横の欄の下の方にある部品は、見える所までスクロールする(地図は動かさない)
      if (el && highlight !== "map") el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    mark();
    const timer = setInterval(mark, 300);
    return () => {
      clearInterval(timer);
      el?.classList.remove("tut-highlight");
    };
  }, [highlight]);

  if (!t || !step) return null;
  const last = t.step === t.def.steps.length - 1;
  const waiting = !!step.until && !tutorialDone(step.until, game.s);
  return (
    <div className="tutorial" data-testid="tutorial">
      <div className="tut-head">
        <span className="muted">
          手引き {t.step + 1} / {t.def.steps.length}
        </span>
        <button className="tut-close" onClick={game.closeTutorial} title="手引きを閉じる(試合は続く)" aria-label="手引きを閉じる">
          ×
        </button>
      </div>
      <h4>{step.title}</h4>
      {step.text.split("\n").map((line, i) => (
        <p key={i}>{line}</p>
      ))}
      <div className="row">
        <button onClick={() => game.tutorialStep(-1)} disabled={t.step === 0}>
          戻る
        </button>
        {waiting ? (
          <span className="muted tut-wait">操作すると次へ進みます</span>
        ) : last ? (
          <button className="primary" onClick={game.closeTutorial}>
            終わる
          </button>
        ) : (
          <button className="primary" onClick={() => game.tutorialStep(1)} data-testid="tutorial-next">
            次へ
          </button>
        )}
        {waiting && (
          <button className="tut-skip" onClick={() => game.tutorialStep(1)} title="この段を飛ばす">
            飛ばす
          </button>
        )}
      </div>
    </div>
  );
}
