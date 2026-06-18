import { useEffect, useState } from 'react';
import { chessConvai } from './convaiManager';
import Tooltip from './Tooltip';
import { playUiSound, unlockUiAudio } from './uiSounds';

type Props = {
  className?: string;
};

export default function MicButton({ className }: Props) {
  const [micOn, setMicOn] = useState(false);

  useEffect(() => {
    return chessConvai.onStatus((s) => setMicOn(s.micEnabled));
  }, []);

  function toggle() {
    unlockUiAudio();
    playUiSound('toggle');
    void chessConvai.setMicEnabled(!micOn);
  }

  return (
    <Tooltip text={micOn ? 'Mute microphone' : 'Enable microphone'} placement="top">
      <button
        type="button"
        className={`mic-button ${micOn ? 'mic-on' : ''} ${className ?? ''}`}
        onClick={toggle}
        aria-label={micOn ? 'Mute microphone' : 'Enable microphone'}
      >
        {micOn ? '🎙' : '🎤'}
      </button>
    </Tooltip>
  );
}
