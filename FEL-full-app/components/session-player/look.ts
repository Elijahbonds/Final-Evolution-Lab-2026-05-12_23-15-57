// components/session-player/look.ts — PLAT-P01 (2026-10-27): every class the session player draws with, in one file.
//
// premium-ui owns the look: the type scale (lib/design/type.ts TYPE / NUM), the kit (components/ui/fel: the player's one
// button is its PrimaryCta) and the tokens (fel-* classes). Every class the player adds on top is here, in one file.
//
// Type: four sizes — TYPE.label 12 (labels), TYPE.body 16 (cue, set-up), TYPE.heading 20 (the name; the CTA's own 20),
// and the dose. THE ONE EXCEPTION, for premium-ui to rule on: the dose is 72 px, above TYPE.display's 44 on a phone,
// because it is the one thing read from two metres away with the phone propped on the floor (the owner check).
// Motion: decorative transitions are motion-safe only; the demo plays either way (it IS the instruction).
import { NUM, TYPE } from '@/lib/design/type';

export const LOOK = {
  shell: 'fixed inset-0 z-[70] flex flex-col bg-fel-bg text-fel-text',
  // the demo fills the top 55%: AvatarDemo's own 4:3 box is stretched to the area (its look is untouched)
  demo: 'relative h-[55dvh] min-h-[220px] w-full shrink-0 overflow-hidden bg-[#08080d] [&_[data-avatar-demo]]:h-full [&_[data-avatar-demo]]:!aspect-auto',
  // the demo's "YOUR ATHLETE" label says nothing during a set; the still's "DEMO COMING" stays
  demoQuiet: '[&_[data-avatar-badge]]:hidden',
  // the still's "DEMO COMING" label sits at the demo's foot, clear of the top bar
  demoBadge: '[&_[data-avatar-badge]]:!top-auto [&_[data-avatar-badge]]:bottom-3 [&_[data-avatar-badge]]:left-3',
  topBar: 'absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 pb-6 pt-[max(10px,env(safe-area-inset-top))]',
  iconBtn: 'grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black/45 text-white/90 backdrop-blur-sm motion-safe:transition-transform active:scale-90',
  progressWrap: 'min-w-0 flex-1',
  progressRow: 'flex h-1 gap-1',
  progressSeg: 'h-full flex-1 overflow-hidden rounded-full bg-white/15',
  progressFill: 'block h-full rounded-full bg-fel-cyan motion-safe:transition-[width] motion-safe:duration-300',
  label: `${TYPE.label} text-fel-soft`,
  body: 'flex min-h-0 flex-1 flex-col px-5 pt-4',
  name: `${TYPE.heading} text-white`,
  doseRow: 'mt-1 flex items-baseline gap-3',
  dose: `${NUM} text-[72px] leading-[0.95] text-white`,
  doseRest: `${NUM} text-[72px] leading-[0.95] text-fel-cyan`,
  doseSmall: `${TYPE.body} font-semibold text-fel-soft`,
  pips: 'mt-3 flex gap-1.5',
  pip: 'h-1.5 w-6 rounded-full',
  cue: `mt-3 ${TYPE.body} text-fel-soft`,
  bottom: 'mt-auto px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-3',
  /** the kit's PrimaryCta, stretched to the column (it sizes itself to its words) */
  cta: '[&>[data-fel-primary]]:w-full',
  // the one quiet button (End, in the end-the-session question): the kit CTA's shape, outlined
  buttonQuiet: 'fel-press inline-flex min-h-14 w-full items-center justify-center rounded-full border border-white/25 px-8 font-display text-[20px] font-extrabold uppercase leading-none tracking-[0.04em] text-white',
  setupBtn: 'grid h-11 w-11 shrink-0 place-items-center rounded-full text-fel-soft motion-safe:transition-transform active:scale-90',
  sheet: 'absolute inset-x-0 bottom-0 z-20 max-h-[70%] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-fel-surface-2/95 px-5 pb-6 pt-4 shadow-[0_-12px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl motion-safe:animate-[felSheetUp_220ms_cubic-bezier(0.16,0.8,0.3,1)]',
  sheetText: `mt-2 ${TYPE.body} text-fel-soft`,
  pausedVeil: 'pointer-events-none absolute inset-0 z-[5] grid place-items-center bg-black/55',
  finish: 'flex flex-1 flex-col items-center justify-center px-6 text-center',
  finishTitle: `mt-4 ${NUM} text-[72px] uppercase leading-none text-white`,
  stat: `${NUM} ${TYPE.heading} text-white`,
  finishLine: `mt-6 max-w-[22rem] ${TYPE.body} text-fel-soft`,
} as const;

/** The sheet's rise, motion-safe (the keyframes ship with the component, so no global stylesheet changes). */
export const SHEET_KEYFRAMES = '@keyframes felSheetUp{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}';
