// RUN-CAPTURE (FEL improvement pass): a headed run must be a saveable artifact, not a screenshot.
//
// The headed 7.5 re-score is the release gate. Without a capture, "7.2 on dance" is a number a person wrote
// down; with one, it is the press/response timeline, the body log, the HUD state, and the posted result in a
// file a probe can replay or a future run can diff against. QaTrace already records all of it under ?agent=1 —
// transcript() only packages what is already there. Nothing is graded here; this pins the packaging.
import { describe, expect, it } from 'vitest';
import { QaTrace } from './QaTrace';

describe('QaTrace.transcript — RUN-CAPTURE', () => {
  it('packages modeId, the timeline, the body log, the HUD snapshot, and the result into one v1 artifact', () => {
    let clock = 1_000;
    const qa = new QaTrace(() => (clock += 10));             // deterministic clock
    qa.press('A');
    qa.hud({ score: 120, banner: 'NICE' });
    qa.juice('scorePop');
    qa.body('takeoff', 14);
    qa.anim('dunk_windmill');

    const result = { outcome: 'WIN', score: 240 };
    const t = qa.transcript('dunkContest', result);

    expect(t.v).toBe(1);
    expect(t.modeId).toBe('dunkContest');
    expect(typeof t.capturedAt).toBe('string');
    expect(t.events).toHaveLength(5);                        // press + score + banner + juice + anim
    expect(t.events.map((e) => e.kind)).toEqual(['press', 'score', 'hud', 'juice', 'anim']);
    expect(t.bodyLog).toEqual([{ t: expect.any(Number), kind: 'takeoff', lagMs: 14 }]);
    expect(t.hud.score).toBe('120');
    expect(t.result).toEqual(result);
  });

  it('a transcript with no result yet reads null, and reset() leaves a clean one', () => {
    const qa = new QaTrace();
    qa.press('B');
    expect(qa.transcript('karateVersus', null).result).toBeNull();
    expect(qa.transcript('karateVersus', null).events).toHaveLength(1);
    qa.reset();
    const fresh = qa.transcript('karateVersus', null);
    expect(fresh.events).toHaveLength(0);
    expect(fresh.hud).toEqual({});
  });

  it('the artifact is JSON-round-trippable (a saved file is the whole point)', () => {
    const qa = new QaTrace();
    qa.press('START');
    qa.hud({ score: 7 });
    const t = qa.transcript('tiebreak', { outcome: 'LOSS', score: 4 });
    const back = JSON.parse(JSON.stringify(t));
    expect(back.modeId).toBe('tiebreak');
    expect(back.result.score).toBe(4);
    expect(back.events[0].kind).toBe('press');
  });
});
