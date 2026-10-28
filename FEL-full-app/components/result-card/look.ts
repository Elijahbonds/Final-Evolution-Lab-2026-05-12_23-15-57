// look — the result card's few looks, in one file so premium-ui can swap them in one place (PLAT-P03; the plan's §3.1
// split: the phases own structure, premium-ui owns the look). Four sizes on the card and no more, chosen so the screen
// stays at four with the shell's own (12 and 14): the number (64); the unit, the line and the button (20, PrimaryCta's
// own size); the chip and the quiet links (14, the scale's small); the label (12). Built on components/ui/fel and
// lib/design's tokens.
import { NUM, TYPE } from '@/lib/design/type';

export const LOOK = {
  card: 'fel-surface fel-enter scroll-mt-4 p-5 text-center',
  /** The room under a card that takes the screen (the tab bar is ~5 rem). */
  fill: 'min-h-[calc(100dvh-6rem)]',
  label: `${TYPE.label} flex items-center justify-center gap-2 text-fel-dim`,
  tag: `${TYPE.label} rounded-full border border-white/15 px-2 py-0.5 text-fel-dim`,
  numberRow: 'mt-3 flex flex-wrap items-baseline justify-center gap-x-2 text-white',
  number: `${NUM} text-[64px] leading-none`,
  unit: 'font-display text-[20px] font-bold text-fel-soft',
  chip: 'mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-sans text-[14px] font-semibold leading-tight',
  chipTone: {
    better: 'border-fel-emerald/40 bg-fel-emerald/[0.1] text-fel-emerald',
    worse: 'border-[#FFB020]/45 bg-[#FFB020]/[0.1] text-[#FFB020]',
    same: 'border-white/15 bg-white/[0.06] text-fel-soft',
  },
  line: 'mx-auto mt-3 max-w-sm font-sans text-[20px] font-medium leading-snug text-white',
  actions: 'mt-5 flex flex-col items-center gap-1',
  quiet: 'fel-press inline-flex min-h-12 items-center justify-center px-3 font-sans text-[14px] font-bold text-fel-soft underline underline-offset-4',
  details: 'mt-2 text-left [&_summary::-webkit-details-marker]:hidden',
  detailsBody: 'mt-3 space-y-3 border-t border-white/10 pt-3',
  /** What the detail says: body size, the soft ink (the tool's own sentences, moved here unchanged). */
  detail: `${TYPE.body} text-fel-soft`,
} as const;
