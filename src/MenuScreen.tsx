import { COACHES, DIFFICULTIES, suggestedDifficultyForCoach, type CoachId, type DifficultyId } from './coachConfig';

type Props = {
  coachId: CoachId;
  difficultyId: DifficultyId;
  savedGameCount: number;
  onCoachChange: (coachId: CoachId) => void;
  onDifficultyChange: (difficultyId: DifficultyId) => void;
  onQuickPlay: () => void;
  onPuzzles: () => void;
  onGames: () => void;
  onCreator: () => void;
};

export default function MenuScreen({
  coachId,
  difficultyId,
  savedGameCount,
  onCoachChange,
  onDifficultyChange,
  onQuickPlay,
  onPuzzles,
  onGames,
  onCreator,
}: Props) {
  const selectedCoach = COACHES.find((coach) => coach.id === coachId) ?? COACHES[0];

  return (
    <main className="menu-screen app-menu">
      <section className="menu-workspace" aria-label="Classic Chess setup">
        <div className="menu-heading">
          <p className="eyebrow">Convai Chess Coaches</p>
          <h1>Classic Chess</h1>
          <p>Choose a coach, tune the board strength, then play, train, review, or create your own coach.</p>
        </div>

        <div className="mode-grid">
          <button className="mode-tile primary-tile" onClick={onQuickPlay}>
            <span>Quick Play</span>
            <strong>Full game with live coaching</strong>
          </button>
          <button className="mode-tile" onClick={onPuzzles}>
            <span>Puzzles with AI</span>
            <strong>Score tactics with guided hints</strong>
          </button>
          <button className="mode-tile" onClick={onGames}>
            <span>My Games</span>
            <strong>{savedGameCount ? `${savedGameCount} saved sessions` : 'Replay saved sessions'}</strong>
          </button>
          <button className="mode-tile" onClick={onCreator}>
            <span>Custom Coach</span>
            <strong>Create a Convai coach locally</strong>
          </button>
        </div>

        <section className="setup-panel">
          <div>
            <p className="eyebrow">Coach</p>
            <div className="coach-picker">
              {COACHES.map((coach) => (
                <button
                  key={coach.id}
                  className={coach.id === coachId ? 'selected-option' : ''}
                  onClick={() => {
                    onCoachChange(coach.id);
                    onDifficultyChange(suggestedDifficultyForCoach(coach, DIFFICULTIES.find((item) => item.id === difficultyId) ?? DIFFICULTIES[0]).id);
                  }}
                  style={{ borderColor: coach.id === coachId ? coach.accent : undefined }}
                >
                  <span>{coach.name}</span>
                  <small>{coach.title}</small>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="eyebrow">Skill Level</p>
            <div className="difficulty-picker">
              {DIFFICULTIES.map((difficulty) => (
                <button
                  key={difficulty.id}
                  className={difficulty.id === difficultyId ? 'selected-option' : ''}
                  onClick={() => onDifficultyChange(difficulty.id)}
                >
                  <span>{difficulty.label}</span>
                  <small>{difficulty.elo}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="coach-summary">
            <p className="eyebrow">{selectedCoach.name}</p>
            <h2>{selectedCoach.title}</h2>
            <p>{selectedCoach.chessFocus}</p>
            <small>{selectedCoach.voiceStyle}</small>
          </div>
        </section>
      </section>
    </main>
  );
}
