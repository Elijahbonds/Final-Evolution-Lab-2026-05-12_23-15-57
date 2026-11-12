// hoops-p06 (1v1/3v3 phase 6 "flow and pace"): the board race has no die — the ball's bounce spot, the seal and a jump that is up decide
// it; `hoops.boardBounceOn` 0 puts the modes' dice line back (the modes keep it behind the knob; pinned by the scan below).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { boardPick, bounceSpot, racerScore, BOARD_BOUNCE_ON, BOARD_TAKE_Y_M, BOARD_JUMP_EDGE_M, boardBounceOn } from './rebound';
import { FEEL_KNOB_BY_ID } from '../../feel-panel/knobs';

const O = { boxEdge: 1.6, jumpWindowSec: 0.7 };

describe('hoops/rebound — the bounce decides', () => {
  it('ships on; the knob rows carry the shipped defaults', () => {
    expect(BOARD_BOUNCE_ON).toBe(true);
    expect(boardBounceOn()).toBe(true);
    expect(FEEL_KNOB_BY_ID.get('hoops.boardBounceOn')?.def).toBe(1);
    expect(FEEL_KNOB_BY_ID.get('hoops.boardTakeYM')?.def).toBe(BOARD_TAKE_Y_M);
    expect(FEEL_KNOB_BY_ID.get('hoops.boardJumpEdgeM')?.def).toBe(BOARD_JUMP_EDGE_M);
  });
  it('a ball under the take height and not climbing is taken where it is', () => {
    const s = bounceSpot({ x: 1, y: 0.12, z: 2 }, { x: 0, y: 0, z: 0 });
    expect(s.x).toBeCloseTo(1, 6); expect(s.z).toBeCloseTo(2, 6); expect(s.t).toBe(0);
  });
  it('a ball flying away comes down further on: the spot follows its flight', () => {
    const s = bounceSpot({ x: 0, y: 3, z: 0 }, { x: 0, y: 2, z: 4 });
    // up 2 m/s from 3 m to under 2.4 m: ≈ 0.6 s of flight, ≈ 2.4 m on
    expect(s.z).toBeGreaterThan(2); expect(s.z).toBeLessThan(3); expect(s.x).toBeCloseTo(0, 6);
  });
  it('the same situation gives the same board, every time (no roll anywhere)', () => {
    const r = [{ team: 'me' as const, pos: { x: 0, z: 1 }, boxing: false }, { team: 'foe' as const, pos: { x: 0.3, z: 1.2 }, boxing: false }];
    const a = boardPick(r, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, O);
    for (let i = 0; i < 20; i++) expect(boardPick(r, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, O)).toEqual(a);
    expect(a.team).toBe('me');
  });
  it('the nearer body to where it comes down wins it, not the one nearer it now', () => {
    const r = [{ team: 'me' as const, pos: { x: 0, z: 0.5 }, boxing: false }, { team: 'foe' as const, pos: { x: 0, z: 3 }, boxing: false }];
    expect(boardPick(r, { x: 0, y: 3, z: 0 }, { x: 0, y: 1, z: 5 }, O).team).toBe('foe');   // swatted out toward him
    expect(boardPick(r, { x: 0, y: 3, z: 0 }, { x: 0, y: 1, z: 0 }, O).team).toBe('me');    // straight down
  });
  it('a seal is worth the mode\'s body length, a jump that is up its edge, a jump long over nothing', () => {
    const spot = { x: 0, z: 0 };
    expect(racerScore({ team: 'me', pos: { x: 2, z: 0 }, boxing: true }, spot, 1.6, 0.7, 0.5)).toBeCloseTo(0.4, 9);
    expect(racerScore({ team: 'me', pos: { x: 2, z: 0 }, boxing: false, jumpAge: 0.3 }, spot, 1.6, 0.7, 0.5)).toBeCloseTo(1.5, 9);
    expect(racerScore({ team: 'me', pos: { x: 2, z: 0 }, boxing: false, jumpAge: 1.2 }, spot, 1.6, 0.7, 0.5)).toBeCloseTo(2, 9);
    expect(racerScore({ team: 'me', pos: { x: 2, z: 0 }, boxing: false, jumpAge: Infinity }, spot, 1.6, 0.7, 0.5)).toBeCloseTo(2, 9);
  });
  it('a dead heat goes to the defence', () => {
    const r = [{ team: 'me' as const, pos: { x: -1, z: 0 }, boxing: false }, { team: 'foe' as const, pos: { x: 1, z: 0 }, boxing: false }];
    expect(boardPick(r, { x: 0, y: 0.12, z: 0 }, { x: 0, y: 0, z: 0 }, { ...O, shooter: 'me' }).team).toBe('foe');
    expect(boardPick(r, { x: 0, y: 0.12, z: 0 }, { x: 0, y: 0, z: 0 }, { ...O, shooter: 'foe' }).team).toBe('me');
  });
  it('both modes call it behind the knob, and the dice line is still there for 0', () => {
    const one = readFileSync('lib/babylon/modes/OneVOneMode.ts', 'utf8');
    expect(one).toMatch(/const edge = boardBounceOn\(\)\s*\? \(boardPick\(/);
    expect(one).toMatch(/: \(foeD - meD\) \+ \(boxing \? BOX_OUT_EDGE : 0\) \+ \(Math\.random\(\) - 0\.5\) \* REBOUND_JITTER;/);
    const three = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');
    expect(three).toMatch(/const winner = boardBounceOn\(\)\s*\? boardPick\(/);
    expect(three).toMatch(/: boardWinner\(bodies, ball\.getAbsolutePosition\(\)\);/);
  });
});
