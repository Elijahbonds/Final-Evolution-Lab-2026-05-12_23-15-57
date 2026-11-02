// MIRROR-TRUST-RATING UI (MT-19, MT-20, and MT-13's display cap): the chip beside each check card's band, its one reason
// line for Medium and Low, the card's aria-label, the info line, and the jump: Low hides the inches. Kids: unchanged.
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResultsView } from '@/app/play/mirror/assess/_components/results-view';
import { JumpResult } from '@/app/play/mirror/assess/_components/jump-result';
import { KidResults } from '@/app/play/mirror/assess/_components/kid-results';
import { BAND_COLOUR, TRUST_COLOUR } from '@/app/play/mirror/assess/_components/screen-ui';
import { quickCapture, replay } from '@/lib/assess/replay';
import { aboutInches } from './jump';
import { summarizeWithTrust, type ScreenSummary } from './checks';
import { checkById } from './PROPOSED-thresholds';
import { TRUST_INFO_LINE, TRUST_REASON_LINES, TRUST_WORDS, SCREEN_TEST_NAMES } from './copy';
import type { MeasureTrust, TrustLevel, TrustReason } from './trust';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }) }));

const BASE = summarizeWithTrust(replay(quickCapture({ fps: 60 })))!;
/** The base summary with every row of a test set to one level and reasons. */
function setTest(s: ScreenSummary, test: 'T1' | 'T2' | 'T3' | 'T5', level: TrustLevel, reasons: TrustReason[]): ScreenSummary {
  return { ...s, trust: s.trust!.map((r): MeasureTrust => (r.id !== 'jump.height' && checkById(r.id).test === test ? { ...r, level, reasons } : r)) };
}
function setJump(s: ScreenSummary, level: TrustLevel, reasons: TrustReason[]): ScreenSummary {
  return { ...s, trust: s.trust!.map((r) => (r.id === 'jump.height' ? { ...r, level, reasons } : r)) };
}
const html = (s: ScreenSummary, age: '18+' | 'under-13' | '13-17' | 'unknown' = '18+') =>
  renderToStaticMarkup(createElement(ResultsView, { summary: s, age, onClear: () => {}, onRunAgain: () => {} }));
const card = (h: string, test: string) => h.slice(h.indexOf(`data-check-card="${test}"`), h.indexOf('</li>', h.indexOf(`data-check-card="${test}"`)));
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;');
const rx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('MT-19: each check card carries its trust', () => {
  const S = setTest(setTest(BASE, 'T2', 'medium', ['wrongView']), 'T3', 'low', ['lowVisibility', 'dim', 'cutOff']);
  const h = html(S);
  it('data-trust with the right word on every card; High adds no reason line', () => {
    expect(card(h, 'T1')).toContain('data-trust="high"');
    expect(text(card(h, 'T1'))).toContain(TRUST_WORDS.high);
    expect(card(h, 'T1')).not.toContain('data-trust-reason');
    expect(card(h, 'T2')).toContain('data-trust="medium"');
    expect(card(h, 'T3')).toContain('data-trust="low"');
  });
  it('Medium and Low render one data-trust-reason line with the copy; only the first two reasons show (all are kept)', () => {
    expect(text(card(h, 'T2'))).toContain(`${TRUST_WORDS.medium}: ${TRUST_REASON_LINES.wrongView}.`);
    const low = text(card(h, 'T3'));
    expect(low).toContain(`${TRUST_WORDS.low}: ${TRUST_REASON_LINES.lowVisibility}; ${TRUST_REASON_LINES.dim}.`);
    expect(low).not.toContain(TRUST_REASON_LINES.cutOff);
    expect(card(h, 'T3').match(/data-trust-reason/g)).toHaveLength(1);
    expect(S.trust!.find((r) => r.id === 'sls.kneeCave')!.reasons).toHaveLength(3);
  });
  it('the aria-label appends the trust word; the trust chip sits right after the band chip', () => {
    for (const [test, lvl] of [['T1', 'high'], ['T2', 'medium'], ['T3', 'low']] as const) {
      expect(h).toMatch(new RegExp(`data-check-card="${test}"[^>]*aria-label="${rx(esc(SCREEN_TEST_NAMES[test]))}: [a-z ]+, ${TRUST_WORDS[lvl]}"`));
      const c = card(h, test);
      expect(c.indexOf('data-trust=')).toBeGreaterThan(c.indexOf('data-band='));
      expect(c.slice(c.indexOf('data-band='), c.indexOf('data-trust=')).match(/data-check-row|data-cue/)).toBeNull();
    }
  });
  it('Low is grey and Medium amber, never the Red band\'s colour; the info line sits above "Your checks"', () => {
    expect(TRUST_COLOUR).toEqual({ high: BAND_COLOUR.green, medium: BAND_COLOUR.yellow, low: BAND_COLOUR.unread });
    expect(TRUST_COLOUR.low).not.toBe(BAND_COLOUR.red);
    expect(h.indexOf(esc(TRUST_INFO_LINE))).toBeGreaterThan(-1);
    expect(h.indexOf(esc(TRUST_INFO_LINE))).toBeLessThan(h.indexOf('Your checks'));
  });
  it('a summary without trust (an old tab) renders no chip and no info line', () => {
    const { trust: _t, ...old } = BASE; void _t;
    const o = html(old);
    expect(o).not.toContain('data-trust');
    expect(o).not.toContain(esc(TRUST_INFO_LINE));
  });
});

describe('MT-20: the jump', () => {
  const inches = (s: ScreenSummary) => esc(aboutInches(s.jumpBestIn!));
  it('results: a Low jump hides the inches and shows the reason; Medium shows the number with the caution', () => {
    const low = setJump(BASE, 'low', ['jumpFpsLow']);
    const pb = (h: string) => h.slice(h.indexOf('data-personal-best'), h.indexOf('</section>', h.indexOf('data-personal-best')));
    expect(pb(html(low))).not.toContain(inches(low));
    expect(text(pb(html(low)))).toContain(`${TRUST_WORDS.low}: ${TRUST_REASON_LINES.jumpFpsLow}.`);
    const med = setJump(BASE, 'medium', ['under240']);
    expect(pb(html(med))).toContain(inches(med));
    expect(text(pb(html(med)))).toContain(`${TRUST_WORDS.medium}: ${TRUST_REASON_LINES.under240}.`);
    expect(pb(html(med)).indexOf('data-trust=')).toBeGreaterThan(pb(html(med)).indexOf(inches(med)));
  });
  const jr = (kid: boolean, trust: { level: TrustLevel; reasons: TrustReason[] } | null) =>
    renderToStaticMarkup(createElement(JumpResult, { heightCm: 50, plusMinusCm: 3, attempts: 3, kid, jumpIn: 19.7, lastIn: null, onFull: () => {}, onAgain: () => {}, trust }));
  it('the adult jump-only view: the chip under the number; Low hides the number and shows the reason', () => {
    const med = jr(false, { level: 'medium', reasons: ['under240'] });
    expect(med).toContain('data-jump-number');
    expect(med.indexOf('data-trust="medium"')).toBeGreaterThan(med.indexOf('data-jump-number'));
    expect(text(med)).toContain(TRUST_REASON_LINES.under240);
    const low = jr(false, { level: 'low', reasons: ['jumpFpsLow'] });
    expect(low).not.toContain('data-jump-number');
    expect(low).toContain('data-jump-trust-hidden');
    expect(text(low)).toContain(`${TRUST_WORDS.low}: ${TRUST_REASON_LINES.jumpFpsLow}.`);
    expect(jr(false, null)).not.toContain('data-trust');
  });
  it('the kid views render byte-identical markup with or without trust', () => {
    for (const lvl of ['high', 'medium', 'low'] as const) expect(jr(true, { level: lvl, reasons: lvl === 'high' ? [] : ['dim'] })).toBe(jr(true, null));
    const { trust: _t, ...old } = BASE; void _t;
    for (const age of ['under-13', '13-17', 'unknown'] as const) {
      expect(html(setJump(BASE, 'low', ['jumpFpsLow']), age)).toBe(html(old, age));
      expect(html(BASE, age)).toBe(renderToStaticMarkup(createElement(KidResults, { jumpIn: BASE.jumpBestIn, lastIn: null, onRunAgain: () => {} })));
    }
  });
});
