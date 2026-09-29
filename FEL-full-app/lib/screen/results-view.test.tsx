// The results screen and the lane page, server-rendered (the first paint), no DOM (SCREEN-SHIP gates 3 and 6, A2-5,
// A3-2, A3-4, A4-2..A4-4). Every card: an icon, a word and a colour; the disclaimer and "PROPOSED · preview" first;
// exactly two CTAs, filled then outlined, then the screenshot line and "Done, clear my results".
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResultsView } from '@/app/play/mirror/assess/_components/results-view';
import { LaneBody } from '@/app/screen/program/[lane]/program-lane';
import { NotSavedCard } from '@/app/play/mirror/assess/_components/not-saved';
import { gradeSession } from '@/lib/assess/runner';
import { cmj, kneeWall, ohsFront, ohsSide, singleLegSquat, syntheticCalibration } from '@/lib/assess/replay';
import { summarize, type ScreenSummary } from './checks';
import { BAND_WORDS, GRADED_CHECKS, PROVISIONAL_LABEL, THRESHOLDS_VERSION } from './PROPOSED-thresholds';
import { BRAIN_BRAWL, BUILD_PROGRAM, DISCLAIMER, DONE_CLEAR, NOT_SAVED_TITLE, PROGRAM_COMING, SCREENSHOT_LINE, WIN_LINE } from './copy';
import { screenNextRoute } from './config';

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
const html = (s: ScreenSummary, o: { next?: string; expanded?: boolean } = {}) =>
  renderToStaticMarkup(createElement(ResultsView, { summary: s, nextRoute: o.next ?? screenNextRoute(undefined), onClear: () => {}, expanded: o.expanded ?? true }));
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const attrs = (h: string, re: RegExp) => [...h.matchAll(re)].map((m) => m[1]);

describe('gate 3: one card per check, icon + word + colour, never colour alone', () => {
  it('every graded check has a card with an icon, a band word and a colour token', () => {
    const h = html(FLAGGED);
    const cards = h.split('data-check-card="').slice(1);
    expect(cards.map((c) => c.slice(0, c.indexOf('"')))).toEqual(GRADED_CHECKS.map((c) => c.id));
    for (const c of cards) {
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

  it('the "not a medical exam" line comes first, then "PROPOSED · preview"', () => {
    const h = html(FLAGGED);
    const t = text(h);
    expect(t.trim().startsWith(DISCLAIMER)).toBe(true);
    expect(t.indexOf(PROVISIONAL_LABEL)).toBeGreaterThan(0);
    expect(t.indexOf(PROVISIONAL_LABEL)).toBeLessThan(t.indexOf('Your top'));
  });
});

describe('the priorities and the win card (A4-4)', () => {
  it('a flagged screen: the top 1–2, Red first, each with ONE drill cue marked PROPOSED and a demo slot', () => {
    const h = html(FLAGGED);
    const ids = attrs(h, /data-priority="([^"]+)"/g);
    expect(ids.length).toBeGreaterThanOrEqual(1);
    expect(ids.length).toBeLessThanOrEqual(2);
    expect(ids[0]).toBe('ohs.kneeCave');
    for (const id of ids) {
      const card = h.slice(h.indexOf(`data-priority="${id}"`)).split('</article>')[0];
      expect(card.match(/data-cue/g)).toHaveLength(1);
      expect(card).toContain('PROPOSED');
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

describe('the end of the results (A3-2, A4-2, gate 6)', () => {
  it('exactly two CTAs: FILLED "Build my Dunk Program", then OUTLINED Brain Brawl directly under it; then the screenshot line and Done', () => {
    const h = html(FLAGGED);
    const ctas = [...h.matchAll(/<(?:a|button)[^>]*data-cta="([^"]+)"[^>]*data-variant="([^"]+)"/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(ctas).toEqual(['program:filled', 'game:outlined']);
    const at = (s: string) => h.indexOf(s);
    expect(at('data-cta="program"')).toBeLessThan(at('data-cta="game"'));
    expect(at('data-cta="game"')).toBeLessThan(at('data-screenshot-line'));
    expect(at('data-screenshot-line')).toBeLessThan(at('data-done-clear'));
    const t = text(h);
    expect(t).toContain(BUILD_PROGRAM);
    expect(t).toContain(BRAIN_BRAWL);
    expect(t).toContain(SCREENSHOT_LINE);
    expect(t).toContain(DONE_CLEAR);
    // nothing after Done
    expect(h.slice(at('data-done-clear')).match(/<a |<button/g)).toBeNull();
  });

  it('the program link carries only the lane; one link for one lane', () => {
    const h = html(FLAGGED);
    expect(attrs(h, /href="(\/screen\/program\/[^"]*)"/g)).toEqual(['/screen/program/correctives']);
  });

  it('the game button: the Brain Brawl route by default, an override when set, the default for an outside URL', () => {
    const game = (h: string) => /<a[^>]*data-cta="game"[^>]*>/.exec(h)![0].match(/href="([^"]+)"/)![1];
    expect(game(html(FLAGGED))).toBe('/play/brain-brawl');
    expect(game(html(FLAGGED, { next: screenNextRoute('/try') }))).toBe('/try');
    expect(game(html(FLAGGED, { next: screenNextRoute('https://evil.example') }))).toBe('/play/brain-brawl');
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

describe('the lane page (A3-4, A4-3)', () => {
  const lane = (s: ScreenSummary, flag?: string) => renderToStaticMarkup(createElement(LaneBody, { lane: s.lane!, s, signupFlag: flag }));

  it('in order: the lane header card, the top flag line, the drill marked PROPOSED, "coming soon", then Back', () => {
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
    expect(h.slice(at('data-sample-drill')).split('</section>')[0]).toContain('PROPOSED');
    expect(t).toContain(PROGRAM_COMING);
    expect(t).toContain('Back to my results');
    expect(h).toMatch(/href="\/play\/mirror\/assess\/results"/);
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
