// The full Quick Screen's two plain pictures (SCREEN-EASY, 2026-10-28), drawn like VERTICAL-EASY's setup picture
// (components/vertical/setup-picture.tsx): decorative (aria-hidden), the words beside them say the same thing, and no
// colour carries meaning alone.
//
//   HandsUp   — "No pain? Put both hands up": the pain check's answer from across the room.
//   WallSetup — the ankle bend: side-on to the camera, one foot forward, the knee pushed to a wall.

export function HandsUp({ className = 'h-16 w-auto' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 64" className={className} aria-hidden data-hands-up-picture fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="20" cy="16" r="5" stroke="#fff" strokeWidth="2" />
      <path d="M20 22 V42 M20 42 L15 62 M20 42 L25 62 M20 26 L12 13 L12 3 M20 26 L28 13 L28 3" stroke="#fff" strokeWidth="2.2" />
      <circle cx="12" cy="3" r="2.6" fill="#00FF9D" />
      <circle cx="28" cy="3" r="2.6" fill="#00FF9D" />
    </svg>
  );
}

export function WallSetup({ className = 'h-20 w-auto' }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 80" className={className} aria-hidden data-wall-picture fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* the floor and the wall */}
      <path d="M4 74 H92" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      <path d="M82 8 V74" stroke="rgba(255,255,255,0.7)" strokeWidth="4" />
      {/* side-on: back foot behind, front foot forward with the heel down, that knee pushed to the wall */}
      <circle cx="44" cy="12" r="5" stroke="#fff" strokeWidth="2" />
      <path d="M44 18 L46 40 M46 40 L36 56 L28 73 M46 40 L66 52 L66 73 M44 22 L54 32 M44 22 L50 34" stroke="#fff" strokeWidth="2.2" />
      <path d="M62 73 H74" stroke="#fff" strokeWidth="2.2" />
      <circle cx="78" cy="52" r="2.8" fill="#00E5FF" />
      <path d="M66 52 L76 52" stroke="#00E5FF" strokeWidth="1.4" strokeDasharray="2 2" />
    </svg>
  );
}
