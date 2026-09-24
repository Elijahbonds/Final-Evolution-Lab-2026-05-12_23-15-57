// The runway has to teach its own moves (owner, 2026-09-16: "teach them on the runway").
//
// Every runway trick is a bare face button thrown while the RUN trigger is held. Nothing on screen has ever said so,
// and this pass added three more of them — the kick-up, the back handspring, the backflip. A move a player cannot find
// is a move that is not in the game, so the hold-run hint is built from RUNWAY_TRICKS itself and these tests are the
// thing that fails when a trick is added without a name to teach it by.
import { describe, expect, it } from 'vitest';
import { RUNWAY_TRICKS, runwayTeachLine, RUN_COMMIT_TEACH, STANDING_ONLY } from './DunkSystem';

const running = { distToLine: 8, speed: 6, ballThrown: false };

describe('the runway teaching line', () => {
  it('names every trick a PLAYER can throw — the button, and the direction when it takes one', () => {
    const line = runwayTeachLine(running);
    for (const t of RUNWAY_TRICKS) {
      if (!t.teach || STANDING_ONLY.has(t.id)) continue;
      expect(line).toContain(t.teach);
      expect(line).toContain(`${t.btn}${t.dir ? `+${t.dir.toUpperCase()}` : ''} ${t.teach}`);
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

describe('the Dubble Up (DUNK MOTION phase 10)', () => {
  it('the two-foot hop is gone: A on the run is the take-off, and nothing on the runway teaches a DOUBLE-UP', () => {
    expect(RUNWAY_TRICKS.some((t) => t.btn === 'A')).toBe(false);
    expect(runwayTeachLine({ distToLine: 2, speed: 6, ballThrown: false })).not.toContain('DOUBLE-UP');
  });
  it('with a helper out, the runway says what the Dubble Up is', () => {
    const line = runwayTeachLine({ distToLine: 5, speed: 6, ballThrown: false, dubble: true });
    expect(line).toContain('DUBBLE UP'); expect(line).toContain('A');
  });
});
