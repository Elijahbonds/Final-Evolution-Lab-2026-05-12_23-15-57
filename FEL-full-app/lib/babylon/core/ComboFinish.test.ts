// hoops-gather G4: the euro / the hop into a dunk (core/ComboFinish) — off by default (today exactly), and the read when it is on.
import { afterEach, describe, expect, it } from 'vitest';
import { comboDunkThen, comboDunkPick, gatherEnd, COMBO_DUNK_ON, COMBO_DUNK_MIN_MPS } from './ComboFinish';
import { DUNK_RANGE } from './BasketballCore';
import { WINDMILL, CRADLE, TOMAHAWK, POWER, DOUBLE_CLUTCH, ANGLED } from './HoopsDunks';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';
import { FEEL_KNOB_BY_ID } from '../../feel-panel/knobs';

const on = () => { resetFeelForTests(); setFeelUser(true); setFeelSession(null); setFeelOverride('hoops.comboDunkOn', 1); };
afterEach(() => resetFeelForTests());
const read = { sprint: true, turbo01: 1, speed: 5.5, rimDistAfter: 2.0 };

describe('ComboFinish (G4)', () => {
  it('ships OFF: a euro or a hop never dunks, whatever the drive', () => {
    expect(COMBO_DUNK_ON).toBe(0);
    expect(FEEL_KNOB_BY_ID.get('hoops.comboDunkOn')!.def).toBe(COMBO_DUNK_ON);
    expect(FEEL_KNOB_BY_ID.get('hoops.comboDunkMinMps')!.def).toBe(COMBO_DUNK_MIN_MPS);
    expect(comboDunkThen(read)).toBe(false);
  });
  it('on: the turbo held with fuel, fast enough, and the last plant inside dunk range — and none of them alone', () => {
    on();
    expect(comboDunkThen(read)).toBe(true);
    expect(comboDunkThen({ ...read, sprint: false })).toBe(false);
    expect(comboDunkThen({ ...read, turbo01: 0.1 })).toBe(false);
    expect(comboDunkThen({ ...read, speed: COMBO_DUNK_MIN_MPS - 0.1 })).toBe(false);
    expect(comboDunkThen({ ...read, rimDistAfter: DUNK_RANGE + 0.1 })).toBe(false);
  });
  it('the dunk: the euro\'s cross is an angle (windmill fast, cradle slower), the hop\'s two feet none, a body in the way the double clutch', () => {
    const base = { lateral01: 0, contest01: 0, poster: false, momentum01: 0, roll: () => 0.99 };
    expect(comboDunkPick('euro', { ...base, speed: 5.5 })).toBe(WINDMILL);
    expect(comboDunkPick('euro', { ...base, speed: 4.0 })).toBe(CRADLE);
    expect(comboDunkPick('hop', { ...base, speed: 5.5, lateral01: 0.6 })).toBe(TOMAHAWK);
    expect(comboDunkPick('hop', { ...base, speed: 4.0 })).toBe(POWER);
    expect(comboDunkPick('euro', { ...base, speed: 5.5, contest01: 0.6 })).toBe(DOUBLE_CLUTCH);
    expect(ANGLED).toBeLessThan(0.72);   // the euro's angle never reads as a baseline drive (the reverse)
  });
  it('gatherEnd walks the legs', () => {
    const e = gatherEnd({ x: 0, z: 5 }, [{ dir: { x: 0, z: -1 }, sec: 0.2, speed: 3 }, { dir: { x: 1, z: 0 }, sec: 0.1, speed: 2 }]);
    expect(e.x).toBeCloseTo(0.2, 6); expect(e.z).toBeCloseTo(4.4, 6);
    expect(gatherEnd({ x: 1, z: 2 }, undefined)).toEqual({ x: 1, z: 2 });
  });
});
