import { useState, type ReactNode } from 'react';
import { KeyRound } from 'lucide-react';
import { getAllCoaches, DIFFICULTIES, suggestedDifficultyForCoach, getCoachPortraitThumbUrl, type CoachId, type DifficultyId } from './coachConfig';
import { maskConvaiApiKey, getConvaiApiKey } from './convaiApiKey';
import { PUZZLES } from './puzzles';
import type { CoachingControlMode } from './storage';
import Tooltip from './Tooltip';
import { playUiSound, unlockUiAudio } from './uiSounds';

type Mode = 'quickplay' | 'puzzles';

const PUZZLE_DIFFICULTY_LABELS: Record<string, string> = {
  new: 'Mate in 1, free pieces',
  beginner: 'Forks, pins, skewers',
  intermediate: 'Multi-step tactics',
  advanced: 'Defense & endgames',
  expert: 'Strategic & prophylaxis',
};

const COACHING_CONTROL_TOOLTIP =
  'Coach mode — she sees the board every turn and decides when to comment. Game mode — she only speaks on teaching moments (tactics, captures, king safety).';

const COACHING_CONTROL_OPTIONS: Array<{ value: CoachingControlMode; label: string; description: string; tooltip: string }> = [
  {
    value: 'coach',
    label: 'Coach',
    description: 'Leila decides when to speak.',
    tooltip: 'Full board context every turn; she chooses when to comment.',
  },
  {
    value: 'game',
    label: 'Game',
    description: 'App picks teaching moments.',
    tooltip: 'She only speaks when captures, tactics, or king-safety heuristics fire.',
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
  onManageApiKey?: () => void;
  authSlot?: ReactNode;
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
  onManageApiKey,
  authSlot,
}: Props) {
  const [selectedMode, setSelectedMode] = useState<Mode>('quickplay');
  const coaches = getAllCoaches();
  const selectedCoach = coaches.find((coach) => coach.id === coachId) ?? coaches[0];
  const maskedKey = maskConvaiApiKey(getConvaiApiKey());

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
          <div className="menu-heading-row">
            <p className="eyebrow">Convai Chess Coaches</p>
            {authSlot && <div className="menu-auth-slot">{authSlot}</div>}
          </div>
          <h1>Classic Chess</h1>
          <p>Choose a coach, set your level, then play a full game, tackle puzzles, review your sessions, or build your own coach.</p>
          <Tooltip
            wide
            text={maskedKey ? 'Click to update your Convai API key' : 'Add your Convai API key to enable coaching'}
          >
            <button
              type="button"
              className="api-key-badge"
              onClick={() => {
                unlockUiAudio();
                playUiSound('tap');
                onManageApiKey?.();
              }}
            >
              <KeyRound size={14} aria-hidden="true" />
              <span>{maskedKey || 'Add API key'}</span>
            </button>
          </Tooltip>
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
              {coaches.map((coach) => (
                <button
                  key={coach.id}
                  className={coach.id === coachId ? 'selected-option' : ''}
                  onClick={() => {
                    onCoachChange(coach.id);
                    onDifficultyChange(suggestedDifficultyForCoach(coach, DIFFICULTIES.find((item) => item.id === difficultyId) ?? DIFFICULTIES[0]).id);
                  }}
                  style={{ borderColor: coach.id === coachId ? coach.accent : undefined }}
                >
                  <span className="coach-picker-avatar-wrap" aria-hidden="true">
                    <img
                      className="coach-picker-avatar"
                      src={getCoachPortraitThumbUrl(coach)}
                      alt=""
                      width={192}
                      height={192}
                      decoding="async"
                      draggable={false}
                      style={{ objectPosition: `center ${coach.portraitFocusY ?? 14}%` }}
                    />
                  </span>
                  <span className="coach-picker-label">
                    <span>{coach.name}</span>
                    <small>{coach.title}</small>
                  </span>
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
                <Tooltip text={COACHING_CONTROL_TOOLTIP} wide placement="left">
                  <span
                    className="coaching-control-info"
                    role="img"
                    aria-label="About coaching control"
                    tabIndex={0}
                  >
                    ?
                  </span>
                </Tooltip>
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
                    <Tooltip key={option.value} text={option.tooltip} placement="top">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        className={`coaching-control-option${isSelected ? ' is-selected' : ''}`}
                        onClick={() => {
                          unlockUiAudio();
                          playUiSound('toggle');
                          onCoachingControlModeChange(option.value);
                        }}
                      >
                        {option.label}
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <div className="mode-launch">
          {isPuzzles ? (
            <button className="menu-play" onClick={() => { unlockUiAudio(); playUiSound('confirm'); onPuzzles(); }}>
              Start Puzzles
            </button>
          ) : (
            <button className="menu-play" onClick={() => { unlockUiAudio(); playUiSound('confirm'); onQuickPlay(); }}>
              Quick Play
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
