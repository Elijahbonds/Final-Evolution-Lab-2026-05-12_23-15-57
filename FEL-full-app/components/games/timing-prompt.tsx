// TimingPrompt — ONE prompt line for the timing host (QA P1-12, 2026-09-27).
//
// The timing host (tennis, volleyball, derby, shootout, golf, dance) drew each prompt at its own fixed offset from the
// bottom: the graded shot at bottom-24, the incoming tell and the contact grade at bottom-36, the rhythm cue at
// bottom-24 — and the swing / kick / golf meter at bottom-28 is ~50 px tall. In a volleyball rally the meter, the shot and
// the SPIKE tell were all up at once and overlapped. The prompts share one slot now, under the meters: the most urgent
// one shows, never a stack. Pure pick + a small view.
import type { HudValue } from '@/lib/babylon';

type Hud = Record<string, HudValue>;
export interface Prompt { kind: 'tell' | 'contact' | 'shot' | 'step'; text: string; gold: boolean }

const str = (v: HudValue | undefined): string => (typeof v === 'string' ? v : '');

/** The one line to show: the incoming tell (read it now), then the contact grade, the graded shot, the rhythm cue. */
export function pickPrompt(hud: Hud): Prompt | null {
  const tell = str(hud.incomingTell);
  if (tell) return { kind: 'tell', text: `INCOMING · ${tell}${str(hud.answer) ? ` · answer ${str(hud.answer)}` : ''}`, gold: false };
  if (str(hud.contact)) return { kind: 'contact', text: str(hud.contact), gold: true };
  if (str(hud.shotType)) return { kind: 'shot', text: str(hud.shotType), gold: false };
  const step = str(hud.nextStep);
  if (step) {
    const inSec = typeof hud.nextStepIn === 'number' ? hud.nextStepIn : null;
    const now = inSec !== null && inSec <= 0.35;
    return { kind: 'step', text: `${now ? 'NOW — ' : ''}${step}${inSec !== null && !now ? ` · ${inSec.toFixed(1)}` : ''}`, gold: now };
  }
  return null;
}

export function TimingPrompt({ hud }: { hud: Hud }) {
  const p = pickPrompt(hud);
  if (!p) return null;
  return (
    <div data-prompt={p.kind} className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center px-4 text-center">
      <span className={`fel-panel px-4 py-1.5 font-mono text-[12px] font-bold ${p.gold ? 'border-[var(--fel-gold)]/60 text-[var(--fel-gold)]' : 'text-white/85'}`}>{p.text}</span>
    </div>
  );
}
