// VERTICAL-EASY (2026-10-27): ONE front door, "Measure my vertical", one tap from Play (the signed-in home), the signed-out
// landing and Train; every jump CTA uses its name; the jump alone asks no take-off foot. Pure (source and data reads).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JUMP_CHECK_HREF, MEASURE_VERTICAL_HREF } from '@/lib/vertical/door';
import { JUMP_CHECK, MEASURE_VERTICAL, MEASURE_VERTICAL_LINE } from '@/lib/vertical/copy';
import { EN } from '@/lib/i18n';
import { JUMP_CHECK_HREF as DRILL_HREF } from '@/lib/daily-drill/copy';
import { JUMP_CHECK_HREF as TILE_HREF } from '@/lib/profile-v2/tiles';
import { REP_METRICS } from '@/lib/social/challenge-terms';
import { ASSESS_PATH } from '@/lib/screen/routes';
import { preStep, PRE_START, type PreEvent } from '@/lib/screen/flow';

const ROOT = join(__dirname, '../..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('one front door', () => {
  it('is the Quick Screen\'s arms-free jump run; the links that read the server\'s jump rows keep the hands-on-hips check', () => {
    expect(MEASURE_VERTICAL_HREF).toBe(`${ASSESS_PATH}?run=vertical`);
    expect(JUMP_CHECK_HREF).toBe(`${ASSESS_PATH}?run=jump`);
    // the profile tile, the daily drill and a challenge read the hands-on-hips series: they link its check, by one name
    expect(DRILL_HREF).toBe(JUMP_CHECK_HREF);
    expect(TILE_HREF).toBe(JUMP_CHECK_HREF);
    const jumpMetrics = Object.values(REP_METRICS).filter((m) => m.measureHref === JUMP_CHECK_HREF);
    expect(jumpMetrics.length).toBeGreaterThan(0);
    expect(jumpMetrics.every((m) => m.measureLabel === JUMP_CHECK)).toBe(true);
    expect(src('app/play/mirror/assess/page.tsx')).toContain("raw === 'vertical'");
    expect(src('app/screen/screen-start.tsx')).toContain('?run=vertical');
  });

  it('is one tap from Play, the landing and Train, under one name', () => {
    expect(EN.play.vertical).toBe(MEASURE_VERTICAL);
    expect(EN.landing.vertical).toBe(MEASURE_VERTICAL);
    expect(EN.train.cards.vertical.title).toBe(MEASURE_VERTICAL);
    expect(EN.train.cards.vertical.line).toBe(MEASURE_VERTICAL_LINE);
    expect(src('app/play/page.tsx')).toMatch(/<Chip href=\{MEASURE_VERTICAL_HREF\}[^\n]*\{t\('play\.vertical'\)\}<\/Chip>/);
    expect(src('components/guest-landing-hero.tsx')).toMatch(/<Chip href=\{MEASURE_VERTICAL_HREF\}[^\n]*\{t\('landing\.vertical'\)\}<\/Chip>/);
    // Train: the first card of the page, in Measure
    const train = src('app/train/page.tsx');
    const first = train.indexOf('href: ');
    expect(train.slice(first, first + 80)).toMatch(/^href: MEASURE_VERTICAL_HREF, group: 'measure'/);
  });

  it('every jump CTA in the app says the same name', () => {
    for (const f of ['lib/profile-v2/tiles.ts', 'lib/daily-drill/copy.ts', 'lib/signature/copy.ts', 'components/profile-v2/stats-section.tsx']) {
      expect(src(f), f).not.toMatch(/Do a Mirror jump check|Do a jump check'|Do the jump check'|MEASURE_VERTICAL/);
      expect(src(f), f).toContain('JUMP_CHECK');
    }
  });
});

describe('the steps before the camera', () => {
  const run = (events: PreEvent[]) => events.reduce((s, e) => preStep(s, e), PRE_START);
  // test changed (SCREEN-EASY, 2026-10-28): the full screen no longer asks the take-off foot either (lib/screen/flow.ts)
  it('the jump alone: age, pain, then the camera — two taps; the full screen the same', () => {
    expect(run([{ type: 'start', kind: 'jump' }, { type: 'age', age: '18+' }, { type: 'pain', hurts: false }]).step).toBe('cameraInfo');
    expect(run([{ type: 'start', kind: 'vertical' }, { type: 'age', age: '18+' }, { type: 'pain', hurts: false }]).step).toBe('cameraInfo');
    expect(run([{ type: 'start', kind: 'full' }, { type: 'age', age: '18+' }, { type: 'pain', hurts: false }]).step).toBe('cameraInfo');
  });
  it('under 18 is unchanged: the grown-up step, and never the camera (cameraAllowed, assess-app.tsx)', () => {
    expect(run([{ type: 'start', kind: 'jump' }, { type: 'age', age: '13-17' }]).step).toBe('grownUp');
    expect(src('app/play/mirror/assess/_components/assess-app.tsx')).toMatch(/if \(!cameraAllowed\(preRef\.current\.age, readAge\(tabStorage\(\)\), readSessionAge\(tabStorage\(\)\)\)\) \{ setPhase\('noCamera'\); return; \}/);
  });
});
