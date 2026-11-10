// lib/every-screen/judge.ts — EVERY-SCREEN phase 1 (lane/every-screen-p01, 2026-11-10): the four checks, as rules.
//
// Owner, 2026-11-10: "To improve the total quality of the product from improving every screen." A screen is done when
// it is clear and quick, looks finished, is fast and smooth on a phone, and is right and trustworthy: all four
// (docs/PLAN-EVERY-SCREEN-10PHASE.md, "The scorecard"). The rig (scripts/every-screen/score.mts) measures a rendered
// screen; this file turns the measurements into pass / fail per check and names the single worst problem.
//
// Pure: no DOM, no I/O. Every number is in BUDGET so the rig, the tests and docs/EVERY-SCREEN-SCORECARD.md cannot drift.

export const BUDGET = {
  /** check 1: a do-this screen shows at most this many words before scrolling (the plan's number) */
  wordsFoldDo: 40,
  /** check 1: tap targets are at least this many CSS px on both sides (the plan's number) */
  tapPx: 44,
  /** check 1: one obvious main action: more bright filled buttons than this on the first screen compete */
  primaryMax: 1,
  /** check 2: at most this many text sizes and button looks on a screen (the plan's numbers) */
  textSizes: 4,
  buttonLooks: 3,
  /** check 3 (owner-approved with the plan, 2026-11-10; "the owner can move them"): on the phone with the CPU 4× slower */
  fcpMs: 2500,
  cls: 0.02,
  tapMs: 200,
} as const;

export type CheckId = 'clear' | 'finished' | 'fast' | 'right';
export const CHECKS: readonly CheckId[] = ['clear', 'finished', 'fast', 'right'];
export const CHECK_NAME: Record<CheckId, string> = {
  clear: 'Clear and quick', finished: 'Looks finished', fast: 'Fast and smooth', right: 'Right and trustworthy',
};

/** What kind of screen it is. Only a do-this screen takes the 40-word rule; a menu or a reading page does not. */
export type ScreenKind = 'do' | 'hub' | 'read';

export interface Fault {
  check: CheckId;
  /** a stable id: the "ten most common faults" are counted by it */
  id: string;
  /** one plain sentence for the owner */
  say: string;
  /** how bad, 1–100: the single worst problem is the highest */
  weight: number;
}

/** What the rig hands over for one screen (phone 390 × 844, CPU 4×), plus the two squeezed set-ups. */
export interface ScreenFacts {
  kind: ScreenKind;
  wordsFold: number;
  wordsAll: number;
  primaryFold: string[];
  /** enabled links, buttons and fields: on the whole screen, and outside the app's own bars */
  actionsAll: number;
  actionsMain: number;
  smallTargets: { label: string; w: number; h: number; chrome: boolean; sel?: string }[];
  unfinished: { mark: string; text: string }[];
  emptyNoNext: string[];
  spinnersNoWords: number;
  blank: boolean;
  textSizes: string[];
  buttonLooks: number;
  /** sideways scroll in CSS px, per set-up; null = that set-up was not measured */
  hscroll: { phone: number | null; zoom200: number | null; font150: number | null };
  /** key text cut off (a number, a heading, a control's label), per set-up */
  clipped: { phone: string[]; zoom200: string[]; font150: string[] };
  /** READABLE.md size misses at phone width: text under 12 px, body copy under 16 px */
  tiny: number;
  bodySmall: number;
  fcpMs: number | null;
  cls: number | null;
  /** the main action's tap: ms to the next paint (null = not measured), and whether anything happened at all */
  tapMs: number | null;
  tapDidNothing: boolean;
  tapLabel: string | null;
  brokenLinks: { href: string; status: number; label: string }[];
  nowhereLinks: string[];
  /** uncaught errors on the page */
  pageErrors: string[];
  a11yCritical: number;
  a11ySerious: number;
  a11yRules: string[];
  /** measured numbers on screen, and whether any line says how they were measured or how sure they are */
  numbers: { text: string; px: number }[];
  methodLine: boolean;
  /** a check the rig cannot finish on this screen, and why (a 3D screen's tap time on a rig with no real GPU). With no
   *  fault found the check reads "n/m" (not measured), which is not a pass. */
  cannot?: Partial<Record<CheckId, string>>;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Every fault on one screen, worst first. */
export function faultsOf(f: ScreenFacts): Fault[] {
  const out: Fault[] = [];
  const add = (check: CheckId, id: string, weight: number, say: string) => out.push({ check, id, say, weight });

  // 1. Clear and quick
  if (f.actionsAll === 0) add('clear', 'dead-end', 100, 'Dead end: nothing on the screen leads on or back.');
  else if (f.actionsMain === 0) add('clear', 'only-chrome', 70, 'Nothing in the screen itself leads on: only the app\'s own bars do.');
  if (f.primaryFold.length > BUDGET.primaryMax) add('clear', 'many-primary', 45, `${f.primaryFold.length} bright buttons compete on the first screen (${f.primaryFold.slice(0, 3).join(', ')}).`);
  if (f.kind === 'do' && f.wordsFold > BUDGET.wordsFoldDo) add('clear', 'too-many-words', Math.min(60, 30 + Math.round((f.wordsFold - BUDGET.wordsFoldDo) / 6)), `${f.wordsFold} words before scrolling (the budget is ${BUDGET.wordsFoldDo}).`);
  const ownSmall = f.smallTargets.filter((t) => !t.chrome);
  const barSmall = f.smallTargets.filter((t) => t.chrome);
  if (ownSmall.length) add('clear', 'small-targets', Math.min(55, 25 + ownSmall.length), `${plural(ownSmall.length, 'tap target')} under ${BUDGET.tapPx} px (smallest: "${[...ownSmall].sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h))[0].label}").`);
  if (barSmall.length) add('clear', 'small-targets-bars', Math.min(40, 20 + barSmall.length), `${plural(barSmall.length, 'tap target')} under ${BUDGET.tapPx} px in the app's own bars.`);

  // 2. Looks finished
  for (const u of f.unfinished) add('finished', `unfinished:${u.mark}`, u.mark === 'placeholder text' || u.mark === 'raw value shown' ? 90 : 80, `Unfinished mark on screen: "${u.text}".`);
  if (f.blank) add('finished', 'blank', 95, 'The screen is blank: no words at all.');
  if (f.emptyNoNext.length) add('finished', 'empty-no-next', 65, `An empty state with no next step: "${f.emptyNoNext[0]}".`);
  if (f.spinnersNoWords > 0) add('finished', 'spinner-no-words', 60, 'A spinner with no words: it never says what it is waiting for.');
  const setups: [keyof ScreenFacts['hscroll'], string][] = [['phone', 'at 390 px'], ['zoom200', 'at 200 % zoom'], ['font150', 'with 150 % text']];
  for (const [k, where] of setups) {
    const px = f.hscroll[k];
    if (px != null && px > 2) add('finished', `hscroll:${k}`, k === 'phone' ? 75 : 50, `The screen scrolls sideways ${where} (${Math.round(px)} px).`);
    const c = f.clipped[k];
    if (c.length) add('finished', `clipped:${k}`, k === 'phone' ? 70 : 48, `Text cut off ${where}: "${c[0].replace(/ \[[^\]]*\]$/, '')}"${c.length > 1 ? ` and ${c.length - 1} more` : ''}.`);
  }
  if (f.tiny > 0) add('finished', 'tiny-text', Math.min(58, 35 + f.tiny), `${plural(f.tiny, 'piece')} of text under 12 px.`);
  if (f.bodySmall > 0) add('finished', 'body-small', Math.min(50, 30 + f.bodySmall), `${plural(f.bodySmall, 'paragraph')} of body copy under 16 px.`);
  if (f.textSizes.length > BUDGET.textSizes) add('finished', 'text-sizes', Math.min(44, 20 + 2 * (f.textSizes.length - BUDGET.textSizes)), `${f.textSizes.length} text sizes on one screen (at most ${BUDGET.textSizes}).`);
  if (f.buttonLooks > BUDGET.buttonLooks) add('finished', 'button-looks', Math.min(42, 20 + 2 * (f.buttonLooks - BUDGET.buttonLooks)), `${f.buttonLooks} button looks on one screen (at most ${BUDGET.buttonLooks}).`);

  // 3. Fast and smooth
  if (f.fcpMs != null && f.fcpMs > BUDGET.fcpMs) add('fast', 'slow-first-content', Math.min(85, 50 + Math.round((f.fcpMs - BUDGET.fcpMs) / 200)), `First content after ${(f.fcpMs / 1000).toFixed(1)} s (the budget is ${BUDGET.fcpMs / 1000} s).`);
  if (f.cls != null && f.cls > BUDGET.cls) add('fast', 'layout-shift', Math.min(72, 40 + Math.round(f.cls * 100)), `The screen jumps as it loads (layout shift ${f.cls.toFixed(3)}; the budget is ${BUDGET.cls}).`);
  if (f.tapMs != null && f.tapMs > BUDGET.tapMs) add('fast', 'slow-tap', Math.min(68, 40 + Math.round((f.tapMs - BUDGET.tapMs) / 40)), `"${f.tapLabel ?? 'the main action'}" answers a tap in ${f.tapMs} ms (the budget is ${BUDGET.tapMs} ms).`);

  // 4. Right and trustworthy
  for (const b of f.brokenLinks.slice(0, 3)) add('right', 'broken-link', b.status >= 500 ? 92 : 88, `"${b.label || b.href}" goes to ${b.href}, which answers ${b.status}.`);
  if (f.nowhereLinks.length) add('right', 'link-nowhere', 78, `A link that goes nowhere: "${f.nowhereLinks[0]}".`);
  if (f.tapDidNothing) add('right', 'button-does-nothing', 86, `"${f.tapLabel ?? 'The main action'}" does nothing when tapped.`);
  if (f.pageErrors.length) add('right', 'page-error', 84, `The screen throws an error: ${f.pageErrors[0].slice(0, 90)}`);
  if (f.a11yCritical > 0) add('right', 'a11y-critical', Math.min(82, 62 + f.a11yCritical), `${plural(f.a11yCritical, 'critical accessibility finding')} (${f.a11yRules.join(', ')}).`);
  else if (f.a11ySerious > 0) add('right', 'a11y-serious', Math.min(60, 40 + f.a11ySerious), `${plural(f.a11ySerious, 'serious accessibility finding')} (${f.a11yRules.join(', ')}).`);

  return out.sort((a, b) => b.weight - a.weight);
}

export type Mark = 'pass' | 'fail' | 'n/m';
export interface Verdict {
  checks: Record<CheckId, Mark>;
  passAll: boolean;
  faults: Fault[];
  worst: Fault | null;
  /** a person must look: a measured number with no line saying how it was measured or how sure it is */
  review: string[];
  /** what could not be measured on this screen (never counted as a pass by silence: it is printed) */
  unmeasured: string[];
}

export function judge(f: ScreenFacts): Verdict {
  const faults = faultsOf(f);
  const checks = { clear: 'pass', finished: 'pass', fast: 'pass', right: 'pass' } as Record<CheckId, Mark>;
  for (const c of CHECKS) if (f.cannot?.[c]) checks[c] = 'n/m';
  for (const x of faults) checks[x.check] = 'fail';
  const review: string[] = [];
  if (f.numbers.length && !f.methodLine) review.push(`A measured number ("${f.numbers[0].text}") with no line saying how it was measured or how sure it is.`);
  const unmeasured: string[] = [];
  if (f.fcpMs == null) unmeasured.push('first content time');
  if (f.cls == null) unmeasured.push('layout shift');
  if (f.tapMs == null) unmeasured.push('tap response');
  for (const c of CHECKS) if (f.cannot?.[c]) unmeasured.push(`${CHECK_NAME[c]}: ${f.cannot[c]}`);
  for (const k of ['zoom200', 'font150'] as const) if (f.hscroll[k] == null) unmeasured.push(k === 'zoom200' ? '200 % zoom' : '150 % text');
  return { checks, passAll: CHECKS.every((c) => checks[c] === 'pass'), faults, worst: faults[0] ?? null, review, unmeasured };
}

/** Which kind a route is. `assumption:` a first sorting by route, for the 40-word rule only; each phase corrects its own. */
export function kindOf(route: string): ScreenKind {
  if (/^\/(terms|privacy|purchase-terms|store-terms|coach-terms|credits|links|media-kit|press|team|kitchens|story|support|learn|education|guidance|camp|screen\/privacy|work-with-us|guardian\/report)(\/|$)/.test(route)) return 'read';
  if (/^\/(|play|train|profile|account|store|shop|modes|coach|cards|market|closet|wallet|squads|groups|multiplayer|arena|ladder|venues|live|create|creator|teach|train\/(library|programs|progress)|coach\/(dashboard|admin|business)|admin\/[a-z]+|sessions|signature|party|welcome|studio)$/.test(route)) return 'hub';
  return 'do';
}
