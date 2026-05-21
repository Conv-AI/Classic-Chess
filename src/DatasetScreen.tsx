import { useEffect, useState, useMemo } from 'react';
import { Chess } from 'chess.js';
import { getCoach, getDifficulty, type CoachId, type DifficultyId } from './coachConfig';
import { ChessBoard } from './App';

export type DatasetEntry = {
  timestamp: string;
  coachId: CoachId;
  coachName: string;
  difficultyId: DifficultyId;
  fen: string;
  dynamicInfo: string;
  prompt?: string;
  coachResponse: string;
  wasSilent: boolean;
};

type Props = {
  onBack: () => void;
};

export default function DatasetScreen({ onBack }: Props) {
  const [entries, setEntries] = useState<DatasetEntry[]>([]);
  const [selectedTimestamp, setSelectedTimestamp] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((c) => (c === msg ? '' : c));
    }, 3000);
  }

  async function fetchDataset() {
    try {
      setLoading(true);
      const res = await fetch('/api/dataset');
      if (res.ok) {
        const data = await res.json();
        setEntries(data);
        if (data.length > 0 && !selectedTimestamp) {
          setSelectedTimestamp(data[data.length - 1].timestamp); // default to most recent
        }
      } else {
        setError('Failed to fetch dataset.');
      }
    } catch {
      setError('Error connecting to dataset API.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchDataset();
  }, []);

  const selected = useMemo(() => {
    return entries.find((e) => e.timestamp === selectedTimestamp) || entries[entries.length - 1];
  }, [entries, selectedTimestamp]);

  useEffect(() => {
    if (selected && selected.timestamp !== selectedTimestamp) {
      setSelectedTimestamp(selected.timestamp);
    }
  }, [selected, selectedTimestamp]);

  const game = useMemo(() => {
    try {
      return new Chess(selected?.fen || undefined);
    } catch {
      return new Chess();
    }
  }, [selected?.fen]);

  async function handleDelete(timestamp: string) {
    if (!confirm('Are you sure you want to delete this dataset entry?')) return;
    try {
      const res = await fetch('/api/dataset', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp }),
      });
      if (res.ok) {
        const result = await res.json();
        showToast('Entry deleted successfully.');
        setEntries((prev) => prev.filter((e) => e.timestamp !== timestamp));
        if (selectedTimestamp === timestamp) {
          setSelectedTimestamp('');
        }
      } else {
        showToast('Failed to delete entry.');
      }
    } catch {
      showToast('Error deleting entry.');
    }
  }

  async function handleClearAll() {
    if (!confirm('WARNING: Are you sure you want to clear the ENTIRE dataset? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/dataset', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearAll: true }),
      });
      if (res.ok) {
        setEntries([]);
        setSelectedTimestamp('');
        showToast('Dataset cleared successfully.');
      } else {
        showToast('Failed to clear dataset.');
      }
    } catch {
      showToast('Error clearing dataset.');
    }
  }

  return (
    <main className="game-screen">
      <header className="topbar">
        <button onClick={onBack}>Menu</button>
        <h1>Dialogue Dataset</h1>
        <div className="topbar-actions">
          <span>{entries.length} Exchange{entries.length !== 1 ? 's' : ''}</span>
        </div>
      </header>

      <div className="games-layout">
        <section className="panel-card games-list">
          <p className="eyebrow">Logged dialogue</p>
          {loading && <p style={{ color: 'var(--muted)' }}>Loading dataset...</p>}
          {error && <p style={{ color: '#ffd7d7' }}>{error}</p>}
          {!loading && !error && entries.length === 0 && (
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', lineHeight: '1.4' }}>
              No logged dialogue exchanges yet. Start a Quick Play game, let the coach update, and press the ➕ icon to log exchanges!
            </p>
          )}

          <div className="dataset-scrollable invisible-scroll" style={{ display: 'grid', gap: '0.5rem', maxHeight: 'calc(100vh - 16rem)', overflowY: 'auto' }}>
            {entries.map((entry) => {
              const coach = getCoach(entry.coachId);
              const difficulty = getDifficulty(entry.difficultyId);
              const dateStr = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              return (
                <button
                  key={entry.timestamp}
                  className={`dataset-option-btn ${entry.timestamp === selected?.timestamp ? 'selected-option' : ''}`}
                  onClick={() => setSelectedTimestamp(entry.timestamp)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    textAlign: 'left',
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    border: '1px solid rgba(244, 234, 216, 0.12)',
                    borderRadius: '10px',
                    background: entry.timestamp === selected?.timestamp ? 'rgba(216, 167, 79, 0.15)' : 'rgba(244, 234, 216, 0.04)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                    <strong style={{ color: 'var(--cream)', fontSize: '0.85rem' }}>{coach.name} ({difficulty.label})</strong>
                    <small style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>{dateStr}</small>
                  </div>
                  <span
                    style={{
                      color: entry.wasSilent ? 'var(--muted)' : 'var(--gold)',
                      fontSize: '0.75rem',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      width: '100%',
                      marginTop: '4px',
                    }}
                  >
                    {entry.wasSilent ? '🔇 Silent' : `🔊 "${entry.coachResponse}"`}
                  </span>
                </button>
              );
            })}
          </div>

          {entries.length > 0 && (
            <button className="ghost-action danger-action" onClick={handleClearAll} style={{ marginTop: 'auto' }}>
              Clear Entire Dataset
            </button>
          )}
        </section>

        {selected ? (
          <div className="replay-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 480px) minmax(260px, 480px)', gap: '1.5rem', alignItems: 'start' }}>
            <div style={{ display: 'grid', justifyItems: 'center' }}>
              <ChessBoard game={game} />
            </div>

            <aside className="panel-card replay-panel dataset-details-panel" style={{ display: 'grid', gap: '0.9rem', padding: '1.25rem' }}>
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>Dialogue Evaluation</p>
                <h2 style={{ fontSize: '1.35rem', color: 'var(--cream)', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {selected.coachName}
                  <span
                    className={`dataset-badge ${selected.wasSilent ? 'badge-silent' : 'badge-speaking'}`}
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.25rem 0.55rem',
                      borderRadius: '6px',
                      fontWeight: 800,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      backgroundColor: selected.wasSilent ? 'rgba(216, 167, 79, 0.16)' : 'rgba(76, 175, 80, 0.16)',
                      border: selected.wasSilent ? '1px solid rgba(216, 167, 79, 0.4)' : '1px solid rgba(76, 175, 80, 0.4)',
                      color: selected.wasSilent ? 'var(--gold)' : '#81c784',
                    }}
                  >
                    {selected.wasSilent ? 'Abstained (Silent)' : 'Spoke'}
                  </span>
                </h2>
                <small style={{ color: 'var(--muted)' }}>
                  Logged at {new Date(selected.timestamp).toLocaleString()} · FEN: {selected.fen.slice(0, 30)}...
                </small>
              </div>

              {selected.prompt && (
                <div style={{ display: 'grid', gap: '4px' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--gold)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>User Prompt</span>
                  <div style={{ background: 'rgba(25, 23, 19, 0.5)', border: '1px solid rgba(244, 234, 216, 0.08)', borderRadius: '8px', padding: '0.65rem', fontSize: '0.8rem', color: 'var(--cream)', maxHeight: '90px', overflowY: 'auto', fontFamily: 'sans-serif' }}>
                    {selected.prompt}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gap: '4px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--gold)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dynamic Config Context (LLM Input)</span>
                <div
                  className="invisible-scroll"
                  style={{
                    background: 'rgba(25, 23, 19, 0.5)',
                    border: '1px solid rgba(244, 234, 216, 0.08)',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    fontSize: '0.8rem',
                    color: 'var(--muted)',
                    maxHeight: '160px',
                    overflowY: 'auto',
                    fontFamily: 'monospace',
                    lineHeight: '1.4',
                  }}
                >
                  {selected.dynamicInfo}
                </div>
              </div>

              <div style={{ display: 'grid', gap: '4px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--gold)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Coach Speech Output</span>
                <div style={{ background: 'rgba(216, 167, 79, 0.05)', border: '1px solid rgba(216, 167, 79, 0.15)', borderRadius: '8px', padding: '0.75rem', fontSize: '0.85rem', color: 'var(--cream)', minHeight: '60px', maxHeight: '110px', overflowY: 'auto', fontStyle: selected.wasSilent ? 'italic' : 'normal', lineHeight: '1.4' }}>
                  {selected.wasSilent ? 'No response. The coach chose to remain silent based on the chess position.' : selected.coachResponse}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '4px' }}>
                <button
                  className="ghost-action danger-action"
                  onClick={() => handleDelete(selected.timestamp)}
                  style={{ width: '100%', margin: 0, padding: '0.65rem' }}
                >
                  Delete This Entry
                </button>
              </div>
            </aside>
          </div>
        ) : (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted)' }}>
            Select a dialogue exchange on the left to analyze its context and chess position.
          </div>
        )}
      </div>

      {toastMessage && (
        <div className="toast-notification">
          <span>{toastMessage}</span>
        </div>
      )}
    </main>
  );
}
