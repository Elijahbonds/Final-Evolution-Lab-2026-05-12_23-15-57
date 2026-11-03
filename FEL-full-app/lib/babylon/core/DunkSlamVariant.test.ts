// DUNK-FLAGSHIP Phase 7 — the slam variants (REVERSE, TWO-HAND POWER), behind the knob `dunk.slamVariants` (off).
// The rule the coordinator set: the stick is read only inside the slam window and only on the live A press, and every one
// of the sixteen named air tricks fires EXACTLY as before with the knob on or off.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DUNK_TRICKS, GestureRecognizer } from './DunkSystem';
import { slamVariantOf, SLAM_VARIANTS, SLAM_VARIANTS_ON, SLAM_VARIANT_STICK_MIN, REVERSE_CONTACT_FROM, type SlamVariant } from './DunkSlamVariant';
import type { FelInput } from './InputBus';

const DUNK = readFileSync(path.join(__dirname, '../modes/DunkMode.ts'), 'utf8');
const fn = (name: string): string => { const i = DUNK.indexOf(`function ${name}(`); expect(i, name).toBeGreaterThan(0); return DUNK.slice(i, DUNK.indexOf('\n  }\n', i)); };

describe('the stick at the slam press', () => {
  it('is off by default: nothing is called', () => {
    expect(SLAM_VARIANTS_ON).toBe(0);
    for (const [x, y] of [[0, 1], [0, -1], [0.2, 0.9], [0, 0]]) expect(slamVariantOf(false, x, y)).toBeNull();
  });
  it('on: back (down, +y) is the REVERSE, up (−y) the TWO-HAND POWER', () => {
    expect(slamVariantOf(true, 0, 1)).toBe('reverse');
    expect(slamVariantOf(true, 0.3, 0.8)).toBe('reverse');
    expect(slamVariantOf(true, 0, -1)).toBe('power');
    expect(slamVariantOf(true, -0.3, -0.8)).toBe('power');
  });
  it('a resting thumb, a sideways push or a diagonal calls nothing', () => {
    expect(slamVariantOf(true, 0, SLAM_VARIANT_STICK_MIN - 0.01)).toBeNull();
    expect(slamVariantOf(true, 0, 0)).toBeNull();
    expect(slamVariantOf(true, 1, 0)).toBeNull();
    expect(slamVariantOf(true, 0.7, 0.7)).toBeNull();
    expect(slamVariantOf(true, -0.9, -0.6)).toBeNull();
  });
  it('each finish has its own name and a registered clip, and the reverse meets the iron only with its back to it', () => {
    expect(SLAM_VARIANTS.reverse.label).toBe('REVERSE');
    expect(SLAM_VARIANTS.power.label).toBe('TWO-HAND POWER');
    const reg = readFileSync(path.join(__dirname, '../anim/clipRegistry.ts'), 'utf8');
    for (const v of Object.values(SLAM_VARIANTS)) expect(reg).toContain(`'${v.clip}'`);
    expect(new Set(Object.values(SLAM_VARIANTS).map((v) => v.clip)).size).toBe(2);
    expect(REVERSE_CONTACT_FROM).toBeGreaterThan(Math.PI / 2);
    expect(REVERSE_CONTACT_FROM).toBeLessThanOrEqual(Math.PI);
  });
});

/**
 * The air's input routing, as DunkMode wires it (pinned by the scan below): while the slam window is SHUT a d-pad direction
 * feeds the trick recognizer and a face button asks it for the trick (airButton); once the window is OPEN an A is the slam,
 * and only that press reads the stick (readSlamVariant). The stick never reaches the recognizer.
 */
type Step = { t: 'dpad'; dir: 'up' | 'down' | 'left' | 'right' } | { t: 'btn'; btn: 'A' | 'B' | 'X' | 'Y' } | { t: 'stick'; x: number; y: number } | { t: 'window' };
function fly(steps: Step[], knobOn: boolean): { tricks: string[]; slam: boolean; variant: SlamVariant | null } {
  const rec = new GestureRecognizer(); let windowOpen = false, sx = 0, sy = 0;
  const out = { tricks: [] as string[], slam: false, variant: null as SlamVariant | null };
  for (const s of steps) {
    if (s.t === 'stick') { sx = s.x; sy = s.y; continue; }
    if (s.t === 'window') { windowOpen = true; continue; }
    if (s.t === 'dpad') { rec.feed({ t: 'dpad', dir: s.dir, pressed: true } as FelInput); continue; }
    const e = { t: 'button', btn: s.btn, pressed: true } as FelInput;
    if (!windowOpen) { const k = rec.peek(e); if (k && !(s.btn === 'A' && rec.dirSpent)) { out.tricks.push(k.id); rec.spend(); } continue; }
    if (s.btn === 'A' && !out.slam) { out.slam = true; out.variant = slamVariantOf(knobOn, sx, sy); }
  }
  return out;
}

describe('ALL SIXTEEN AIR TRICKS fire exactly as before, knob on or off', () => {
  const sticks: [string, number, number][] = [['neutral', 0, 0], ['back', 0, 1], ['up', 0, -1]];
  for (const t of DUNK_TRICKS) {
    it(`${t.id} (${t.dir} + ${t.btn})`, () => {
      for (const [, x, y] of sticks) {
        // the trick thrown in the air with the stick held the whole flight, then the slam on the beat with that stick still held
        const seq: Step[] = [{ t: 'stick', x, y }, { t: 'dpad', dir: t.dir }, { t: 'btn', btn: t.btn }, { t: 'window' }, { t: 'btn', btn: 'A' }];
        const off = fly(seq, false), on = fly(seq, true);
        expect(on.tricks).toEqual(off.tricks);
        expect(on.tricks).toEqual([t.id]);
        expect(on.slam).toBe(true);
        expect(off.variant).toBeNull();   // off: never a variant
      }
    });
  }
  it('the down + A double clutch thrown with the stick held BACK is still the double clutch, not a reverse', () => {
    const r = fly([{ t: 'stick', x: 0, y: 1 }, { t: 'dpad', dir: 'down' }, { t: 'btn', btn: 'A' }], true);
    expect(r.tricks).toEqual(['clutch']);
    expect(r.slam).toBe(false);
    expect(r.variant).toBeNull();
  });
});

describe('DunkMode reads the stick ONLY on the live A press inside the slam window', () => {
  it('readSlamVariant is called once: in the qteWindowOpen A branch, on a press the latch did not spend', () => {
    expect(DUNK.split('readSlamVariant();').length - 1).toBe(1);   // the one call (the definition reads 'readSlamVariant(): void')
    expect(DUNK).toMatch(/if \(e\.t === 'button' && e\.btn === 'A' && e\.pressed && qteWindowOpen && !lob\.live && !echoA\) \{ if \(phase === 'cinematic' && slamLatch\.press\(clipTime, true\) === 'spent'\) console\.info\([^\n]*\); else \{ readSlamVariant\(\); slamNow\(ctx, clipTime\); \} \}/);
  });
  it('slamVariantOf is read in readSlamVariant only, behind the knob, from the stick', () => {
    expect(DUNK.split('slamVariantOf(').length - 1).toBe(1);
    expect(fn('readSlamVariant')).toMatch(/slamVariantOf\(feel\('dunk\.slamVariants', SLAM_VARIANTS_ON\) >= 0\.5, stickX, stickY\)/);
    expect(fn('readSlamVariant')).toMatch(/turn !== 'player'/);
  });
  it('the trick path never sees it: airButton and the recognizer feed are untouched', () => {
    expect(fn('airButton')).not.toMatch(/[vV]ariant/);
    expect(DUNK).toMatch(/if \(phase === 'cinematic' && e\.t === 'dpad' && e\.pressed\) flight\.recognizer\.feed\(e\);/);
    expect(DUNK).toMatch(/&& !qteWindowOpen && echoA !== 'space'\) airButton\(ctx, e, echoA !== null\);/);
  });
  it('a called trick keeps its own flush; the variant is one slam\'s (reset at the launch and the attempt)', () => {
    expect(DUNK).toMatch(/finishVariant = turn === 'player' && slamVariant && qteHit && !lob\.live && !inOffHand\(\) && !calledAirTrick\(\) \? slamVariant : null;/);
    expect(fn('pickAerialFinish')).toMatch(/if \(finishVariant && !called\) return SLAM_VARIANTS\[finishVariant\]\.clip;/);
    expect(DUNK.split('slamVariant = null; finishVariant = null;').length - 1).toBe(2);
  });
});
