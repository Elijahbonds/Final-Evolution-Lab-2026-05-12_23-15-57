// The results screen and the lane page, server-rendered (the first paint), no DOM (SCREEN-SHIP gates 3 and 6, A2-5,
// A3-2, A3-4, A4-2..A4-4; SCREEN-FIX S-1, S-4, S-7, S-9, Cyber 3). Every card: an icon, a word and a colour; the
// disclaimer, the stop line and "Early version" first; one card per check; 13 and older: exactly two CTAs, filled then
// outlined (the free game at /try); under 13: "Have a parent open this" and no link out; then the screenshot line and
// "Done, clear my results".
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResultsView } from '@/app/play/mirror/assess/_components/results-view';
import { LaneBody, ProgramLaneView } from '@/app/screen/program/[lane]/program-lane';
import { NotSavedCard } from '@/app/play/mirror/assess/_components/not-saved';
import { gradeSession } from '@/lib/assess/runner';
import { cmj, kneeWall, ohsFront, ohsSide, singleLegSquat, syntheticCalibration } from '@/lib/assess/replay';
import { summarize, type ScreenSummary } from './checks';
import { BAND_WORDS, GRADED_CHECKS, THRESHOLDS_VERSION } from './PROPOSED-thresholds';
import { AGE_BANDS, type AgeBand } from './age';
import {
  BUILD_PROGRAM, DISCLAIMER, DONE_CLEAR, EARLY_VERSION, FREE_GAME, NOT_SAVED_TITLE, PARENT_TITLE, PROGRAM_COMING, SCREENSHOT_LINE,
  STOP_LINE, WIN_LINE,
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
const html = (s: ScreenSummary, o: { age?: AgeBand | null; env?: string } = {}) =>
  renderToStaticMarkup(createElement(ResultsView, { summary: s, age: o.age === undefined ? '18+' : o.age, nextEnv: o.env, onClear: () => {} }));
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const attrs = (h: string, re: RegExp) => [...h.matchAll(re)].map((m) => m[1]);
/** Links a younger athlete must never get (Cyber 3). */
const FORBIDDEN_HREF = /href="\/(login|signup|account[^"]*|play\/brain-brawl[^"]*|try[^"]*|screen\/program[^"]*)"/;

describe('gate 3 and S-4: one card per check, all shown; icon + word + colour, never colour alone', () => {
  it('every graded check has exactly one card, shown without a toggle: the priorities first, then check order', () => {
    const h = html(FLAGGED);
    const ids = attrs(h, /data-check-card="([^"]+)"/g);
    expect([...ids].sort()).toEqual(GRADED_CHECKS.map((c) => c.id).sort());
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice(0, FLAGGED.priorities.length)).toEqual(FLAGGED.priorities);
    const rest = ids.slice(FLAGGED.priorities.length);
    expect(rest).toEqual(GRADED_CHECKS.map((c) => c.id).filter((id) => !FLAGGED.priorities.includes(id)));
    expect(h).not.toContain('data-see-all');
    for (const c of h.split('data-check-card="').slice(1)) {
      expect(c).toMatch(/data-band-icon="(green|yellow|red|unread)"/);
      expect(c).toMatch(/data-band-word="?[^>]*>(Good to go|Worth working on|Priority to work on|Not read)</);
      expect(c).toMatch(/data-colour="(#00FF9D|#FFB020|#FF5A5F|rgba\(255,255,255,0\.55\))"/);
      expect(c).toMatch(/aria-label="[^"]+: (green|yellow|red|not read)"/);
    }
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

describe('the priorities and the win card (A4-4)', () => {
  it('a flagged screen: the top 1–2 cards, Red first, each with ONE drill cue marked "Early version" and a demo slot', () => {
    const h = html(FLAGGED);
    const ids = attrs(h, /data-priority="([^"]+)"/g);
    expect(ids.length).toBeGreaterThanOrEqual(1);
    expect(ids.length).toBeLessThanOrEqual(2);
    expect(ids[0]).toBe('ohs.kneeCave');
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
    // hidden-only / nothing read: never clean
    const none: ScreenSummary = { ...CLEAN, checks: GRADED_CHECKS.map((c) => ({ id: c.id, band: null })), complete: false, clean: false, lane: null, priorities: [], topFlag: null };
    expect(html(none)).not.toContain('data-win-card');
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
      expect(attrs(h, /data-check-card="([^"]+)"/g)).toHaveLength(GRADED_CHECKS.length);
    }
  });

  it('the jump is a personal best, never a band word', () => {
    const h = html(CLEAN);
    const pb = h.slice(h.indexOf('data-personal-best')).split('</section>')[0];
    expect(text(pb)).toMatch(/Your best jump: \d+(\.\d)? in A personal best to beat next time\./);
    expect(pb).not.toMatch(/data-band|Good to go|Worth working on|Priority to work on/);
  });
});

describe('the end of the results, 13 and older (A3-2, A4-2, gate 6, S-1)', () => {
  it('exactly two CTAs: FILLED "Build my Dunk Program", then OUTLINED "Play the Dunk Game, free" directly under it; then the screenshot line and Done', () => {
    for (const age of ['18+', '13-17'] as const) {
      const h = html(FLAGGED, { age });
      const ctas = [...h.matchAll(/<(?:a|button)[^>]*data-cta="([^"]+)"[^>]*data-variant="([^"]+)"/g)].map((m) => `${m[1]}:${m[2]}`);
      expect(ctas, age).toEqual(['program:filled', 'game:outlined']);
      const at = (s: string) => h.indexOf(s);
      expect(at('data-cta="program"')).toBeLessThan(at('data-cta="game"'));
      expect(at('data-cta="game"')).toBeLessThan(at('data-screenshot-line'));
      expect(at('data-screenshot-line')).toBeLessThan(at('data-done-clear'));
      const t = text(h);
      expect(t).toContain(BUILD_PROGRAM);
      expect(t).toContain(FREE_GAME);
      expect(t).toContain(SCREENSHOT_LINE);
      expect(t).toContain(DONE_CLEAR);
      // nothing after Done
      expect(h.slice(at('data-done-clear')).match(/<a |<button/g)).toBeNull();
      expect(h).not.toContain('data-parent-card');
    }
  });

  it('the program link carries only the lane; one link for one lane', () => {
    const h = html(FLAGGED);
    expect(attrs(h, /href="(\/screen\/program\/[^"]*)"/g)).toEqual(['/screen/program/correctives']);
  });

  it('S-1: the game button opens /try signed out; an env override only when it is open to a guest', () => {
    const game = (h: string) => /<a[^>]*data-cta="game"[^>]*>/.exec(h)![0].match(/href="([^"]+)"/)![1];
    expect(game(html(FLAGGED))).toBe('/try');
    expect(game(html(FLAGGED, { env: '/try?src=screen' }))).toBe('/try?src=screen');
    expect(game(html(FLAGGED, { env: '/play/brain-brawl' }))).toBe('/try');
    expect(game(html(FLAGGED, { env: '/login' }))).toBe('/try');
    expect(game(html(FLAGGED, { env: 'https://evil.example' }))).toBe('/try');
  });

  it('no snowboard, no coach link, no booking, no save button, no sign-up prompt', () => {
    const t = text(html(FLAGGED)).toLowerCase();
    for (const w of ['snowboard', 'coach elijah', 'book a session', 'booking', 'sms:', 'save', 'sign up', 'sign-up', 'log in', 'login']) expect(t, w).not.toContain(w);
    expect(html(FLAGGED)).not.toMatch(/sms:|tel:|NEXT_PUBLIC_COACH/);
  });

  it('a screen with no pick: the program button is there but disabled, and says why', () => {
    const h = html(session({ dimT5: true }));
    expect(h).toMatch(/<button[^>]*disabled=""[^>]*data-cta="program"[^>]*data-variant="filled"/);
    expect(text(h)).toContain('Finish every check to get your program pick.');
  });
});

describe('Cyber 3: under 13 (and "rather not say") never gets a link out', () => {
  const young = ['under-13', 'unknown', null] as const;
  it.each(young)('%s: no link to a sign-in, an account, Brain Brawl, /try or the program; no email field; "Have a parent open this"', (age) => {
    for (const s of [FLAGGED, CLEAN, session({ dimT5: true })]) {
      const h = html(s, { age, env: '/try' });
      expect(h).not.toMatch(FORBIDDEN_HREF);
      expect(h).not.toMatch(/type="email"|<form|<input/);
      expect(h).not.toContain('data-cta=');
      expect(h).toContain('data-parent-card');
      expect(text(h)).toContain(PARENT_TITLE);
      // what is left to press: the privacy page and "Done, clear my results", both inside the screen
      expect(attrs(h, /href="([^"]+)"/g)).toEqual(['/screen/privacy']);
    }
  });

  it('13 and older get the links, not the card', () => {
    for (const age of ['13-17', '18+'] as const) {
      const h = html(FLAGGED, { age });
      expect(h).not.toContain('data-parent-card');
      expect(h).toMatch(/data-cta="game"[^>]*href="\/try"|href="\/try"[^>]*data-cta="game"/);
    }
  });
});

describe('the lane page (A3-4, A4-3; S-7, S-9, Cyber 3)', () => {
  const lane = (s: ScreenSummary, flag?: string) => renderToStaticMarkup(createElement(LaneBody, { lane: s.lane!, s, signupFlag: flag }));
  const view = (age: AgeBand | null, s: ScreenSummary | null = FLAGGED, flag?: string) =>
    renderToStaticMarkup(createElement(ProgramLaneView, { lane: 'correctives', state: { s, age }, signupFlag: flag }));

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

  it('S-9: "Not a medical exam. If anything hurts, stop." on the finished page, the unfinished one and the not-saved card', () => {
    expect(text(lane(FLAGGED))).toContain(STOP_LINE);
    const unfinished = session({ dimT5: true });
    expect(unfinished.lane).toBeNull();
    const u = renderToStaticMarkup(createElement(LaneBody, { lane: 'correctives', s: unfinished }));
    expect(text(u)).toContain(DISCLAIMER);
    expect(text(u)).toContain(STOP_LINE);
    expect(text(renderToStaticMarkup(createElement(NotSavedCard)))).toContain(STOP_LINE);
    expect(text(view('under-13'))).toContain(STOP_LINE);
  });

  it('a clean screen shows the win line instead of a flag', () => {
    expect(text(lane(CLEAN))).toContain(WIN_LINE);
  });

  it('sign-up flag off (unset): no email box, no form, no placeholder; "true": the inert placeholder only', () => {
    for (const f of [undefined, '', 'false']) {
      const h = lane(FLAGGED, f);
      expect(h).not.toMatch(/<input|<form|type="email"|data-signup-placeholder/);
    }
    const on = lane(FLAGGED, 'true');
    expect(on).toContain('data-signup-placeholder');
    expect(on).not.toMatch(/<input|<form|type="email"/);
  });

  it.each(AGE_BANDS)('the page for %s, with the sign-up flag ON', (age) => {
    const h = view(age, FLAGGED, 'true');
    if (age === 'under-13' || age === 'unknown') {
      expect(h).toContain('data-parent-card');
      expect(text(h)).toContain(PARENT_TITLE);
      expect(h).not.toMatch(FORBIDDEN_HREF);
      expect(h).not.toMatch(/type="email"|<form|<input|data-signup-placeholder|data-lane-page/);
      expect(attrs(h, /href="([^"]+)"/g)).toEqual(['/play/mirror/assess/results']);
    } else {
      expect(h).toContain('data-lane-page="correctives"');
      expect(h).not.toContain('data-parent-card');
    }
  });

  it('opened directly by an under-13 tab with no result: the same card, never a lane', () => {
    for (const age of ['under-13', 'unknown'] as const) {
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
