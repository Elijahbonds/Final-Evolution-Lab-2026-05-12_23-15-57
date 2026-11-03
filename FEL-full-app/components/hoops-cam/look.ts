// components/hoops-cam/look.ts — PLAT-P09 (2026-11-03): the shot and dribble tracker's classes in one file (premium-ui's
// swap is this file). Built from the type scale (lib/design/type.ts TYPE) and the fel-* tokens; the one primary on the
// set-up is the kit's PrimaryCta.
import { TYPE } from '@/lib/design/type';

export const HOOPS_LOOK = {
  // the session, full screen while the camera runs: the picture, the count, the last call, one line
  layer: 'fixed inset-0 z-[70] flex flex-col bg-black pb-[max(12px,env(safe-area-inset-bottom))] pt-[max(8px,env(safe-area-inset-top))]',
  hud: 'flex items-center justify-between gap-3 px-4 py-2',
  count: 'font-display text-[44px] font-extrabold leading-none tabular-nums text-white',
  pct: `${TYPE.heading} tabular-nums text-white/80`,
  call: `${TYPE.label} rounded-full px-2.5 py-1 text-black`,
  line: `${TYPE.small} px-4 pb-2 text-center text-white/70`,
  stage: 'relative mx-auto w-full max-w-3xl flex-1 overflow-hidden bg-black',
  bar: 'flex items-center justify-center gap-3 px-4 pt-3',
  icon: 'fel-press grid h-12 w-12 place-items-center rounded-full border border-white/20 text-white',
  end: 'fel-press grid h-12 w-12 place-items-center rounded-full bg-white text-black',
  pick: `${TYPE.small} fel-press inline-flex min-h-12 flex-1 items-center justify-center rounded-full border border-white/25 px-4 font-semibold text-white`,
  ask: 'mx-4 flex items-center justify-between gap-2 rounded-2xl border border-[#FFB020]/40 bg-[#FFB020]/[0.08] px-4 py-2',
  yes: `${TYPE.label} fel-press min-h-12 rounded-full bg-[#00FF9D] px-5 text-black`,
  no: `${TYPE.label} fel-press min-h-12 rounded-full bg-[#FF6B8A] px-5 text-black`,
} as const;
