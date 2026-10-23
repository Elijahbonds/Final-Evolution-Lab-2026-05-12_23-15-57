// lib/legal/legalProse.ts — TW-DEAD-CLASSES (2026-10-16): how /terms, /privacy and /store-terms style the HTML their Markdown
// renders to (lib/legal/terms-markdown.ts, the privacy page's simpleMarkdown, lib/store-terms/render.ts: bare h1–h3, p, ul,
// li, strong, em, blockquote, table, a).
//
// The pages used `prose prose-invert prose-sm prose-headings:… prose-p:…`, the classes of @tailwindcss/typography, which
// is not installed. Every one compiled to NO CSS, and Tailwind's base reset left the rendered headings unsized, the lists
// without bullets and the paragraphs without spacing. The owner chose (2026-10-16) to style the tags here rather than add
// the plugin. Each class targets a descendant tag of the wrapper ([&_h2]:…) and keeps what the pages asked for: headings
// white in .fel-heading's face (the display font, uppercase, 0.04em), body at 70 % white, strong white, em 50 %, quotes in
// the page's accent, Store Terms' links and table. The sizes and spacing follow prose-sm's scale.
//
// Tailwind only generates classes it can read in this file, so every class is written out in full; none may be built at
// runtime.

export const LEGAL_PROSE = [
  'text-sm leading-[1.7] text-white/70',
  '[&>div>:first-child]:mt-0',
  '[&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:text-white [&_h1]:font-display [&_h1]:uppercase [&_h1]:tracking-[0.04em]',
  '[&_h2]:mb-2 [&_h2]:mt-7 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:leading-snug [&_h2]:text-white [&_h2]:font-display [&_h2]:uppercase [&_h2]:tracking-[0.04em]',
  '[&_h3]:mb-1.5 [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-white [&_h3]:font-display [&_h3]:uppercase [&_h3]:tracking-[0.04em]',
  '[&_p]:my-3',
  '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_li]:pl-1 [&_li]:marker:text-white/40',
  '[&_strong]:font-semibold [&_strong]:text-white [&_em]:italic [&_em]:text-white/50',
  '[&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_blockquote]:italic',
  '[&_a]:text-cyan-300 [&_a]:underline [&_a]:underline-offset-2',
  '[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[0.8125rem]',
  '[&_td]:border [&_td]:border-white/10 [&_td]:px-2 [&_td]:py-1 [&_td]:align-top',
  '[&_th]:border [&_th]:border-white/10 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:align-top [&_th]:text-white',
  '[&_hr]:my-6 [&_hr]:border-white/10',
].join(' ');

/** The quote colour each page asked for: gold on Terms and Store Terms, violet on Privacy. */
export const LEGAL_QUOTE_GOLD = '[&_blockquote]:border-[#FFD700]/40 [&_blockquote]:text-[#FFD700]/80';
export const LEGAL_QUOTE_VIOLET = '[&_blockquote]:border-[#A855F7]/40 [&_blockquote]:text-[#A855F7]/80';
