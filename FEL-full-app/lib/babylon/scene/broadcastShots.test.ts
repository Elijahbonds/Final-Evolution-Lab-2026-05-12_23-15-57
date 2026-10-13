// vis-foundation-2 A9.12 — the broadcast kit's framing maths: the intro, the replay angles, the replay lens.
import { describe, expect, it } from 'vitest';
import {
  CRANE, DOF_REPLAY, DOF_REST, INTRO, REPLAY_ANGLES, introLetterbox, introPose, introSec, orbitBlend, replayCut, replayLens, replayShot,
  type ShotPose, type V3,
} from './broadcastShots';

const sub: V3 = { x: 4, y: 0, z: -2 };
const back: V3 = { x: 0, y: 0, z: -1 };   // the play camera sits on the player's -z side
const flatDist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.z - b.z);
const dotBack = (p: V3) => ((p.x - sub.x) * back.x + (p.z - sub.z) * back.z) / (flatDist(p, sub) || 1);

describe('the intro', () => {
  it('opens on a high, wide crane away from the play camera and comes down toward the player', () => {
    const a = introPose('walkIn', 0, sub, back) as ShotPose, b = introPose('walkIn', INTRO.craneSec - 0.01, sub, back) as ShotPose;
    expect(a.pos.y - sub.y).toBeCloseTo(CRANE.h0, 1);
    expect(flatDist(a.pos, sub)).toBeCloseTo(CRANE.r0, 1);
    expect(dotBack(a.pos)).toBeLessThan(0);                // round the far side of the venue from the play camera
    expect(b.pos.y).toBeLessThan(a.pos.y);
    expect(flatDist(b.pos, sub)).toBeLessThan(flatDist(a.pos, sub));
    expect(dotBack(b.pos)).toBeGreaterThan(dotBack(a.pos)); // swinging home toward the play camera's side
    expect(flatDist(b.target, sub)).toBeLessThan(0.5);     // the look has settled on the player
  });
  it('walkIn cuts to a low shot in FRONT of the player, looking up at them', () => {
    const h = introPose('walkIn', INTRO.craneSec + 0.3, sub, back) as ShotPose;
    expect(dotBack(h.pos)).toBeLessThan(-0.5);
    expect(h.pos.y - sub.y).toBeLessThan(h.target.y - sub.y);
    expect(flatDist(h.pos, sub)).toBeGreaterThan(2.5);
    expect(h.fov).toBeGreaterThan(0.3);
  });
  it('hands the frame back to play when it has run — establish skips the player shot', () => {
    expect(introPose('walkIn', introSec('walkIn') + 0.01, sub, back)).toBe('play');
    expect(introPose('establish', introSec('establish') + 0.01, sub, back)).toBe('play');
    expect(introSec('walkIn')).toBeGreaterThan(introSec('establish'));
  });
  it('the letterbox is closed from the first frame and open by the hand-over', () => {
    expect(introLetterbox('walkIn', 0)).toBe(1);
    expect(introLetterbox('walkIn', introSec('walkIn') - INTRO.outSec / 2)).toBeCloseTo(0.5, 5);
    expect(introLetterbox('walkIn', introSec('walkIn'))).toBe(0);
  });
  it('a back with no ground component still frames the player (no NaN)', () => {
    const p = introPose('walkIn', 1, sub, { x: 0, y: 1, z: 0 }) as ShotPose;
    for (const n of [p.pos.x, p.pos.y, p.pos.z, p.target.x]) expect(Number.isFinite(n)).toBe(true);
  });
});

describe('orbitBlend', () => {
  it('goes ROUND the player, never along the chord through them', () => {
    const front = { x: sub.x, y: 1, z: sub.z + 3 }, behind = { x: sub.x, y: 3, z: sub.z - 5 };
    for (let k = 0; k <= 1.0001; k += 0.1) {
      const p = orbitBlend(front, behind, sub, k);
      expect(flatDist(p, sub)).toBeGreaterThanOrEqual(3 - 1e-6);   // the chord would pass at 0
    }
    expect(orbitBlend(front, behind, sub, 0).y).toBe(1);
    const end = orbitBlend(front, behind, sub, 1);
    expect(end.x).toBeCloseTo(behind.x, 6); expect(end.z).toBeCloseTo(behind.z, 6); expect(end.y).toBeCloseTo(3, 6);
  });
});

describe('the replay angles', () => {
  const focus: V3 = { x: 0, y: 0, z: 10 }, heading: V3 = { x: 0, y: 0, z: 6 };
  it('every angle frames the subject from a readable distance, with a finite lens', () => {
    for (const a of REPLAY_ANGLES) {
      const s = replayShot(a, focus, heading);
      const d = Math.hypot(s.pos.x - focus.x, s.pos.y - focus.y - 1, s.pos.z - focus.z);
      expect(d, a).toBeGreaterThan(2.5);
      expect(d, a).toBeLessThan(20);
      if (s.fov !== undefined) { expect(s.fov, a).toBeGreaterThan(0.3); expect(s.fov, a).toBeLessThan(1.2); }
    }
  });
  it('low sits low behind the action; side is a profile; tight is in front; high is above', () => {
    const low = replayShot('low', focus, heading), side = replayShot('side', focus, heading), tight = replayShot('tight', focus, heading), high = replayShot('high', focus, heading);
    expect(low.pos.y).toBeLessThan(1); expect(low.pos.z).toBeLessThan(focus.z);
    expect(Math.abs(side.pos.z - focus.z)).toBeLessThan(0.01); expect(Math.abs(side.pos.x - focus.x)).toBeGreaterThan(5);
    expect(tight.pos.z).toBeGreaterThan(focus.z);
    expect(high.pos.y).toBeGreaterThan(8);
  });
  it('side −1 mirrors the profile', () => {
    expect(replayShot('side', focus, heading, null, -1).pos.x).toBeCloseTo(-replayShot('side', focus, heading, null, 1).pos.x, 6);
  });
  it('a replay is cut into two or three angles', () => {
    expect(replayCut(0.8)).toHaveLength(2);
    expect(replayCut(3)).toHaveLength(3);
    expect(replayCut(9)).toHaveLength(3);
    expect(replayCut(3, ['side', 'tight'])).toEqual(['side', 'tight']);
  });
});

describe('the replay lens', () => {
  it('rests at a lens with no blur and eases to the replay lens, focused on the subject', () => {
    expect(replayLens(0, 6)).toEqual({ fStop: DOF_REST.fStop, focalLength: DOF_REST.focalLength, focusDistance: 6000 });
    const l = replayLens(1, 6);
    expect(l.fStop).toBe(DOF_REPLAY.fStop); expect(l.focalLength).toBe(DOF_REPLAY.focalLength);
    expect(replayLens(0.5, 0.1).focusDistance).toBe(500);
  });
});

describe("the filmer angle (vis-board, wave 2)", () => {
  const focus: V3 = { x: 0, y: 0, z: 10 }, heading: V3 = { x: 0, y: 0, z: 6 };
  it('is ankle-high, close, beside the line and on an extreme wide lens — and is not one of the standard cut', () => {
    const s = replayShot('filmer', focus, heading);
    expect(s.pos.y).toBeLessThan(0.5);
    expect(Math.abs(s.pos.x - focus.x)).toBeGreaterThan(1.5);
    expect(Math.hypot(s.pos.x - focus.x, s.pos.z - focus.z)).toBeLessThan(3);
    expect(s.fov).toBeGreaterThan(1.2);
    expect(REPLAY_ANGLES as readonly string[]).not.toContain('filmer');
    expect(replayCut(3.6)).not.toContain('filmer');
  });
  it('side −1 takes the other side of the line, like the profile does', () => {
    expect(replayShot('filmer', focus, heading, null, -1).pos.x).toBeCloseTo(-replayShot('filmer', focus, heading, null, 1).pos.x, 6);
  });
});
