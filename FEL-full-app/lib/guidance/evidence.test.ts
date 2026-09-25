import { describe, expect, it } from 'vitest';
import { MODE_DISCIPLINE, disciplineForMode, evidenceFrom } from './evidence';
import { suggestPathways } from './pathways';
import { FAMILIES } from '../nav/families';

describe('what a mode is evidence of', () => {
  it('reads the craft modes as their own craft, not as sport', () => {
    expect(disciplineForMode('dance')).toBe('dance');
    expect(disciplineForMode('music')).toBe('music');
    expect(disciplineForMode('acting')).toBe('acting');
    expect(disciplineForMode('storyMode')).toBe('scene');
  });

  it('reads the games as sport', () => {
    for (const k of ['dunkContest', 'karateEndless', 'surfing', 'soccer']) {
      expect(disciplineForMode(k), k).toBe('sport');
    }
  });

  it('SAYS NOTHING about a mode that means nothing', () => {
    // A party game is not somebody telling you what they want to be. Filing it under sport to complete the
    // table would make the counsellor confidently wrong, which is the one thing it must never be.
    expect(disciplineForMode('brainBrawl')).toBeNull();
    expect(disciplineForMode('carnival')).toBeNull();
    expect(disciplineForMode('nonsense')).toBeNull();
  });

  it('covers most of what is on the shelf, so the map has not silently rotted', () => {
    const shelved = FAMILIES.flatMap((f) => f.modes);
    const mapped = shelved.filter((m) => m in MODE_DISCIPLINE);
    expect(mapped.length / shelved.length).toBeGreaterThan(0.8);
  });
});

describe('building the evidence', () => {
  const day = (n: number) => new Date(2026, 8, n).toISOString();

  it('counts sessions per discipline', () => {
    const ev = evidenceFrom([{ mode: 'dunkContest', createdAt: day(1) }, { mode: 'dance', createdAt: day(1) }], []);
    expect(ev.sessionsByDiscipline.sport).toBe(1);
    expect(ev.sessionsByDiscipline.dance).toBe(1);
  });

  it('reads the Academy by the key its sessions are SAVED under — GameShell mode="music", never "musicAcademy"', () => {
    const ev = evidenceFrom([{ mode: 'music', createdAt: day(1) }, { mode: 'music', createdAt: day(2) }], []);
    expect(ev.sessionsByDiscipline.music).toBe(2);
    expect(ev.activeDaysByDiscipline?.music).toBe(2);
  });

  it('HOTFIX (2026-09-24): reads the racers by their saved keys — GameShell posts velocityKart / aeroAces', () => {
    // Before the fix the map said 'velocitykart' / 'aeroaces' (the Babylon modeIds), so a racing session was evidence
    // of nothing. These are the rows the kart and the plane actually write.
    const ev = evidenceFrom([
      { mode: 'velocityKart', createdAt: day(1) }, { mode: 'aeroAces', createdAt: day(2) }, { mode: 'dunkContest', createdAt: day(2) },
    ], []);
    expect(ev.sessionsByDiscipline.sport).toBe(3);
    expect(ev.activeDaysByDiscipline?.sport).toBe(2);
  });

  it('HOTFIX (2026-09-24): an old spelling still reads as its mode, and a prototype key is not a discipline', () => {
    expect(disciplineForMode('musicAcademy')).toBe('music');
    expect(disciplineForMode('velocitykart')).toBe('sport');
    expect(disciplineForMode('aeroaces')).toBe('sport');
    expect(disciplineForMode('constructor')).toBeNull();
    expect(disciplineForMode('toString')).toBeNull();
  });

  it('counts DISTINCT DAYS, because persistence beats one long evening', () => {
    const three = [day(1), day(1), day(1)].map((d) => ({ mode: 'dance', createdAt: d }));
    const spread = [day(1), day(2), day(3)].map((d) => ({ mode: 'dance', createdAt: d }));
    expect(evidenceFrom(three, []).activeDaysByDiscipline?.dance).toBe(1);
    expect(evidenceFrom(spread, []).activeDaysByDiscipline?.dance).toBe(3);
    expect(evidenceFrom(three, []).sessionsByDiscipline.dance).toBe(3);
  });

  it('ignores a session in a mode that carries no direction', () => {
    const ev = evidenceFrom([{ mode: 'brainBrawl', createdAt: day(1) }], []);
    expect(Object.keys(ev.sessionsByDiscipline)).toEqual([]);
  });

  it('counts published cards, and refuses a junk discipline on a row', () => {
    const ev = evidenceFrom([], [{ primary: 'music' }, { primary: 'not-a-discipline' }]);
    expect(ev.cardsByDiscipline.music).toBe(1);
    expect(Object.keys(ev.cardsByDiscipline)).toEqual(['music']);
  });

  it('passes a stated goal through untouched', () => {
    expect(evidenceFrom([], [], ['coach']).statedGoalTags).toEqual(['coach']);
  });
});

describe('the counsellor, once it finally has something to read', () => {
  const day = (n: number) => new Date(2026, 8, n).toISOString();

  it('suggests something for somebody who only dances', () => {
    const ev = evidenceFrom(
      [day(1), day(2), day(3), day(4)].map((d) => ({ mode: 'dance', createdAt: d })),
      [{ primary: 'dance' }],
    );
    const out = suggestPathways(ev);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].pathway.discipline).toBe('dance');
  });

  it('NEVER CLOSES A DOOR — a brand-new account still gets somewhere to start', () => {
    // The module's own stated rule, and the reason it exists: low evidence produces an invitation, never
    // "this is not for you".
    const out = suggestPathways(evidenceFrom([], []));
    expect(out.length).toBeGreaterThan(0);
  });

  it('shows its working, so a guardian can disagree on the facts', () => {
    const ev = evidenceFrom([day(1), day(2), day(3)].map((d) => ({ mode: 'dunkContest', createdAt: d })), []);
    const out = suggestPathways(ev);
    expect(out[0].because.join(' ')).toMatch(/session|day|card/i);
  });
});
