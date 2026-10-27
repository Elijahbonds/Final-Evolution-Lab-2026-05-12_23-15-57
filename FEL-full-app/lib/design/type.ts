// THE TYPE SCALE (lane/premium-ui, 2026-10-27; docs/PLAN-UI-10PHASE.md P1).
//
// The owner: "it still feels cheap", and the first reason picked was "inconsistent — different fonts, buttons and spacing
// from page to page". The pages measured 33 ad-hoc `text-[Npx]` sizes and four faces (Barlow Condensed, Chakra Petch,
// JetBrains Mono for the eyebrows, Plex). Nike and Apple Fitness+ use one condensed display face, one text face and
// very few sizes; that restraint is most of what reads as premium.
//
// SIX SIZES, TWO FACES:
//   display  the hero headline and the hero number            Barlow Condensed 800, uppercase, tight
//   title    a page or sheet title, a big stat                 Barlow Condensed 700
//   heading  a section or card title                           Barlow Condensed 700, uppercase, tracked
//   body     anything you read                                 IBM Plex Sans 400
//   small    the supporting line under a title (≤ 12 words)    IBM Plex Sans 500
//   label    an eyebrow, a tab, a unit, a chip                 IBM Plex Sans 600, uppercase, tracked
// Numbers use the display face with tabular figures (`num`), so a ticking value never jitters sideways.
//
// The strings are Tailwind classes: lib/** is in tailwind.config.ts's content, so each class below is generated.
// The HUD in a running game keeps Chakra Petch (--fel-font-display; the owner's 2026-09-29 call): this scale is the menus'.

export const TYPE_SIZES_PX = {
  display: { phone: 44, wide: 64 },
  title: { phone: 30, wide: 36 },
  heading: { phone: 20, wide: 20 },
  body: { phone: 16, wide: 16 },
  small: { phone: 14, wide: 14 },
  label: { phone: 12, wide: 12 },
} as const;

export type TypeRole = keyof typeof TYPE_SIZES_PX;

/** The class for each role. One role per piece of text; never a raw text-[Npx] beside these. */
export const TYPE: Record<TypeRole, string> = {
  display: 'font-display text-[44px] md:text-[64px] font-extrabold uppercase leading-[0.9] tracking-[-0.005em]',
  title: 'font-display text-[30px] md:text-[36px] font-bold leading-[1] tracking-[0.005em]',
  heading: 'font-display text-[20px] font-bold uppercase leading-[1.1] tracking-[0.03em]',
  body: 'font-sans text-[16px] font-normal leading-[1.5]',
  small: 'font-sans text-[14px] font-medium leading-[1.4]',
  label: 'font-sans text-[12px] font-semibold uppercase leading-[1.2] tracking-[0.14em]',
};

/** Numbers: the display face, tabular figures. Add a size role beside it (TYPE.display / TYPE.title). */
export const NUM = 'font-display font-extrabold tabular-nums tracking-[-0.01em]';

/** The two faces the menus use (app/layout.tsx's next/font variables). */
export const FACES = { display: '--font-display', text: '--font-sans' } as const;
