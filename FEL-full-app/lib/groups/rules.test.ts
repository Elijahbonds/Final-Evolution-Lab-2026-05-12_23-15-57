import { describe, expect, it } from 'vitest';
import {
  ageBand, can, canRemove, canSetRole, checkGroupName, checkHomeCourt, firstName, groupHasMinor, homeCourtOptions, sharesMeasured,
  showsScores, squadNameChoices, squadNames, type GroupAction,
} from './rules';
import { GROUP_ROLES, MAX_MEMBERS } from './types';

const Y = new Date().getFullYear();

describe('roles and permissions', () => {
  const every: GroupAction[] = ['view', 'react', 'nudge', 'duo', 'post_challenge', 'leave', 'share_measured', 'see_invite', 'remove_member', 'assign', 'see_rollup', 'edit', 'rotate_invite', 'set_role', 'delete'];
  const table = (role: (typeof GROUP_ROLES)[number]) => every.filter((a) => can(role, a));

  it('a member takes part and leaves; nothing else', () => {
    expect(table('member')).toEqual(['view', 'react', 'nudge', 'duo', 'post_challenge', 'leave', 'share_measured']);
  });
  it('a coach adds the invite, removing members, assigning and the roll-up; never edits, roles or delete', () => {
    expect(table('coach')).toEqual(['view', 'react', 'nudge', 'duo', 'post_challenge', 'leave', 'share_measured', 'see_invite', 'remove_member', 'assign', 'see_rollup']);
  });
  it('the owner does everything except leave (a group is never left ownerless)', () => {
    expect(table('owner')).toEqual(every.filter((a) => a !== 'leave'));
  });
  it('no role, no permission', () => {
    for (const a of every) expect(can(null, a)).toBe(false);
  });
  it('removal: never the owner, never yourself; a coach removes members only', () => {
    expect(canRemove('owner', 'coach', false)).toBe(true);
    expect(canRemove('owner', 'member', false)).toBe(true);
    expect(canRemove('coach', 'member', false)).toBe(true);
    expect(canRemove('coach', 'coach', false)).toBe(false);
    expect(canRemove('owner', 'owner', false)).toBe(false);
    expect(canRemove('member', 'member', false)).toBe(false);
    expect(canRemove('owner', 'member', true)).toBe(false);
  });
  it('roles: only member <-> coach, and a coach must be certified', () => {
    expect(canSetRole('member', 'coach', true)).toBe(true);
    expect(canSetRole('member', 'coach', false)).toBe(false);
    expect(canSetRole('coach', 'member', false)).toBe(true);
    expect(canSetRole('owner', 'member', true)).toBe(false);
    expect(canSetRole('member', 'owner', true)).toBe(false);
  });
});

describe('fields: nothing typed except a coach\'s team name', () => {
  it('a squad name is two preset words, picked, never typed', () => {
    expect(squadNames()).toHaveLength(256);
    expect(checkGroupName('squad', 'Swift Falcons')).toEqual({ ok: true, name: 'Swift Falcons' });
    expect(checkGroupName('squad', '  swift   Falcons ').ok).toBe(false);
    expect(checkGroupName('squad', 'My Squad').ok).toBe(false);
    let i = 0;
    const picks = squadNameChoices(() => [0.1, 0.5, 0.9, 0.3][i++ % 4]);
    expect(picks).toHaveLength(4);
    for (const p of picks) expect(squadNames()).toContain(p);
  });
  it('a team name: 2–32 plain characters, no link, no handle, no email', () => {
    expect(checkGroupName('team', 'Westside U16 Girls')).toEqual({ ok: true, name: 'Westside U16 Girls' });
    expect(checkGroupName('team', "St. Mary's A-Team").ok).toBe(true);
    for (const bad of ['x', '', 'a'.repeat(33), 'see www.spam.example', 'dm @me', 'http://x.io', 'mail me at a@b.co', '<script>', 42]) {
      expect(checkGroupName('team', bad as string).ok, String(bad)).toBe(false);
    }
  });
  it('a home court is a playable venue key or nothing', () => {
    const opts = homeCourtOptions();
    expect(opts.length).toBeGreaterThan(3);
    expect(opts.every((o) => o.ref.startsWith('venue:'))).toBe(true);
    expect(checkHomeCourt(opts[0].ref)).toEqual({ ok: true, ref: opts[0].ref });
    expect(checkHomeCourt(null)).toEqual({ ok: true, ref: null });
    expect(checkHomeCourt('venue:lumaveniceshop').ok).toBe(false); // the shop is not a court
    expect(checkHomeCourt('studio:anything').ok).toBe(false);
  });
  it('member caps (new numbers)', () => {
    expect(MAX_MEMBERS).toEqual({ squad: 12, team: 60 });
  });
});

describe('people: minors are never exposed', () => {
  it('age bands: unknown is a minor', () => {
    expect(ageBand(Y - 30)).toBe('adult');
    expect(ageBand(Y - 15)).toBe('teen');
    expect(ageBand(null)).toBe('unknown');
    expect(ageBand(Y - 18)).toBe('teen'); // exactly 18 by year may be 17: not a verified adult
    expect(groupHasMinor([{ band: 'adult' }, { band: 'unknown' }])).toBe(true);
    expect(groupHasMinor([{ band: 'adult' }])).toBe(false);
  });
  it('measured numbers: an adult who saves them AND turned sharing on; never a minor, whatever the flag says', () => {
    expect(sharesMeasured({ band: 'adult', canSaveScan: true, shareMeasured: true })).toBe(true);
    expect(sharesMeasured({ band: 'adult', canSaveScan: false, shareMeasured: true })).toBe(false);
    expect(sharesMeasured({ band: 'adult', canSaveScan: true, shareMeasured: false })).toBe(false);
    expect(sharesMeasured({ band: 'teen', canSaveScan: true, shareMeasured: true })).toBe(false);
    expect(sharesMeasured({ band: 'unknown', canSaveScan: true, shareMeasured: true })).toBe(false);
    expect(showsScores({ band: 'teen' })).toBe(false);
    expect(showsScores({ band: 'adult' })).toBe(true);
  });
  it('friends see a first name, never an email or a surname', () => {
    expect(firstName('Jordan Lee Smith')).toBe('Jordan');
    expect(firstName('jo@example.com')).toBe('Player');
    expect(firstName(null)).toBe('Player');
  });
});
