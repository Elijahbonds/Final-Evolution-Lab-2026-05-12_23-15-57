// QA P1-20 (2026-09-27): "Game Night: lineup stop 1 is Game Night itself". The night opens with the native 3D round on
// purpose (ARENA-10PHASE P7: a shuffled night used to leave /play/carnival before Court Carnival's canvas ever mounted),
// but the stop was labelled with MODE_INFO.carnival.name — "Game Night", the name of the whole night. It reads as the Court
// Carnival round it is now, and no stop in any night is labelled Game Night.
import { describe, expect, it } from 'vitest';
import { CARNIVAL_EXTERNAL_POOL, NATIVE_STOP_LABEL, carnivalStopLabel, drawCarnivalLineup } from './carnival-run';
import { MODE_INFO, VENUES } from './game-data';

describe('Game Night\'s lineup', () => {
  it('across 100 nights no stop is labelled Game Night, and the native round is the Court Carnival, first', () => {
    for (let n = 0; n < 100; n++) {
      const lineup = drawCarnivalLineup();
      const labels = lineup.map(carnivalStopLabel);
      expect(labels).not.toContain(MODE_INFO.carnival.name);
      expect(labels[0]).toBe(NATIVE_STOP_LABEL);
      expect(lineup.filter((s) => s === 'carnival')).toHaveLength(1);        // the 3D round once, never repeated
      expect(new Set(lineup).size).toBe(lineup.length);
      for (const s of lineup.slice(1)) expect(CARNIVAL_EXTERNAL_POOL as readonly string[]).toContain(s);
    }
  });

  it('the Court Carnival venue card lists the native round\'s real events', () => {
    const card = VENUES.find((v) => v.key === 'courtcarnival')!;
    for (const e of ['Slam Rush', 'Strike Storm', 'Trick Gauntlet', 'Hot Shot', 'Coin Storm', 'Counter Strike']) expect(card.modes).toContain(e);
  });

  it('external stops keep their own mode names', () => {
    expect(carnivalStopLabel('threePoint')).toBe(MODE_INFO.threePoint.name);
  });
});
