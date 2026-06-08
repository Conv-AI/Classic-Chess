import type { ReactNode } from 'react';

type Props = {
  coachName: string;
  open: boolean;
  onClose: () => void;
  chatInput: string;
  onChatInputChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  mic?: ReactNode;
};

export default function ChatDrawer({
  coachName,
  open,
  onClose,
  chatInput,
  onChatInputChange,
  onSend,
  placeholder = 'Ask about the current position...',
  mic,
}: Props) {
  if (!open) return null;

  return (
    <section className="chat-drawer chat-drawer-corner" aria-label={`Chat with ${coachName}`}>
      <div className="chat-drawer-header">
        <strong>Ask {coachName}</strong>
        <div className="chat-drawer-actions">
          {mic}
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </div>
      <textarea
        value={chatInput}
        onChange={(event) => onChatInputChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
        placeholder={placeholder}
      />
      <button type="button" className="primary-action" onClick={onSend}>Send</button>
    </section>
  );
}
