// NAMED DUNKS (2026-09-16).
//
// Some combinations are not a combo, they are somebody's dunk. The vocabulary already carries other people's — the
// SCORPION, LOST & FOUND and HIDE & SEEK are Jordan Kilganon's, the EASTBAY is the East Bay Funk Dunk — and the first
// one in the table is the owner's own: the KICK-UP EASTBAY, kicked up to yourself off your own foot on the runway and
// taken between the legs in the air.
import { describe, expect, it } from 'vitest';
import { SIGNATURE_DUNKS, signatureFor, RUNWAY_TRICKS, DUNK_TRICKS } from './DunkSystem';

describe('signature dunks', () => {
  it('the kick-up eastbay is a named dunk, credited', () => {
    const sig = signatureFor(['kickup'], ['eastbay']);
    expect(sig?.name).toBe('THE KICK-UP EASTBAY');
    expect(sig?.by).toBe('Elijah Bonds');
    expect(sig?.nod).toBeGreaterThan(0);
  });

  it('is a SEQUENCE, not a set of parts', () => {
    expect(signatureFor([], ['eastbay'])).toBeNull();                 // no kick-up: it is just an eastbay
    expect(signatureFor(['kickup'], [])).toBeNull();                  // no eastbay: it is just a kick-up
    expect(signatureFor(['kickup'], ['windmill'])).toBeNull();
    expect(signatureFor(['kickup'], ['eastbay', 'windmill'])).toBeNull();   // a chain past it is a different dunk
  });

  it('every signature names moves that actually exist', () => {
    const runway = new Set(RUNWAY_TRICKS.map((t) => t.id));
    const air = new Set(DUNK_TRICKS.map((t) => t.id));
    for (const sig of SIGNATURE_DUNKS) {
      if (sig.runway) expect(runway.has(sig.runway), `${sig.name}: ${sig.runway}`).toBe(true);
      for (const id of sig.air) expect(air.has(id), `${sig.name}: ${id}`).toBe(true);
      expect(sig.by.length, `${sig.name} has an author`).toBeGreaterThan(0);
    }
  });
});
