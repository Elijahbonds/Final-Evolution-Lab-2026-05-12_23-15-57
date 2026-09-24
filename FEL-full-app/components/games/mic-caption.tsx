'use client';
// THE MIC on screen (2026-09-24): the lower third for what the court's MC (or the sidekick, or a player) just said, and the
// switch for the voice. The mode sets `mic` / `micWho` through ModeMic; the words show whether or not the voice plays (muted,
// no audio, a bank that never arrived), and the harness's caption bus reads `mic` out to screen readers.
import { useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { SoundKit } from '@/lib/babylon/audio/SoundKit';
import { VoiceKit } from '@/lib/babylon/audio/mic/VoiceKit';

export function MicCaption({ text, who, className = 'bottom-[14%]' }: { text: unknown; who: unknown; className?: string }) {
  const line = typeof text === 'string' ? text : '';
  if (!line) return null;
  const name = typeof who === 'string' ? who : '';
  return (
    <div className={`pointer-events-none absolute inset-x-0 ${className} z-10 flex justify-center px-4`} aria-hidden>
      <div className="max-w-[min(92vw,560px)] rounded-lg bg-black/60 px-3 py-1.5 text-center shadow-lg">
        {name && <span className="mr-2 align-middle font-mono text-[10px] font-bold tracking-[0.18em] text-[var(--fel-cyan)]">{name}</span>}
        <span className="fel-heading align-middle text-[13px] font-black uppercase italic leading-tight text-[#ffd75e] md:text-[15px]">{line}</span>
      </div>
    </div>
  );
}

/** The MC's voice on or off (kept across sessions). Off stops what is playing; the captions stay. */
export function MicToggle({ className = 'right-3 top-[18%]' }: { className?: string }) {
  const [on, setOn] = useState(() => SoundKit.voiceOn);
  const flip = () => {
    const next = !on;
    SoundKit.setVoice(next); setOn(next);
    if (!next) VoiceKit.stopAll(0.1);
  };
  return (
    // a mouse click must not leave focus on the button: Space is SHOOT/JUMP, and a focused button answers its keyup with a click
    <button type="button" onClick={(e) => { flip(); e.currentTarget.blur(); }} onMouseDown={(e) => e.preventDefault()} onPointerDown={(e) => e.stopPropagation()}
      aria-label={on ? 'Turn the announcer off' : 'Turn the announcer on'} aria-pressed={on}
      className={`pointer-events-auto absolute ${className} z-20 flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 font-mono text-[9px] uppercase tracking-widest ${on ? 'text-white/80' : 'text-white/40'}`}>
      {on ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
      MC
    </button>
  );
}
