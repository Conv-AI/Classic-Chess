import { useState } from 'react';
import { COACHES, DIFFICULTIES, suggestedDifficultyForCoach, type CoachId, type DifficultyId } from './coachConfig';
import { PUZZLES } from './puzzles';
import type { CoachingControlMode } from './storage';

type Mode = 'quickplay' | 'puzzles';

const PUZZLE_DIFFICULTY_LABELS: Record<string, string> = {
  new: 'Mate in 1, free pieces',
  beginner: 'Forks, pins, skewers',
  intermediate: 'Multi-step tactics',
  advanced: 'Defense & endgames',
  expert: 'Strategic & prophylaxis',
};

const COACHING_CONTROL_TOOLTIP =
  'Choose who decides when the coach speaks during Quick Play. ' +
  '"Game" means the game logic inspects every move and only triggers the coach when there is a teaching point. ' +
  '"Coach" lets Convai\'s LLM see the full context every turn and decide whether to chime in on its own.';

const COACHING_CONTROL_OPTIONS: Array<{ value: CoachingControlMode; label: string; description: string }> = [
  {
    value: 'game',
    label: 'Game',
    description: 'Game logic picks the teaching moments.',
  },
  {
    value: 'coach',
    label: 'Coach',
    description: 'Convai decides when to speak.',
  },
];

type Props = {
  coachId: CoachId;
  difficultyId: DifficultyId;
  savedGameCount: number;
  coachingControlMode: CoachingControlMode;
  onCoachChange: (coachId: CoachId) => void;
  onDifficultyChange: (difficultyId: DifficultyId) => void;
  onCoachingControlModeChange: (mode: CoachingControlMode) => void;
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
  coachingControlMode,
  onCoachChange,
  onDifficultyChange,
  onCoachingControlModeChange,
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
              <strong>View logged dialogue cases &amp; AI speaking behaviors</strong>
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

          <div className="coach-summary-stack">
            <div className="coach-summary">
              <p className="eyebrow">{selectedCoach.name}</p>
              <h2>{selectedCoach.title}</h2>
              <p>{selectedCoach.chessFocus}</p>
              <small>{selectedCoach.voiceStyle}</small>
            </div>

            <div
              className="coaching-control-card"
              role="group"
              aria-labelledby="coaching-control-heading"
            >
              <div className="coaching-control-header">
                <p
                  className="eyebrow coaching-control-heading"
                  id="coaching-control-heading"
                >
                  Coaching Control
                </p>
                <span
                  className="coaching-control-info"
                  role="img"
                  aria-label="About coaching control"
                  data-tooltip={COACHING_CONTROL_TOOLTIP}
                  tabIndex={0}
                >
                  ?
                </span>
              </div>
              <p className="coaching-control-sub">
                {COACHING_CONTROL_OPTIONS.find((opt) => opt.value === coachingControlMode)?.description}
              </p>
              <div
                className="coaching-control-toggle"
                role="radiogroup"
                aria-label="Coaching control mode"
              >
                {COACHING_CONTROL_OPTIONS.map((option) => {
                  const isSelected = option.value === coachingControlMode;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      className={`coaching-control-option${isSelected ? ' is-selected' : ''}`}
                      data-tooltip={option.description}
                      onClick={() => onCoachingControlModeChange(option.value)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
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
