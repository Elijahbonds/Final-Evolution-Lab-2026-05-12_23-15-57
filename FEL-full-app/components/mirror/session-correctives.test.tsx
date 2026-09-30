// What one press/row set earns, under its summary in the Mirror (MIRROR-COACH P9, 2026-09-30). A server render is the
// card's first paint, so it is pinned here without a DOM: an adult's drifting set shows the release first and the band
// drills with their breath; a clean set says so; a youth athlete sees why there is nothing, and nothing else; and the
// picker beside the pattern tabs is an adult's only.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CorrectivesPicker, SessionCorrectives, sentence } from './session-correctives';
import { CORRECTIVES_YOUTH_OFF, type SetSummaryLike } from '@/lib/mirror/correctives';
import { CORRECTIVE_CAUTION } from '@/lib/babylon/nexus/neuro-mirror/rules/rnt-breath';
import type { YouthGate } from '@/lib/mirror/screenCorrectives';

const MIN = 60_000;
const drifted: SetSummaryLike = {
  durationMs: 2 * MIN, reps: 12, avgTempo: { pullSec: 1.5, pressSec: 1.5 },
  faultCounts: { rib_thoracic: 8, lumbo_pelvic: 8, posterior_chain: 6, lat_rhomboid: 6, upper_traps: 5 },
  timeInStableMs: { rib_thoracic: 20_000, lumbo_pelvic: 20_000, posterior_chain: 30_000, lat_rhomboid: 30_000, upper_traps: 40_000 },
};
const clean: SetSummaryLike = { ...drifted, faultCounts: {}, timeInStableMs: {} };
const render = (summary: SetSummaryLike, youth?: YouthGate) =>
  renderToStaticMarkup(createElement(SessionCorrectives, youth === undefined ? { summary } : { summary, youth }));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ');

describe('after a press/row set', () => {
  it('an adult who drifted: the release first (centre-out), then one band drill per signal, then the retest', () => {
    const html = render(drifted, null);
    expect([...html.matchAll(/data-release-zone="(\w+)"/g)].map((m) => m[1])).toEqual(['lat_rhomboid', 'upper_traps']);
    expect([...html.matchAll(/data-band="(\w+)"/g)].map((m) => m[1]).sort()).toEqual(['elbowPath', 'shoulderRise', 'trunkShift']);
    expect(html.indexOf('data-release')).toBeLessThan(html.indexOf('data-band'));
    const t = text(html);
    expect(t).toContain('The camera read your shoulders drifting sideways off your hips, seen from the front (estimated).');
    expect(t).toContain('Think: Keep your belt buckle pointed at the camera while the band pulls.');
    expect(t).toMatch(/Breath: .* \(in \d\.\ds, out \d\.\ds\)\./);
    expect(t).toMatch(/repeat the same set in the Mirror/);
    expect(t).toContain(CORRECTIVE_CAUTION);
    expect(html).toContain('href="/play/mirror/correctives"');
    // no double full stops from joining the written lines
    expect(t).not.toMatch(/\.\./);
  });

  it('an adult with a clean set: nothing to correct, said specifically', () => {
    const html = render(clean, null);
    expect(html).toContain('data-correctives-clean');
    expect(text(html)).toContain('Nothing to correct from 12 reps');
    expect(html).not.toContain('data-band');
    expect(html).not.toContain('data-release');
  });

  it('youth rules — a minor, no birth year, and the card\'s own default — show only why', () => {
    for (const [youth, key] of [['minor', 'minor'], ['unknownAge', 'unknownAge'], [undefined, 'unknownAge']] as const) {
      const html = render(drifted, youth);
      expect(text(html)).toContain(text(CORRECTIVES_YOUTH_OFF[key]).trim());
      expect(html).not.toContain('data-band');
      expect(html).not.toContain('data-release');
      expect(html).not.toContain('Release first');
      expect(html).not.toContain('href=');   // no way into a page that is off for them either
    }
  });
});

// MIRROR-COACH P9 fix (2026-09-30, code review)
describe('P9 fix: thin sets and band-only sets', () => {
  it('a 0-rep set (set-up noise) and a 2-rep set: no drill, no release — the card says the set was too short to read', () => {
    for (const reps of [0, 2]) {
      const html = render({ durationMs: 8_000, reps, avgTempo: null, timeInStableMs: {}, faultCounts: { rib_thoracic: 1, lumbo_pelvic: 1, posterior_chain: 1, lat_rhomboid: 1, upper_traps: 1 } }, null);
      expect(html).toContain('data-correctives-thin');
      expect(text(html)).toContain(`(that set counted ${reps})`);
      expect(html).not.toContain('data-band');
      expect(html).not.toContain('data-release');
      expect(html).not.toContain('data-retest');
    }
  });

  it('a trunk-drift-only set: the band drill, then "Run the band drill…" — never "go straight back in" under it', () => {
    const html = render({ ...drifted, faultCounts: { rib_thoracic: 8, lumbo_pelvic: 8 }, timeInStableMs: { rib_thoracic: 20_000, lumbo_pelvic: 20_000 } }, null);
    expect([...html.matchAll(/data-band="(\w+)"/g)].map((m) => m[1])).toEqual(['trunkShift']);
    expect(html).not.toContain('data-release');
    const t = text(html);
    expect(t).toContain('Run the band drill, then repeat the same set in the Mirror.');
    expect(t).not.toMatch(/Nothing to release|go straight back in/);
    expect(html.indexOf('data-band')).toBeLessThan(html.indexOf('data-retest'));
  });
});

describe('the picker beside the pattern tabs', () => {
  it('an adult sees the three correctives, each a link into the page', () => {
    const html = renderToStaticMarkup(createElement(CorrectivesPicker, { youth: null }));
    expect([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual([
      '/play/mirror/correctives#band-drills', '/play/mirror/correctives#release', '/play/mirror/correctives#program',
    ]);
  });

  it('youth rules and the default: no picker', () => {
    expect(renderToStaticMarkup(createElement(CorrectivesPicker, { youth: 'minor' }))).toBe('');
    expect(renderToStaticMarkup(createElement(CorrectivesPicker, { youth: 'unknownAge' }))).toBe('');
    expect(renderToStaticMarkup(createElement(CorrectivesPicker, {}))).toBe('');
  });
});

describe('sentence', () => {
  it('keeps a line\'s own full stop and adds one when it has none', () => {
    expect(sentence('Hold it.')).toBe('Hold it.');
    expect(sentence('Hold it')).toBe('Hold it.');
    expect(sentence(' Why? ')).toBe('Why?');
  });
});
