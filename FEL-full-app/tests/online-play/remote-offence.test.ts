// lane/improve-hoops-2 phase 10 (2026-11-22): a remote human's 3v3 offence — his own presses, read as edges (a lost packet repeats the last
// input, so a level would pass every frame), and a pass thrown where his stick points; the switch's default and the 3v3 wiring.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RemoteButtons, remotePassTarget } from '@/lib/net/remoteOffence';
import { NET_REMOTE_OFFENCE } from '@/lib/net/knobs';
import type { Intent } from '@/lib/babylon/core/PlayerSlot';

const I = (o: Partial<Intent> = {}): Intent => ({ moveX: 0, moveY: 0, sprint: false, action: false, actionHeld: 0, pass: false, steal: false, ...o });

describe('RemoteButtons: press edges', () => {
  it('a pass repeated over three ticks (the lost-packet repeat) is one pass; a new press after a release is another', () => {
    const b = new RemoteButtons();
    expect(b.read(I({ pass: true })).pass).toBe(true);
    expect(b.read(I({ pass: true })).pass).toBe(false);
    expect(b.read(I({ pass: true })).pass).toBe(false);
    expect(b.read(I()).pass).toBe(false);
    expect(b.read(I({ pass: true })).pass).toBe(true);
  });
  it('the shot starts on the press of Square (its hold), once, and a seat going empty releases everything', () => {
    const b = new RemoteButtons();
    expect(b.read(I({ actionHeld: 0.01 })).shot).toBe(false);
    const p = b.read(I({ actionHeld: 1 })); expect(p.shot).toBe(true); expect(p.shotHeld).toBe(true);
    expect(b.read(I({ actionHeld: 1 })).shot).toBe(false);
    expect(b.read(null).shotHeld).toBe(false);
    expect(b.read(I({ action: true })).shot).toBe(true);
  });
});

describe('remotePassTarget', () => {
  const from = { x: 0, z: 0 }, rim = { x: 0, z: -6 };
  const mates = [{ x: 5, z: 0 }, { x: -4, z: -4 }];
  it('throws to the team-mate the stick points at', () => {
    expect(remotePassTarget(from, { x: 1, z: 0 }, mates, rim)).toBe(0);
    expect(remotePassTarget(from, { x: -0.7, z: -0.7 }, mates, rim)).toBe(1);
  });
  it('a stick at rest (or pointing at nobody) throws to the one nearest the rim; nobody to throw to is -1', () => {
    expect(remotePassTarget(from, { x: 0, z: 0 }, mates, rim)).toBe(1);
    expect(remotePassTarget(from, { x: 0, z: 1 }, mates, rim)).toBe(1);
    expect(remotePassTarget(from, { x: 1, z: 0 }, [], rim)).toBe(-1);
  });
});

describe('the 3v3 wiring (net.remoteOffence)', () => {
  const src = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');
  it('a human never stands in for the hero, and the AI keeps an empty or dropped seat (seatIsHuman)', () => {
    expect(src).toMatch(/const humanOffence = \(b: Body\): boolean => b !== me && !!net\?\.play\.enabled && netRemoteOffence\(\) && net\.seatIsHuman\(b\.slot\.id\);/);
  });
  it('with no human the rival\'s possession draws its random man and its catch-and-shoot exactly as before', () => {
    expect(src).toMatch(/const shooter = cont \? cont\.receiver : humanUp \?\? foes\[Math\.floor\(Math\.random\(\) \* foes\.length\)\];/);
    expect(src).toMatch(/const pullUp = !!cont && !humanDrive && catchAndShoot\(/);
  });
  it('the presses are read once a frame, before the drive tick', () => {
    expect(src).toMatch(/readRemote\(\);[^\n]*\n\s+foeDriveTick\?\.\(/);
  });
  it('ships off until a browser or two-phone check shows it (the lane report); 0 = the AI decides, as before', () => { expect(NET_REMOTE_OFFENCE).toBe(0); });
});
