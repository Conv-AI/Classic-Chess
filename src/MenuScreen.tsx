import { useState } from 'react';
import { COACHES, DIFFICULTIES, suggestedDifficultyForCoach, type CoachId, type DifficultyId } from './coachConfig';
import { PUZZLES } from './puzzles';

type Mode = 'quickplay' | 'puzzles';

const PUZZLE_DIFFICULTY_LABELS: Record<string, string> = {
  new: 'Mate in 1, free pieces',
  beginner: 'Forks, pins, skewers',
  intermediate: 'Multi-step tactics',
  advanced: 'Defense & endgames',
  expert: 'Strategic & prophylaxis',
};

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
  onDataset?: () => void;
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
  onDataset,
}: Props) {
  const [selectedMode, setSelectedMode] = useState<Mode>('quickplay');
  const selectedCoach = COACHES.find((coach) => coach.id === coachId) ?? COACHES[0];

  const isPuzzles = selectedMode === 'puzzles';
  const difficultyLabel = isPuzzles ? 'Puzzle Challenge' : 'Skill Level';
  const difficultyNote = isPuzzles
    ? 'Sets the type of puzzle you face — pick what suits your current training focus.'
    : 'Controls how strong the AI plays and how deep the coaching commentary goes.';

  function puzzleCountForDifficulty(id: DifficultyId) {
    return PUZZLES.filter((p) => p.difficultyId === id).length;
  }

  return (
    <main className="menu-screen app-menu">
      <section className="menu-workspace" aria-label="Classic Chess setup">
        <div className="menu-heading">
          <p className="eyebrow">Convai Chess Coaches</p>
          <h1>Classic Chess</h1>
          <p>Choose a coach, set your level, then play a full game, tackle puzzles, review your sessions, or build your own coach.</p>
        </div>

        <div className="mode-grid">
          <button
            className={`mode-tile primary-tile${selectedMode === 'quickplay' ? ' selected-mode-tile' : ''}`}
            onClick={() => setSelectedMode('quickplay')}
          >
            <span>Quick Play</span>
            <strong>Full game — live coaching after every move</strong>
          </button>
          <button
            className={`mode-tile${selectedMode === 'puzzles' ? ' selected-mode-tile' : ''}`}
            onClick={() => setSelectedMode('puzzles')}
          >
            <span>Puzzles with AI</span>
            <strong>Focused tactics — scored with guided AI hints</strong>
          </button>
          <button className="mode-tile" onClick={onGames}>
            <span>My Games</span>
            <strong>{savedGameCount ? `${savedGameCount} saved sessions` : 'Replay saved sessions'}</strong>
          </button>
          <button className="mode-tile" onClick={onCreator}>
            <span>Custom Coach</span>
            <strong>Create a Convai coach locally</strong>
          </button>
          {onDataset && (
            <button className="mode-tile" onClick={onDataset}>
              <span>Dialogue Dataset</span>
              <strong>View logged dialogue cases & AI speaking behaviors</strong>
            </button>
          )}
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
            <p className="eyebrow">{difficultyLabel}</p>
            <p className="difficulty-note">{difficultyNote}</p>
            <div className="difficulty-picker">
              {DIFFICULTIES.map((difficulty) => {
                const count = isPuzzles ? puzzleCountForDifficulty(difficulty.id) : 0;
                return (
                  <button
                    key={difficulty.id}
                    className={difficulty.id === difficultyId ? 'selected-option' : ''}
                    onClick={() => onDifficultyChange(difficulty.id)}
                  >
                    <span>{difficulty.label}</span>
                    <small>
                      {isPuzzles
                        ? `${PUZZLE_DIFFICULTY_LABELS[difficulty.id] ?? difficulty.elo} · ${count} puzzle${count !== 1 ? 's' : ''}`
                        : difficulty.elo}
                    </small>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="coach-summary">
            <p className="eyebrow">{selectedCoach.name}</p>
            <h2>{selectedCoach.title}</h2>
            <p>{selectedCoach.chessFocus}</p>
            <small>{selectedCoach.voiceStyle}</small>
          </div>
        </section>

        <div className="mode-launch">
          {isPuzzles ? (
            <button className="menu-play" onClick={onPuzzles}>
              Start Puzzles
            </button>
          ) : (
            <button className="menu-play" onClick={onQuickPlay}>
              Quick Play
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
