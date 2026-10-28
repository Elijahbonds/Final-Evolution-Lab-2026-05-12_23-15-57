// SetupCard — the shared self-guiding setup card (TOOLS-EASY, 2026-10-28): a picture of where the phone goes and ONE big
// word — the fix in amber ("Step back", "Whole body in view") or "Ready" in green with a tick — and, under it, the one
// sentence that says how. VERTICAL-EASY drew it inside the Quick Screen's HUD (app/play/mirror/assess/_components/
// live-hud.tsx); this is the same card, same look and same words (lib/vertical/copy.ts), for every other camera tool:
// the readiness check, the combine jump station, bar speed and form review.
//
// Readable from across the room: the word is 28–40 px. The state is never colour alone (the tick, and the word itself).
// The pictures are decorative (aria-hidden): the words beside them say the same thing.
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { HandsOnHips, SetupPicture } from '@/components/vertical/setup-picture';
import { SETUP_EYEBROW } from '@/lib/vertical/copy';

export type SetupPictureKind = 'front' | 'side' | 'hips';

/** Side-on: a phone leaning on a bottle, a person side-on two or three steps away, the whole body in the view. */
export function SideSetup({ className = 'h-20 w-auto' }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 80" className={className} aria-hidden data-side-setup-picture fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 74 H156" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      <rect x="14" y="44" width="9" height="30" rx="3" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
      <rect x="22" y="36" width="8" height="15" rx="1.8" transform="rotate(8 26 43)" stroke="#00E5FF" strokeWidth="2" />
      <path d="M30 42 L132 8 M30 44 L132 76" stroke="#00E5FF" strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="3 3" />
      {/* side-on: one shoulder to the camera, the arms forward (a bar or a dumbbell) */}
      <circle cx="116" cy="20" r="5" stroke="#fff" strokeWidth="2" />
      <path d="M115 26 L114 48 M114 48 L112 73 M114 48 L118 73 M115 31 L126 38 M106 38 H134" stroke="#fff" strokeWidth="2" />
      <path d="M36 78 H104" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
      <path d="M36 76 V80 M104 76 V80" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
    </svg>
  );
}

function Picture({ kind }: { kind: SetupPictureKind }) {
  if (kind === 'side') return <SideSetup className="h-16 w-auto shrink-0" />;
  if (kind === 'hips') return <HandsOnHips className="h-14 w-auto shrink-0" />;
  return <SetupPicture className="h-16 w-auto shrink-0" />;
}

export function SetupCard({ word, ready, line, picture = 'front', className = 'absolute inset-x-3 bottom-3 z-[6]', children }: {
  word: string; ready: boolean; line?: string | null; picture?: SetupPictureKind | null; className?: string; children?: ReactNode;
}) {
  return (
    <div data-setup-card={ready ? 'ready' : 'fix'} className={`${className} rounded-2xl border border-white/15 bg-black/75 p-3 text-center backdrop-blur`}>
      <p className="text-[16px] font-bold uppercase tracking-[0.14em] text-white/55">{SETUP_EYEBROW}</p>
      <p data-setup-word className={`mt-1 flex items-center justify-center gap-2 text-[clamp(28px,8vw,40px)] font-black leading-none ${ready ? 'text-[#00FF9D]' : 'text-[#FFB020]'}`}>
        {ready ? <Check aria-hidden className="h-8 w-8" strokeWidth={3} /> : null}{word}
      </p>
      {line || picture ? (
        <div className="mt-2 flex items-center gap-3 text-left">
          {picture ? <Picture kind={picture} /> : null}
          {line ? <p data-setup-line className="text-[16px] leading-snug text-white/85">{line}</p> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** A refused rep or jump: its reason and its fix, big, in the place the setup card was (amber, never colour alone). */
export function RefusalCard({ line, className = 'absolute inset-x-3 bottom-3 z-[6]' }: { line: string; className?: string }) {
  return (
    <div data-take-refusal role="status" className={`${className} rounded-2xl border border-[#FFB020]/50 bg-black/80 px-4 py-3 text-center`}>
      <p className="text-[clamp(18px,5vw,24px)] font-bold leading-snug text-[#FFB020]">{line}</p>
    </div>
  );
}
