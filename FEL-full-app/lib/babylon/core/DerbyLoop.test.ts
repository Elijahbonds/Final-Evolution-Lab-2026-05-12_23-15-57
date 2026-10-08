// IMPROVE (2026-10-06, docs/IMPROVEMENTS-2026-10-05.md § Derby): the derby's pure reads, and the source guards that keep
// DerbyMode on them.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PITCH_MIX, LEARN_FASTBALLS, pitchShape, derbySeed, derbyProgress, rivalVerdict, rivalLine, secToContact, timingMiss, timingMissLine,
  contactCue, landingRangeM, homerFeet, hitLateral, STICK_AIM_MPS, batFlipRead,
} from './DerbyLoop';
import { OUTS_CAP } from './derbyHud';
import { PARK, predictWallCross } from './ParkourDerby';

/** DerbyMode's source, read so this file does not load the modes (Babylon, characters, venues). */
const SRC = readFileSync(path.join(__dirname, '../modes/precisionModes.ts'), 'utf8');
const DERBY = SRC.slice(SRC.indexOf('export const DerbyMode'), SRC.indexOf('export const PenaltyMode'));
/** The window the mode times against: swingQuality(ball z, 0.3, speed, 0.3) is > 0 inside ±0.15 s of z 0.3. */
const CONTACT_Z = 0.3, HALF = 0.15;
const swingQuality = (z: number, speed: number) => Math.max(0, 1 - Math.abs(z - CONTACT_Z) / speed / HALF);

describe('#5 the pitch sequence is seeded per session', () => {
  it('no seed is the old fixed sequence, bit for bit (control: the depth suite and pitchSpec(round) read it)', () => {
    for (let r = 1; r <= 30; r++) {
      const s = pitchShape(r);
      expect(s.type).toBe(PITCH_MIX[(r - 1) % PITCH_MIX.length]);
      expect(s.ux).toBe(Math.sin(r * 2.7)); expect(s.uy).toBe(Math.cos(r * 1.9));
      expect(s.breakSign).toBe(r % 2 === 0 ? 1 : -1);
    }
  });
  it('a seed opens on fastballs, keeps the mix and the zone envelope, and repeats itself', () => {
    for (let seed = 0; seed < 200; seed++) {
      const seq = Array.from({ length: 30 }, (_, i) => pitchShape(i + 1, seed));
      for (let r = 1; r <= LEARN_FASTBALLS; r++) expect(seq[r - 1].type).toBe('fastball');
      for (const s of seq) { expect(Math.abs(s.ux)).toBeLessThanOrEqual(1); expect(Math.abs(s.uy)).toBeLessThanOrEqual(1); }
      // after the learning pitches every ten in a row is the same mix the fixed derby threw
      const ten = seq.slice(LEARN_FASTBALLS, LEARN_FASTBALLS + 10).map((s) => s.type).sort();
      expect(ten).toEqual([...PITCH_MIX].sort());
      expect(JSON.stringify(Array.from({ length: 30 }, (_, i) => pitchShape(i + 1, seed)))).toBe(JSON.stringify(seq));
    }
  });
  it('different sessions throw different derbies', () => {
    const key = (seed: number) => Array.from({ length: 12 }, (_, i) => { const s = pitchShape(i + 1, seed); return `${s.type}${s.ux.toFixed(2)}${s.breakSign}`; }).join('|');
    const seen = new Set(Array.from({ length: 50 }, (_, i) => key(derbySeed(1_700_000_000_000 + i * 7919))));
    expect(seen.size).toBeGreaterThan(40);
  });
});

describe('#2 the rival', () => {
  it('the line runs on outs as well as pitches: a round that ends on outs shows the rival\'s whole round', () => {
    expect(derbyProgress(10, 0, 30, OUTS_CAP)).toBeCloseTo(10 / 30, 9);
    expect(derbyProgress(18, OUTS_CAP, 30, OUTS_CAP)).toBe(1);   // was 18 / 30 at the final out
    expect(derbyProgress(6, 9, 30, OUTS_CAP)).toBeCloseTo(9 / OUTS_CAP, 9);
    expect(derbyProgress(40, 0, 30, OUTS_CAP)).toBe(1);
  });
  it('you have to beat the number: more is a WIN, a tie or fewer is a LOSS', () => {
    expect(rivalVerdict(6, 5)).toBe('WIN'); expect(rivalVerdict(5, 5)).toBe('LOSS'); expect(rivalVerdict(2, 5)).toBe('LOSS');
    expect(rivalLine(6, 5)).toMatch(/^YOU WIN/); expect(rivalLine(5, 5)).toMatch(/^TIED/); expect(rivalLine(2, 5)).toMatch(/^RIVAL WINS/);
  });
});

describe('#3 / #8 the timing window', () => {
  it('a mistimed swing says which side and by how much past the window', () => {
    // a 15 m/s pitch: 0.3 s out (z 4.8) is 150 ms before the window opens; 0.2 s past contact is 50 ms after it closed
    expect(timingMiss(CONTACT_Z + 15 * 0.3, CONTACT_Z, 15, HALF)).toEqual({ early: true, ms: 150 });
    expect(timingMiss(CONTACT_Z - 15 * 0.2, CONTACT_Z, 15, HALF)).toEqual({ early: false, ms: 50 });
    expect(timingMissLine({ early: true, ms: 150 })).toBe('EARLY by 150 ms');
    expect(timingMissLine({ early: false, ms: 50 })).toBe('LATE by 50 ms');
    expect(timingMissLine({ early: true, ms: 900 }, false)).toMatch(/still in his hand/);
  });
  it('the cue is green exactly where a swing connects, and closes monotonically on the way in', () => {
    const speed = 16;
    let lastFill = -1;
    for (let z = 17.5; z >= -1.2; z -= 0.01) {
      const c = contactCue(z, CONTACT_Z, speed, HALF, 0.6);
      const q = swingQuality(z, speed);
      if (Math.abs(Math.abs(secToContact(z, CONTACT_Z, speed)) - HALF) > 1e-6) expect(c.inWindow, `z ${z.toFixed(2)}`).toBe(q > 0);
      if (c.show) { expect(c.fill).toBeGreaterThanOrEqual(lastFill - 1e-12); lastFill = c.fill; }
    }
    expect(contactCue(CONTACT_Z + speed * (HALF + 0.6 + 0.05), CONTACT_Z, speed, HALF, 0.6).show).toBe(false);   // not yet
    expect(contactCue(CONTACT_Z + speed * (HALF + 0.3), CONTACT_Z, speed, HALF, 0.6).fill).toBeCloseTo(0.5, 6);   // halfway in
    expect(contactCue(CONTACT_Z - speed * (HALF + 0.05), CONTACT_Z, speed, HALF, 0.6).show).toBe(false);          // gone by
  });
});

describe('#4 a homer\'s feet are the flight\'s', () => {
  it('the projection lands where the mode\'s own integration lands it', () => {
    const pos = { x: 1.2, y: 9, z: 37.9 }, vel = { x: 1.3, y: 2.5, z: 30 };
    // Flight.step: vel.y += g·dt, then pos += vel·dt
    const p = { ...pos }, v = { ...vel }; const dt = 1 / 2000;
    while (p.y > 0) { v.y -= PARK.g * dt; p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt; }
    expect(landingRangeM(pos, vel, PARK.g)).toBeCloseTo(Math.hypot(p.x, p.z), 1);
  });
  it('a pure, square swing that clears the wall goes further than the wall, and the feet grow with the drive', () => {
    const q = 1, launch = 0.45, from = { x: 0, y: 1.05, z: 0.3 };
    const vel = { x: 0, y: 18 * launch * q + 4, z: 16 + q * 18 };
    const cross = predictWallCross(vel, from)!;
    const at = { x: from.x + vel.x * cross.t, y: cross.h, z: from.z + vel.z * cross.t };
    const vAt = { x: vel.x, y: vel.y - PARK.g * cross.t, z: vel.z };
    const ft = homerFeet(at, vAt, PARK.g);
    expect(ft).toBeGreaterThan(Math.round(PARK.wallR * 3.28084));
    const harder = { ...vAt, z: vAt.z * 1.3 };
    expect(homerFeet(at, harder, PARK.g)).toBeGreaterThan(ft);
  });
});

describe('#6 the stick aims, nothing rolls dice', () => {
  it('timing sets the side, the stick nudges it, the same swing goes to the same place', () => {
    expect(hitLateral(0, 0)).toBe(0);
    expect(hitLateral(0.5, 0)).toBe(8.5);
    expect(hitLateral(0, 1)).toBe(STICK_AIM_MPS); expect(hitLateral(0, -3)).toBe(-STICK_AIM_MPS);
    expect(new Set(Array.from({ length: 20 }, () => hitLateral(-0.3, 0.4))).size).toBe(1);
  });
});

describe('#12 the bat-flip opens in the set', () => {
  it('the set and the wind-up are open, a ball in play is not, one a pitch', () => {
    const base = { incoming: false, throwIn: 0, pending: false, trickDone: false, ended: false };
    expect(batFlipRead({ ...base, pending: true })).toBe('ok');                        // the set (was refused)
    expect(batFlipRead({ ...base, incoming: true, throwIn: 0.3 })).toBe('ok');         // the wind-up
    expect(batFlipRead({ ...base, incoming: true, throwIn: 0.3, trickDone: true })).toBe('spent');
    expect(batFlipRead({ ...base, incoming: true, throwIn: 0 })).toBe('closed');       // the pitch is on the way
    expect(batFlipRead({ ...base })).toBe('closed');                                   // a hit in the air
    expect(batFlipRead({ ...base, pending: true, ended: true })).toBe('closed');
  });
});

describe('DerbyMode stays on the reads (source guards)', () => {
  it('#1 the targets are painted on the wall and kept for the hit to take down', () => {
    expect(DERBY).toMatch(/MeshBuilder\.CreateDecal\(`park_target_\$\{tg\.id\}`, wall,/);
    expect(DERBY).toContain('targetMeshes.set(tg.id, decal)');
    expect(DERBY).not.toContain('CreateDisc(`park_target_');   // WA-17: no floating discs
  });
  it('#2 / #4 / #5 / #6 / #7 the mode reads them', () => {
    expect(DERBY).toContain('const spec = pitchSpec(round, seed);');
    expect(DERBY).toContain('const vx = hitLateral(side, stickX);');
    expect(DERBY).not.toMatch(/Math\.random\(\) - 0\.5/);
    expect(DERBY).toContain('homerFeet(ball.position, flight.vel, PARK.g)');
    expect(DERBY).not.toMatch(/300 \+ q \*/);
    expect(DERBY).toMatch(/rivalProgress\(derbyProgress\(round, tally\.outs, TOTAL, OUTS_CAP\)\)/);
    expect(DERBY).toMatch(/beatRival: verdict === 'WIN' \? 1 : 0/);
    expect(DERBY).toMatch(/round: `PITCH \$\{round\}`,[\s\S]{0,400}pitch: '',/);
  });
  it('#9 / #10 one timer bag, one banner channel, and dispose ends the derby', () => {
    expect(DERBY).not.toMatch(/\bsetTimeout\(/);
    expect(DERBY.match(/setHud\(\{[^}]*\bbanner:/g)?.length).toBe(1);   // the channel's own push, and nothing else
    expect(DERBY).toContain('bannerCh = new BannerChannel(timers, (text) => ctx.setHud({ banner: text }));');
    expect(DERBY).toMatch(/dispose\(\) \{ ended = true; pending = false; timers\.clear\(\);/);
  });
  it('#13 – #17 nothing per frame allocates what a scratch can hold', () => {
    expect(DERBY).not.toContain('getAbsolutePosition().clone()');
    expect(DERBY).not.toContain('toEulerAngles().y');
    expect(DERBY).not.toContain('Vector3.Distance(new Vector3(root.position.x');
    expect(DERBY).not.toContain('me.root.position.add(new Vector3(0, 1.1, 0))');
    expect(DERBY).not.toMatch(/camDirector\.update\([^)]*Vector3\.Zero\(\)/);
    expect(DERBY).toMatch(/if \(DEV_PCI\) ctx\.setHud\(\{ pci:/);
    expect(DERBY.match(/ctx\.setHud\(\{ pci:/g)?.length).toBe(DERBY.match(/if \(DEV_PCI\) ctx\.setHud\(\{ pci:/g)?.length);
    expect(DERBY).toContain("tokenMat ??= VenueKit.paint(ctx.scene, 'park_token_mat'");
  });
  it('#18 / #19 the stadium is merged and frozen, the gallery parks off-screen', () => {
    expect(DERBY).toContain("merge('park_wall', [...wallSegs, ...tiers])");
    expect(DERBY).toContain('one.freezeWorldMatrix()');
    expect(DERBY).toContain('{ pauseOffscreen: true }');
  });
});
