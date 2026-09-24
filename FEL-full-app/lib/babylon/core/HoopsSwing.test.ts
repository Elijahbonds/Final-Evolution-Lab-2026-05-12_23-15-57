// HOOPS SWING — which side of the momentum meter a 3v3 play lands on (finish-release, 2026-09-24).
//
// 3v3 reported a rival's swat of MY dunk as swing('block') (a stop against me credited me), and my own blocks, my makes,
// my misses and the ball taken off me reported nothing. The table is pinned first (the 1v1's kinds, by side), then the
// mode's call sites: each play names who did it to whom, so the side cannot cross silently again.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { heroSwing, type Seat, type SidedPlay } from './HoopsSwing';

const SEATS: Seat[] = ['me', 'mate', 'foe'];

describe('heroSwing: the 1v1 kinds, by side', () => {
  it('my plays report as the 1v1 reports them', () => {
    expect(heroSwing({ play: 'make', by: 'me' })).toBe('big_make');
    expect(heroSwing({ play: 'miss', by: 'me' })).toBe('miss');
    expect(heroSwing({ play: 'block', by: 'me', on: 'foe' })).toBe('block');
    expect(heroSwing({ play: 'steal', by: 'me', on: 'foe' })).toBe('steal');
  });

  it('a block AGAINST me never credits me: my dunk swatted is a turnover, my shot sent back a miss', () => {
    expect(heroSwing({ play: 'block', by: 'foe', on: 'me', dunk: true })).toBe('turnover');
    expect(heroSwing({ play: 'block', by: 'foe', on: 'me' })).toBe('miss');
  });

  it('the ball taken off me is a turnover; taken off a mate it is not my meter', () => {
    expect(heroSwing({ play: 'steal', by: 'foe', on: 'me' })).toBe('turnover');
    expect(heroSwing({ play: 'steal', by: 'foe', on: 'mate' })).toBeNull();
  });

  it("a mate's bucket is mine only off my pass", () => {
    expect(heroSwing({ play: 'make', by: 'mate', myPass: true })).toBe('big_make');
    expect(heroSwing({ play: 'make', by: 'mate', myPass: false })).toBeNull();
    expect(heroSwing({ play: 'make', by: 'mate' })).toBeNull();
  });

  it('nobody else ever moves my meter UP, and only the other side moves it down, and only when it was done to me', () => {
    const plays: SidedPlay['play'][] = ['make', 'miss', 'block', 'steal'];
    const UP = new Set(['big_make', 'block', 'steal']);
    for (const play of plays) for (const by of SEATS) for (const on of [...SEATS, undefined]) for (const dunk of [true, false]) for (const myPass of [true, false]) {
      const kind = heroSwing({ play, by, on, dunk, myPass });
      if (by === 'me') continue;
      if (kind && UP.has(kind)) expect({ play, by, kind }).toEqual({ play: 'make', by: 'mate', kind: 'big_make' });   // the one exception: my assist
      if (kind === 'miss' || kind === 'turnover') expect({ by, on }).toEqual({ by: 'foe', on: 'me' });
    }
  });
});

describe('ThreeVThreeMode reports through the table', () => {
  const SRC = readFileSync(path.join(__dirname, '../modes/ThreeVThreeMode.ts'), 'utf8');
  /** One of the mode's own functions, up to the next one. */
  const fn = (name: string): string => {
    const at = SRC.indexOf(`function ${name}(`);
    expect(at, name).toBeGreaterThan(-1);
    const rest = SRC.slice(at + 1);
    const end = rest.search(/\n {2}(async )?function |\n {2}return \{/);
    return end < 0 ? rest : rest.slice(0, end);
  };
  const between = (from: string, to: string): string => {
    const i = SRC.indexOf(from);
    expect(i, from).toBeGreaterThan(-1);
    return SRC.slice(i, SRC.indexOf(to, i + from.length));
  };

  it('no block is reported by its name alone (the wrong-side swing)', () => {
    const code = SRC.replace(/\/\/.*$/gm, '');   // the comments may name the old call
    expect(code).not.toMatch(/swing\('block'\)/);
  });

  it('my dunk swatted is my turnover, and nothing in my flight credits a block', () => {
    const dunk = fn('startDunk');
    expect(dunk).toContain("heroSwing({ play: 'block', by: 'foe', on: 'me', dunk: true })");
    expect(dunk).not.toContain("play: 'block', by: 'me'");
  });

  it('my blocks report: the swat of his dunk and the block at his release', () => {
    expect(fn('driverDunk')).toContain("heroSwing({ play: 'block', by: 'me', on: 'foe' })");
    expect(fn('opponentPossession')).toContain("heroSwing({ play: 'block', by: 'me', on: 'foe' })");
  });

  it('my shot: the make and the miss at the iron, and a shot blocked at the release is a miss', () => {
    expect(between("if (res === 'made') {", "} else if (res === 'missed') {")).toContain("heroSwing({ play: 'make', by: 'me' })");
    expect(between("} else if (res === 'missed') {", 'board = {')).toContain("heroSwing({ play: 'miss', by: 'me' })");
    expect(fn('blockedShot')).toContain("heroSwing({ play: 'block', by: 'foe', on: 'me' })");
  });

  it("a mate's bucket reports on my pass", () => {
    expect(fn('teammateShoots')).toContain("heroSwing({ play: 'make', by: 'mate', myPass: lastPasserWasMe })");
  });

  it('the ball taken off me: the strip (by whose hands it was in) and my pass picked off', () => {
    expect(fn('stripBall')).toContain("heroSwing({ play: 'steal', by: 'foe', on: carrierId === 'me' ? 'me' : 'mate' })");
    expect(between("banner: 'PICKED OFF!", 'opponentPossession(ctx)')).toContain("heroSwing({ play: 'steal', by: 'foe', on: 'me' })");
  });

  it('a charge I draw on his drive is my steal, as on the half court and in 1v1 (it reported nothing)', () => {
    expect(between("const id = drivePlanted ? 'charge' : 'blocking_foul';", 'driveStolen = true;')).toMatch(/if \(drivePlanted\) \{ swing\('steal'\);/);
  });
});

describe('OneVOneMode: a charge I draw is never my turnover', () => {
  const SRC = readFileSync(path.join(__dirname, '../modes/OneVOneMode.ts'), 'utf8');
  it("both charge-drawn whistles ('CHARGE — YOUR BALL', he ran through my set body) report steal", () => {
    const at = SRC.indexOf("bannerFlash(ctx, 'CHARGE — YOUR BALL', 1000);");
    expect(at).toBeGreaterThan(-1);
    const site = SRC.slice(SRC.lastIndexOf('they ran through a SET defender', at), at);
    expect(site).toMatch(/swing\('steal'\)/);
    expect(site).not.toMatch(/swing\('turnover'\)/);
  });
});
