import { afterEach, describe, expect, it } from 'vitest';
import { trapEscape, stepBackRead, ESCAPE_READ_ON, ESCAPE_LATE_SEC, TRAP_READ_ON, TRAP_GAP_MIN_M, ESCAPE_STRIP_REACH_M, PASS_APART_M, passApartM, TRAP_SQUEEZE_ON, SQUEEZE_STANDOFF_M, SQUEEZE_SEC } from './escapeRead';
import { resetFeelForTests } from '../../../feel-panel/feel';
import { FEEL_KNOB_BY_ID } from '../../../feel-panel/knobs';
import type { ManRead } from '../rulebook';

// The handler at the origin facing +z (yaw 0): his right is +x.
const H = { x: 0, z: 0 };
const SET: ManRead = { closingMps: 0, lateralMps: 0, offBalance: false, moveSide: null };
const BIT: ManRead = { closingMps: 2.5, lateralMps: 0, offBalance: false, moveSide: null };

describe('escapeRead (hoops-gather G3: escapes read the defenders, never a roll)', () => {
  afterEach(() => resetFeelForTests());
  it('the knobs default to the constants', () => {
    expect(FEEL_KNOB_BY_ID.get('hoops.escapeReadOn')!.def).toBe(ESCAPE_READ_ON);
    expect(FEEL_KNOB_BY_ID.get('hoops.escapeLateSec')!.def).toBe(ESCAPE_LATE_SEC);
    expect(FEEL_KNOB_BY_ID.get('hoops.trapGapMinM')!.def).toBe(TRAP_GAP_MIN_M);
    expect(FEEL_KNOB_BY_ID.get('hoops.trapReadOn')!.def).toBe(TRAP_READ_ON);
    expect(FEEL_KNOB_BY_ID.get('hoops.trapSqueezeOn')!.def).toBe(TRAP_SQUEEZE_ON);
    expect(FEEL_KNOB_BY_ID.get('hoops.trapSqueezeM')!.def).toBe(SQUEEZE_STANDOFF_M);
    expect(FEEL_KNOB_BY_ID.get('hoops.trapSqueezeSec')!.def).toBe(SQUEEZE_SEC);
    expect(FEEL_KNOB_BY_ID.get('hoops.escapeStripReachM')!.def).toBe(ESCAPE_STRIP_REACH_M);
  });
  it('the hop-back beats a man on his heels (giving ground) or off balance — never a set man, nor one closing at me', () => {
    expect(stepBackRead(SET).beat).toBe(false);
    expect(stepBackRead(BIT).beat).toBe(false);
    expect(stepBackRead({ ...SET, closingMps: -1.5 }).beat).toBe(true);
    expect(stepBackRead({ ...SET, closingMps: -0.3 }).beat).toBe(false);
    expect(stepBackRead({ ...SET, offBalance: true }).beat).toBe(true);
  });
  it('a tight trap (side by side, 1.10 m apart): a cross to either side is into the closed side — stripped, by the man on that side', () => {
    const men = [{ at: { x: 0.55, z: 1.0 }, read: SET }, { at: { x: -0.55, z: 1.0 }, read: SET }];
    expect(trapEscape(H, 0, 'right', men)).toEqual({ kind: 'strip', by: 0 });
    expect(trapEscape(H, 0, 'left', men)).toEqual({ kind: 'strip', by: 1 });
  });
  it('the squeeze (on): a body fits between two men 1.6 m apart; off, it takes the game stand-off, 2.2 m', () => {
    expect(passApartM()).toBeCloseTo(2 * SQUEEZE_STANDOFF_M, 6);
    const men = [{ at: { x: 0.81, z: 1.0 }, read: SET }, { at: { x: -0.81, z: 1.0 }, read: SET }];
    expect(trapEscape(H, 0, 'right', men).kind).toBe('split');
    expect(trapEscape(H, 0, 'right', men, { passApartM: PASS_APART_M })).toEqual({ kind: 'strip', by: 0 });
  });
  it('an open trap (a body fits between them: 2 x the stand-off + trapGapMinM): the cross splits it, either way; 1.4 m apart is shut', () => {
    const half = (TRAP_GAP_MIN_M + passApartM()) / 2 + 0.01;
    const men = [{ at: { x: half, z: 1.0 }, read: SET }, { at: { x: -half, z: 1.0 }, read: SET }];
    expect(trapEscape(H, 0, 'right', men).kind).toBe('split');
    expect(trapEscape(H, 0, 'left', men).kind).toBe('split');
    const shut = [{ at: { x: 0.7, z: 1.0 }, read: SET }, { at: { x: -0.7, z: 1.0 }, read: SET }];
    expect(trapEscape(H, 0, 'right', shut)).toEqual({ kind: 'strip', by: 0 });
  });
  it('both men on one side: a cross the other way is open — only a man who bit is late; out of reach is not a strip', () => {
    const men = [{ at: { x: 0.5, z: 0.9 }, read: SET }, { at: { x: 0.9, z: 0.3 }, read: BIT }];
    expect(trapEscape(H, 0, 'left', men)).toEqual({ kind: 'open', beat: [1] });
    const far = [{ at: { x: 0.3, z: ESCAPE_STRIP_REACH_M + 0.2 }, read: SET }];
    expect(trapEscape(H, 0, 'right', far)).toEqual({ kind: 'open', beat: [] });
  });
  it('the frame turns with the handler: facing -x (yaw -pi/2) his right is +z', () => {
    const men = [{ at: { x: -1.0, z: 0.5 }, read: SET }];
    expect(trapEscape(H, -Math.PI / 2, 'right', men)).toEqual({ kind: 'strip', by: 0 });
    expect(trapEscape(H, -Math.PI / 2, 'left', men).kind).toBe('open');
  });
});
