// components/shop/look.ts — PLAT-P07 (2026-11-02): every class the shop front draws with, in one file (premium-ui's swap
// is this file). Built from the type scale (lib/design/type.ts TYPE: label 12, small 14, heading 20, title 30) and the
// fel-* tokens; the one primary is the kit's PrimaryCta.
import { TYPE } from '@/lib/design/type';

export const SHOP_LOOK = {
  page: 'mx-auto max-w-3xl px-5 pb-28 pt-8 text-white',
  eyebrow: `${TYPE.label} text-fel-cyan`,
  title: `${TYPE.title} mt-2 text-white`,
  lede: `${TYPE.small} mt-2 max-w-xl text-fel-soft`,
  section: 'mt-8',
  sectionTitle: `${TYPE.label} mb-3 text-fel-soft`,
  grid: 'grid gap-3 sm:grid-cols-2',
  // the one product card: a surface, the title, one line, the price; the whole card is the tap target when it links
  card: 'fel-surface fel-press flex min-h-[96px] flex-col gap-1 rounded-2xl p-4 text-left',
  cardTitle: `${TYPE.heading} text-white`,
  cardLine: `${TYPE.small} text-fel-soft`,
  cardPrice: `${TYPE.small} mt-auto pt-2 font-semibold text-fel-cyan`,
  cardSide: `${TYPE.label} text-fel-soft`,
  chips: 'flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
  chip: `${TYPE.label} fel-press inline-flex min-h-10 shrink-0 items-center rounded-full px-4 text-fel-soft`,
  chipOn: 'bg-white/[0.14] text-white',
  // a list of one-line rows (the wallet's Earn today / Spend, the bookings list): a divider is an inset shadow, not a border
  rows: 'fel-surface flex flex-col overflow-hidden rounded-2xl p-0',
  row: `${TYPE.small} fel-press flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-white/90 [li:not(:first-child)>&]:shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]`,
  rowSide: `${TYPE.label} text-fel-soft`,
  // Opens soon: one line, no button
  soon: `${TYPE.small} mt-2 inline-flex items-center gap-2 text-fel-soft`,
  soonDot: 'h-2 w-2 rounded-full bg-fel-cyan/70 motion-safe:animate-pulse',
  owned: `${TYPE.small} mt-2 font-semibold text-[#7BD389]`,
  // the buy sheet
  veil: 'fixed inset-0 z-[80] bg-black/60',
  sheet: 'fixed inset-x-0 bottom-0 z-[81] mx-auto max-h-[88dvh] max-w-lg overflow-y-auto rounded-t-3xl border-t border-white/10 bg-fel-surface-2 px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4 shadow-[0_-12px_40px_rgba(0,0,0,0.6)] motion-safe:animate-[felSheetUp_220ms_cubic-bezier(0.16,0.8,0.3,1)]',
  sheetHead: 'flex items-start justify-between gap-3',
  stepLabel: `${TYPE.label} mt-5 text-fel-soft`,
  stepLabelTop: `${TYPE.label} text-fel-soft`,
  includes: `${TYPE.small} mt-2 space-y-1 text-white/85`,
  terms: `${TYPE.small} mt-2 flex min-h-12 items-center gap-3 text-white/85`,
  termsNudge: 'text-fel-cyan',
  close: 'grid h-11 w-11 shrink-0 place-items-center rounded-full text-fel-soft',
  cta: 'mt-5 [&>[data-fel-primary]]:w-full',
  alert: `${TYPE.small} mt-3 text-amber-200`,
  // the card's own buy button: the kit's outlined shape (the page's primary stays the one PrimaryCta)
  buy: `${TYPE.label} fel-press mt-3 inline-flex min-h-12 items-center justify-center rounded-full border border-white/25 px-6 text-white`,
} as const;

export const SHEET_KEYFRAMES = '@keyframes felSheetUp{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}';
