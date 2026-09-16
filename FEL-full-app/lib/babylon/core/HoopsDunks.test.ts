import { describe, it, expect } from 'vitest';
import {
  pickHoopsDunk, dunkSpeedRatio, POWER, TOMAHAWK, WINDMILL, CRADLE, DOUBLE_CLUTCH, SPIN_360, EASTBAY,
  WINDUP_SPEED, ANGLED, CROWDED, SHOWTIME_MOMENTUM, type DunkRead,
} from './HoopsDunks';

/** A clean, slow, straight-on drive with the game level — the case that should get the plainest dunk there is. */
const PLAIN: DunkRead = { speed: 3.6, lateral01: 0, contest01: 0, poster: false, momentum01: 0.5, roll: () => 0.99 };

describe('pickHoopsDunk', () => {
  it('the drive nobody contested, at a jog, straight on, is a power dunk — the one both modes used to play always', () => {
    expect(pickHoopsDunk(PLAIN)).toBe(POWER);
  });

  it('a poster is decided by the body: one hand, through him, no flourish', () => {
    expect(pickHoopsDunk({ ...PLAIN, poster: true })).toBe(TOMAHAWK);
    // …even at showtime speed with the game won, because contact settles the argument
    expect(pickHoopsDunk({ ...PLAIN, poster: true, speed: 9, lateral01: 1, momentum01: 1, roll: () => 0 })).toBe(TOMAHAWK);
  });

  it('a hand up without the contact is the double clutch — the dunk that exists BECAUSE of the defender', () => {
    expect(pickHoopsDunk({ ...PLAIN, contest01: CROWDED })).toBe(DOUBLE_CLUTCH);
  });

  it('you do not wind one up through a chest: contest beats speed and angle', () => {
    expect(pickHoopsDunk({ ...PLAIN, contest01: 0.9, speed: 9, lateral01: 1 })).toBe(DOUBLE_CLUTCH);
  });

  it('across the face of the rim at speed is a windmill; the same angle slowly is a cradle', () => {
    const angled = { ...PLAIN, lateral01: ANGLED };
    expect(pickHoopsDunk({ ...angled, speed: WINDUP_SPEED })).toBe(WINDMILL);
    expect(pickHoopsDunk({ ...angled, speed: WINDUP_SPEED - 0.1 })).toBe(CRADLE);
  });

  it('straight on and fast is a tomahawk', () => {
    expect(pickHoopsDunk({ ...PLAIN, speed: WINDUP_SPEED })).toBe(TOMAHAWK);
  });

  it('showtime needs the game going your way AND the speed — neither alone opens it', () => {
    const lucky = () => 0;                                   // the roll that would take the rarest dunk
    expect(pickHoopsDunk({ ...PLAIN, speed: 9, momentum01: SHOWTIME_MOMENTUM - 0.01, roll: lucky })).not.toBe(EASTBAY);
    expect(pickHoopsDunk({ ...PLAIN, speed: WINDUP_SPEED - 0.1, momentum01: 1, roll: lucky })).not.toBe(EASTBAY);
    expect(pickHoopsDunk({ ...PLAIN, speed: 9, momentum01: 1, roll: lucky })).toBe(EASTBAY);
  });

  it('and showtime is not EVERY trip — an unlucky roll at full momentum still falls through to the ordinary read', () => {
    const read = { ...PLAIN, speed: 9, momentum01: 1, roll: () => 0.99 };
    expect(pickHoopsDunk(read)).toBe(TOMAHAWK);             // straight on, fast
    expect(pickHoopsDunk({ ...read, lateral01: 1 })).toBe(WINDMILL);
  });

  it('the 360 sits between the eastbay and the ordinary read', () => {
    const at = (r: number) => pickHoopsDunk({ ...PLAIN, speed: 9, momentum01: 1, roll: () => r });
    expect(at(0.1)).toBe(EASTBAY);
    expect(at(0.4)).toBe(SPIN_360);
    expect(at(0.8)).toBe(TOMAHAWK);
  });

  it('every dunk in the vocabulary names a clip and a label, and the flashy ones are the showy ones', () => {
    for (const d of [POWER, TOMAHAWK, WINDMILL, CRADLE, DOUBLE_CLUTCH, SPIN_360, EASTBAY]) {
      expect(d.clip).toMatch(/^dunk_/);
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.sec).toBeGreaterThan(0);
    }
    expect(POWER.flashy).toBe(false);
    expect(SPIN_360.flashy).toBe(true);
  });
});

describe('dunkSpeedRatio', () => {
  it('a clip longer than the flight is sped up, a shorter one slowed, so the ball meets the rim', () => {
    expect(dunkSpeedRatio(SPIN_360, 0.4)).toBeGreaterThan(1);
    expect(dunkSpeedRatio(POWER, 0.7)).toBeLessThan(1);
  });

  it('clamped either side — a dunk is not slow motion and it is not a twitch', () => {
    expect(dunkSpeedRatio(SPIN_360, 0.01)).toBe(2);
    expect(dunkSpeedRatio(POWER, 100)).toBe(0.5);
  });

  it('a nonsense flight length changes nothing rather than producing a NaN speedRatio', () => {
    expect(dunkSpeedRatio(POWER, 0)).toBe(1);
    expect(dunkSpeedRatio(POWER, Number.NaN)).toBe(1);
  });
});
