// lane/move-feel-2 (owner 2026-11-17): "stick right runs a straight line while held" — core/StickFrame, knob `hoops.stickFrameHold`.
// The camera orbits the rim while the stick is held: ON, the court direction the stick asks for stays where it was pushed; OFF (0), it turns
// with the camera every frame, as before. The stick coming home, or a camera cut past RECAPTURE_DEG, takes the live camera again.
import { describe, it, expect, afterEach } from 'vitest';
import { StickFrame, HOOPS_STICK_FRAME_HOLD, RECAPTURE_DEG } from './StickFrame';
import { setFeelUser, setFeelSession, setFeelOverride, resetFeelForTests } from '@/lib/feel-panel/feel';

/** A camera yawed `deg` (forward = (sin, cos) of −Z rotated), its right axis; the court wish of stick-right through the frame. */
const cam = (deg: number) => { const a = (deg * Math.PI) / 180; return { f: { x: -Math.sin(a), z: -Math.cos(a) }, r: { x: Math.cos(a), z: -Math.sin(a) } }; };
const rightWish = (sf: StickFrame, deg: number, mag = 1) => { const { f, r } = cam(deg); sf.read(f, r, mag); return Math.atan2(r.z, r.x) * 180 / Math.PI; };

describe('StickFrame (hoops.stickFrameHold)', () => {
  afterEach(() => { resetFeelForTests(); });

  it('ships ON: a held stick-right keeps its court direction while the camera orbits 40°', () => {
    expect(HOOPS_STICK_FRAME_HOLD).toBe(1);
    const sf = new StickFrame(); const w0 = rightWish(sf, 0);
    for (let d = 1; d <= 40; d++) expect(rightWish(sf, d)).toBeCloseTo(w0, 9);
  });

  it('OFF (0): the old stick — the wish turns with the camera every frame', () => {
    setFeelUser(true); setFeelSession(null); expect(setFeelOverride('hoops.stickFrameHold', 0)).toBe(0);
    const sf = new StickFrame(); const w0 = rightWish(sf, 0);
    expect(rightWish(sf, 40)).toBeCloseTo(w0 - 40, 6);
  });

  it('the stick home lets go: the next push takes the live camera', () => {
    const sf = new StickFrame(); rightWish(sf, 0); rightWish(sf, 30);
    rightWish(sf, 30, 0);   // home
    expect(rightWish(sf, 30)).toBeCloseTo(rightWish(new StickFrame(), 30), 9);
  });

  it(`a camera cut past ${RECAPTURE_DEG}° re-captures (no inverted stick after a possession snap)`, () => {
    const sf = new StickFrame(); rightWish(sf, 0);
    expect(rightWish(sf, RECAPTURE_DEG + 10)).toBeCloseTo(rightWish(new StickFrame(), RECAPTURE_DEG + 10), 9);
  });
});
