// MIRROR-COACH P6 (2026-09-29): the Today readiness card. No DOM in this runner (node environment), so the pieces are
// proved the way attention-panel.test.tsx proves its panel: a server render is the real first paint, the pure helper
// is called directly, and the wiring is read from the source.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { READINESS_API, ReadinessCheckInCard, ReadinessResult, ReadinessScales, toggleAnswer } from './readiness-checkin';
import { READINESS_ITEMS, READINESS_NOT_SCORED_LINE, readReadiness } from '@/lib/health/readiness';

afterEach(() => { vi.unstubAllGlobals(); });

function readSource(p = './readiness-checkin.tsx'): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:fs').readFileSync(new URL(p, import.meta.url), 'utf8');
}

describe('never blocks training', () => {
  it('the first paint (before its read returns) is NOTHING — no spinner, no gate in front of the session', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    expect(renderToStaticMarkup(createElement(ReadinessCheckInCard, { warmup: 'generated' }))).toBe('');
  });

  it('Today mounts it beside the session, not around it — the session card is a sibling, never a child', () => {
    const today = readSource('../../app/coach/_components/today-view.tsx');
    // MIRROR-COACH P6 (warm-up generator, 2026-09-29): the card now passes its read to the warm-up (`onRead`, as this
    // card's own header says it would), so the tag carries a prop; still a self-closing sibling in the same place
    // MIRROR-COACH P6 FIX (2026-09-29): and it is told what today's warm-up is (`warmup`, from lib/coach/cooldown.ts
    // todayWarmupKind), so it never promises a longer warm-up on a session that has none
    expect(today).toMatch(/<NextMorningFollowUps \/>\s*<ReadinessCheckInCard onRead=\{[^}]*\} warmup=\{todayWarmupKind\(today\.session\.exercises, today\.session\.kind\)\} \/>\s*<div className="fel-card/);
    // the hard-stop and no-program early returns come BEFORE the card: it only ever shows next to a real session
    expect(today.indexOf('if (data.hardStopped) return')).toBeLessThan(today.indexOf('<ReadinessCheckInCard '));   // the JSX tag, not the header comment's <ReadinessCheckInCard>
  });

  it('a failed read still offers the scales, and a failed save says the session is unaffected', () => {
    const src = readSource();
    expect(src).toMatch(/\.catch\(\(\) => \{ if \(!cancelled\) \{ publish\(readReadiness\(null\)\); setPhase\('ask'\); \} \}\)/);
    expect(src).toMatch(/Your session below isn’t affected/);
  });
});

describe('the scales — four taps, every one optional', () => {
  const html = renderToStaticMarkup(createElement(ReadinessScales, { answers: { sleep: 2 }, onPick: () => {} }));

  it('renders the four questions in card order, five buttons each, words at both ends', () => {
    for (const item of READINESS_ITEMS) {
      expect(html).toContain(`data-readiness-item="${item.id}"`);
      expect(html).toContain(item.prompt);
      expect(html).toContain(item.anchors[1]);
      expect(html).toContain(item.anchors[5]);
    }
    expect(html.match(/<button/g)).toHaveLength(20);
  });

  it('marks the picked value pressed and nothing else', () => {
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="How did you sleep? 2 of 5"');
  });

  it('tapping the picked value again clears it (optional right up to Save)', () => {
    expect(toggleAnswer({ sleep: 2 }, 'sleep', 2)).toEqual({ sleep: null });
    expect(toggleAnswer({ sleep: 2 }, 'sleep', 4)).toEqual({ sleep: 4 });
    expect(toggleAnswer({}, 'mood', 1)).toEqual({ mood: 1 });
  });
});

describe('after a save — the server’s level, said for what today’s warm-up really is', () => {
  // MIRROR-COACH P6 FIX (2026-09-29, code review): this test pinned "about N minutes" on every card. The review's trace:
  // a Mirror-prescribed athlete (the coach's Prep) tapping "Rough" sleep read "your warm-up runs 4 minutes longer" and
  // "about 14 minutes" while nothing changed. No minutes now; the line follows the session.
  it('FEL\'s warm-up: says it is set longer and gentler, and names no minutes', () => {
    const r = readReadiness({ sleep: 1, soreness: 5 });
    const html = renderToStaticMarkup(createElement(ReadinessResult, { read: r, warmup: 'generated' }));
    expect(html).toContain('data-readiness-level="low"');
    expect(html).toContain('Running low today, so the warm-up below is set longer and gentler');
    expect(html).not.toMatch(/\d+ min/);
  });

  it('a coach-Prep session or an off day: no promise about a longer warm-up — the coach\'s Prep runs as written', () => {
    const r = readReadiness({ sleep: 1 });
    for (const warmup of ['coach', 'none'] as const) {
      const html = renderToStaticMarkup(createElement(ReadinessResult, { read: r, warmup }));
      expect(html, warmup).toContain('Running low today');
      expect(html, warmup).not.toMatch(/longer|\d+ min|warm-up below/);
      expect(html, warmup).toContain(`data-warmup-kind="${warmup}"`);
    }
  });
});

describe('wiring (source)', () => {
  const src = readSource();

  it('says on its face that it is not scored', () => {
    expect(src).toContain('READINESS_NOT_SCORED_LINE');
    expect(READINESS_NOT_SCORED_LINE).toMatch(/not scored/i);
  });

  it('posts to its own route and nowhere else; imports nothing that scores, pays or counts a streak', () => {
    expect(READINESS_API).toBe('/api/health/readiness');
    const fetches = [...src.matchAll(/fetch\(([^,)]+)/g)].map((m) => m[1].trim());
    expect(fetches.length).toBeGreaterThan(0);
    for (const f of fetches) expect(f).toMatch(/^`?\$?\{?endpoint/);
    for (const bad of ['wallet', 'prq', 'session-payout', 'api/sessions', 'streak', 'analytics', 'track(']) expect(src.toLowerCase(), bad).not.toContain(bad);
  });

  it('a skip sends nothing — it is a local, per-day flag', () => {
    const skip = /const skip = \(\) => \{([^}]*)\}/.exec(src)![1];
    expect(skip).not.toMatch(/fetch/);
    expect(skip).toMatch(/writeSkip\(date, true\)/);
  });

  it('every storage access is wrapped (private windows and blocked storage must not break Today)', () => {
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    const uses = (code.match(/localStorage\./g) ?? []).length;
    // the text between each `try {` and its `} catch`, where every storage call has to sit
    const inTry = [...code.matchAll(/try \{([\s\S]*?)\} catch/g)].reduce((n, m) => n + (m[1].match(/localStorage\./g) ?? []).length, 0);
    expect(uses).toBeGreaterThan(0);
    expect(inTry).toBe(uses);
  });

  it('the two consent 412s reuse the pain chip’s own notices — one wording each', () => {
    expect(src).toMatch(/import \{ GuardianLockedNotice, HealthConsentLockedNotice \} from '@\/components\/coach\/pain-checkin'/);
    expect(src).toMatch(/'health_data_consent_required'/);
    expect(src).toMatch(/'guardian_consent_required'/);
  });

  it('the read travels in memory only: the answers never go in the URL', () => {
    const urlFetch = /fetch\(`\$\{endpoint\}\?([^`]*)`/.exec(src)![1];
    expect(urlFetch).toBe('date=${encodeURIComponent(date)}');
  });
});
