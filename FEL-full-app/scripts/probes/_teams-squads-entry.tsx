// Squads and teams on a phone, with no server (TEAMS-SQUADS, 2026-10-25). Bundled by scripts/probes/_teams-squads-probe.mts
// with esbuild and loaded into headless Chromium at 390 px. The views are built by the REAL pure core (lib/groups/
// activity.ts, feed.ts) from fixture members and rows — the awkward case: long names, a teen in the squad, an adult who
// shares and one who does not, a verified and an unverified jump — and every /api call is answered here.
// `window.__SCREEN` picks the screen: home | squad | team | soon | join.
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { GroupScreen } from '@/components/groups/group-screen';
import { GroupsHome } from '@/components/groups/groups-home';
import { JoinLanding } from '@/components/groups/join-landing';
import { TeamsPanel } from '@/components/groups/teams-panel';
import { boards, buddies, duoGoals, friendStreak, standings, teamRollup, trophyShelf, type Activity } from '@/lib/groups/activity';
import { buildFeed } from '@/lib/groups/feed';
import { dayOf, addDays, weekKeyOf, prevWeekKey } from '@/lib/groups/week';
import type { GroupAct, MemberFacts } from '@/lib/groups/types';
import type { GroupView } from '@/lib/groups/view';

const NOW = Date.now();
const today = dayOf(NOW);
const WEEK = weekKeyOf(NOW);
const d = (n: number) => addDays(today, -n);
const at = (n: number) => NOW - n * 86_400_000 - 3_600_000;
const m = (userId: string, name: string, o: Partial<MemberFacts> = {}): MemberFacts => ({
  groupId: 'g1', userId, role: 'member', shareMeasured: false, joinedAt: NOW - 40 * 86_400_000, name, band: 'adult', canSaveScan: false, onRoster: true, ...o,
});

function squadView(): GroupView {
  const members = [
    m('me', 'Alexandria', { role: 'owner', canSaveScan: true, shareMeasured: true }),
    m('jo', 'Jordan', { canSaveScan: true, shareMeasured: true }),
    m('sam', 'Sam', { band: 'teen' }),
    m('kai', 'Kai', { canSaveScan: true }),
  ];
  const act = (o: Partial<GroupAct>): GroupAct => ({ id: Math.random().toString(36), kind: 'reaction', dedupeKey: '', fromUserId: null, toUserId: null, ref: null, preset: null, points: null, createdAt: NOW, ...o });
  const a: Activity = {
    drillDays: { me: [today, d(1), d(2), d(3)], jo: [today, d(1), d(2), d(3)], sam: [d(1), d(2), d(3)], kai: [today, d(1), d(2), d(3), d(5)] },
    runs: [...Array.from({ length: 6 }, (_, i) => ({ userId: 'jo', at: at(i % 3), won: i < 3 })), { userId: 'sam', at: at(1), won: true }],
    prs: [{ userId: 'jo', mode: 'threePoint', modeName: 'Downtown', score: 31, previous: 27, at: at(1) }, { userId: 'sam', mode: 'threePoint', modeName: 'Downtown', score: 999, previous: 1, at: at(1) }],
    reps: [{ userId: 'me', id: 'r1', patternId: 'squat', reps: 24, at: at(0) }, { userId: 'jo', id: 'r2', patternId: 'lunge', reps: 16, at: at(2) }],
    jumps: [
      { userId: 'jo', id: 'j1', record: { type: 'cmj', heightCm: 52.3, plusMinusCm: 1.8, verified: true, blocks: [], source: 'live', fps: 60, trust: null, rsi: null }, at: at(1) },
      { userId: 'me', id: 'j2', record: { type: 'cmj', heightCm: 61, plusMinusCm: 4, verified: false, blocks: ['frameRate'], source: 'live', fps: 30, trust: null, rsi: null }, at: at(1) },
    ],
    challenges: [{ code: 'Jx81kPq2', ownerUserId: 'jo', modeName: 'Downtown', score: 31, at: at(1) }],
  };
  const acts: GroupAct[] = [
    act({ kind: 'reaction', fromUserId: 'jo', ref: `drill:me:${today}`, preset: 'fire' }),
    act({ kind: 'reaction', fromUserId: 'sam', ref: `drill:me:${today}`, preset: 'fire' }),
    act({ kind: 'reaction', fromUserId: 'me', ref: 'jump:j1', preset: 'goat' }),
    act({ kind: 'duo', fromUserId: 'me', toUserId: 'jo', ref: WEEK, preset: '5' }),
    act({ kind: 'challenge', fromUserId: 'jo', ref: 'Jx81kPq2', createdAt: at(1) }),
    act({ kind: 'trophy', preset: 'league_winner', toUserId: 'kai', ref: prevWeekKey(WEEK), points: 64, createdAt: at(2) }),
    act({ kind: 'trophy', preset: 'league_winner', toUserId: 'jo', ref: prevWeekKey(prevWeekKey(WEEK)), points: 58, createdAt: at(9) }),
    act({ kind: 'nudge', fromUserId: 'kai', toUserId: 'me', ref: today, preset: 'streak' }),
  ];
  return {
    id: 'g1', kind: 'squad', name: 'Midnight Panthers', color: 'violet', homeCourt: { ref: 'venue:venicebeach', name: 'Venice Beach Court' },
    me: { userId: 'me', role: 'owner', shareMeasured: true, canShareMeasured: true },
    can: { edit: true, invite: true, remove: true, assign: false, setRole: true, leave: false, delete: true },
    invite: { code: 'K7QM-3RZD', path: '/squads/join/K7QM3RZD~abc', open: true },
    members: members.map((x) => ({ userId: x.userId, name: x.name, role: x.role, you: x.userId === 'me' })),
    dailyDrillAssigned: false,
    buddies: buddies(members, a, 'me', acts, NOW),
    streak: friendStreak(members, a, NOW - 40 * 86_400_000, NOW),
    duos: duoGoals(members, a, acts, WEEK),
    boards: boards(members, a, WEEK),
    league: { weekKey: WEEK, standings: standings(members, a, WEEK) },
    trophies: trophyShelf(members, acts),
    feed: buildFeed(members, a, acts, 'me', WEEK),
    rollup: null,
    myChallenges: [{ code: 'Me12345a', modeName: 'Flight Night', score: 48, posted: false }],
    nudges: [{ fromName: 'Kai', key: 'streak' }],
  };
}

function teamView(): GroupView {
  const names = ['Alexandria Montgomery-Fitzgerald', 'Ben', 'Chloe', 'Dmitri', 'Esperanza', 'Finn'];
  const members = [m('coach', 'Coach Carter', { role: 'owner' }), ...names.map((n, i) => m(`a${i}`, n.split(' ')[0], { band: i % 2 ? 'teen' : 'adult' }))];
  const players = members.filter((x) => x.role === 'member'); // as lib/groups/server.ts: a team's athletes play
  const a: Activity = {
    drillDays: Object.fromEntries(names.map((_, i) => [`a${i}`, Array.from({ length: i }, (_x, k) => d(k))])),
    runs: names.flatMap((_, i) => Array.from({ length: (i * 2) % 5 }, (_x, k) => ({ userId: `a${i}`, at: at(k), won: false }))),
    prs: [], reps: [], jumps: [], challenges: [],
  };
  return {
    ...squadView(),
    id: 'g2', kind: 'team', name: 'Westside U16 Varsity Girls', color: 'gold', homeCourt: null,
    me: { userId: 'coach', role: 'owner', shareMeasured: false, canShareMeasured: false },
    can: { edit: true, invite: true, remove: true, assign: true, setRole: true, leave: false, delete: true },
    members: members.map((x) => ({ userId: x.userId, name: x.name, role: x.role, you: x.userId === 'coach' })),
    dailyDrillAssigned: true,
    buddies: buddies(players, a, 'coach', [], NOW),
    streak: friendStreak(players, a, NOW - 40 * 86_400_000, NOW),
    duos: [],
    boards: boards(players, a, WEEK),
    league: { weekKey: WEEK, standings: standings(players, a, WEEK) },
    trophies: [],
    feed: buildFeed(members, a, [], 'coach', WEEK),
    rollup: teamRollup(members, a, WEEK, true),
    myChallenges: [],
    nudges: [],
  };
}

const groups = [
  { id: 'g1', kind: 'squad', name: 'Midnight Panthers', color: 'violet', role: 'owner', members: 4 },
  { id: 'g2', kind: 'team', name: 'Westside U16 Varsity Girls', color: 'gold', role: 'owner', members: 7 },
];

let squad = squadView();
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  if (path === '/api/groups') return Response.json({ available: true, groups, certifiedCoach: true });
  if (path === '/api/groups/g1/act' && init?.body) {
    // a reaction lands: the next read shows it (the real server re-reads the acts)
    const b = JSON.parse(String(init.body));
    if (b.kind === 'react') squad = { ...squad, feed: squad.feed.map((f) => (f.key === b.item ? { ...f, reactions: f.reactions.map((r) => (r.key === b.reaction ? { ...r, count: r.count + 1, mine: true } : r)) } : f)) };
    if (b.kind === 'nudge') squad = { ...squad, buddies: squad.buddies.map((x) => (x.userId === b.to ? { ...x, canNudge: false, nudgedByMe: true } : x)) };
    return Response.json({ saved: true, already: false });
  }
  if (path === '/api/groups/g1') return Response.json({ available: true, group: squad });
  if (path === '/api/groups/g2') return Response.json({ available: true, group: teamView() });
  if (path === '/api/coach/programs') return Response.json({ programs: [{ role: 'coach', tree: { id: 'p1', name: 'Off-season strength and power block' } }] });
  return Response.json({ error: 'not_found' }, { status: 404 });
};

const screen = (window as unknown as { __SCREEN?: string }).__SCREEN ?? 'squad';
const body = screen === 'home'
  ? createElement(GroupsHome, { initial: { available: true, groups: groups as never, certifiedCoach: true }, initialNames: ['Swift Falcons', 'Electric Owls', 'Coastal Comets', 'Thunder Wolves'] })
  : screen === 'soon'
    ? createElement(GroupsHome, { initial: { available: false, groups: [] }, initialNames: [] })
    : screen === 'join'
      ? createElement(JoinLanding, { token: 'K7QM3RZD~abc', kind: 'squad', name: 'Midnight Panthers', color: 'violet', signedIn: true, loginHref: '/login' })
      : screen === 'team'
        ? createElement('div', { className: 'space-y-4' }, createElement(TeamsPanel), createElement(GroupScreen, { initial: teamView() }))
        : createElement(GroupScreen, { initial: squad });

createRoot(document.getElementById('root')!).render(createElement('div', { className: 'min-h-screen bg-[#050505] px-4 pb-24 pt-6' }, body));
