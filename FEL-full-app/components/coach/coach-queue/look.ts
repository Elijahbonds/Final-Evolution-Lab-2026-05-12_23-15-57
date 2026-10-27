// components/coach/coach-queue/look.ts — PLATFORM PHASE 5: the coach's queue, roster strip, athlete sheet and Setup in
// ONE look file, built on premium-ui's tokens (TYPE, fel-surface, fel-press), so its later sweep swaps one file.
// Three button looks on the page, never more: the solid accent (the action that resolves a card), the outline (a way in),
// and the plain text row (a list of places). Four type sizes on the first screen: title, body, small, label.
import { TYPE } from '@/lib/design/type';

export const LOOK = {
  page: 'fel-fade mx-auto max-w-[680px] px-4 pb-28 pt-6 md:pb-10',
  header: 'mb-5 flex items-center justify-between gap-3',
  title: `${TYPE.title} text-white`,
  section: 'mb-6',
  sectionHead: `${TYPE.label} mb-3 flex items-center justify-between text-fel-dim`,
  card: 'fel-surface fel-enter flex flex-col gap-3 p-4 transition-[opacity,transform,max-height,margin,padding] duration-200 ease-out',
  cardLeaving: 'pointer-events-none !max-h-0 !py-0 opacity-0 translate-x-6 overflow-hidden',
  name: `${TYPE.body} font-semibold text-white`,
  line: `${TYPE.small} text-fel-soft`,
  quiet: `${TYPE.small} text-fel-dim`,
  actions: 'flex justify-end gap-2',
  // the three button looks
  solid: `fel-press inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-full bg-fel-cyan px-5 ${TYPE.small} font-semibold text-black disabled:opacity-50`,
  outline: `fel-press inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-full border border-white/15 px-5 ${TYPE.small} font-semibold text-white disabled:opacity-50`,
  row: `fel-press flex min-h-12 w-full items-center justify-between gap-3 border-b border-white/[0.06] py-3 text-left ${TYPE.body} text-white`,
  // the roster strip: avatars in their own scroller (the page never scrolls sideways)
  strip: '-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]',
  avatarBtn: 'fel-press flex w-[76px] shrink-0 flex-col items-center gap-1.5',
  avatar: `flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.08] ${TYPE.small} font-semibold text-white`,
  dots: 'flex gap-[3px]',
  dot: 'h-1.5 w-1.5 rounded-full',
  // full-screen sheets (athlete, Setup, a tool)
  sheet: 'fixed inset-0 z-50 overflow-y-auto bg-[#050505] fel-fade',
  sheetInner: 'mx-auto max-w-[680px] px-4 pb-28 pt-4',
  sheetHead: 'sticky top-0 z-10 -mx-4 mb-4 flex items-center gap-3 bg-[#050505]/95 px-4 py-3 backdrop-blur',
  tabs: 'mb-4 flex gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1',
  tab: `fel-press min-h-11 flex-1 rounded-full ${TYPE.label}`,
  tabOn: 'bg-white/[0.14] text-white',
  tabOff: 'text-fel-dim',
  // the reply sheet: presets as rows, the text box for an adult
  replySheet: 'fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] border-t border-white/10 bg-[#0c0c11] p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] fel-enter',
  scrim: 'fixed inset-0 z-[55] bg-black/60',
  input: `min-h-12 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 ${TYPE.body} text-white placeholder:text-fel-dim`,
} as const;

/** Initials for an avatar: the first letter of the first two words. */
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
