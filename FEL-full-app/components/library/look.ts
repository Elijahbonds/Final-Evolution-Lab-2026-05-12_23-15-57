// components/library/look.ts — PLAT-P08 (2026-11-02): the classes the library's search screen and exercise sheet add, in one
// file (premium-ui's swap is this file). Built from the type scale (lib/design/type.ts TYPE) and the fel-* tokens; the one
// primary is the kit's PrimaryCta.
import { TYPE } from '@/lib/design/type';

export const LIB_LOOK = {
  // the search screen
  search: `${TYPE.small} w-full rounded-full border border-white/10 bg-fel-surface-2 py-3 pl-11 pr-11 text-white placeholder-white/50 focus:border-fel-cyan/50 focus:outline-none`,
  chips: 'flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
  chip: `${TYPE.label} fel-press inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-white/12 px-4 text-fel-soft`,
  chipOn: 'border-fel-cyan/60 text-fel-cyan',   // no fill: on and off stay one look (the premium rule's ≤ 3 button looks)
  grid: 'grid grid-cols-2 gap-3',
  tile: 'fel-surface fel-press flex min-h-[132px] flex-col justify-between rounded-2xl p-3 text-left',
  tileName: `${TYPE.small} font-semibold text-white`,
  tileMeta: `${TYPE.label} text-fel-soft`,
  moves: `${TYPE.label} inline-flex items-center gap-1 text-fel-cyan`,
  // the exercise sheet
  veil: 'fixed inset-0 z-[80] bg-black/70',
  sheet: 'fixed inset-x-0 bottom-0 z-[81] mx-auto max-h-[92dvh] max-w-lg overflow-y-auto rounded-t-3xl border-t border-white/10 bg-fel-surface-2 pb-[max(20px,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(0,0,0,0.6)] motion-safe:animate-[felSheetUp_220ms_cubic-bezier(0.16,0.8,0.3,1)]',
  head: 'flex items-start justify-between gap-3 px-5 pb-3 pt-4',
  title: `${TYPE.heading} text-white`,
  close: 'grid h-11 w-11 shrink-0 place-items-center rounded-full text-fel-soft',
  body: 'space-y-4 px-5 pt-4',
  muscles: 'flex flex-wrap gap-1.5',
  muscle: `${TYPE.label} inline-flex min-h-8 items-center rounded-full bg-white/[0.08] px-3 text-white/85`,
  cues: `${TYPE.small} space-y-2 text-white`,
  cue: 'flex gap-2',
  cta: '[&>[data-fel-primary]]:w-full',
  quiet: `${TYPE.label} fel-press inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-white/25 px-6 text-white`,
  more: `${TYPE.label} flex min-h-12 w-full items-center justify-between text-fel-soft`,
  section: `${TYPE.label} mb-1 text-fel-soft`,
  text: `${TYPE.small} text-white/80`,
} as const;

export const SHEET_KEYFRAMES = '@keyframes felSheetUp{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}';
