// The guidance counsellor (2026-09-12).
// The behavioural tests matter, but the tests that matter MOST are the ones about what it must
// never do to a young person: close a door, or deliver a verdict it cannot support.
import { describe, it, expect } from 'vitest';
import {
  suggestPathways, adjacentPathways, counsellorNote, pathwaysForDiscipline, PATHWAYS,
  type ActivityEvidence,
} from '../../lib/guidance/pathways';
import { DISCIPLINES } from '../../lib/creator/creative-card-types';

const ev = (over: Partial<ActivityEvidence> = {}): ActivityEvidence => ({
  sessionsByDiscipline: {}, cardsByDiscipline: {}, ...over,
});

describe('it reads behaviour, not self-report', () => {
  it('follows what someone keeps doing', () => {
    const s = suggestPathways(ev({ sessionsByDiscipline: { music: 20 }, cardsByDiscipline: { music: 3 } }));
    expect(s[0].pathway.discipline).toBe('music');
  });

  it('weights FINISHING above starting', () => {
    const finisher = suggestPathways(ev({ cardsByDiscipline: { art: 3 } }))[0];
    const starter = suggestPathways(ev({ sessionsByDiscipline: { art: 3 } }))[0];
    expect(finisher.strength).toBeGreaterThanOrEqual(starter.strength);
    expect(finisher.because.join(' ')).toMatch(/finish/);
  });

  it('weights persistence above a single binge', () => {
    const habit = suggestPathways(ev({ sessionsByDiscipline: { dance: 6 }, activeDaysByDiscipline: { dance: 6 } }));
    expect(habit[0].because.join(' ')).toMatch(/habit, not a one-off/);
  });

  it('respects a goal a coach recorded, without overriding the behaviour', () => {
    const s = suggestPathways(ev({ statedGoalTags: ['engineer'], sessionsByDiscipline: { sport: 2 } }));
    expect(s.some((x) => x.pathway.id === 'engineer')).toBe(true);
    expect(s.find((x) => x.pathway.id === 'engineer')!.because.join(' ')).toMatch(/told a coach/);
  });
});

describe('IT NEVER CLOSES A DOOR', () => {
  it('gives a blank-slate person invitations across DIFFERENT disciplines, not an empty screen', () => {
    const s = suggestPathways(ev());
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => x.exploratory)).toBe(true);
    const disciplines = new Set(s.map((x) => x.pathway.discipline));
    expect(disciplines.size).toBe(s.length);            // spread, not four flavours of one thing
  });

  it('labels thin evidence as exploratory rather than concluding from it', () => {
    const s = suggestPathways(ev({ sessionsByDiscipline: { cooking: 1 } }));
    expect(s[0].exploratory).toBe(true);
  });

  it('never tells anyone a pathway is not for them — no negative verdicts exist', () => {
    const s = suggestPathways(ev({ cardsByDiscipline: { music: 9 } }));
    const text = (counsellorNote(s) + ' ' + s.flatMap((x) => x.because).join(' ')).toLowerCase();
    for (const bad of ['not for you', 'unsuited', 'should not', "can't", 'cannot do', 'lack']) {
      expect(text).not.toContain(bad);
    }
  });

  it('says out loud that the top suggestion is not the only road', () => {
    const s = suggestPathways(ev({ cardsByDiscipline: { sport: 5 } }));
    expect(counsellorNote(s)).toMatch(/not the only one/);
  });

  it('keeps the map wide by surfacing adjacent pathways it did NOT suggest', () => {
    const s = suggestPathways(ev({ cardsByDiscipline: { music: 6 } }), 2);
    const adj = adjacentPathways(s);
    expect(adj.length).toBeGreaterThan(0);
    const shown = new Set(s.map((x) => x.pathway.id));
    for (const a of adj) expect(shown.has(a.id)).toBe(false);
  });

  it('every pathway stays reachable — none is ever removed from the map', () => {
    const s = suggestPathways(ev({ cardsByDiscipline: { sport: 50 } }));
    expect(PATHWAYS.length).toBeGreaterThan(s.length);
    expect(pathwaysForDiscipline('music').length).toBeGreaterThan(0);   // still there, still listed
  });
});

describe('it shows its working', () => {
  it('every suggestion names the evidence behind it', () => {
    const s = suggestPathways(ev({ sessionsByDiscipline: { dance: 4 }, cardsByDiscipline: { dance: 1 } }));
    for (const x of s) expect(x.because.length).toBeGreaterThan(0);
  });
  it('gives ONE concrete next step, doable this week', () => {
    for (const p of PATHWAYS) {
      expect(p.firstStep.length).toBeGreaterThan(20);
      expect(p.looksLike.length).toBeGreaterThan(20);
    }
  });
});

describe('coverage', () => {
  it('every discipline the card system has, the counsellor can guide', () => {
    for (const d of DISCIPLINES) {
      expect(pathwaysForDiscipline(d).length, `no pathway for ${d}`).toBeGreaterThan(0);
    }
  });
});
