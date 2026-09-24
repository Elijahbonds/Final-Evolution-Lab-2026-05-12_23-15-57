// The runway has to teach its own moves (owner, 2026-09-16: "teach them on the runway").
//
// Every runway trick is a bare face button thrown while the RUN trigger is held. Nothing on screen has ever said so,
// and this pass added three more of them — the kick-up, the back handspring, the backflip. A move a player cannot find
// is a move that is not in the game, so the hold-run hint is built from RUNWAY_TRICKS itself and these tests are the
// thing that fails when a trick is added without a name to teach it by.
import { describe, expect, it } from 'vitest';
import { RUNWAY_TRICKS, runwayTeachLine, doubleUpFits, DOUBLE_UP_WINDOW_M, DOUBLE_UP_MIN_SPEED, RUN_COMMIT_TEACH, STANDING_ONLY } from './DunkSystem';

const running = { distToLine: 8, speed: 6, ballThrown: false };

describe('the runway teaching line', () => {
  it('names every trick a PLAYER can throw — the button, and the direction when it takes one', () => {
    const line = runwayTeachLine(running);
    for (const t of RUNWAY_TRICKS) {
      if (!t.teach || t.id === 'doubleup' || STANDING_ONLY.has(t.id)) continue;
      expect(line).toContain(t.teach);
      expect(line).toContain(`${t.btn}${t.dir === 'up' ? '+UP' : ''} ${t.teach}`);
    }
  });

  it('every trick either teaches itself or is thrown by a PROP — nothing is silently undiscoverable', () => {
    const propThrown = new Set(['offglass', 'bounce']);   // the prop ring picks these; the player never presses for them
    for (const t of RUNWAY_TRICKS) expect(t.teach != null || propThrown.has(t.id)).toBe(true);
  });

  it('DUNK MOTION phase 8: on the run Y is the attempt (the J bends in) — taught until it is used; the self-lob is a standing throw', () => {
    expect(runwayTeachLine(running)).toContain(`Y ${RUN_COMMIT_TEACH}`);
    expect(runwayTeachLine({ ...running, committed: true })).not.toContain(RUN_COMMIT_TEACH);
    expect(runwayTeachLine(running)).not.toContain('Y LOB');
    expect(STANDING_ONLY.has('selflob')).toBe(true);
  });

  it('still says how to jump: the move list is an offer, not a replacement for the dunk', () => {
    expect(runwayTeachLine(running)).toContain('release to jump');
  });

  it('a lob in the air owns the line — catching it is the only thing that matters now', () => {
    expect(runwayTeachLine({ ...running, ballThrown: true })).toContain('CATCH IT');
  });
});

describe('the double-up window', () => {
  it('is offered only where it exists, and there it is the WHOLE line', () => {
    expect(runwayTeachLine(running)).not.toContain('DOUBLE-UP');
    const inWindow = runwayTeachLine({ distToLine: 2, speed: 6, ballThrown: false });
    expect(inWindow).toContain('DOUBLE-UP');
    expect(inWindow).not.toContain('HANDSPRING');
  });

  it('is wide enough to be pressed by a person: about half a second at a real run', () => {
    const seconds = DOUBLE_UP_WINDOW_M / 7;   // HOLD_RUN_MAX is 7 m/s
    expect(seconds).toBeGreaterThan(0.4);     // 1.8 m was 0.26 s — an expert input for an untaught move
  });

  it('is a GATHER, not a jump button: it needs the run under it', () => {
    expect(doubleUpFits(1, DOUBLE_UP_MIN_SPEED - 0.5)).toBe(false);   // walking in: that press is a jump
    expect(doubleUpFits(1, DOUBLE_UP_MIN_SPEED)).toBe(true);
    expect(doubleUpFits(DOUBLE_UP_WINDOW_M + 0.1, 7)).toBe(false);    // a whole stride out: that press is a jump
    expect(doubleUpFits(DOUBLE_UP_WINDOW_M, 7)).toBe(true);
  });
});
