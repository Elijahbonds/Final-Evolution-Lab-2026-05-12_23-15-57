// components/signature/look.ts — PLAT-P01 (2026-10-27): the classes the signature program pages add on top of premium-ui's
// look, in one file. premium-ui owns the look: the type scale (lib/design/type.ts TYPE), the kit (components/ui/fel: the
// page's one primary button is its PrimaryCta, a status is its Chip) and the tokens (fel-* classes).
//
// Type above the fold: TYPE.label 12 (meta), TYPE.small 14 (the day's lines, the fold rows), the CTA's 20, TabPage's 30.
import { TYPE } from '@/lib/design/type';

export const SIG_LOOK = {
  meta: `${TYPE.label} text-fel-soft`,
  body: `${TYPE.small} text-fel-soft`,
  note: `flex gap-2 ${TYPE.small}`,
  /** the kit's PrimaryCta, stretched to the card (it sizes itself to its words) */
  start: 'mt-4 [&>[data-fel-primary]]:w-full',
  today: 'fel-surface rounded-3xl border border-fel-cyan/25 bg-gradient-to-b from-fel-cyan/[0.07] to-transparent p-5',
  link: 'font-semibold text-fel-cyan underline-offset-2 hover:underline',
  card: 'fel-press flex gap-4 rounded-2xl border border-white/8 bg-white/[0.02] p-4 motion-safe:transition-colors hover:border-white/15 hover:bg-white/[0.045]',
  cardTitle: `${TYPE.heading} mt-1 block text-white`,
  fold: 'group mt-3 rounded-2xl border border-white/8 bg-white/[0.02] px-4',
  foldSummary: `flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-2 ${TYPE.small} font-semibold text-white [&::-webkit-details-marker]:hidden`,
  row: `flex items-baseline justify-between gap-3 border-b border-white/[0.06] py-2.5 ${TYPE.small} last:border-0`,
} as const;
