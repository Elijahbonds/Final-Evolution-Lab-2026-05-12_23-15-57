// MUSIC-SUITE P5 (2026-09-25): CHOP THE FEL THEME — the first lesson on the FLIP tab (owner decisions #15, #25), on the
// real public/audio/flip/pack.json, driven with the repo's no-DOM helpers (tests/helpers/driveRender.ts).
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { button, drive, findAll, textOf } from '@/tests/helpers/driveRender';
import FlipLesson, { type FlipLessonProps } from './FlipLesson';
import { parseFlipPack, type FlipPackIndex } from './flipPack';

const parsed = parseFlipPack(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../public/audio/flip/pack.json'), 'utf8')));
if (!parsed.ok) throw new Error('pack.json refused');
const PACK: FlipPackIndex = parsed.pack;

function props(o: Partial<FlipLessonProps> & { loads?: string[]; pads?: number[]; closed?: number[] } = {}): FlipLessonProps {
  return {
    pack: PACK, packError: null, loadedId: null, ready: false,
    onLoad: (id) => o.loads?.push(id), onPad: (p) => o.pads?.push(p), onClose: () => o.closed?.push(1),
    ...o,
  };
}
const byQa = (tree: unknown, qa: string) => findAll(tree as never, (el) => el.props['data-qa'] === qa);

describe('CHOP THE FEL THEME', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('one screen: the default theme (Sunday Tape ★), pads 1 → 16, the re-flip written out, and FEL\'s tip', () => {
    const { html, tree } = drive(() => FlipLesson(props()));
    expect(html).toContain('CHOP THE FEL THEME');
    expect(byQa(tree, 'lesson-theme').map((b) => textOf(b.props.children))).toEqual(['Sunday Tape ★', 'Skyline Anthem', 'Dust & Strings']);
    expect(byQa(tree, 'lesson-theme')[0].props['aria-pressed']).toBe(true);
    expect(html).toContain('90 BPM · Eb major');
    expect(html).toContain('Pads 1 → 16 in order play it back.');
    expect(byQa(tree, 'lesson-pattern')[0].props['aria-label']).toBe('the flip: 1 · · 12 · · 8 · · · 4 · 5 · · ·');
    expect(textOf(byQa(tree, 'lesson-tip')[0].props.children)).toBe(PACK.byId.get('theme_a_sunday_tape')!.lesson!.tip);
    // nothing on the pads yet: LOAD, and the demos wait for the sound
    expect(byQa(tree, 'lesson-load')).toHaveLength(1);
    expect(byQa(tree, 'lesson-order')[0].props.disabled).toBe(true);
    expect(byQa(tree, 'lesson-flip')[0].props.disabled).toBe(true);
  });

  it('LOAD asks the room to put the theme on the pads', () => {
    const loads: string[] = [];
    const { tree } = drive(() => FlipLesson(props({ loads })));
    byQa(tree, 'lesson-load')[0].props.onClick();
    expect(loads).toEqual(['theme_a_sunday_tape']);
    // on the pads, still decoding: it says so and offers no LOAD
    expect(drive(() => FlipLesson(props({ loadedId: 'theme_a_sunday_tape', ready: false }))).html).toContain('Putting Sunday Tape on the pads…');
  });

  it('the picker switches theme and asks the room to load it; its pad count follows (Skyline has 15)', () => {
    const loads: string[] = [];
    const { html, tree } = drive(() => FlipLesson(props({ loads, loadedId: 'theme_a_sunday_tape', ready: true })), [
      (t) => byQa(t, 'lesson-theme')[1].props.onClick(),
    ]);
    expect(loads).toEqual(['theme_b_skyline']);
    expect(byQa(tree, 'lesson-theme')[1].props['aria-pressed']).toBe(true);
    expect(html).toContain('Pads 1 → 15 in order play it back.');
  });

  it('with the theme on the pads, ▶ PADS 1 → 16 plays every pad in order at its own cut', () => {
    const pads: number[] = [];
    drive(() => FlipLesson(props({ pads, loadedId: 'theme_a_sunday_tape', ready: true })), [
      (t) => { expect(byQa(t, 'lesson-order')[0].props.disabled).toBe(false); byQa(t, 'lesson-order')[0].props.onClick(); },
    ]);
    const a = PACK.byId.get('theme_a_sunday_tape')!;
    vi.advanceTimersByTime(a.suggestedPads[8] * 1000 + 1);
    expect(pads).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    vi.advanceTimersByTime(20_000);
    expect(pads).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });

  it('▶ HEAR THE FLIP plays the lesson\'s pattern: pad 1, then 12 on the swung off-16th', () => {
    const pads: number[] = [];
    drive(() => FlipLesson(props({ pads, loadedId: 'theme_a_sunday_tape', ready: true })), [(t) => byQa(t, 'lesson-flip')[0].props.onClick()]);
    vi.advanceTimersByTime(1);
    expect(pads).toEqual([0]);
    vi.advanceTimersByTime(600);                       // step 3 at 90 BPM, swing 0.54: (2 + 1.08) × 166.7 ms = 513 ms
    expect(pads).toEqual([0, 11]);
    vi.advanceTimersByTime(10_000);
    expect(pads).toEqual([0, 11, 7, 3, 4, 0, 11, 7, 3, 4]);
  });

  it('GOT IT closes it (the room remembers it for this player); no pack yet or none at all says so', () => {
    const closed: number[] = [];
    button(drive(() => FlipLesson(props({ closed }))).tree, /GOT IT/).props.onClick();
    expect(closed).toEqual([1]);
    expect(drive(() => FlipLesson(props({ pack: null }))).html).toContain('Loading the FEL pack…');
    expect(drive(() => FlipLesson(props({ pack: null, packError: 'the FEL pack answered 404' }))).html).toContain("The FEL pack didn&#x27;t load (the FEL pack answered 404) — the 808 kit is on the KITS tab.");
  });
});
