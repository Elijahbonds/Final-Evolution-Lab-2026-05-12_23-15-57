// SetupPicture — where the phone goes, as a picture (VERTICAL-EASY, 2026-10-27): a phone leaning on a bottle at about hip
// height, its view reaching a person two or three steps away, head to feet inside it. HandsOnHips — the jump's one rule,
// as a picture. Both decorative (aria-hidden): the words beside them say the same thing. No colour carries meaning alone.
export function SetupPicture({ className = 'h-20 w-auto' }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 80" className={className} aria-hidden data-setup-picture fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* the floor */}
      <path d="M4 74 H156" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      {/* a bottle, the phone leaning on it */}
      <rect x="14" y="44" width="9" height="30" rx="3" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
      <rect x="22" y="36" width="8" height="15" rx="1.8" transform="rotate(8 26 43)" stroke="#00E5FF" strokeWidth="2" />
      {/* the camera's view: dashed, from the phone to past the person's head and feet */}
      <path d="M30 42 L132 8 M30 44 L132 76" stroke="#00E5FF" strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="3 3" />
      {/* the person, whole body inside the view, hands on hips */}
      <circle cx="116" cy="20" r="5" stroke="#fff" strokeWidth="2" />
      <path d="M116 26 V48 M116 48 L111 73 M116 48 L121 73 M116 31 L108 39 L112 46 M116 31 L124 39 L120 46" stroke="#fff" strokeWidth="2" />
      {/* the distance: two or three big steps */}
      <path d="M36 78 H104" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
      <path d="M36 76 V80 M104 76 V80" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
    </svg>
  );
}

export function HandsOnHips({ className = 'h-16 w-auto' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 64" className={className} aria-hidden data-hands-on-hips fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="20" cy="8" r="5" stroke="#fff" strokeWidth="2" />
      <path d="M20 14 V36 M20 36 L15 61 M20 36 L25 61 M20 19 L10 27 L15 35 M20 19 L30 27 L25 35" stroke="#fff" strokeWidth="2.2" />
      <circle cx="15" cy="35" r="2.6" fill="#00E5FF" />
      <circle cx="25" cy="35" r="2.6" fill="#00E5FF" />
    </svg>
  );
}
