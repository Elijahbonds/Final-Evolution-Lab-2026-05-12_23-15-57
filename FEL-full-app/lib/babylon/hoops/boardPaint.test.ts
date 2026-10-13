// vis-hoops-dunk — what the boards say: the formatters, and the painters over a recording 2-D context.
import { describe, expect, it } from 'vitest';
import { allFinite, recordingCtx } from '../../../tests/helpers/canvasShim';
import { cardHex, clockHex, clockText, paintCard, paintCardBlank, paintDuel, paintShootout, scoreText, type DuelBoard, type ShootoutBoard } from './boardPaint';
import { yawToward, stepToward } from './faceToward';

const texts = (g: ReturnType<typeof recordingCtx>): string[] => g.calls.filter((c) => c.fn === 'fillText').map((c) => String(c.args[0]));

describe('the clock and the score as the board writes them', () => {
  it('whole seconds, never negative, -- for no clock', () => {
    expect(clockText(41.2)).toBe('42');
    expect(clockText(0)).toBe('0');
    expect(clockText(-3)).toBe('0');
    expect(clockText(null)).toBe('--');
    expect(clockText(NaN)).toBe('--');
  });
  it('calm cyan, amber under 20, red under 10, grey with no clock', () => {
    expect(clockHex(60)).toBe('#7ee7ff');
    expect(clockHex(20)).toBe('#ffb454');
    expect(clockHex(10)).toBe('#ff5d5d');
    expect(clockHex(null)).toBe('#7b8794');
  });
  it('scores are integers, never negative, - for none', () => {
    expect(scoreText(14.6)).toBe('15');
    expect(scoreText(-2)).toBe('0');
    expect(scoreText(undefined)).toBe('-');
  });
  it('a card reads gold at the top, red at the bottom, and a nonsense card is red, not a throw', () => {
    expect(cardHex(1)).toBe('#ffd75e');
    expect(cardHex(0.7)).toBe('#22d3ee');
    expect(cardHex(0.4)).toBe('#ff9d5c');
    expect(cardHex(0)).toBe('#ef4444');
    expect(cardHex(NaN)).toBe('#ef4444');
  });
});

describe('the painters', () => {
  const shoot: ShootoutBoard = { score: 17, rack: 2, racks: 5, clock: 31, streak: 0, fireAt: 3, moneyRack: false };
  it('the contest board writes the score, the rack and the clock, with finite numbers throughout', () => {
    const g = recordingCtx(); paintShootout(g, 1024, 384, shoot);
    const t = texts(g);
    expect(t).toContain('17'); expect(t).toContain('RACK 3/5'); expect(t).toContain('31'); expect(t).toContain('3-POINT CONTEST');
    expect(allFinite(g.calls)).toBe(true);
  });
  it('on a streak the board says so, and a practice rack shows no clock', () => {
    const g = recordingCtx(); paintShootout(g, 1024, 384, { ...shoot, streak: 4, clock: null });
    expect(texts(g)).toContain('ON FIRE'); expect(texts(g)).toContain('--');
    const h = recordingCtx(); paintShootout(h, 1024, 384, { ...shoot, streak: 2 });
    expect(texts(h)).toContain('2 IN A ROW');
  });
  it('a rack past the last is held at the last (the board never says RACK 6/5)', () => {
    const g = recordingCtx(); paintShootout(g, 1024, 384, { ...shoot, rack: 9 });
    expect(texts(g)).toContain('RACK 5/5');
  });
  const duel: DuelBoard = { p1: 87, p2: 91, up: 1, dunk: 'DUNK 2/3', names: ['P1', 'P2'], colors: ['#22d3ee', '#ff2d78'] };
  it('the duel tower writes both totals, both names and the dunk', () => {
    const g = recordingCtx(); paintDuel(g, 768, 440, duel);
    const t = texts(g);
    expect(t).toEqual(expect.arrayContaining(['87', '91', 'P1', 'P2', 'DUNK 2/3', 'DUNK DUEL']));
    expect(allFinite(g.calls)).toBe(true);
  });
  it('a judge\'s card writes its label and its number; a blank card writes nothing', () => {
    const g = recordingCtx(); paintCard(g, 256, 192, 'SILK', '9', 0.8);
    expect(texts(g)).toEqual(['SILK', '9']);
    const b = recordingCtx(); paintCardBlank(b, 256, 192);
    expect(texts(b)).toEqual([]);
  });
});

describe('facing', () => {
  it('a plane\'s front (−z) turned toward a point: the yaw puts the front\'s direction on that point', () => {
    for (const to of [{ x: 5, z: 3 }, { x: -4, z: 9 }, { x: 0, z: -7 }, { x: 8, z: 0 }]) {
      const from = { x: 1, z: -2 };
      const yaw = yawToward(from, to);
      const front = { x: -Math.sin(yaw), z: -Math.cos(yaw) };   // what rotation.y = yaw does to a plane's −z normal
      const d = { x: to.x - from.x, z: to.z - from.z }, l = Math.hypot(d.x, d.z);
      expect(front.x).toBeCloseTo(d.x / l, 6); expect(front.z).toBeCloseTo(d.z / l, 6);
    }
  });
  it('the same point is yaw 0, never NaN; stepToward walks along the line', () => {
    expect(yawToward({ x: 1, z: 1 }, { x: 1, z: 1 })).toBe(0);
    const p = stepToward({ x: 0, y: 4, z: 0 }, { x: 3, z: 4 }, 2.5);
    expect(p.x).toBeCloseTo(1.5, 6); expect(p.z).toBeCloseTo(2, 6); expect(p.y).toBe(4);
  });
});
