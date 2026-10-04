// The results screen and the lane page, server-rendered (the first paint), no DOM (SCREEN-SHIP gates 3 and 6, A2-5,
// A3-2, A3-4, A4-2..A4-4; SCREEN-FIX S-4, S-7, S-9, Cyber 3; SCREEN-FIX-2 items 3–4 and retest 1 L5, S-4, S-10, S-13).
// 18 or older: the "not a medical exam" line ONCE, "Early version", one card per check (the four the start card lists),
// each with an icon, a word and a colour; exactly ONE next step, the Kindle book; then the screenshot line and "Done,
// clear my results". Under 18 or "rather not say": their own number only (lib/screen/kid-path.test.tsx has the rest).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResultsView, checkCards } from '@/app/play/mirror/assess/_components/results-view';
import { LaneBody, ProgramLaneView } from '@/app/screen/program/[lane]/program-lane';
import { NotSavedCard } from '@/app/play/mirror/assess/_components/not-saved';
import { gradeSession } from '@/lib/assess/runner';
import { cmj, kneeWall, ohsFront, ohsSide, singleLegSquat, syntheticCalibration } from '@/lib/assess/replay';
import { summarize, type ScreenSummary } from './checks';
import { BAND_WORDS, GRADED_CHECKS, THRESHOLDS_VERSION } from './PROPOSED-thresholds';
import { AGE_BANDS, type AgeBand } from './age';
import {
  DISCLAIMER, DONE_CLEAR, EARLY_VERSION, KINDLE_BOOK_LABEL, KINDLE_BOOK_URL, NOT_SAVED_TITLE, NOTHING_TO_RANK, PARENT_TITLE,
  PROGRAM_COMING, SCREENSHOT_LINE, SCREEN_TEST_NAMES, STOP_LINE, WIN_LINE,
} from './copy';

const cal = syntheticCalibration();
const session = (o: { kneeInL?: number; tibiaR?: number; dimT5?: boolean } = {}) => {
  const r = gradeSession({
    calibration: cal, T1: { front: ohsFront({ kneeInL: o.kneeInL ?? 0 }).frames, side: ohsSide().frames },
    T2: { left: kneeWall('left').frames, right: kneeWall('right', { tibiaMax: o.tibiaR ?? 44 }).frames },
    T3: { left: singleLegSquat('left').frames, right: singleLegSquat('right').frames },
    T5: cmj([0, 1, 2].map(() => ({ heightM: 0.42 }))).frames,
  });
  if (o.dimT5) r.tests[3] = { ...r.tests[3], status: 'notScored', sides: {}, score100: null, score03: null };
  return summarize(r)!;
};
const CLEAN = session();
const FLAGGED = session({ kneeInL: 0.06, tibiaR: 38.5 });
const html = (s: ScreenSummary, o: { age?: AgeBand | null } = {}) =>
  renderToStaticMarkup(createElement(ResultsView, { summary: s, age: o.age === undefined ? '18+' : o.age, onClear: () => {}, onRunAgain: () => {} }));
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const attrs = (h: string, re: RegExp) => [...h.matchAll(re)].map((m) => m[1]);
/** Links a younger athlete must never get (Cyber 3, S-10). */
const FORBIDDEN_HREF = /href="\/(login|signup|account[^"]*|play\/brain-brawl[^"]*|try[^"]*|screen\/program[^"]*)"/;
/** "not a medical exam", in any wording. */
const medical = (h: string) => text(h).match(/medical exam/gi)?.length ?? 0;
/** The four checks the start card lists (S-4: one card each). */
const CHECKS = Object.keys(SCREEN_TEST_NAMES);

afterEach(() => { vi.unstubAllEnvs(); });

describe('gate 3 and S-4 (retest 1): one card per check, all shown; icon + word + colour, never colour alone', () => {
  it('CHANGED (retest 1 S-4): 14 cards → 4, one per check the start card lists; the priorities first, then check order', () => {
    expect(CHECKS).toEqual(['T1', 'T2', 'T3', 'T5']);
    const h = html(FLAGGED);
    const ids = attrs(h, /data-check-card="([^"]+)"/g);
    expect(ids).toHaveLength(4);                                       // was GRADED_CHECKS.length, 14
    expect([...ids].sort()).toEqual(CHECKS);
    expect(ids).toEqual(['T1', 'T2', 'T3', 'T5']);                     // T1 holds the Red knee cave, T2 the Yellow gap
    expect(attrs(h, /data-priority="([^"]+)"/g)).toEqual(['T1', 'T2']);
    expect(h).not.toContain('data-see-all');
    for (const c of h.split('data-check-card="').slice(1)) {
      expect(c).toMatch(/data-band-icon="(green|yellow|red|unread)"/);
      expect(c).toMatch(/data-band-word="?[^>]*>(Good to go|Worth working on|Priority to work on|Not read)</);
      expect(c).toMatch(/data-colour="(#00FF9D|#FFB020|#FF5A5F|rgba\(255,255,255,0\.55\))"/);
      expect(c).toMatch(/aria-label="[^"]+: (green|yellow|red|not read)"/);
    }
  });

  it('a card takes its worst row: Red or Yellow names the row behind it; Green only when every row is; unread never reads Green', () => {
    const cards = checkCards(FLAGGED);
    expect(cards.map((c) => [c.test, c.band, c.row?.id ?? null, c.top])).toEqual([
      ['T1', 'red', 'ohs.kneeCave', true], ['T2', 'yellow', 'ktw.lrGap', true], ['T3', 'green', null, false], ['T5', 'green', null, false],
    ]);
    expect(checkCards(CLEAN).every((c) => c.band === 'green' && !c.row && !c.top)).toBe(true);
    const unread: ScreenSummary = { ...CLEAN, checks: CLEAN.checks.map((c) => (c.id === 'jump.stiffLanding' ? { ...c, band: null } : c)) };
    expect(checkCards(unread).find((c) => c.test === 'T5')!.band).toBeNull();
    const h = html(FLAGGED);
    expect(text(h.slice(h.indexOf('data-check-card="T1"')).split('</li>')[0])).toContain('Knees cave in');
    expect(h).toContain('data-check-row="ohs.kneeCave"');
  });

  it('with the colour stripped, the words still say it', () => {
    const t = text(html(FLAGGED).replace(/style="[^"]*"/g, '').replace(/data-colour="[^"]*"/g, ''));
    expect(t).toContain(BAND_WORDS.red);
    expect(t).toContain(BAND_WORDS.green);
  });

  it('the "not a medical exam" line comes first, then the stop line, then "Early version" (no PROPOSED, no preview)', () => {
    const t = text(html(FLAGGED));
    expect(t.trim().startsWith(DISCLAIMER)).toBe(true);
    expect(t.indexOf(STOP_LINE)).toBeGreaterThan(0);
    expect(t.indexOf(EARLY_VERSION)).toBeGreaterThan(t.indexOf(STOP_LINE));
    expect(t.indexOf(EARLY_VERSION)).toBeLessThan(t.indexOf('Your checks'));
    expect(t).not.toMatch(/PROPOSED|preview/i);
  });
});

describe('S-13 (retest 1): "not a medical exam" shows ONCE per page, never stacked twice', () => {
  it('CHANGED: the stop line keeps only "If anything hurts, stop." (was "Not a medical exam. If anything hurts, stop.")', () => {
    expect(STOP_LINE).toBe('If anything hurts, stop.');
    expect(DISCLAIMER).toBe('This is a free movement check, not a medical exam.');
  });

  it('once on the results (every age, every kind of screen), once on each program page, once on the not-saved card', () => {
    for (const s of [FLAGGED, CLEAN, session({ dimT5: true })]) for (const age of [...AGE_BANDS, null]) expect(medical(html(s, { age })), `${age}`).toBe(1);
    const unfinished = session({ dimT5: true });
    expect(medical(renderToStaticMarkup(createElement(LaneBody, { lane: 'correctives', s: FLAGGED })))).toBe(1);
    expect(medical(renderToStaticMarkup(createElement(LaneBody, { lane: 'correctives', s: unfinished })))).toBe(1);
    for (const age of [...AGE_BANDS, null]) {
      expect(medical(renderToStaticMarkup(createElement(ProgramLaneView, { lane: 'correctives', state: { s: FLAGGED, age } }))), `${age}`).toBe(1);
      expect(medical(renderToStaticMarkup(createElement(ProgramLaneView, { lane: 'correctives', state: { s: null, age } }))), `${age}/none`).toBe(1);
    }
    expect(medical(renderToStaticMarkup(createElement(NotSavedCard)))).toBe(1);
  });
});

describe('the priorities and the win card (A4-4)', () => {
  it('a flagged screen: the top 1–2 cards, Red first, each with ONE drill cue marked "Early version" and a demo slot', () => {
    const h = html(FLAGGED);
    const ids = attrs(h, /data-priority="([^"]+)"/g);
    expect(ids.length).toBeGreaterThanOrEqual(1);
    expect(ids.length).toBeLessThanOrEqual(2);
    expect(ids[0]).toBe('T1');                                         // was 'ohs.kneeCave': the card now names its check
    for (const id of ids) {
      const card = h.slice(h.indexOf(`data-check-card="${id}"`)).split('</li>')[0];
      expect(card.match(/data-cue/g)).toHaveLength(1);
      expect(card).toContain('data-top-priority');
      expect(card).toMatch(/data-early-tag[^>]*>Early version</);
      expect(card).toMatch(/data-demo-slot[^>]*>[\s\S]*Demo coming/);
    }
    expect(h).not.toContain('data-win-card');
  });

  it('the win card shows only on a real clean screen', () => {
    expect(CLEAN.clean).toBe(true);
    expect(text(html(CLEAN))).toContain(WIN_LINE);
    expect(html(FLAGGED)).not.toContain('data-win-card');
    const partial = session({ dimT5: true });
    expect(partial.clean).toBe(false);
    expect(html(partial)).not.toContain('data-win-card');
    const none: ScreenSummary = { ...CLEAN, checks: GRADED_CHECKS.map((c) => ({ id: c.id, band: null })), complete: false, clean: false, lane: null, priorities: [], topFlag: null };
    expect(html(none)).not.toContain('data-win-card');
    expect(text(html(none))).toContain(NOTHING_TO_RANK);
  });
});

describe('A2-5: hidden and TODO checks leave nothing behind', () => {
  it('no card, no "--", no "N of M" count, and nothing for the hidden landing weight shift', () => {
    for (const s of [CLEAN, FLAGGED, session({ dimT5: true })]) {
      const h = html(s);
      const t = text(h);
      expect(h).not.toContain('jump.landingWeightShift');
      expect(h).not.toContain('jump.height"');
      expect(t).not.toMatch(/landing weight shift|clear shift|slight shift/i);
      expect(t).not.toMatch(/--|—\s*\/|\b\d+\s*(of|\/)\s*\d+\b/);
      expect(attrs(h, /data-check-card="([^"]+)"/g)).toHaveLength(CHECKS.length);   // was GRADED_CHECKS.length
    }
  });

  it('the jump is a personal best for an adult, never a band word', () => {
    const h = html(CLEAN);
    const pb = h.slice(h.indexOf('data-personal-best')).split('</section>')[0];
    expect(text(pb)).toMatch(/Your best jump: \d+(\.\d)? in A personal best to beat next time\./);
    expect(pb).not.toMatch(/data-band|Good to go|Worth working on|Priority to work on/);
  });
});

describe('item 4 and L5 (retest 1): 18 or older get EXACTLY ONE next step, the Kindle book', () => {
  const links = (h: string) => [...h.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
  it('one next-step link: the book, byte for byte, a new tab, noopener noreferrer, no prefetch, no query', () => {
    for (const s of [FLAGGED, CLEAN, session({ dimT5: true })]) {
      const h = html(s);
      const step = h.slice(h.indexOf('data-next-step')).split('</div>')[0];
      const a = links(step);
      expect(a).toHaveLength(1);
      expect(a[0]).toContain(`href="${KINDLE_BOOK_URL}"`);
      expect(KINDLE_BOOK_URL).toBe('https://www.amazon.com/dp/B0H5J1M18H');
      expect(a[0]).toContain('target="_blank"');
      expect(a[0]).toContain('rel="noopener noreferrer"');
      expect(text(/<a\b[^>]*data-cta="book"[^>]*>([\s\S]*?)<\/a>/.exec(h)![1]).trim()).toBe(KINDLE_BOOK_LABEL);
      // every link on the results: the book, and the privacy page inside the screen; nothing else
      expect(attrs(h, /href="([^"]+)"/g)).toEqual([KINDLE_BOOK_URL, '/screen/privacy']);
      expect(h.match(/data-cta=/g)).toHaveLength(1);
    }
  });

  it('Train with Elijah is absent until the server passes a verified-adult href, and a kid never sees it', () => {
    const adult = renderToStaticMarkup(createElement(ResultsView, { summary: FLAGGED, age: '18+', onClear: () => {}, onRunAgain: () => {}, trainWithElijahHref: '/coach/elijah' }));
    expect(adult).toContain('data-train-with-elijah');
    expect(adult).toContain('Train with Elijah');
    const step = adult.slice(adult.indexOf('data-next-step')).split('</div>')[0];
    expect(step).not.toContain('Train with Elijah');
    const kid = renderToStaticMarkup(createElement(ResultsView, { summary: FLAGGED, age: '13-17', onClear: () => {}, onRunAgain: () => {}, trainWithElijahHref: '/coach/elijah' }));
    expect(kid).not.toContain('Train with Elijah');
  });

  it('Build my Dunk Program appears only when the lane is given a dunk href', () => {
    const plain = renderToStaticMarkup(createElement(LaneBody, { lane: 'dunking', s: FLAGGED }));
    expect(plain).not.toContain('Build my Dunk Program');
    expect(plain).toContain('data-coming-soon');
    const linked = renderToStaticMarkup(createElement(LaneBody, { lane: 'dunking', s: FLAGGED, dunkHref: '/coach/elijah/programs/dunking' }));
    expect(linked).toContain('Build my Dunk Program');
    const other = renderToStaticMarkup(createElement(LaneBody, { lane: 'posture', s: FLAGGED, dunkHref: '/coach/elijah/programs/dunking' }));
    expect(other).not.toContain('Build my Dunk Program');
  });

  it('CHANGED (L5): "Build my Dunk Program" and "Play the Dunk Game, free" are gone (was: exactly two CTAs, program then game)', () => {
    for (const s of [FLAGGED, CLEAN, session({ dimT5: true })]) {
      const h = html(s);
      expect(h).not.toMatch(/data-cta="(program|game)"/);
      expect(text(h)).not.toMatch(/Build my Dunk Program|Play the Dunk Game/);
      expect(h).not.toMatch(FORBIDDEN_HREF);
    }
  });

  it('the book, then the screenshot line, the privacy page and Done; nothing after Done', () => {
    const h = html(FLAGGED);
    const at = (s: string) => h.indexOf(s);
    expect(at('data-next-step')).toBeLessThan(at('data-screenshot-line'));
    expect(at('data-screenshot-line')).toBeLessThan(at('data-privacy-link'));
    expect(at('data-privacy-link')).toBeLessThan(at('data-done-clear'));
    const t = text(h);
    for (const w of [SCREENSHOT_LINE, DONE_CLEAR]) expect(t).toContain(w);
    expect(h.slice(at('data-done-clear')).match(/<a |<button/g)).toBeNull();
    expect(h).not.toContain('data-parent-card');
  });

  it('no snowboard, no coach link, no booking, no save button, no sign-up prompt, no email box, no form', () => {
    const t = text(html(FLAGGED)).toLowerCase();
    for (const w of ['snowboard', 'coach elijah', 'book a session', 'booking', 'sms:', 'save', 'sign up', 'sign-up', 'log in', 'login', 'waitlist', 'wait list']) expect(t, w).not.toContain(w);
    expect(html(FLAGGED)).not.toMatch(/sms:|tel:|NEXT_PUBLIC_COACH|<form|<input|type="email"/);
  });
});

describe('item 4: no waitlist form anywhere on the Quick Screen', () => {
  const ROOT = join(__dirname, '../..');
  const files = (): string[] => {
    const out: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f)) out.push(relative(ROOT, p));
      }
    };
    for (const d of ['app/screen', 'app/play/mirror/assess', 'lib/screen']) walk(join(ROOT, d));
    return out;
  };
  it.each(files())('%s: no <form, no email input, no POST or fetch to a sign-up or waitlist route', (f) => {
    const src = readFileSync(join(ROOT, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).not.toMatch(/<form\b|type=["'{]*email|inputMode=["']email/i);
    expect(src).not.toMatch(/\/api\/(signup|waitlist|subscribe|newsletter|join)|method:\s*['"]POST['"]|\bfetch\s*\(/i);
  });

  it('the program page\'s sign-up placeholder renders for NO flag value, "true" included (the page no longer reads the flag)', () => {
    for (const v of ['true', 'TRUE', '1', 'false', '']) {
      vi.stubEnv('NEXT_PUBLIC_PROGRAM_SIGNUP_ENABLED', v);
      for (const s of [FLAGGED, CLEAN]) {
        const h = renderToStaticMarkup(createElement(LaneBody, { lane: s.lane!, s }));
        expect(h, v).not.toMatch(/data-signup-placeholder|Sign-up opens|<input|<form|type="email"/);
      }
    }
    const src = readFileSync(join(__dirname, '../../app/screen/program/[lane]/program-lane.tsx'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).not.toMatch(/programSignupEnabled|NEXT_PUBLIC_PROGRAM_SIGNUP_ENABLED/);
  });
});

describe('item 3, Cyber 3, S-10: under 18 and "rather not say" get their number, never the cards or a link out', () => {
  const young = ['under-13', '13-17', 'unknown', null] as const;
  it.each(young)('%s: the kid view; no card, band, cue, CTA or link out; only the privacy page inside the screen', (age) => {
    for (const s of [FLAGGED, CLEAN, session({ dimT5: true })]) {
      const h = html(s, { age });
      expect(h).toContain('data-kid-results');
      expect(h).not.toMatch(/data-screen-results|data-check-card|data-band|data-cta=|data-personal-best|data-top-priority|data-cue/);
      expect(h).not.toMatch(FORBIDDEN_HREF);
      expect(h).not.toMatch(/type="email"|<form|<input/);
      expect(attrs(h, /href="([^"]+)"/g)).toEqual(['/screen/privacy']);
    }
  });

  it('S-10 (retest 1): a 13–17 result has no /try link and no link out of the screen', () => {
    const h = html(FLAGGED, { age: '13-17' });
    expect(h).not.toMatch(/href="\/try/);
    expect(attrs(h, /href="([^"]+)"/g).filter((x) => x !== '/screen/privacy')).toEqual([]);
  });

  it('18 or older get the book, not the kid view', () => {
    const h = html(FLAGGED, { age: '18+' });
    expect(h).not.toContain('data-kid-results');
    expect(h).toContain(`href="${KINDLE_BOOK_URL}"`);
  });
});

describe('the lane page (A3-4, A4-3; S-7, S-9, Cyber 3)', () => {
  const lane = (s: ScreenSummary) => renderToStaticMarkup(createElement(LaneBody, { lane: s.lane!, s }));
  const view = (age: AgeBand | null, s: ScreenSummary | null = FLAGGED) =>
    renderToStaticMarkup(createElement(ProgramLaneView, { lane: 'correctives', state: { s, age } }));

  it('in order: the lane header card, the top flag line, the drill marked "Early version", "coming soon", then Back', () => {
    const h = lane(FLAGGED);
    const at = (s: string) => h.indexOf(s);
    expect(at('data-lane-header')).toBeGreaterThan(0);
    expect(at('data-lane-header')).toBeLessThan(at('data-top-flag'));
    expect(at('data-top-flag')).toBeLessThan(at('data-sample-drill'));
    expect(at('data-sample-drill')).toBeLessThan(at('data-coming-soon'));
    expect(at('data-coming-soon')).toBeLessThan(at('data-back-to-results'));
    const t = text(h);
    expect(t).toContain('Your top flag: knees cave in (overhead squat), so start with Correctives.');
    expect(t).toContain('Band lateral walks, clamshells, goblet squat with knees pushed out');
    expect(h.slice(at('data-sample-drill')).split('</section>')[0]).toContain(EARLY_VERSION);
    expect(t).toContain(PROGRAM_COMING);
    expect(t).toContain('Back to my results');
    expect(h).toMatch(/href="\/play\/mirror\/assess\/results"/);
    expect(t).not.toMatch(/PROPOSED|preview/i);
  });

  it('S-7: no "From the draft\'s cue…" line under the drill', () => {
    for (const s of [FLAGGED, CLEAN]) expect(text(lane(s))).not.toMatch(/\bFrom the draft|the draft's/);
  });

  it('S-9: "If anything hurts, stop." on the finished page, the unfinished one, the not-saved card and the parent view', () => {
    expect(text(lane(FLAGGED))).toContain(STOP_LINE);
    const unfinished = session({ dimT5: true });
    expect(unfinished.lane).toBeNull();
    const u = renderToStaticMarkup(createElement(LaneBody, { lane: 'correctives', s: unfinished }));
    expect(text(u)).toContain(DISCLAIMER);
    expect(text(u)).toContain(STOP_LINE);
    expect(text(renderToStaticMarkup(createElement(NotSavedCard)))).toContain(STOP_LINE);
    expect(text(view('under-13'))).toContain(STOP_LINE);
    expect(text(view('under-13'))).toContain(DISCLAIMER);                 // ADDED (S-13): the parent view says it once too
  });

  it('a clean screen shows the win line instead of a flag', () => {
    expect(text(lane(CLEAN))).toContain(WIN_LINE);
  });

  it.each(AGE_BANDS)('CHANGED (item 3): the page for %s: only 18 or older see a lane (was 13 and older)', (age) => {
    vi.stubEnv('NEXT_PUBLIC_PROGRAM_SIGNUP_ENABLED', 'true');
    const h = view(age, FLAGGED);
    if (age !== '18+') {
      expect(h).toContain('data-parent-card');
      expect(text(h)).toContain(PARENT_TITLE);
      expect(h).not.toMatch(FORBIDDEN_HREF);
      expect(h).not.toMatch(/type="email"|<form|<input|data-signup-placeholder|data-lane-page/);
      expect(attrs(h, /href="([^"]+)"/g)).toEqual(['/play/mirror/assess/results']);
    } else {
      expect(h).toContain('data-lane-page="correctives"');
      expect(h).not.toContain('data-parent-card');
      expect(h).not.toContain('data-signup-placeholder');
    }
  });

  it('opened directly by a kid\'s tab with no result: the same card, never a lane', () => {
    for (const age of ['under-13', '13-17', 'unknown'] as const) {
      const h = view(age, null);
      expect(h).toContain('data-parent-card');
      expect(h).not.toMatch(/data-lane-page|data-not-saved/);
    }
    // a tab with no answer and no result: "not saved"
    expect(view(null, null)).toContain('data-not-saved');
  });

  it('the missing-session card: its words and a restart, never a lane', () => {
    const h = renderToStaticMarkup(createElement(NotSavedCard));
    expect(text(h)).toContain(NOT_SAVED_TITLE);
    expect(/<a[^>]*data-restart[^>]*>/.exec(h)![0]).toMatch(/href="\/play\/mirror\/assess"/);
    expect(h).not.toMatch(/screen\/program/);
  });

  it('the summary behind all of this is the PROPOSED version\'s', () => {
    expect(FLAGGED.thresholdsVersion).toBe(THRESHOLDS_VERSION);
  });
});
