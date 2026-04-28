type Props = {
  progress: number;
  step: string;
};

const PIECES = ['♙', '♘', '♗', '♖', '♕'];
const LINES = [
  'Polishing the bishops. They insisted.',
  'Teaching the knights to stop jumping to conclusions.',
  'Asking the queen to keep it reasonable. She declined.',
  'Convincing the pawns this is their big character arc.',
  'Waking Danielle before the rooks start arguing.',
];

export default function LoadingScreen({ progress, step }: Props) {
  const line = LINES[Math.floor(Date.now() / 3500) % LINES.length];

  return (
    <div className="loading-screen">
      <div className="loading-pieces" aria-hidden="true">
        {PIECES.map((piece, index) => (
          <span key={piece} style={{ animationDelay: `${index * 120}ms` }}>
            {piece}
          </span>
        ))}
      </div>
      <h1>Classic Chess</h1>
      <p>{step}</p>
      <div className="loading-track">
        <div className="loading-fill" style={{ width: `${progress}%` }} />
      </div>
      <small>{line}</small>
    </div>
  );
}
