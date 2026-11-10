// components/teach/look.ts — PLAT-P10 (2026-11-03): the teacher platform's classes in one file (premium-ui's swap is this
// file). Built from the type scale (lib/design/type.ts TYPE) and the fel-* tokens; the one primary per screen is the
// kit's PrimaryCta. Three button looks: the primary pill, the chip, and the quiet row button.
import { TYPE } from '@/lib/design/type';

export const TEACH_LOOK = {
  card: 'fel-surface space-y-3 rounded-2xl p-4',
  label: `${TYPE.label} text-fel-soft`,
  title: `${TYPE.heading} text-white`,
  text: `${TYPE.small} text-white/80`,
  input: `${TYPE.body} min-h-12 w-full rounded-xl border border-white/15 bg-black/40 px-3 text-white placeholder-white/50 focus:border-fel-cyan/60 focus:outline-none`,
  area: `${TYPE.body} min-h-24 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white placeholder-white/50 focus:border-fel-cyan/60 focus:outline-none`,
  chips: 'flex flex-wrap gap-2',
  chip: `${TYPE.label} fel-press inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/15 px-4 text-white/80 disabled:opacity-40`,
  // EDU-05 (2026-11-10): the ON look has to WIN over the chip's own border and text colours. Both were plain utilities, and
  // in the compiled CSS `border-white/15` and `text-white/80` come after `border-fel-cyan/60` and `text-fel-cyan`, so a
  // picked chip looked exactly like the others (measured on the motion lesson page: the pressed chip's colours were the
  // unpressed ones). The `!` makes the on-state's two colours important; nothing else about the chip changes.
  chipOn: '!border-fel-cyan/60 !text-fel-cyan',
  row: `${TYPE.small} fel-press flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border border-white/10 px-3 text-left text-white`,
  error: `${TYPE.small} text-[#FFB020]`,
  ok: `${TYPE.small} text-[#00FF9D]`,
} as const;
