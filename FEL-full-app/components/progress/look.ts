// look — My progress's looks, in one file so premium-ui can swap them in one place (PLAT-P03). Four sizes: the latest
// number (30, the type scale's title), what you read (16), the source and the change (14), the label (12).
import { NUM, TYPE } from '@/lib/design/type';

export const LOOK = {
  row: 'fel-surface overflow-hidden',
  rowButton: 'fel-press flex min-h-16 w-full items-center gap-3 p-4 text-left',
  measure: `${TYPE.body} block truncate font-semibold text-white`,
  source: `${TYPE.label} mt-0.5 block text-fel-dim`,
  vs: `${TYPE.small} mt-1 flex items-center gap-1`,
  latest: `${NUM} text-[30px] leading-none text-white`,
  unit: `${TYPE.small} font-sans font-medium text-fel-dim`,
  better: 'text-fel-emerald',
  worse: 'text-[#FFB020]',
  same: 'text-fel-soft',
  history: 'space-y-1 border-t border-white/10 px-4 py-3',
  historyRow: `${TYPE.small} flex items-center justify-between gap-3 py-1`,
  emptyLine: `${TYPE.body} max-w-xs text-fel-soft`,
  foot: `${TYPE.small} text-center text-fel-dim`,
} as const;
