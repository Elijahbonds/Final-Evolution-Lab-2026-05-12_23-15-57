// TEAMS-SQUADS: the server side end to end against the in-memory tables (tests/helpers/fakeGroupsDb.ts): roles and
// permissions, invite/join/leave, the age and teen gates, minors never exposed, reactions only, the boards' sources,
// the graceful 503 before the pending SQL, and the weekly league rollover.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeGroupsDb, YEARS, type FakeUser } from '@/tests/helpers/fakeGroupsDb';
import {
  areSquadmates, createGroupFor, editGroup, groupAct, joinGroup, listGroups, loadGroupView, memberAction, previewInvite, deleteGroupFor,
} from '@/lib/groups/server';
import { resetGroupsProbe } from '@/lib/groups/store';
import { dailyDrillKey } from '@/lib/daily-drill/load';
import { codeOfToken, formatCode } from '@/lib/coach/inviteCode';
import { dayOf, prevWeekKey, weekDays, weekKeyOf } from '@/lib/groups/week';
import { ASSESSMENT_KIND } from '@/lib/assess/prqWrite';
import type { GroupView } from '@/lib/groups/view';

const ADA: FakeUser = { id: 'ada', name: 'Ada Lovelace', dobYear: YEARS.adult, optIn: true };
const BEN: FakeUser = { id: 'ben', name: 'Ben Ng', dobYear: YEARS.adult };
const TESS: FakeUser = { id: 'tess', name: 'Tess Kid', dobYear: YEARS.teen, optIn: true };
const KID: FakeUser = { id: 'kid', name: 'Small', dobYear: YEARS.child };
const BLANK: FakeUser = { id: 'blank', name: 'No Year', dobYear: null };
const COACH: FakeUser = { id: 'coach', name: 'Coach Carter', dobYear: YEARS.adult, certified: true };

beforeEach(() => { resetGroupsProbe(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });

async function squadOf(users: FakeUser[], extra: Parameters<typeof fakeGroupsDb>[0] = {}) {
  const f = fakeGroupsDb({ users: [ADA, BEN, TESS, KID, BLANK, COACH], ...extra });
  const made = await createGroupFor(f.db, users[0].id, { kind: 'squad', name: 'Swift Falcons', color: 'cyan' });
  expect(made.status).toBe(201);
  const id = String(made.body.id);
  const token = String(f.state.groups[0].inviteToken);
  for (const u of users.slice(1)) {
    // a minor cannot join through the gate today, so tests that need one in the group seat them directly
    f.state.members.push({ groupId: id, userId: u.id, role: 'member', shareMeasured: false, joinedAt: new Date(Date.now() - 86_400_000) });
  }
  return { ...f, id, token };
}
const view = async (db: Parameters<typeof loadGroupView>[0], id: string, who: string) => (await loadGroupView(db, id, who)).body.group as GroupView;

describe('before the pending SQL is applied: a clear "not yet", never a 500', () => {
  it('reads say available: false; every write answers 503 groups_not_ready', async () => {
    const { db, state } = fakeGroupsDb({ ready: false, users: [ADA, COACH] });
    expect(await listGroups(db, 'ada')).toEqual({ status: 200, body: { available: false, groups: [] } });
    expect(await loadGroupView(db, 'g', 'ada')).toEqual({ status: 200, body: { available: false } });
    expect(await previewInvite(db, { code: 'ABCD-2345' })).toEqual({ status: 200, body: { available: false } });
    for (const r of [
      await createGroupFor(db, 'ada', { kind: 'squad', name: 'Swift Falcons', color: 'cyan' }),
      await createGroupFor(db, 'coach', { kind: 'team', name: 'Westside', color: 'cyan' }),
      await joinGroup(db, 'ada', { code: 'ABCD-2345' }),
      await editGroup(db, 'g', 'ada', { color: 'gold' }),
      await memberAction(db, 'g', 'ada', { action: 'leave' }),
      await groupAct(db, 'g', 'ada', { kind: 'duo', with: 'ben', target: 3 }),
      await deleteGroupFor(db, 'g', 'ada'),
    ]) {
      expect(r.status).toBe(503);
      expect(r.body.error).toBe('groups_not_ready');
    }
    expect(state.executed).toEqual([]);
    expect(await areSquadmates(db, 'ada', 'ben')).toBe(false);
  });

  it('switches on once the tables appear (after the probe\'s TTL), with no deploy', async () => {
    const f = fakeGroupsDb({ ready: false, users: [ADA] });
    expect((await listGroups(f.db, 'ada')).body.available).toBe(false);
    f.state.ready = true;
    resetGroupsProbe(); // stands in for the 5-minute re-probe
    expect((await listGroups(f.db, 'ada')).body.available).toBe(true);
  });
});

describe('create', () => {
  it('an adult starts a squad: preset name, preset colour, a coded invite; the owner is its first member', async () => {
    const { db, state } = fakeGroupsDb({ users: [ADA] });
    const r = await createGroupFor(db, 'ada', { kind: 'squad', name: 'Swift Falcons', color: 'mint', homeCourt: 'venue:venicebeach' });
    expect(r.status).toBe(201);
    expect(state.members).toEqual([expect.objectContaining({ userId: 'ada', role: 'owner' })]);
    expect(codeOfToken(String(state.groups[0].inviteToken))).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  });
  it('refuses a typed squad name, an unknown colour or court, and a second group of the same name', async () => {
    const { db } = fakeGroupsDb({ users: [ADA] });
    expect((await createGroupFor(db, 'ada', { kind: 'squad', name: 'Ada’s Crew', color: 'cyan' })).body.error).toBe('name_invalid');
    expect((await createGroupFor(db, 'ada', { kind: 'squad', name: 'Swift Falcons', color: 'blue' })).body.error).toBe('color_invalid');
    expect((await createGroupFor(db, 'ada', { kind: 'squad', name: 'Swift Falcons', color: 'cyan', homeCourt: 'venue:nowhere' })).body.error).toBe('home_court_invalid');
    expect((await createGroupFor(db, 'ada', { kind: 'squad', name: 'Swift Falcons', color: 'cyan' })).status).toBe(201);
    expect((await createGroupFor(db, 'ada', { kind: 'squad', name: 'Swift Falcons', color: 'gold' })).body.error).toBe('name_taken');
  });
  it('a team is a certified coach\'s; a teen, a child or a blank year starts no squad today', async () => {
    const { db, state } = fakeGroupsDb({ users: [ADA, TESS, KID, BLANK, COACH] });
    expect((await createGroupFor(db, 'ada', { kind: 'team', name: 'Westside', color: 'cyan' })).body.error).toBe('teams_are_for_coaches');
    expect((await createGroupFor(db, 'coach', { kind: 'team', name: 'Westside U16', color: 'cyan' })).status).toBe(201);
    expect((await createGroupFor(db, 'tess', { kind: 'squad', name: 'Swift Falcons', color: 'cyan' })).body.error).toBe('guardian_consent_required');
    expect((await createGroupFor(db, 'kid', { kind: 'squad', name: 'Swift Falcons', color: 'cyan' })).body.error).toBe('under_13');
    expect((await createGroupFor(db, 'blank', { kind: 'squad', name: 'Swift Falcons', color: 'cyan' })).body.error).toBe('age_required');
    expect(state.groups).toHaveLength(1);
  });
});

describe('invite, join and leave', () => {
  it('by link, by typed code (any case, the dash forgiven), and a second join is "already"', async () => {
    const { db, state, id, token } = await squadOf([ADA]);
    const code = formatCode(codeOfToken(token)!);
    expect((await previewInvite(db, { code: code.toLowerCase() })).body).toMatchObject({ available: true, kind: 'squad', name: 'Swift Falcons', token });
    expect((await joinGroup(db, 'ben', { code: code.replace('-', '') })).body).toMatchObject({ result: 'joined', id });
    expect((await joinGroup(db, 'ben', { token })).body).toMatchObject({ result: 'already' });
    expect(state.members.map((m) => m.userId)).toEqual(['ada', 'ben']);
  });
  it('a closed invite and a made-up one answer the same 404; a rotated invite kills the old link', async () => {
    const { db, id, token } = await squadOf([ADA]);
    expect((await joinGroup(db, 'ben', { token: 'nope~nope' })).status).toBe(404);
    expect((await editGroup(db, id, 'ada', { inviteOpen: false })).status).toBe(200);
    expect((await joinGroup(db, 'ben', { token })).status).toBe(404);
    expect((await previewInvite(db, { token })).status).toBe(404);
    await editGroup(db, id, 'ada', { inviteOpen: true, rotateInvite: true });
    expect((await joinGroup(db, 'ben', { token })).status).toBe(404);
  });
  it('the age and teen gates run on join: a teen (no squad consent is live), a child and a blank year are refused and nothing is written', async () => {
    const { db, state, token } = await squadOf([ADA]);
    for (const [who, error] of [['tess', 'guardian_consent_required'], ['kid', 'under_13'], ['blank', 'age_required']] as const) {
      const r = await joinGroup(db, who, { token });
      expect(r.status).toBe(403);
      expect(r.body.error).toBe(error);
    }
    expect(state.members.map((m) => m.userId)).toEqual(['ada']);
  });
  it('a team: joining joins the coach\'s roster; a teen is refused by the coach loop\'s gate before anything is written', async () => {
    const f = fakeGroupsDb({ users: [ADA, TESS, COACH] });
    await createGroupFor(f.db, 'coach', { kind: 'team', name: 'Westside', color: 'gold' });
    const token = String(f.state.groups[0].inviteToken);
    expect((await joinGroup(f.db, 'tess', { token })).body.error).toBe('guardian_consent_required');
    expect(f.state.coachClients).toEqual([]);
    expect((await joinGroup(f.db, 'ada', { token })).body.result).toBe('joined');
    expect(f.state.coachClients).toEqual([expect.objectContaining({ coachId: 'coach', clientId: 'ada', via: 'team', endedAt: null })]);
  });
  it('a full squad says so; the owner cannot leave (they delete); a member leaves', async () => {
    const twelve = Array.from({ length: 11 }, (_, i) => ({ id: `u${i}`, name: `U${i}`, dobYear: YEARS.adult }));
    const { db, state, id, token } = await squadOf([ADA, ...twelve]);
    expect((await joinGroup(db, 'ben', { token })).body.error).toBe('group_full');
    expect((await memberAction(db, id, 'ada', { action: 'leave' })).body.error).toBe('owner_cannot_leave');
    expect((await memberAction(db, id, 'u3', { action: 'leave' })).body).toEqual({ left: true });
    expect(state.members.some((m) => m.userId === 'u3')).toBe(false);
  });
});

describe('roles and permissions on the server', () => {
  it('a member cannot edit, remove, set roles, assign or delete; the owner can; a coach must be certified', async () => {
    const { db, id } = await squadOf([ADA, BEN, COACH]);
    expect((await editGroup(db, id, 'ben', { color: 'gold' })).status).toBe(403);
    expect((await memberAction(db, id, 'ben', { action: 'remove', userId: 'coach' })).status).toBe(403);
    expect((await deleteGroupFor(db, id, 'ben')).status).toBe(403);
    expect((await editGroup(db, id, 'ada', { dailyDrill: true })).status).toBe(403); // a squad has no assigned drill
    expect((await memberAction(db, id, 'ada', { action: 'role', userId: 'ben', role: 'coach' })).status).toBe(403);
    expect((await memberAction(db, id, 'ada', { action: 'role', userId: 'coach', role: 'coach' })).status).toBe(200);
    expect((await memberAction(db, id, 'coach', { action: 'remove', userId: 'ada' })).status).toBe(403);
    expect((await memberAction(db, id, 'coach', { action: 'remove', userId: 'ben' })).status).toBe(200);
    expect((await editGroup(db, id, 'ada', { color: 'gold', name: 'Iron Owls' })).status).toBe(200);
    expect((await editGroup(db, id, 'ada', { motto: 'free text' })).body.error).toBe('unexpected_field');
  });
  it('no public page: a non-member gets the same 404 as no group', async () => {
    const { db, id } = await squadOf([ADA, TESS]);
    expect((await loadGroupView(db, id, 'ben')).status).toBe(404);
    expect((await loadGroupView(db, 'missing', 'ben')).status).toBe(404);
  });
});

describe('reactions only, nudges and duo goals', () => {
  it('a preset reaction to a visible feed item, once; no typed field; no unknown key; no invisible item', async () => {
    const today = dayOf(new Date());
    const { db, id, state } = await squadOf([ADA, BEN], { ledgerKeys: [dailyDrillKey('ben', today)] });
    const item = `drill:${today}`;
    expect((await groupAct(db, id, 'ada', { kind: 'react', item, reaction: 'fire' })).body).toEqual({ saved: true, already: false });
    expect((await groupAct(db, id, 'ada', { kind: 'react', item, reaction: 'fire' })).body).toEqual({ saved: true, already: true });
    expect((await groupAct(db, id, 'ada', { kind: 'react', item, reaction: 'fire', text: 'nice!' })).body.error).toBe('unexpected_field');
    expect((await groupAct(db, id, 'ada', { kind: 'comment', text: 'hi' })).body.error).toBe('kind_invalid');
    expect((await groupAct(db, id, 'ada', { kind: 'react', item, reaction: 'nice job' })).body.error).toBe('reaction_invalid');
    expect((await groupAct(db, id, 'ada', { kind: 'react', item: 'drill:1999-01-01', reaction: 'fire' })).status).toBe(404);
    const v = await view(db, id, 'ben');
    expect(v.feed.find((f) => f.key === item)?.reactions.find((r) => r.key === 'fire')).toMatchObject({ count: 1, mine: false });
    expect((await groupAct(db, id, 'ada', { kind: 'unreact', item, reaction: 'fire' })).status).toBe(200);
    expect(state.acts.filter((x) => x.kind === 'reaction')).toEqual([]);
  });
  it('a nudge: preset, to a buddy who has not done today\'s drill, once a day; shown to them', async () => {
    const today = dayOf(new Date());
    const { db, id } = await squadOf([ADA, BEN, TESS], { ledgerKeys: [dailyDrillKey('tess', today)] });
    expect((await groupAct(db, id, 'ada', { kind: 'nudge', to: 'ben', nudge: 'drill' })).body).toEqual({ saved: true, already: false });
    expect((await groupAct(db, id, 'ada', { kind: 'nudge', to: 'ben', nudge: 'streak' })).body).toEqual({ saved: true, already: true });
    expect((await groupAct(db, id, 'ada', { kind: 'nudge', to: 'tess', nudge: 'drill' })).body.error).toBe('already_done');
    expect((await groupAct(db, id, 'ada', { kind: 'nudge', to: 'ada', nudge: 'drill' })).status).toBe(404);
    expect((await groupAct(db, id, 'ada', { kind: 'nudge', to: 'ben', nudge: 'call me' })).body.error).toBe('nudge_invalid');
    expect((await view(db, id, 'ben')).nudges).toEqual([{ fromName: 'Ada', key: 'drill' }]);
    expect((await view(db, id, 'ada')).buddies.find((b) => b.userId === 'tess')).toMatchObject({ doneToday: true, canNudge: false });
  });
  it('a duo goal with another member at a preset target, once a week per pair', async () => {
    const { db, id } = await squadOf([ADA, BEN]);
    expect((await groupAct(db, id, 'ada', { kind: 'duo', with: 'ben', target: 4 })).body.error).toBe('target_invalid');
    expect((await groupAct(db, id, 'ada', { kind: 'duo', with: 'ben', target: 5 })).body.already).toBe(false);
    expect((await groupAct(db, id, 'ben', { kind: 'duo', with: 'ada', target: 3 })).body.already).toBe(true);
    expect((await view(db, id, 'ben')).duos).toEqual([expect.objectContaining({ aName: 'Ada', bName: 'Ben', target: 5, together: 0 })]);
  });
  it('a squad challenge reuses challenges v2: one of your own open links, posted once; a teen\'s shows no score', async () => {
    const now = new Date();
    const { db, id } = await squadOf([ADA, TESS], {
      links: [
        { code: 'AdaC0de1', ownerUserId: 'ada', modeKey: 'threePoint', score: 31, createdAt: now },
        { code: 'TessC0de', ownerUserId: 'tess', modeKey: 'threePoint', score: 4444, createdAt: now },
        { code: 'OldC0de1', ownerUserId: 'ada', modeKey: 'threePoint', score: 5, createdAt: new Date(now.getTime() - 3 * 86_400_000) },
      ],
    });
    expect((await groupAct(db, id, 'ada', { kind: 'challenge', code: 'TessC0de' })).status).toBe(404);
    expect((await groupAct(db, id, 'ada', { kind: 'challenge', code: 'OldC0de1' })).status).toBe(404);
    expect((await groupAct(db, id, 'ada', { kind: 'challenge', code: 'AdaC0de1' })).body.already).toBe(false);
    expect((await groupAct(db, id, 'tess', { kind: 'challenge', code: 'TessC0de' })).body.already).toBe(false);
    const v = await view(db, id, 'ada');
    const lines = v.feed.filter((f) => f.kind === 'challenge').map((f) => [f.line, f.href]);
    expect(lines).toContainEqual(['Ada posted a challenge in Downtown: beat 31', '/c/AdaC0de1']);
    expect(lines.find(([l]) => String(l).startsWith('Tess'))?.[0]).not.toContain('4444');
    expect(v.myChallenges).toEqual([expect.objectContaining({ code: 'AdaC0de1', posted: true })]);
  });
});

describe('minors never exposed; the boards draw only from real or verified data', () => {
  function rows(now: Date) {
    const day = dayOf(now);
    const t5 = (method: 'refined' | undefined, h: number) => ({ tests: [{ id: 'T5', t5: { poseFps: 60, heightPlusMinusCm: 1, jumps: [{ index: 1, valid: true, flightMs: 500, heightCm: h, ...(method ? { method, heightSdCm: 1 } : {}) }] } }] });
    return {
      ledgerKeys: [dailyDrillKey('ada', day), dailyDrillKey('tess', day)],
      games: [
        { userId: 'tess', mode: 'threePoint', score: 99, won: true, createdAt: now },
        { userId: 'tess', mode: 'threePoint', score: 1, won: false, createdAt: new Date(now.getTime() - 30 * 86_400_000) },
        { userId: 'ada', mode: 'threePoint', score: 31, won: true, createdAt: now },
        { userId: 'ada', mode: 'threePoint', score: 20, won: false, createdAt: new Date(now.getTime() - 30 * 86_400_000) },
      ],
      mirror: [{ id: 'm1', userId: 'ada', patternId: 'squat', reps: 12, createdAt: now }, { id: 'm2', userId: 'tess', patternId: 'squat', reps: 77, createdAt: now }],
      scans: [
        { id: 's1', userId: 'ada', kind: ASSESSMENT_KIND, metrics: t5(undefined, 70), createdAt: now }, // as stored today: frame edges only
        { id: 's2', userId: 'ada', kind: ASSESSMENT_KIND, metrics: t5('refined', 50), createdAt: now }, // a re-timed read
        { id: 's3', userId: 'tess', kind: ASSESSMENT_KIND, metrics: t5('refined', 55), createdAt: now },
      ],
    };
  }

  it('measured numbers stay hidden until an adult who saves them turns sharing on; a teen can never turn it on', async () => {
    const now = new Date();
    const { db, id } = await squadOf([ADA, TESS, BEN], rows(now));
    let v = await view(db, id, 'ben');
    expect(v.boards.reps).toEqual([]);
    expect(v.boards.jump).toEqual([]);
    expect((await memberAction(db, id, 'tess', { action: 'share', on: true })).body.error).toBe('share_adults_who_save_only');
    expect((await memberAction(db, id, 'ben', { action: 'share', on: true })).body.error).toBe('share_adults_who_save_only');
    expect((await memberAction(db, id, 'ada', { action: 'share', on: true })).body).toEqual({ saved: true, on: true });
    v = await view(db, id, 'ben');
    expect(v.boards.reps).toEqual([expect.objectContaining({ userId: 'ada', value: 12 })]);
    // the stored frame-edge read (70 cm) does not verify; the re-timed 50 cm does (lib/jump/seam.ts verifyJump)
    expect(v.boards.jump).toEqual([expect.objectContaining({ userId: 'ada', value: 50 })]);
    expect(v.boards.drill.map((r) => r.userId).sort()).toEqual(['ada', 'ben', 'tess']);
  });

  it('a teen\'s score, reps and jump never reach any view (the PR is an adult\'s; the reads gate inside the query)', async () => {
    const now = new Date();
    const f = await squadOf([ADA, TESS], rows(now));
    f.state.members.find((m) => m.userId === 'tess')!.shareMeasured = true; // even a stored flag cannot open it
    await memberAction(f.db, f.id, 'ada', { action: 'share', on: true });
    const v = await view(f.db, f.id, 'ada');
    // everything a member is shown about others (ids and the invite token are random text, so they are left out)
    const all = JSON.stringify({ members: v.members, buddies: v.buddies, boards: v.boards, league: v.league, feed: v.feed, duos: v.duos, trophies: v.trophies });
    for (const n of ['99', '77', '55', '21.7', 'Tess Kid']) expect(all).not.toContain(n);
    expect(v.feed.map((x) => x.line)).toContain('Ada set a new best in Downtown: 31');
    expect(v.feed.filter((x) => x.userId === 'tess')).toEqual([]);
    expect(v.feed.find((x) => x.kind === 'drill')?.line).toBe('Ada and Tess did the daily drill');
    const gated = f.state.wheres.filter((w) => w.model === 'mirrorSession' || w.model === 'workoutScan');
    expect(gated.every((w) => !!(w.where as any).user?.is?.scanSaveOptIn)).toBe(true);
    expect(f.state.wheres.filter((w) => w.model === 'gameSession.groupBy').every((w) => !!(w.where as any).user?.is?.dobYear)).toBe(true);
  });
});

describe('a team: the coach\'s roll-up and the assigned daily drill', () => {
  it('the coach sees counts for the athletes on their live roster; an athlete sees no roll-up', async () => {
    const f = fakeGroupsDb({ users: [ADA, BEN, COACH] });
    await createGroupFor(f.db, 'coach', { kind: 'team', name: 'Westside', color: 'gold' });
    const id = String(f.state.groups[0].id);
    const token = String(f.state.groups[0].inviteToken);
    await joinGroup(f.db, 'ada', { token });
    await joinGroup(f.db, 'ben', { token });
    f.state.coachClients.find((c) => c.clientId === 'ben')!.endedAt = new Date(); // Ben left the roster
    f.state.ledgerKeys.push(dailyDrillKey('ada', dayOf(new Date())));
    expect((await editGroup(f.db, id, 'coach', { dailyDrill: true })).status).toBe(200);
    expect((await editGroup(f.db, id, 'ada', { dailyDrill: false })).status).toBe(403);
    const coachView = await view(f.db, id, 'coach');
    expect(coachView.rollup?.rows.map((r) => [r.userId, r.drillDays])).toEqual([['ada', 1]]);
    expect(coachView.rollup?.drillAssigned).toBe(true);
    // a team's coach runs it: the league, boards and buddies are the athletes'
    expect(coachView.league.standings.map((r) => r.userId).sort()).toEqual(['ada', 'ben']);
    expect(coachView.buddies.some((b) => b.userId === 'coach')).toBe(false);
    expect(coachView.invite?.code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    const athleteView = await view(f.db, id, 'ada');
    expect(athleteView.rollup).toBeNull();
    expect(athleteView.invite).toBeNull();
    expect(athleteView.dailyDrillAssigned).toBe(true);
  });
});

describe('the weekly league rollover', () => {
  it('the first visit after a week ends settles it once, to its winner, and the shelf shows it', async () => {
    const now = new Date();
    const last = weekDays(prevWeekKey(weekKeyOf(now)));
    const f = await squadOf([ADA, BEN], { ledgerKeys: [dailyDrillKey('ada', last[0]), dailyDrillKey('ada', last[1]), dailyDrillKey('ben', last[2])] });
    // the group and both memberships are older than last week
    f.state.groups[0].createdAt = new Date(now.getTime() - 20 * 86_400_000);
    for (const m of f.state.members) m.joinedAt = new Date(now.getTime() - 20 * 86_400_000);
    const v1 = await view(f.db, f.id, 'ben');
    const trophies = f.state.acts.filter((x) => x.kind === 'trophy');
    expect(trophies).toEqual([expect.objectContaining({ dedupeKey: `league:${prevWeekKey(weekKeyOf(now))}`, toUserId: 'ada', points: 20, preset: 'league_winner' })]);
    expect(v1.trophies).toEqual([expect.objectContaining({ userId: 'ada', points: 20 })]);
    await view(f.db, f.id, 'ada');
    expect(f.state.acts.filter((x) => x.kind === 'trophy')).toHaveLength(1);
  });
});

describe('profile v2\'s friends: squadmates', () => {
  it('two members of one squad are friends; a team is not a friends list', async () => {
    const f = await squadOf([ADA, BEN]);
    expect(await areSquadmates(f.db, 'ada', 'ben')).toBe(true);
    expect(await areSquadmates(f.db, 'ada', 'tess')).toBe(false);
    expect(await areSquadmates(f.db, null, 'ben')).toBe(false);
    f.state.groups[0].kind = 'team';
    expect(await areSquadmates(f.db, 'ada', 'ben')).toBe(false);
  });
});
