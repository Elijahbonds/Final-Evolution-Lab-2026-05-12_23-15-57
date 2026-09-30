// MUSIC-SUITE P7 (2026-09-29), room-mix-ux: the instrument chips replacing the MIX bar (DanceMode.ts). Pure functions
// only — no Babylon, no audio node, no HUD host — so "chip state from the band state" (the task's own test line) is
// checkable with plain objects.
import { describe, expect, it } from 'vitest';
import { DANCE_LIBRARY } from '../../core/DanceCore';
import { CATEGORY_STEM } from '../../audio/StemBand';
import {
  buildInstrumentChips, decodeInstrumentChips, encodeInstrumentChips, songCategories, type InstrumentChip,
} from './InstrumentChips';

const ORDER = Object.keys(CATEGORY_STEM);   // bounce, footwork, wave, toprock, freeze, power, transition

describe('songCategories — which instruments the loaded chart actually calls for', () => {
  it('reads a step\'s category through its clipId, de-duplicated', () => {
    const steps = [{ clipId: 'dance_bounce_two_step' }, { clipId: 'dance_bounce_shoulder' }, { clipId: 'dance_footwork_six' }];
    expect(songCategories(steps)).toEqual(new Set(['bounce', 'footwork']));
  });
  it('an empty routine (no steps yet, or an empty song) calls for nothing', () => {
    expect(songCategories([])).toEqual(new Set());
  });
  it('a clipId DANCE_LIBRARY does not know is skipped, not thrown', () => {
    expect(songCategories([{ clipId: 'not_a_real_clip' }])).toEqual(new Set());
  });
  it('every category on the shipped library resolves (a live smoke against DANCE_LIBRARY itself)', () => {
    const all = songCategories(DANCE_LIBRARY.map((c) => ({ clipId: c.id })));
    expect(all).toEqual(new Set(DANCE_LIBRARY.map((c) => c.category)));
    expect(all.size).toBe(ORDER.length);   // the library covers all seven stem categories
  });
});

describe('buildInstrumentChips — chip state from the band state', () => {
  const inSong = new Set(['bounce', 'footwork', 'toprock']);

  it('a category the song never calls for is FEL, whatever its (necessarily zero) level reads', () => {
    const chips = buildInstrumentChips(ORDER, CATEGORY_STEM, inSong, {});
    const wave = chips.find((c) => c.id === 'wave')!;
    expect(wave.state).toBe('fel');
    expect(wave.label).toBe('KEYS');
  });
  it('a category in the song, never yet judged (level 0 or missing): ducked, not fel', () => {
    const chips = buildInstrumentChips(ORDER, CATEGORY_STEM, inSong, {});
    const bounce = chips.find((c) => c.id === 'bounce')!;
    expect(bounce.state).toBe('ducked');
    expect(bounce.level).toBe(0);
  });
  it('a category in the song with a level above zero is earned (the same threshold as onJudged\'s join banner)', () => {
    const chips = buildInstrumentChips(ORDER, CATEGORY_STEM, inSong, { bounce: 0.34 });
    expect(chips.find((c) => c.id === 'bounce')!.state).toBe('earned');
  });
  it('a level that ducks back to exactly 0 after being earned reads ducked again, not earned or fel', () => {
    const chips = buildInstrumentChips(ORDER, CATEGORY_STEM, inSong, { footwork: 0 });
    expect(chips.find((c) => c.id === 'footwork')!.state).toBe('ducked');
  });
  it('every id in `order` gets exactly one chip, in order, whatever inSong/levels contain', () => {
    const chips = buildInstrumentChips(ORDER, CATEGORY_STEM, new Set(), {});
    expect(chips.map((c) => c.id)).toEqual(ORDER);
    expect(chips.every((c) => c.state === 'fel')).toBe(true);   // inSong empty: nothing can be earned or ducked
  });
  it('an id with no label falls back to its own id, upper-cased (defensive: CATEGORY_STEM always has one today)', () => {
    const chips = buildInstrumentChips(['mystery'], {}, new Set(['mystery']), { mystery: 0.1 });
    expect(chips[0]).toEqual({ id: 'mystery', label: 'MYSTERY', state: 'earned', level: 0.1 });
  });
});

describe('encodeInstrumentChips / decodeInstrumentChips — the HudValue string round trip', () => {
  const chips: InstrumentChip[] = [
    { id: 'bounce', label: 'DRUMS', state: 'earned', level: 0.62 },
    { id: 'wave', label: 'KEYS', state: 'fel', level: 0 },
    { id: 'toprock', label: 'PERC', state: 'ducked', level: 0 },
  ];

  it('round-trips every field exactly (levels to 3 decimals)', () => {
    const decoded = decodeInstrumentChips(encodeInstrumentChips(chips));
    expect(decoded).toEqual(chips.map((c) => ({ ...c, level: Number(c.level.toFixed(3)) })));
  });
  it('an empty chip list encodes to an empty string, and decodes back to an empty array', () => {
    expect(encodeInstrumentChips([])).toBe('');
    expect(decodeInstrumentChips('')).toEqual([]);
  });
  it('decode is tolerant of undefined/null (every other timing-sport mode never sets hud.instruments at all)', () => {
    expect(decodeInstrumentChips(undefined)).toEqual([]);
    expect(decodeInstrumentChips(null)).toEqual([]);
  });
  it('decode drops a row that does not parse (garbage input never throws or half-renders)', () => {
    expect(decodeInstrumentChips('not|a:real:row:with:too:many:fields|bounce:DRUMS:earned:0.5')).toEqual([
      { id: 'bounce', label: 'DRUMS', state: 'earned', level: 0.5 },
    ]);
    expect(decodeInstrumentChips('bounce:DRUMS:not-a-state:0.5')).toEqual([]);
  });
  it('a non-numeric level decodes to 0 rather than NaN reaching a render', () => {
    expect(decodeInstrumentChips('bounce:DRUMS:earned:oops')).toEqual([{ id: 'bounce', label: 'DRUMS', state: 'earned', level: 0 }]);
  });
});
