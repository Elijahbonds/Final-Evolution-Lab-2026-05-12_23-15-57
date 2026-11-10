// EVERY-SCREEN phase 1: a representative address for every screen, and what switches a screen off.
//
// A dynamic route ([slug], [token] …) needs one real address to be scored. Where the app itself links to one, the rig
// takes the first the app links to (`from`); where a row is needed, the rig makes it through the app's own API as one of
// its five people (`make`); where neither is possible on a database with no pending tables, the screen is "not scored"
// with the reason. Nothing here writes outside the rig's throwaway database.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { layoutsOf, type Screen } from './routes.mts';
import { ORIGIN, ROOT, sql, type People, type Person } from './rig.mts';

export interface Fixture {
  /** the address to open; absent = not scored, and `why` says why */
  url?: string;
  why?: string;
  /** score it as this person (default: the least-privileged person who gets the page) */
  as?: Person;
  /** when the screen is a 404 for everyone: what turns it on */
  offWhy?: string;
  note?: string;
}

/** The switches that turn a page into a 404, by the helper the page calls. Read from the page's own source. */
const SWITCHES: [RegExp, string][] = [
  [/isCoachStoreEnabled\(\)/, 'COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL)'],
  [/isCoachMarketplaceEnabled\(\)/, 'COACH_MARKETPLACE_ENABLED (find a coach)'],
  [/coachLiveEnabled\(\)/, 'NEXT_PUBLIC_COACH_LIVE_ENABLED (live coach sessions)'],
  [/isStudioShareEnabled\(\)/, 'STUDIO_SHARE_ENABLED (Studio share links)'],
  [/isLiveStreamScheduleEnabled\(\)/, 'LIVE_STREAM_SCHEDULE_ENABLED (the live schedule)'],
  [/isNexusStudioEnabled\(\)/, 'NEXUS_STUDIO_ENABLED (Nexus Studio)'],
];
export function switchesOf(s: Screen): string[] {
  const src = [s.file, ...layoutsOf(s.file)].map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
  return SWITCHES.filter(([re]) => re.test(src)).map(([, name]) => name);
}

const get = async (p: People, who: Person, path: string) => fetch(ORIGIN + path, { headers: p.cookies[who] ? { cookie: p.cookies[who] } : {} });
const post = async (p: People, who: Person, path: string, body: unknown) => fetch(ORIGIN + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(p.cookies[who] ? { cookie: p.cookies[who] } : {}) }, body: JSON.stringify(body) });

/** the first address matching `pattern` that the page at `page` links to, read as `who` */
async function firstLink(p: People, who: Person, page: string, pattern: RegExp): Promise<string | null> {
  const html = await (await get(p, who, page)).text();
  for (const m of html.matchAll(/href="([^"#?]+)[^"]*"/g)) if (pattern.test(m[1])) return m[1];
  return null;
}

const cache = new Map<string, Fixture>();
type Maker = (p: People) => Promise<Fixture>;

/** Dynamic routes, and the few fixed routes that need a query to show their screen. */
const MAKERS: Record<string, Maker> = {
  '/controller/[code]': async () => ({ url: '/controller/ABCD', note: 'a made-up room code: the screen a phone shows before the TV answers' }),
  '/party/[code]': async () => ({ url: '/party/ABCD', note: 'a made-up party code' }),
  '/screen/program/[lane]': async () => ({ url: '/screen/program/correctives' }),
  '/education/course/[id]': async () => ({ url: '/education/course/playbook' }),
  '/education/playbook/[chapter]': async (p) => ({ url: (await firstLink(p, 'solo', '/education/playbook', /^\/education\/playbook\/[^/]+$/)) ?? '/education/playbook/1' }),
  '/press/[slug]': async (p) => { const u = await firstLink(p, 'anon', '/press', /^\/press\/(?!library|receipt)[^/]+$/); return u ? { url: u } : { why: 'the press page links to no book' }; },
  '/team/[slug]': async (p) => { const u = await firstLink(p, 'anon', '/team', /^\/team\/[^/]+$/); return u ? { url: u } : { why: 'the team page links to no profile (no approved profile in the catalog)' }; },
  '/create/[discipline]': async (p) => { const u = await firstLink(p, 'solo', '/create', /^\/create\/[^/]+$/); return u ? { url: u } : { url: '/create/music' }; },
  // EVERY-SCREEN P3: the builder is scored with a program on it (the page builds a ?q= ask on load): the empty page is
  // one box and a button, and the program view is the screen phase 3 is about
  '/train/build': async () => ({ url: `/train/build?q=${encodeURIComponent('All I have is a band. Full body, 3 days a week.')}`, note: 'scored with the sample ask built: the program view' }),
  // the programs list links none while its tables are off: the first signature program's own address (lib/signature)
  '/train/programs/[id]': async (p) => { const u = await firstLink(p, 'solo', '/train/programs', /^\/train\/programs\/[^/]+$/); return { url: u ?? '/train/programs/vertical-jump', note: u ? undefined : 'the list links no program while it is switched off: opened by its address' }; },
  // a coach's invite, made through the coach's own API; the client's join link
  '/coach/join/[token]': async (p) => {
    const r = await post(p, 'coach', '/api/coach/invite', { use: 'many' });
    const j = await r.json().catch(() => null) as { invite?: { token?: string } } | null;
    return j?.invite?.token ? { url: `/coach/join/${encodeURIComponent(j.invite.token)}`, as: 'solo', note: 'a real invite made by the rig\'s coach, opened by an athlete who has not joined' } : { why: `the invite API answered ${r.status}` };
  },
  // "Film a set" opens from an exercise in the client's own session (?slot=): the seeded program's first exercise
  '/coach/form-review': async (p) => {
    const slot = sql(`select se.id from "SessionExercise" se join "Session" s on s.id = se."sessionId" join "Block" b on b.id = s."blockId" join "CoachingProgram" cp on cp.id = b."programId" where cp."clientId" = '${p.ids.client}' order by b."order", s."order", se."order" limit 1`);
    return slot ? { url: `/coach/form-review?slot=${slot}`, as: 'client', note: 'opened from the first exercise of the client\'s session, as the app links it' } : { why: 'needs an exercise in a coached program; the rig\'s coached pair was not made' };
  },
  '/coach/highlight/[id]': async () => ({ url: '/coach/highlight/none', as: 'solo', note: 'no highlight row exists on a new account: the screen for a link that names none' }),
  '/groups/[groupId]': async () => ({ url: '/groups/none', note: 'the group-booking table is not applied: any group link shows the dark screen' }),
  '/groups/trainer/[code]': async () => ({ url: '/groups/trainer/NONE', as: 'coach', note: 'the group-booking table is not applied: any trainer invite shows the dark screen' }),
  '/squads/[id]': async () => ({ url: '/squads/none', note: 'the teams-and-squads tables are not applied' }),
  '/squads/join/[token]': async () => ({ url: '/squads/join/none', note: 'the teams-and-squads tables are not applied' }),
  '/c/[code]': async () => ({ url: '/c/NONE00', note: 'no challenge row on the rig: the screen for a challenge link that no longer resolves', offWhy: "not switched off: a challenge code that does not exist is the app's 404 (a real challenge needs a row a player makes by sending one)" }),
  '/c/[code]/play': async () => ({ url: '/c/NONE00/play' }),
  '/card/[slug]': async (p) => { const slug = sql(`select slug from "CreatorCard" where "ownerId" = '${p.ids.solo}' and published limit 1`); return slug ? { url: `/card/${slug}` } : { why: 'needs a published creator card row; a new account has none' }; },
  '/u/[slug]': async (p) => { const slug = sql(`select slug from "CreatorCard" where "ownerId" = '${p.ids.solo}' and published limit 1`); return slug ? { url: `/u/${slug}` } : { why: 'needs a published creator card row; a new account has none' }; },
  '/p/[token]': async () => ({ why: 'needs a coach share-link row (a coach sharing a client\'s progress); none exists on a new account' }),
  '/consent/guardian/[token]': async () => ({ why: 'needs a guardian-consent row with its emailed token' }),
  '/guardian/report/[token]': async () => ({ why: 'needs a guardian report row with its emailed token' }),
  '/coach/[slug]': async () => ({ url: '/coach/none' }),
  '/coach/[slug]/book/[listingId]': async () => ({ url: '/coach/none/book/none' }),
  '/coach/[slug]/fee/[packageId]': async () => ({ url: '/coach/none/fee/none' }),
  '/coach/[slug]/programs/[lane]': async () => ({ url: '/coach/none/programs/dunking' }),
  '/coach/live/[room]': async () => ({ url: '/coach/live/none' }),
  '/coach/offers/[offer]': async () => ({ url: '/coach/offers/none' }),
  '/coach/review/[bookingId]': async () => ({ url: '/coach/review/none' }),
  '/program/[accessId]': async () => ({ url: '/program/none' }),
  '/session/[bookingId]': async () => ({ url: '/session/none' }),
  '/play/shared/[token]': async () => ({ url: '/play/shared/none' }),
};

export async function fixtureFor(s: Screen, p: People): Promise<Fixture> {
  if (cache.has(s.route)) return cache.get(s.route)!;
  let fx: Fixture;
  const make = MAKERS[s.route];
  if (make) { try { fx = await make(p); } catch (e) { fx = { why: `the fixture could not be made (${String(e).slice(0, 120)})` }; } }
  else if (s.dynamic) fx = { why: 'no fixture written for this dynamic route yet' };
  else fx = { url: s.route };
  const sw = switchesOf(s);
  if (sw.length) fx.offWhy = `switched off: ${sw.join('; or ')}`;
  else if (s.route === '/play/shared') fx.offWhy = 'a 404 by design: only its share links are pages (lib/nav/reachability.test.ts)';
  cache.set(s.route, fx);
  return fx;
}
