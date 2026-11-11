// EVERY-SCREEN P5: the plan's last training gate — "All 52 training and coaching screens pass all four checks, or are
// listed with the reason" — as one table, from the rig's latest reading (ES_OUT/routes, re-judged with
// lib/every-screen/judge.ts). Writes docs/every-screen/TRAINING-SCREENS.md.
//
//   ES_OUT=<the run's folder> npx tsx scripts/every-screen/training-list.mts
//
// A screen that does not pass is listed with what failed (the judge's own words) and why it stays: the REASONS below are
// the lane's findings, each one checked on the rig. The list counts what the plan counts: the phase 1–5 entries of
// docs/every-screen/screen-list (scored, switched off, or an address that redirects to another training screen).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './rig.mts';
import { readResults } from './results.mts';
import * as judgeNs from '../../lib/every-screen/judge.ts';

// the CommonJS interop the report uses (scripts/every-screen/report.mts)
const { CHECKS, judge } = ((judgeNs as { default?: unknown }).default ?? judgeNs) as typeof judgeNs;

const BOOKING_SQL = 'prisma/pending/2026-11-02-group-booking.sql';
/** Why a screen that fails stays as it is (checked on the rig in phase 5). Keyed by route. */
const REASONS: Record<string, string> = {
  '/groups': `Group booking is switched off until the owner applies ${BOOKING_SQL} and sets the business owner: the screen says "Opens soon", why, and what to do instead. With the SQL applied (the LIT rig) joining is 4 taps, a 1:1 is 5, a cancel is 3 with the rule first.`,
  '/groups/[groupId]': 'The same switch as /groups (a shared group link).',
  '/groups/one-on-one': 'The same switch as /groups.',
  '/coach/groups': 'The same switch as /groups. With the SQL applied, today\'s session opens on its roster: one tap a person.',
  '/train/combine': 'Saving combines is switched off until the combine tables are applied (lib/combine/store.ts combineReady). The line is the owner-approved one.',
  '/coach/combine': 'The same combine switch; the coach can still run a combine on the device. Also over the word budget: the owner-approved switched-off line and the how-to.',
  '/train/programs': 'Signature programs are switched off until their tables are applied and the owner approves programs (owner-approvals #469); the line is the owner-approved one.',
  '/train/programs/[id]': "Shown only to the owner while programs are off: the owner's review of a program (its sources, gaps and every dose). Dense by design.",
  '/coach/admin/programs': "The owner's review of the signature programs: every check, gap and dose on one page. Dense by design.",
  '/coach/admin/library': "The owner's review of the exercise library drafts. Dense by design.",
  '/train/build': 'Once a program is built, the program is the first screen: its summary, the weeks and the day cards (the ask and what FEL read fold to one line). 40 words is a single-action screen; reaching it means a different program view.',
  '/workout': "The template picker's own explanation and its two products with their prices; cutting words means new copy (owner's call). Its consent ticks are native checkboxes.",
  '/train/jumps': 'A menu of six jump tests, each with a short line: the words are the choices.',
  '/screen': 'Two choices, then the "not a medical exam" notice, the early-version note, the four moves and the privacy line (owner-approved notices).',
  '/play/mirror/assess': 'The same screen as /screen.',
  '/play/mirror/assess/results': 'The result screen\'s notices (not saved, not a medical exam, stop if it hurts).',
  '/screen/program/[lane]': 'The same notices as the results screen.',
  '/play/mirror': 'The health check before the Mirror: what is stored, why, who sees it (consent wording, not changed).',
  '/play/mirror/correctives': 'The correctives\' explanation and the switched-off line (wording not changed).',
  '/play/drills': 'The drill shelf\'s descriptions: each drill is a choice with its line.',
  '/train/readiness': 'The set-up picture line, "not a diagnosis", and the coach\'s rules for the day (safety wording).',
  '/train/shots': 'The set-up choices (where the phone stands, height) with the beta and privacy lines; the set-up guide is now one tap away. The front-camera tick is a native checkbox in a 44 px row.',
  '/train/speed': 'The tests, the diagram and the settings line; the four set-up steps are now one tap away. Its four button looks (test chips, the settings line, CSV/clear, Start) are not merged in this phase.',
  '/train/velocity': 'The lift, load and the stop line, with the privacy line; the tips and the slow-motion picker are now one tap away. Six button looks are not merged in this phase; the warm-up tick is a native checkbox in a 44 px row.',
  '/train/today-drill': 'The drill\'s three steps, its why and the first-time line. Start answers in 280–720 ms: the tap starts the camera and the pose model (280 ms in phase 4 too); not fixed in this phase.',
  '/coach/form-review': 'The set-up line and "every number is an estimate" (wording not changed).',
  '/coach/highlight/[id]': 'The consent wording for sharing a result (not changed).',
  '/coach/session': 'The nickname and privacy note for a court session (not changed); 3 words over.',
  '/coach/business/thanks': 'One word over: the page says why it is empty and offers two ways on.',
  '/coach/business': '"Coach Pro is not on sale yet" and the payments line are owner-approved (money is switched off); the terms tick is a native checkbox in a 44 px row.',
  '/coach/join/[token]': 'The invite line (what the coach can do, and that you can leave at any time) and the join button: 4 words over, wording not changed. Under heavy load the rig once measured the page dropping by the top bar\'s height (an invite can be opened signed out, so the bar\'s space is not held); holding it would need the session on the server for every page, a deploy change.',
};

const rows = readResults(join(process.env.ES_OUT ?? '/tmp/every-screen', 'routes')).filter((r) => r.phase >= 1 && r.phase <= 5);
const lines: string[] = [];
let pass = 0, listed = 0, off = 0, alias = 0;
for (const r of rows) {
  if (r.state === 'alias') { alias++; lines.push(`| \`${r.route}\` | ${r.phase} | – | redirects | ${r.reason ?? ''} |`); continue; }
  if (r.state === 'off') { off++; lines.push(`| \`${r.route}\` | ${r.phase} | – | switched off | ${r.reason ?? ''} |`); continue; }
  if (r.state !== 'scored' || !r.facts) { listed++; lines.push(`| \`${r.route}\` | ${r.phase} | – | not read | ${r.reason ?? ''} |`); continue; }
  const v = judge(r.facts);
  const marks = CHECKS.map((c) => (v.checks[c] === 'pass' ? '✓' : v.checks[c] === 'fail' ? '✗' : '–')).join(' ');
  if (v.passAll) { pass++; lines.push(`| \`${r.route}\` | ${r.phase} | ${marks} | **passes all four** | |`); continue; }
  listed++;
  const said = v.faults.slice(0, 3).map((f) => f.say).join(' ');
  lines.push(`| \`${r.route}\` | ${r.phase} | ${marks} | listed | ${said}${REASONS[r.route] ? ` **Why it stays:** ${REASONS[r.route]}` : ' **Why it stays:** not yet fixed (see the phase-5 notes).'} |`);
}
const out = [
  '# Training and coaching screens: the end of phase 5',
  '',
  'The plan\'s gate for phase 5: "All 52 training and coaching screens pass all four checks, or are listed with the reason."',
  `Read on the rig (${new Date().toISOString().slice(0, 10)}), re-judged with \`lib/every-screen/judge.ts\`. Checks: clear and quick · looks finished · fast and smooth · right and trustworthy.`,
  '',
  `**${pass} pass all four · ${listed} listed with the reason · ${off} switched off · ${alias} redirect to another screen** (${rows.length} entries in phases 1–5).`,
  '',
  '| Screen | Phase | Checks | Result | What failed, and why it stays |',
  '|---|---|---|---|---|',
  ...lines,
  '',
  'Made by `scripts/every-screen/training-list.mts`.',
  '',
];
writeFileSync(join(ROOT, 'docs/every-screen/TRAINING-SCREENS.md'), out.join('\n'));
console.log(`${pass} pass · ${listed} listed · ${off} off · ${alias} redirect (${rows.length})`);
