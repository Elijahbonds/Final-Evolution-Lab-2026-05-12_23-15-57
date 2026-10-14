'use client';
// THE MIC on screen (2026-09-24): the lower third for what the court's MC (or the sidekick, or a player) just said, and the
// switch for the voice. The mode sets `mic` / `micWho` through ModeMic; the words show whether or not the voice plays (muted,
// no audio, a bank that never arrived), and the harness's caption bus reads `mic` out to screen readers.
import { useState } from 'react';
import { Mic, MicOff, SlidersHorizontal } from 'lucide-react';
import { SoundKit } from '@/lib/babylon/audio/SoundKit';
import { VoiceKit } from '@/lib/babylon/audio/mic/VoiceKit';
import { VolumeMixer } from '@/lib/audio/ui/VolumeMixer';
import { HUD_FONT_CLASS, HUD_PLATE, HudText, hudColor, hudType } from './tv-hud';

export function MicCaption({ text, who, className = 'bottom-[14%]', flow = false }: { text: unknown; who: unknown; className?: string; /** In the flow of a parent column (the dunk host's bottom stack) instead of a layer of its own at `className`. */ flow?: boolean }) {
  const line = typeof text === 'string' ? text : '';
  if (!line) return null;
  const name = typeof who === 'string' ? who : '';
  return (
    <div data-mic-caption className={`pointer-events-none ${flow ? 'relative flex w-full' : `absolute inset-x-0 ${className}`} z-10 flex justify-center px-4 ${HUD_FONT_CLASS}`} aria-hidden>
      {/* data-mic-line: on a sideways screen the line may run wider (app/game-surface.css, console view) — at 560 px it
          wrapped to two lines and, zoomed for a TV, the box sat across the dunker's legs */}
      <div data-mic-line className="max-w-[min(92vw,560px)] px-3 py-1.5 text-center"
        style={{ background: HUD_PLATE.background, border: HUD_PLATE.border, borderRadius: HUD_PLATE.radius, boxShadow: HUD_PLATE.shadow }}>
        {name && <HudText size="caption" tone="you" className="mr-2 align-middle uppercase tracking-[0.18em]" style={{ fontWeight: 800 }}>{name}</HudText>}
        <HudText size="value" tone="score" className="align-middle uppercase italic" style={{ fontWeight: 800 }}>{line}</HudText>
      </div>
    </div>
  );
}

/** The MC's voice on or off (kept across sessions). Off stops what is playing; the captions stay.
 *  VOICEOVER (2026-10-06): and a MIX button beside it: the voice level and the output (phone speaker / TV / headphones), the
 *  same controls the dance room and the Academy show (lib/audio/ui/VolumeMixer.tsx), so a hoops player can find them mid-game. */
export function MicToggle({ className = 'right-3 top-[18%]', flow = false }: { className?: string; flow?: boolean }) {
  const [on, setOn] = useState(() => SoundKit.voiceOn);
  const [mix, setMix] = useState(false);
  const flip = () => {
    const next = !on;
    SoundKit.setVoice(next); setOn(next);
    if (!next) VoiceKit.stopAll(0.1);
  };
  const chip = 'pointer-events-auto flex items-center gap-1 rounded-full px-2 py-1 uppercase tracking-widest';
  const chipStyle = (alpha: number) => ({ ...hudType('caption'), background: 'rgba(0, 0, 0, 0.5)', color: hudColor('text', alpha) });
  return (
    // `flow`: in the flow of a parent column (the dunk host's right-hand stack) instead of a corner of its own
    <div className={`pointer-events-none ${flow ? 'relative' : `absolute ${className}`} z-20 flex flex-col items-end gap-1 ${HUD_FONT_CLASS}`}>
      <div className="flex items-center gap-1">
        {/* a mouse click must not leave focus on the button: Space is SHOOT/JUMP, and a focused button answers its keyup with a click */}
        <button type="button" onClick={(e) => { setMix((m) => !m); e.currentTarget.blur(); }} onMouseDown={(e) => e.preventDefault()} onPointerDown={(e) => e.stopPropagation()}
          aria-label={mix ? 'Close the sound mix' : 'Open the sound mix'} aria-expanded={mix} data-qa="mic-mix"
          className={chip} style={chipStyle(mix ? 0.9 : 0.6)}>
          <SlidersHorizontal className="h-3 w-3" />
          MIX
        </button>
        <button type="button" onClick={(e) => { flip(); e.currentTarget.blur(); }} onMouseDown={(e) => e.preventDefault()} onPointerDown={(e) => e.stopPropagation()}
          aria-label={on ? 'Turn the announcer off' : 'Turn the announcer on'} aria-pressed={on}
          className={chip} style={chipStyle(on ? 0.8 : 0.4)}>
          {on ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
          MC
        </button>
      </div>
      {mix && (
        // a slider keeps focus after a drag, and the arrow keys would then move it instead of the player: hand focus back on release
        <div className="pointer-events-auto rounded-lg bg-black/75 px-3 py-2 shadow-lg" style={{ width: 240 }}
          onPointerDown={(e) => e.stopPropagation()} onPointerUp={() => { const a = document.activeElement; if (a instanceof HTMLElement) a.blur(); }}>
          <VolumeMixer buses={['voice', 'sfx']} />
        </div>
      )}
    </div>
  );
}
