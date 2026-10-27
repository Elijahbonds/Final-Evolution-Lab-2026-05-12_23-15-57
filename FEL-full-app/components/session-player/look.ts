// components/session-player/look.ts — PLAT-P01 (2026-10-27): every class the session player draws with, in one file.
//
// premium-ui owns the look (tokens, the components/ui/fel kit). Its kit is not on lane/finish-release yet, so the player
// uses the tokens that are (--fel-* through Tailwind's fel-* classes, app/theme.css) and keeps them here: when the kit
// lands, the swap is this one file. TODO(premium-ui): swap BUTTON for the kit's primary button and .fel-press.
//
// Type: four sizes — 10 px labels (the demo's own badge size), 16 px cue and button, 20 px name, 72 px the dose.
// Motion: decorative transitions are motion-safe only; the demo plays either way (it IS the instruction).

export const ACCENT = '#00FF9D';   // the Train tab's green (TabPage accent on the program pages)

export const LOOK = {
  shell: 'fixed inset-0 z-[70] flex flex-col bg-fel-bg text-fel-text',
  // the demo fills the top 55%: AvatarDemo's own 4:3 box is stretched to the area (its look is untouched)
  demo: 'relative h-[55dvh] min-h-[220px] w-full shrink-0 overflow-hidden bg-[#08080d] [&_[data-avatar-demo]]:h-full [&_[data-avatar-demo]]:!aspect-auto',
  // the demo's "YOUR ATHLETE" label says nothing during a set; the still's "DEMO COMING" stays
  demoQuiet: '[&_[data-avatar-badge]]:hidden',
  topBar: 'absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 pb-6 pt-[max(10px,env(safe-area-inset-top))]',
  iconBtn: 'grid h-11 w-11 shrink-0 place-items-center rounded-full bg-black/45 text-white/90 backdrop-blur-sm motion-safe:transition-transform active:scale-90',
  progressWrap: 'min-w-0 flex-1',
  progressRow: 'flex h-1 gap-1',
  progressSeg: 'h-full flex-1 overflow-hidden rounded-full bg-white/15',
  progressFill: 'block h-full rounded-full bg-[#00FF9D] motion-safe:transition-[width] motion-safe:duration-300',
  label: 'font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-fel-soft',
  body: 'flex min-h-0 flex-1 flex-col px-5 pt-4',
  name: 'fel-heading text-[20px] font-black leading-tight text-white',
  doseRow: 'mt-1 flex items-baseline gap-3',
  dose: 'fel-heading text-[72px] font-black leading-[0.95] tabular-nums text-white',
  doseRest: 'fel-heading text-[72px] font-black leading-[0.95] tabular-nums text-[#00E5FF]',
  doseSmall: 'text-[16px] font-bold text-fel-soft',
  pips: 'mt-3 flex gap-1.5',
  pip: 'h-1.5 w-6 rounded-full',
  cue: 'mt-3 text-[16px] leading-snug text-fel-soft',
  bottom: 'mt-auto px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-3',
  button: 'fel-heading flex min-h-[64px] w-full items-center justify-center gap-2 rounded-2xl bg-[#00FF9D] px-5 text-[16px] font-black uppercase tracking-[0.08em] text-black shadow-[0_0_28px_rgba(0,255,157,0.28)] motion-safe:transition-transform motion-safe:duration-100 active:scale-[0.97] disabled:opacity-50',
  buttonRest: 'fel-heading flex min-h-[64px] w-full items-center justify-center gap-2 rounded-2xl bg-[#00E5FF] px-5 text-[16px] font-black uppercase tracking-[0.08em] text-black shadow-[0_0_28px_rgba(0,229,255,0.28)] motion-safe:transition-transform motion-safe:duration-100 active:scale-[0.97] disabled:opacity-50',
  setupBtn: 'grid h-11 w-11 shrink-0 place-items-center rounded-full text-fel-soft motion-safe:transition-transform active:scale-90',
  sheet: 'absolute inset-x-0 bottom-0 z-20 max-h-[70%] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-fel-surface-2/95 px-5 pb-6 pt-4 shadow-[0_-12px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl motion-safe:animate-[felSheetUp_220ms_cubic-bezier(0.16,0.8,0.3,1)]',
  sheetText: 'mt-2 text-[16px] leading-relaxed text-fel-soft',
  pausedVeil: 'pointer-events-none absolute inset-0 z-[5] grid place-items-center bg-black/55',
  finish: 'flex flex-1 flex-col items-center justify-center px-6 text-center',
  finishTitle: 'fel-heading mt-4 text-[72px] font-black leading-none text-white',
  stat: 'fel-heading text-[20px] font-black tabular-nums text-white',
  finishLine: 'mt-6 max-w-[22rem] text-[16px] leading-snug text-fel-soft',
} as const;

/** The sheet's rise, motion-safe (the keyframes ship with the component, so no global stylesheet changes). */
export const SHEET_KEYFRAMES = '@keyframes felSheetUp{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}';
