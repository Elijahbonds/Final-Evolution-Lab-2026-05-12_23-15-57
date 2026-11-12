// EVERY-SCREEN phase 1 (lane/every-screen-p01, 2026-11-10; docs/PLAN-EVERY-SCREEN-10PHASE.md): the exact list of screens.
//
// Every app/**/page.tsx a person can reach: app/dev/** and app/api/** are left out (developer pages are a 404 outside
// `next dev`). Discovered from the tree, so a new page is on the scorecard the day it lands. For each screen this file
// says which part of the app it belongs to and which phase of the plan owns it (2–9). WHO can see it is not written
// here: the rig measures it (scripts/every-screen/score.mts opens every screen as five people and records who gets the
// page, who is sent to sign in, and who gets a 404).
//
//   npx tsx scripts/every-screen/routes.mts            prints the list as JSON
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export type Phase = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type Area = 'training' | 'coaching' | 'first-run' | 'games' | 'yours' | 'learn-create-public';

export interface Screen {
  /** the route pattern, e.g. /coach/[slug]/book/[listingId] */
  route: string;
  /** app/-relative source file */
  file: string;
  dynamic: boolean;
  area: Area;
  phase: Phase;
  /** training and coaching: phases 2–5 */
  tc: boolean;
}

/**
 * Which phase owns a route. First match wins; the patterns follow the plan's own lists:
 *   2  the Train front door and the session player        3  the AI program builder
 *   4  numbers you can trust (jump, Mirror, sprint, bar speed, readiness, progress)
 *   5  booking, groups and the coach's day                6  the first five minutes
 *   7  around the games                                   8  your things
 *   9  learn, create and the public pages
 */
const OWNERS: [RegExp, Phase, Area][] = [
  [/^\/train\/build(\/|$)/, 3, 'training'],
  [/^\/train\/(jumps|speed|velocity|readiness|progress|shots|combine)(\/|$)/, 4, 'training'],
  [/^\/play\/mirror(\/|$)/, 4, 'training'],
  [/^\/screen(\/|$)/, 4, 'training'],
  [/^\/(train|training|workout|signature)(\/|$)/, 2, 'training'],
  [/^\/play\/(drills|training)(\/|$)/, 2, 'training'],
  [/^\/program(\/|$)/, 2, 'training'],
  [/^\/(groups|coach|coaches|sessions|session)(\/|$)/, 5, 'coaching'],
  [/^\/account\/(bookings|coaching)(\/|$)/, 5, 'coaching'],
  [/^\/(try|welcome|signup|login|age|consent|join)(\/|$)/, 6, 'first-run'],
  [/^\/$/, 6, 'first-run'],
  [/^\/(play|party|multiplayer|host|controller|arena|ladder|modes|c|venues|live)(\/|$)/, 7, 'games'],
  [/^\/(profile|account|settings|wallet|shop|store|closet|squads|support|cards|card|market|pro|u|p|admin)(\/|$)/, 8, 'yours'],
  [/.*/, 9, 'learn-create-public'],
];

export function ownerOf(route: string): { phase: Phase; area: Area } {
  for (const [re, phase, area] of OWNERS) if (re.test(route)) return { phase, area };
  return { phase: 9, area: 'learn-create-public' };
}

export function discover(): Screen[] {
  const out: Screen[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (name !== 'page.tsx') continue;
      const rel = relative(join(ROOT, 'app'), dir).split('\\').join('/');
      if (/^(api|dev)(\/|$)/.test(rel) || rel.split('/').some((s) => s.startsWith('_'))) continue;
      const segs = rel ? rel.split('/').filter((s) => !/^\(.*\)$/.test(s)) : [];
      const route = '/' + segs.join('/');
      const o = ownerOf(route);
      out.push({ route, file: relative(ROOT, p).split('\\').join('/'), dynamic: route.includes('['), area: o.area, phase: o.phase, tc: o.phase <= 5 });
    }
  };
  walk(join(ROOT, 'app'));
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

/** the nested layouts of a route (a layout can gate a whole folder) */
export function layoutsOf(file: string): string[] {
  const segs = file.replace(/\/page\.tsx$/, '').split('/');
  const out: string[] = [];
  for (let i = 1; i <= segs.length; i++) {
    const l = join(ROOT, ...segs.slice(0, i), 'layout.tsx');
    if (existsSync(l)) out.push(relative(ROOT, l));
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = discover();
  const by = (k: keyof Screen) => all.reduce<Record<string, number>>((a, s) => { const v = String(s[k]); a[v] = (a[v] ?? 0) + 1; return a; }, {});
  console.log(JSON.stringify({ total: all.length, trainingAndCoaching: all.filter((s) => s.tc).length, byPhase: by('phase'), byArea: by('area'), screens: all }, null, 1));
}
