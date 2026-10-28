// components/session-player/coach-look.ts — PLAT-P06 (2026-10-28): every class the coached session draws with (the
// player's reply card and rest row, and Today's launcher), in one file, so premium-ui's swap is one file. Built from the
// player's own type (lib/design/type.ts TYPE: label 12, body 16, heading 20) and the fel-* tokens; no new size.
import { TYPE } from '@/lib/design/type';

export const COACH_LOOK = {
  // the player
  reply: 'rounded-2xl border border-fel-cyan/30 bg-[#0b1d24]/90 px-4 py-3 backdrop-blur-sm motion-safe:animate-[felSheetUp_320ms_cubic-bezier(0.16,0.8,0.3,1)]',
  replyFrom: `${TYPE.label} text-fel-cyan`,
  replyBody: `mt-1 line-clamp-3 ${TYPE.body} text-white`,
  log: 'space-y-1.5',
  logHead: `${TYPE.label} text-fel-soft`,
  film: '[&_a]:min-h-11 [&_a]:text-[12px]',
  // Today's launcher
  launcher: 'space-y-4',
  card: 'fel-card rounded-2xl p-4',
  eyebrow: `${TYPE.label} text-fel-soft`,
  title: `${TYPE.heading} mt-1 text-white`,
  cta: 'mt-4 [&>[data-fel-primary]]:w-full',
  rows: 'fel-surface flex flex-col divide-y divide-white/[0.06] overflow-hidden p-0',
  row: `flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left ${TYPE.body} text-white/90 fel-press`,
  rowSide: `${TYPE.label} text-fel-soft`,
  /** the empty day's one quiet action (the kit's outlined shape) */
  quietCta: `fel-press mt-2 inline-flex min-h-12 items-center justify-center rounded-full border border-white/25 px-6 ${TYPE.label} text-white`,
  sheetVeil: 'fixed inset-0 z-[60] bg-black/60 motion-safe:animate-[felFade_180ms_ease-out]',
  sheet: 'fixed inset-x-0 bottom-0 z-[61] max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-fel-surface-2 px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.6)] motion-safe:animate-[felSheetUp_220ms_cubic-bezier(0.16,0.8,0.3,1)]',
  sheetHead: 'mb-3 flex items-center justify-between gap-2',
  sheetTitle: `${TYPE.label} text-fel-soft`,
  sheetClose: `grid h-11 w-11 place-items-center rounded-full text-fel-soft`,
} as const;

/** The sheet's rise and the veil's fade, motion-safe (they ship with the component; no global stylesheet changes). */
export const LAUNCHER_KEYFRAMES = '@keyframes felSheetUp{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}@keyframes felFade{from{opacity:0}to{opacity:1}}';
