// components/coach/coach-queue/look.ts — PLATFORM PHASE 5: the coach's queue, roster strip, athlete sheet and Setup in
// ONE look file, built on premium-ui's tokens (TYPE, fel-surface, fel-press), so its later sweep swaps one file.
// Button looks, measured (premium rule: ≤ 3 a page): the shell's status rail already brings two (its PRQ chip and the
// sign-out circle, 40 px), so this phase adds ONE — the solid accent pill that resolves a card. Every other button here is
// a plain text button (no fill, no outline, still 48 px tall): a way in, Cancel, Setup, Back, a sheet's tabs.
// Four type sizes on the first screen with the shell's: heading (20, the shell's wordmark size), body, small, label.
import { TYPE } from '@/lib/design/type';

export const LOOK = {
  page: 'fel-fade mx-auto max-w-[680px] px-4 pb-28 pt-6 md:pb-10',
  header: 'mb-5 flex items-center justify-between gap-3',
  title: `${TYPE.heading} text-white`,
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
  outline: `fel-press inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-full px-4 ${TYPE.small} font-semibold text-fel-soft hover:text-white disabled:opacity-50`,
  row: `fel-press flex min-h-12 w-full items-center justify-between gap-3 border-b border-white/[0.06] py-3 text-left ${TYPE.body} text-white`,
  // the roster strip: avatars in their own scroller (the page never scrolls sideways)
  strip: '-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]',
  avatarBtn: 'fel-press flex w-[76px] shrink-0 flex-col items-center gap-1.5',
  avatar: `flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.08] ${TYPE.small} font-semibold text-white`,
  dots: 'flex gap-[3px]',
  dot: 'h-1.5 w-1.5 rounded-full',
  // full-screen sheets (athlete, Setup, a tool)
  // above the status rail (z-40) and the tab bar (z-50): a full-screen sheet is the whole screen
  sheet: 'fixed inset-0 z-[60] overflow-y-auto bg-[#050505] fel-fade',
  sheetInner: 'mx-auto max-w-[680px] px-4 pb-28 pt-4',
  sheetHead: 'sticky top-0 z-10 -mx-4 mb-4 flex items-center gap-3 bg-[#050505]/95 px-4 py-3 backdrop-blur',
  tabs: 'mb-4 flex border-b border-white/[0.08]',
  tab: `fel-press -mb-px min-h-12 flex-1 border-b-2 ${TYPE.label}`,
  tabOn: 'border-fel-cyan text-white',
  tabOff: 'border-transparent text-fel-dim',
  // the reply sheet: presets as rows, the text box for an adult
  replySheet: 'fixed inset-x-0 bottom-0 z-[75] rounded-t-[24px] border-t border-white/10 bg-[#0c0c11] p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] fel-enter',
  scrim: 'fixed inset-0 z-[70] bg-black/60',
  input: `min-h-12 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 ${TYPE.body} text-white placeholder:text-fel-dim`,
} as const;

/** Initials for an avatar: the first letter of the first two words. */
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
