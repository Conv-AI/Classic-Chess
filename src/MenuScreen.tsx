type Props = {
  onPlay: () => void;
};

export default function MenuScreen({ onPlay }: Props) {
  return (
    <main className="menu-screen">
      <div className="menu-orbit" aria-hidden="true">
        <span>♔</span>
        <span>♞</span>
        <span>♜</span>
        <span>♛</span>
      </div>
      <section className="menu-panel">
        <p className="eyebrow">Danielle's Training Board</p>
        <h1>Classic Chess</h1>
        <p>
          Sit across from Danielle for a calm chess lesson: make your move, hear her thoughts, and learn why the board is quietly judging everyone.
        </p>
        <button className="menu-play" onClick={onPlay}>
          Start Lesson
        </button>
      </section>
    </main>
  );
}
