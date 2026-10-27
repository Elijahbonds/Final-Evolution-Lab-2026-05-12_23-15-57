// components/signature/look.ts — PLAT-P01 (2026-10-27): the classes the signature program pages draw with, in one file.
// premium-ui owns the look; its kit (components/ui/fel) is not on lane/finish-release yet, so these use the tokens that
// are (fel-* classes, app/theme.css). When the kit lands, the swap is this one file. TODO(premium-ui): swap START for the
// kit's primary button and .fel-press, CARD for its card.
//
// Type above the fold: 11 px meta (TabPage's eyebrow size), 13.5 px body (TabPage's lede size), 16 px the button.

export const SIG_LOOK = {
  meta: 'font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-fel-soft',
  body: 'text-[13.5px] leading-relaxed text-fel-soft',
  heading: 'fel-heading text-[30px] font-black leading-none text-white',
  note: 'flex gap-2 text-[13.5px] leading-snug',
  start: 'fel-heading mt-4 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[#00FF9D] px-5 text-[16px] font-black uppercase tracking-[0.08em] text-black shadow-[0_0_28px_rgba(0,255,157,0.25)] motion-safe:transition-transform motion-safe:duration-100 active:scale-[0.97] disabled:opacity-50',
  today: 'rounded-3xl border border-[#00FF9D]/25 bg-gradient-to-b from-[#00FF9D]/[0.07] to-transparent p-5',
  link: 'font-bold text-[#00E5FF] underline-offset-2 hover:underline',
  card: 'flex gap-4 rounded-2xl border border-white/8 bg-white/[0.02] p-4 motion-safe:transition-colors hover:border-white/15 hover:bg-white/[0.045] active:scale-[0.99]',
  chip: 'shrink-0 rounded-full bg-[#FFD700]/12 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFD700]',
  row: 'flex items-baseline justify-between gap-3 border-b border-white/[0.06] py-2.5 text-[13.5px] last:border-0',
} as const;
