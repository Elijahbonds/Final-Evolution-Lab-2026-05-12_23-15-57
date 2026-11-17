import { afterEach, describe, expect, it } from 'vitest';
import { trapEscape, stepBackRead, ESCAPE_READ_ON, ESCAPE_LATE_SEC, TRAP_READ_ON, TRAP_GAP_MIN_M, ESCAPE_STRIP_REACH_M, PASS_APART_M } from './escapeRead';
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
  it('an open trap (a body fits between them: 2 x the stand-off + trapGapMinM): the cross splits it, either way; 1.6 m apart is shut', () => {
    const half = (TRAP_GAP_MIN_M + PASS_APART_M) / 2 + 0.01;
    const men = [{ at: { x: half, z: 1.0 }, read: SET }, { at: { x: -half, z: 1.0 }, read: SET }];
    expect(trapEscape(H, 0, 'right', men).kind).toBe('split');
    expect(trapEscape(H, 0, 'left', men).kind).toBe('split');
    const shut = [{ at: { x: 0.8, z: 1.0 }, read: SET }, { at: { x: -0.8, z: 1.0 }, read: SET }];
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
