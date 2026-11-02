// TOOLS-EASY (2026-10-28): one door and one name per tool, the Mirror's walk-through order, and every new word held to
// docs/CUE-STYLE.md (lib/cue-style). Pure.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintStyle, type CueTier } from '@/lib/cue-style/style';
import { CLAIM_WORDS } from '@/tests/helpers/claimFree';
import { MEASURE_TOOLS, JUMP_TESTS_HREF, JUMP_TESTS, JUMP_TESTS_LEDE, JUMP_TESTS_ADULTS_ONLY } from '@/lib/tools-easy/door';
import * as C from '@/lib/tools-easy/copy';
import { SPRINT_FIX_REASONS, withSprintFix } from '@/lib/tools-easy/sprintFix';
import { SETUP_STEPS } from '@/components/sprint/setup-diagram';
import { MODIFIED_SCREEN, FULL_SCREEN, screenRunFor } from '@/lib/mirror/screen';
import { ScreenRunner } from '@/lib/mirror/screenRunner';
import { refusalLine } from '@/lib/tools-easy/liveJump';

const ROOT = join(__dirname, '..', '..');
const train = JSON.parse(readFileSync(join(ROOT, 'messages/en/train.json'), 'utf8')) as { cards: Record<string, { title: string; line?: string }> };

describe('one Measure hub: every tool one row on Train, under its one name', () => {
  const page = readFileSync(join(ROOT, 'app/train/page.tsx'), 'utf8');
  it('each tool\'s name is a Train card title', () => {
    const titles = Object.values(train.cards).map((c) => c.title);
    for (const t of MEASURE_TOOLS) expect(titles, t.id).toContain(t.name);
  });
  it('the jump tests have a door of their own (before: 8 taps and a whole vertical run)', () => {
    expect(JUMP_TESTS_HREF).toBe('/train/jumps');
    expect(page).toContain('href: JUMP_TESTS_HREF');
    expect(train.cards.jumpTests.title).toBe(JUMP_TESTS);
    const jumps = readFileSync(join(ROOT, 'app/train/jumps/page.tsx'), 'utf8');
    expect(jumps).toMatch(/verifiedAdult\(await readDobYear/);   // adults only, the sprint page's rule
    expect(jumps).toContain('JUMP_TESTS_ADULTS_ONLY');
  });
  it('the Measure rows come in MEASURE_TOOLS order', () => {
    const at = (k: string) => page.indexOf(`t('train.cards.${k}.title')`);
    const keys = ['vertical', 'quickScreen', 'jumpTests', 'readiness', 'sprint', 'velocity', 'mirror'];
    const pos = keys.map(at);
    expect(pos.every((p) => p > 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
  });
  it('one start label and one stop label on the camera tools', () => {
    for (const f of ['components/readiness/readiness-check.tsx', 'components/vbt/velocity-session.tsx']) expect(readFileSync(join(ROOT, f), 'utf8'), f).toContain('START_CAMERA');
    for (const f of ['components/readiness/readiness-check.tsx', 'components/combine/jump-camera.tsx', 'components/coach/form-review/record-set.tsx']) expect(readFileSync(join(ROOT, f), 'utf8'), f).toContain('STOP_AND_READ');
    expect(readFileSync(join(ROOT, 'components/readiness/readiness-check.tsx'), 'utf8')).not.toContain('Start the jump check');
  });
});

describe('the Mirror\'s Movement Screen walks front-on first', () => {
  const turns = (list: { view: string }[], start = 'front') => list.reduce((n, s, i) => n + ((i ? list[i - 1].view : start) !== s.view ? 1 : 0), 0);
  it('two turns instead of four, the same stations, holds and checks', () => {
    expect(turns(MODIFIED_SCREEN)).toBe(4);
    expect(turns(screenRunFor('modified', 'frontFirst'))).toBe(2);
    expect(turns(screenRunFor('full', 'frontFirst'))).toBe(2);
    for (const [proto, run] of [[MODIFIED_SCREEN, screenRunFor('modified', 'frontFirst')], [FULL_SCREEN, screenRunFor('full', 'frontFirst')]] as const) {
      expect([...run].sort((a, b) => a.id.localeCompare(b.id))).toEqual([...proto].sort((a, b) => a.id.localeCompare(b.id)));
    }
    expect(screenRunFor('modified')).toBe(MODIFIED_SCREEN);   // the protocol order stays the default
  });
  it('the runner walks the order it was given, and says so in its state', () => {
    const r = new ScreenRunner('modified', { order: 'frontFirst' });
    expect(r.station?.id).toBe('frontStack');
    expect(new ScreenRunner('modified').station?.id).toBe('heels');
  });
});

const LINES: [string, CueTier][] = [
  [C.START_CAMERA, 'label'], [C.STOP_AND_READ, 'label'], [C.TAKE_STAND_WORD, 'label'], [C.TAKE_STAND_LINE, 'prompt'],
  [C.TAKE_JUMP_WORD, 'label'], [C.READINESS_HOW, 'card'], [C.JUMP_TAB_LINE, 'card'], [C.LOAD_LABEL, 'label'], [C.TIPS_LABEL, 'label'],
  [C.SLOWMO_LABEL, 'label'], [C.READY_LINE, 'prompt'], [C.RULER_WORD, 'label'], [C.RULER_LINE, 'prompt'],
  [JUMP_TESTS, 'label'], [JUMP_TESTS_LEDE, 'card'], [JUMP_TESTS_ADULTS_ONLY, 'card'],
  [train.cards.jumpTests.line!, 'card'], [train.cards.readiness.line!, 'card'], [train.cards.mirror.line!, 'card'],
  [train.cards.sprint.line!, 'card'], [train.cards.velocity.line!, 'card'],
  ...Object.values(SETUP_STEPS).flat().map((l) => [l, 'setup'] as [string, CueTier]),
  [refusalLine('the dip was too shallow'), 'prompt'],
];

describe('the words pass the style guide', () => {
  it.each(LINES)('%s', (line, tier) => {
    expect(lintStyle(line, tier)).toEqual([]);
    expect(line).not.toMatch(CLAIM_WORDS);
  });
  it('every sprint refusal that had no fix gets one; the reader\'s own words are kept', () => {
    const src = ['session', 'timing', 'trace', 'agility', 'profile'].map((f) => readFileSync(join(ROOT, `lib/sprint/${f}.ts`), 'utf8')).join('\n');
    for (const has of SPRINT_FIX_REASONS) {
      expect(src, has).toContain(has);
      const out = withSprintFix(`${has}.`);
      expect(out.startsWith(has), has).toBe(true);
      expect(out.length).toBeGreaterThan(has.length + 10);
    }
    expect(withSprintFix('Type the distance between the two lines.')).toBe('Type the distance between the two lines.');
  });
});
