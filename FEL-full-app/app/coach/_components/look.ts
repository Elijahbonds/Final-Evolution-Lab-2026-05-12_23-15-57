// app/coach/_components/look.ts — COACH-DELIVERY phase 2 (2026-10-27): the coach screens' shared look, in one file so
// premium-ui's primitives can replace it in one swap (the platform pass's rule).
//
// TAP: COA-06's gate on a phone — every tap target in the Clients tab (the roster, the builder, the inbox, the thread, the
// panels) at least 44 px tall and wide. Applied once at the Clients root, so no panel has to remember it: buttons, inputs,
// selects, text areas and summaries get a 44 px floor; a link that is not already a block/flex box becomes an inline-flex
// box so its floor applies too (min-height does nothing on an inline box). Checkboxes and radios keep their size (their
// label is the target).
export const TAP = [
  '[&_button]:min-h-11', '[&_button]:min-w-11',
  '[&_input:not([type=checkbox]):not([type=radio])]:min-h-11', '[&_select]:min-h-11', '[&_textarea]:min-h-11', '[&_summary]:min-h-11',
  '[&_a]:min-h-11', '[&_a]:min-w-11', '[&_a:not([class*=flex]):not([class*=block])]:inline-flex', '[&_a:not([class*=flex]):not([class*=block])]:items-center',
].join(' ');
