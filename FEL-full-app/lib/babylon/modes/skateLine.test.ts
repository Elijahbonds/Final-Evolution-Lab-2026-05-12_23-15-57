// IMPROVE (2026-10-06) — the THPS line's small rules: named grinds (11), lock identities (12), the combo line (10), the
// buzzer's warnings (19) and the wall ride's camera side (20).
import { describe, expect, it } from 'vitest';
import {
  grindTrickFor, grindLabel, railKey, wallKey, lipKey, comboLine, settlePrompt, buzzerCue, wallCamSide,
  TRANSFER_BONUS, BUZZER_WARN_SEC, LAND_IT_EVERY_SEC, COMBO_LINE_LINKS,
} from './skateLine';
import { heldTrickDir, SKATE_TRICKS } from '../core/BoardTricks';
import { plazaWalls } from './skatePlaza';

describe('named grinds (item 11)', () => {
  it('the stick held at the lock picks the grind: nothing 50-50, across BOARDSLIDE, forward NOSESLIDE, back TAILSLIDE', () => {
    expect(grindTrickFor(heldTrickDir(0, 0)).label).toBe('50-50');
    expect(grindTrickFor(heldTrickDir(0.9, 0)).label).toBe('BOARDSLIDE');
    expect(grindTrickFor(heldTrickDir(-0.9, 0)).label).toBe('BOARDSLIDE');
    expect(grindTrickFor(heldTrickDir(0, -0.9)).label).toBe('NOSESLIDE');   // stick forward is −y
    expect(grindTrickFor(heldTrickDir(0, 0.9)).label).toBe('TAILSLIDE');
  });
  it('the slides are the trick table\'s own names, and a slide turns the rider off the rail the side you hold', () => {
    const table = new Set(SKATE_TRICKS.filter((t) => t.kind === 'grind').map((t) => t.label));
    for (const d of ['left', 'right', 'up', 'down'] as const) expect(table.has(grindTrickFor(d).label), d).toBe(true);
    expect(grindTrickFor(null).bodyYaw).toBe(0);
    expect(grindTrickFor('right').bodyYaw).toBeCloseTo(Math.PI / 2);
    expect(grindTrickFor('left').bodyYaw).toBeCloseTo(-Math.PI / 2);
    // the nose rides the bar nose-up, the tail tail-up (the manual's sign: negative is nose up)
    expect(grindTrickFor('up').boardPitch).toBeLessThan(0);
    expect(grindTrickFor('down').boardPitch).toBeGreaterThan(0);
  });
  it('a transfer rail says so', () => {
    expect(grindLabel(grindTrickFor(null), TRANSFER_BONUS)).toBe('TRANSFER 50-50');
    expect(grindLabel(grindTrickFor('up'), TRANSFER_BONUS - 1)).toBe('NOSESLIDE');
  });
});

describe('lock identities (item 12)', () => {
  it('a rail is its goal id or its place, a lip its label, a wall its FACE — every face in the plaza its own', () => {
    expect(railKey('plaza_hubba', 3)).toBe('rail:plaza_hubba');
    expect(railKey(undefined, 3)).not.toBe(railKey(undefined, 4));
    const walls = plazaWalls(56);
    // the two gap ledges share their labels ("the gapLedge (south face)" twice): a label alone would make one ledge a
    // repeat of the other
    expect(new Set(walls.map((w) => w.label)).size).toBeLessThan(walls.length);
    expect(new Set(walls.map(wallKey)).size).toBe(walls.length);
    expect(wallKey(walls[0])).toBe(wallKey({ ...walls[0] }));   // the same face is the same key, whatever object carries it
    expect(lipKey('the wallride lip')).not.toBe(wallKey({ label: 'the wallride lip', a: { x: 0, z: 0 } }));
  });
});

describe('the combo line (item 10)', () => {
  it('names the links, newest last, and folds an old head', () => {
    expect(comboLine([])).toBe('');
    expect(comboLine([{ label: 'KICKFLIP' }, { label: '50-50' }, { label: 'MANUAL' }])).toBe('KICKFLIP + 50-50 + MANUAL');
    expect(comboLine([{ label: 'SKETCHY KICKFLIP+INDY' }])).toBe('KICKFLIP+INDY');
    const many = Array.from({ length: COMBO_LINE_LINKS + 2 }, (_, i) => ({ label: `T${i}` }));
    const line = comboLine(many);
    expect(line.startsWith('… + ')).toBe(true);
    expect(line.endsWith(`T${COMBO_LINE_LINKS + 1}`)).toBe(true);
    expect(line.split(' + ').length).toBe(COMBO_LINE_LINKS + 1);
  });
  it('says what the pot is waiting on', () => {
    expect(settlePrompt(false, false)).toBe('');
    expect(settlePrompt(true, false)).toBe('LINK TRICKS BEFORE YOU SETTLE');
    expect(settlePrompt(true, true)).toMatch(/SETTLING/);
  });
});

describe('the buzzer (item 19)', () => {
  it('calls ten seconds once, as the clock crosses it', () => {
    expect(buzzerCue(10.01, 9.99, false, false, 99)).toBe('ten');
    expect(buzzerCue(9.99, 9.97, false, false, 99)).toBeNull();
    expect(buzzerCue(30, 29.98, true, true, 99)).toBeNull();
    expect(BUZZER_WARN_SEC).toBe(10);
  });
  it('says LAND IT! while an open pot rides a state the buzzer burns — and not every frame', () => {
    expect(buzzerCue(5, 4.98, true, true, LAND_IT_EVERY_SEC)).toBe('landIt');
    expect(buzzerCue(5, 4.98, true, true, LAND_IT_EVERY_SEC - 0.1)).toBeNull();
    expect(buzzerCue(5, 4.98, false, true, 99)).toBeNull();   // nothing to lose
    expect(buzzerCue(5, 4.98, true, false, 99)).toBeNull();   // down and rolling: it banks
    expect(buzzerCue(0.01, -0.01, true, true, 99)).toBeNull();   // the buzzer itself
  });
});

describe('the wall ride camera (item 20)', () => {
  it('swings to the side the wall\'s normal points to', () => {
    // travelling +x along a wall whose park side is −z: the camera looks down +x, its right is −z — the open side
    expect(wallCamSide(5, 0, 0, -1)).toBe(1);
    // the same travel past a wall whose open side is +z: swing left
    expect(wallCamSide(5, 0, 0, 1)).toBe(-1);
    // travelling the other way flips it
    expect(wallCamSide(-5, 0, 0, -1)).toBe(-1);
  });
});
