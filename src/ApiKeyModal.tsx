import { useState } from 'react';
import { createPortal } from 'react-dom';
import { setStoredConvaiApiKey } from './convaiApiKey';

type Props = {
  open: boolean;
  onSaved: () => void;
  onDismiss?: () => void;
  required?: boolean;
};

export default function ApiKeyModal({ open, onSaved, onDismiss, required = false }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  if (!open) return null;

  function save() {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Paste your Convai API key to continue.');
      return;
    }
    setStoredConvaiApiKey(trimmed);
    setError('');
    onSaved();
  }

  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="api-key-title">
      <div className="gameover-modal api-key-modal">
        <div className="gameover-result" id="api-key-title">Convai API key required</div>
        <p className="gameover-status">
          Get a free key from Convai, then paste it here. It is stored locally in your browser.
        </p>
        <ol className="api-key-steps">
          <li>Sign in at <a href="https://convai.com" target="_blank" rel="noreferrer">convai.com</a></li>
          <li>Open your profile → API Keys → create or copy a key</li>
          <li>Paste the key below and save</li>
        </ol>
        <label className="api-key-field">
          <span>API key</span>
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Paste Convai API key"
            autoComplete="off"
          />
        </label>
        {error && <p className="warning-text">{error}</p>}
        <div className="gameover-actions">
          {!required && onDismiss && (
            <button type="button" className="ghost-action" onClick={onDismiss}>Later</button>
          )}
          <button type="button" className="primary-action" onClick={save}>Save key</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
