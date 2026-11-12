// EVERY-SCREEN phase 1: the scorecard, written out. Reads what the crawl saved (<ES_OUT>/routes/*.json, and dark.json
// when scripts/every-screen/dark.mts has run) and writes:
//
//   docs/every-screen/scorecard.json     one record per screen: who sees it, the phase that owns it, the four marks, every
//                                        fault id, the numbers behind them
//   docs/EVERY-SCREEN-SCORECARD.md       the same for a person: the number, the count failing each check, the ten most
//                                        common faults and where each comes from, the dark screens and what turns each on,
//                                        what the rig cannot render, then one line per screen
//
//   npx tsx scripts/every-screen/score.mts --report         (no browser, no server, no lock)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, STATE } from './rig.mts';
import { discover } from './routes.mts';
import { readResults, type Result } from './results.mts';
import type { DarkRow } from './dark.mts';
import * as judgeNs from '../../lib/every-screen/judge.ts';

const { BUDGET, CHECKS, CHECK_NAME, judge } = ((judgeNs as { default?: unknown }).default ?? judgeNs) as typeof judgeNs;

/** What each fault is called in the tables. */
export const FAULT_NAME: Record<string, string> = {
  'small-targets': 'Tap targets under 44 px in the screen itself',
  'small-targets-bars': 'Tap targets under 44 px in the app\'s own bars',
  'too-many-words': 'More than 40 words before scrolling on a do-this screen',
  'many-primary': 'More than one bright button on the first screen',
  'dead-end': 'Dead end: nothing leads on or back',
  'float-covers': 'A floating button covers text or a link on the first screen',
  'only-chrome': 'Only the app\'s bars lead on',
  'text-sizes': 'More than 4 text sizes on one screen',
  'button-looks': 'More than 3 button looks on one screen',
  'tiny-text': 'Text under 12 px',
  'body-small': 'Body copy under 16 px',
  'empty-no-next': 'An empty state with no next step',
  'spinner-no-words': 'A spinner with no words',
  'blank': 'A blank screen',
  'slow-first-content': 'First content later than 2.5 s',
  'layout-shift': 'The screen jumps as it loads',
  'slow-tap': 'The main action answers a tap in more than 200 ms',
  'broken-link': 'A link to a page that is not there',
  'link-nowhere': 'A link that goes nowhere',
  'button-does-nothing': 'The main action does nothing',
  'page-error': 'The screen throws an error',
  'a11y-critical': 'Critical accessibility findings',
  'a11y-serious': 'Serious accessibility findings',
};
const SETUP: Record<string, string> = { phone: '390 px', zoom200: '200 % zoom', font150: '150 % text' };
const nameOf = (id: string) => FAULT_NAME[id] ?? (id.startsWith('unfinished:') ? `Unfinished mark: "${id.slice(11)}"` : id.startsWith('hscroll:') ? `Sideways scroll (${SETUP[id.slice(8)]})` : id.startsWith('clipped:') ? `Text cut off (${SETUP[id.slice(8)]})` : id);

const mark = (m: string | undefined) => (m === 'pass' ? '✓' : m === 'fail' ? '✗' : m === 'n/m' ? '?' : '–');
const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const top = <T,>(m: Map<T, number>, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);
const bump = <T,>(m: Map<T, number>, k: T) => m.set(k, (m.get(k) ?? 0) + 1);

export async function report(): Promise<void> {
  const all = readResults();
  const listed = discover();
  const missing = listed.filter((s) => !all.some((r) => r.route === s.route));
  // the verdicts are recomputed from the saved facts, so a rule change needs no new crawl
  for (const r of all) if (r.state === 'scored' && r.facts) r.verdict = judge(r.facts);
  const scored = all.filter((r) => r.state === 'scored' && r.verdict);
  const pass = scored.filter((r) => r.verdict!.passAll);
  const tc = all.filter((r) => r.tc);
  const dark: { rows: DarkRow[]; tables: Record<string, string> } | null = existsSync(join(STATE, 'dark.json')) ? JSON.parse(readFileSync(join(STATE, 'dark.json'), 'utf8')) : null;
  const sha = (() => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return '?'; } })();

  // ── counts ──
  const byCheck = Object.fromEntries(CHECKS.map((c) => [c, { pass: 0, fail: 0, nm: 0 }])) as Record<string, { pass: number; fail: number; nm: number }>;
  for (const r of scored) for (const c of CHECKS) { const m = r.verdict!.checks[c]; byCheck[c][m === 'pass' ? 'pass' : m === 'fail' ? 'fail' : 'nm']++; }
  const faultScreens = new Map<string, string[]>();
  for (const r of scored) for (const id of new Set(r.verdict!.faults.map((f) => f.id))) faultScreens.set(id, [...(faultScreens.get(id) ?? []), r.route]);
  const ranked = [...faultScreens].sort((a, b) => b[1].length - a[1].length);
  // "fix this one fault everywhere": how many more screens would then pass all four
  const unlock = (id: string) => scored.filter((r) => !r.verdict!.passAll && r.verdict!.faults.every((f) => f.id === id) && CHECKS.every((c) => r.verdict!.checks[c] !== 'n/m')).length;

  // ── where the common faults come from: the most common elements behind each ──
  const src = { smallOwn: new Map<string, number>(), smallBar: new Map<string, number>(), sizes: new Map<string, number>(), tiny: new Map<string, number>(), a11y: new Map<string, number>(), shifts: new Map<string, number>(), hs: new Map<string, number>(), empties: new Map<string, number>(), unfinished: new Map<string, number>(), broken: new Map<string, number>(), primary: new Map<string, number>() };
  const sizeCount = new Map<number, number>(), btnCount = new Map<number, number>();
  for (const r of scored) {
    const f = r.facts!;
    for (const t of new Set(f.smallTargets.map((t) => `${t.chrome ? 'BAR' : 'OWN'} "${t.label.slice(0, 28)}" ${Math.round(t.w)}×${Math.round(t.h)} ${t.sel ?? ''}`))) bump(t.startsWith('BAR') ? src.smallBar : src.smallOwn, t.slice(4));
    for (const s of f.textSizes) bump(src.sizes, s);
    bump(sizeCount, f.textSizes.length); bump(btnCount, f.buttonLooks);
    for (const s of new Set((r.detail?.sizeSamples ?? []).map((x) => `${x.rule} ${x.px}px ${x.path.split(' > ').slice(-2).join(' > ')}`))) bump(src.tiny, s);
    for (const a of new Set((r.detail?.a11y ?? []).map((x) => `${x.severity} ${x.rule}: ${(x.target ?? '').slice(0, 70)}`))) bump(src.a11y, a);
    for (const s of new Set((r.measure?.shifts ?? []).map((x) => x.replace(/^[\d.]+ /, '')))) bump(src.shifts, s);
    for (const k of ['phone', 'zoom200', 'font150'] as const) for (const c of r.detail?.hscrollCulprits?.[k] ?? []) bump(src.hs, `${k}: ${c.replace(/\(\d+px\)/, '').slice(-90)}`);
    for (const e of f.emptyNoNext) bump(src.empties, e.slice(0, 60));
    for (const u of f.unfinished) bump(src.unfinished, `${u.mark}: ${u.text.slice(0, 50)}`);
    for (const b of f.brokenLinks) bump(src.broken, `${b.href} (${b.status})`);
    if (f.primaryFold.length > 1) bump(src.primary, f.primaryFold.slice(0, 3).join(' + '));
  }

  // ── the JSON ──
  mkdirSync(join(ROOT, 'docs/every-screen'), { recursive: true });
  const json = {
    what: 'The every-screen scorecard: docs/PLAN-EVERY-SCREEN-10PHASE.md, phase 1. Written by scripts/every-screen/score.mts --report.',
    measuredAt: all.map((r) => r.when).sort().pop() ?? null, commit: sha, budgets: BUDGET,
    totals: { screens: listed.length, scored: scored.length, passAll: pass.length, alias: all.filter((r) => r.state === 'alias').length, off: all.filter((r) => r.state === 'off').length, notScored: all.filter((r) => r.state === 'not-scored').length + missing.length, byCheck, trainingAndCoaching: { screens: listed.filter((s) => s.tc).length, scored: tc.filter((r) => r.state === 'scored').length, passAll: tc.filter((r) => r.verdict?.passAll).length } },
    faults: ranked.map(([id, routes]) => ({ id, name: nameOf(id), screens: routes.length, wouldPassIfFixed: unlock(id) })),
    screens: all.map((r) => ({
      route: r.route, url: r.url, phase: r.phase, area: r.area, kind: r.kind, audience: r.audience, scoredAs: r.persona, state: r.state, reason: r.reason ?? null,
      checks: r.verdict?.checks ?? null, passAll: r.verdict?.passAll ?? false, worst: r.verdict?.worst?.say ?? null, faults: r.verdict ? [...new Set(r.verdict.faults.map((f) => f.id))] : [], review: r.verdict?.review ?? [], unmeasured: r.verdict?.unmeasured ?? [],
      numbers: r.facts ? { wordsBeforeScroll: r.facts.wordsFold, brightButtons: r.facts.primaryFold.length, smallTargets: r.facts.smallTargets.length, textSizes: r.facts.textSizes.length, buttonLooks: r.facts.buttonLooks, firstContentMs: r.facts.fcpMs, layoutShift: r.facts.cls, tapMs: r.facts.tapMs, tapped: r.facts.tapLabel, brokenLinks: r.facts.brokenLinks.length, a11yCritical: r.facts.a11yCritical, a11ySerious: r.facts.a11ySerious, jsKb: r.load?.jsKb ?? null } : null,
    })),
    notReached: missing.map((s) => s.route),
  };
  writeFileSync(join(ROOT, 'docs/every-screen/scorecard.json'), JSON.stringify(json, null, 1) + '\n');

  // ── the page ──
  const L: string[] = [];
  const P = (s = '') => L.push(s);
  const n = listed.length;
  P('# The every-screen scorecard');
  P();
  P('**Owner, 2026-11-10:** "To improve the total quality of the product from improving every screen."');
  P();
  P(`Every screen a person can reach, scored on the plan's four checks (\`docs/PLAN-EVERY-SCREEN-10PHASE.md\`): phase 1 was the starting line; this is phase 10's re-score of all of them. Written by \`scripts/every-screen/score.mts --report\` from the rig's last run (${json.measuredAt?.slice(0, 10) ?? 'not run'}); do not edit it by hand.`);
  P();
  P('## The number');
  P();
  P(`**${pass.length} of ${n} screens pass all four checks.**`);
  P();
  P('| | Screens |');
  P('|---|---|');
  P(`| Pages a person can reach (\`app/**/page.tsx\`, less the developer pages) | ${n} |`);
  P(`| Scored on the rig | ${scored.length} |`);
  P(`| Not a screen of its own: it only sends you on to another | ${json.totals.alias} |`);
  P(`| Switched off: a 404 for everyone today | ${json.totals.off} |`);
  P(`| Not scored, with the reason (section 5) | ${json.totals.notScored} |`);
  P(`| **Pass all four** | **${pass.length}** |`);
  P(`| Training and coaching (phases 2–5): pass all four | ${json.totals.trainingAndCoaching.passAll} of ${json.totals.trainingAndCoaching.screens} (${json.totals.trainingAndCoaching.scored} scored) |`);
  P();
  P('| Check | Pass | Fail | Not measured |');
  P('|---|---|---|---|');
  for (const c of CHECKS) P(`| ${CHECKS.indexOf(c) + 1}. ${CHECK_NAME[c]} | ${byCheck[c].pass} | **${byCheck[c].fail}** | ${byCheck[c].nm} |`);
  P();
  P(`Of the ${scored.length} scored screens. "Not measured" is a 3D screen's tap time: the rig has no real GPU, so that one number is left open and the screen is not counted as passing.`);
  P();
  beforeAfter(P, all, n, pass.length);
  P('## 1. How a screen is scored');
  P();
  P('The real app (a production build) runs against a throwaway local database, and a phone-sized browser (390 × 844, CPU slowed 4×) opens every screen as the least-privileged person who can see it. The rules are `lib/every-screen/judge.ts`; each number below is the plan\'s.');
  P();
  P('| Check | What the rig measures | Fails when |');
  P('|---|---|---|');
  P(`| 1. Clear and quick | Words before scrolling. Bright filled buttons on the first screen. Tap targets. Whether anything leads on or back. | A do-this screen shows more than ${BUDGET.wordsFoldDo} words before scrolling; more than ${BUDGET.primaryMax} bright button competes; a tap target is under ${BUDGET.tapPx} px; nothing leads on. |`);
  P(`| 2. Looks finished | "Coming soon" / "opens soon", placeholder text, an empty state with no next step, a spinner with no words. Sideways scroll and cut-off text at 390 px, at 200 % zoom and with 150 % text. Text sizes, button looks, and the READABLE.md size floor. | Any of those marks; any sideways scroll or cut-off text; text under 12 px or body copy under 16 px; more than ${BUDGET.textSizes} text sizes or ${BUDGET.buttonLooks} button looks. |`);
  P(`| 3. Fast and smooth | First content, layout shift, and how long the main action takes to answer a tap (the browser's own event timing). | First content after ${BUDGET.fcpMs / 1000} s; layout shift over ${BUDGET.cls}; a tap answered after ${BUDGET.tapMs} ms. |`);
  P('| 4. Right and trustworthy | Every link is fetched. The main action is tapped. Uncaught errors. The accessibility scan (`scripts/a11y/inpage.ts`). | A link answers 404 or 5xx, or goes nowhere; the main action does nothing; the screen throws; a critical or serious accessibility finding. |');
  P();
  P('**A person must still look at:** a measured number with no line saying how it was measured or how sure it is. The rig flags it ("review" in the table) and does not fail the screen on it, because a machine cannot tell a measurement from a count. On new accounts almost no screen shows a number yet, so phase 4 re-runs this with results on the account.');
  P();
  P('**Sorting screens into do-this, menu and reading pages** ("Kind" in the table) is a first sorting by address (`kindOf`), an `assumption:`; only a do-this screen takes the 40-word rule. Each phase corrects its own screens.');
  P();
  const plantFile = join(STATE, 'plant.json');
  const plant = existsSync(plantFile) ? JSON.parse(readFileSync(plantFile, 'utf8')) as { ok: boolean; when: string; scorer: number } : null;
  P(plant ? (plant.ok ? `**Controls: passed** on ${plant.when.slice(0, 16).replace('T', ' ')} UTC (scorer version ${plant.scorer}).` : `**CONTROLS FAILED on ${plant.when.slice(0, 16)}: do not trust this scorecard until \`score.mts --plant\` prints PLANT OK.**`) : '**Controls: not run in this folder.**');
  P();
  P('**The scorer was checked before it was believed** (`score.mts --plant`, and again at the start of every crawl): a clean control page must pass all four, and each planted fault (three bright buttons, 120 words, a 30 px target, a dead end, "Coming soon", an owner placeholder, an empty state, a wordless spinner, sideways scroll, 10 px text, six text sizes, five button looks, slow first content, a jumping banner, a blocking tap handler, a link to a missing page, a link to nowhere, a button that does nothing, an unnamed button, a bare measured number) must be flagged on its own page and fail only its own check.');
  P();
  P('## 2. The ten most common faults, and where each comes from');
  P();
  P('The plan\'s rule: fix the shared thing first. "Alone" is how many screens would pass all four if this one fault were fixed everywhere and nothing else changed.');
  P();
  P('| # | Fault | Screens | Alone | Check |');
  P('|---|---|---|---|---|');
  ranked.slice(0, 10).forEach(([id, routes], i) => { const check = scored.find((r) => r.verdict!.faults.some((f) => f.id === id))!.verdict!.faults.find((f) => f.id === id)!.check; P(`| ${i + 1} | ${nameOf(id)} | ${routes.length} | ${unlock(id)} | ${CHECKS.indexOf(check) + 1} |`); });
  P();
  // the reading of the lists below (which shared component or token each fault comes from) is written by a person
  if (existsSync(join(ROOT, 'docs/every-screen/SHARED-FAULTS.md'))) { P(readFileSync(join(ROOT, 'docs/every-screen/SHARED-FAULTS.md'), 'utf8').trim()); P(); }
  {
    // the owner call in SHARED-FAULTS.md: what changes if the type scale's own five steps are the budget
    const five = scored.filter((r) => r.facts!.textSizes.length === 5);
    const passIfFive = scored.filter((r) => !r.verdict!.passAll && CHECKS.every((c) => r.verdict!.checks[c] !== 'n/m')
      && r.verdict!.faults.every((f) => f.id === 'text-sizes' && r.facts!.textSizes.length === 5)).length;
    P(`Measured for that call: ${five.length} scored screens use exactly 5 text sizes; with 5 allowed, ${passIfFive} more screen${passIfFive === 1 ? '' : 's'} would pass all four today (the other faults on them stay).`);
    P();
  }
  P('<details><summary>The elements behind them (the rig\'s own list)</summary>');
  P();
  const dump = (title: string, m: Map<string, number>, k = 12) => { if (!m.size) return; P(`**${title}**`); P(); for (const [key, c] of top(m, k)) P(`- ${c} × \`${key.replace(/`/g, "'")}\``); P(); };
  dump('Small tap targets in the app\'s own bars (screens)', src.smallBar);
  dump('Small tap targets in screens (screens)', src.smallOwn, 20);
  P(`**Text sizes per screen:** ${top(sizeCount, 30).sort((a, b) => a[0] - b[0]).map(([k, c]) => `${k} sizes: ${c} screens`).join('; ')}`); P();
  dump('The sizes themselves (screens that use each)', src.sizes, 30);
  P(`**Button looks per screen:** ${top(btnCount, 30).sort((a, b) => a[0] - b[0]).map(([k, c]) => `${k}: ${c}`).join('; ')}`); P();
  dump('Text under the READABLE floor', src.tiny, 16);
  dump('Accessibility findings', src.a11y, 16);
  dump('What moves as a screen loads', src.shifts, 12);
  dump('What sticks out sideways', src.hs, 12);
  dump('Empty states with no next step', src.empties, 12);
  dump('Unfinished marks', src.unfinished, 12);
  dump('Broken links', src.broken, 12);
  dump('Bright buttons that compete', src.primary, 12);
  P('</details>');
  P();

  // ── the polish each training and coaching phase inherits, ranked ──
  P('### For phases 2–5: what each phase inherits, ranked');
  P();
  P('Phase 1 fixed only what stops a person (`docs/EVERY-SCREEN-JOBS.md`). Everything else found in training and coaching is listed here for the phase that owns the screen, most common first.');
  P();
  for (const ph of [2, 3, 4, 5]) {
    const mine = scored.filter((r) => r.phase === ph);
    const count = new Map<string, string[]>();
    for (const r of mine) for (const id of new Set(r.verdict!.faults.map((f) => f.id))) count.set(id, [...(count.get(id) ?? []), r.route]);
    const rows = [...count].sort((a, b) => b[1].length - a[1].length);
    P(`**Phase ${ph}** (${mine.length} scored screens, ${mine.filter((r) => r.verdict!.passAll).length} pass all four):`);
    P();
    rows.slice(0, 12).forEach(([id, routes], i) => P(`${i + 1}. ${nameOf(id)}: ${routes.length} screen${routes.length === 1 ? '' : 's'} (${routes.slice(0, 6).map((x) => `\`${x}\``).join(', ')}${routes.length > 6 ? ', …' : ''})`));
    P();
  }

  // ── dark ──
  P('## 3. What is switched off today');
  P();
  P('Scored in the state production has them in. `assumption:` the rig\'s database is `prisma db push` of today\'s schema with nothing from `prisma/pending/` applied (`docs/LAUNCH-CHECKLIST.md` C1: "not done"), and every env switch is at its default (off). Checked against the live site on 2026-11-10: `/groups` says "Opens soon"; `/coaches`, `/studio`, `/live/schedule` and `/session/x` are a 404. The owner\'s `npx tsx scripts/pending-sql/cli.ts plan` prints what production really lacks.');
  P();
  const off = all.filter((r) => r.state === 'off');
  P(`### 3a. A 404 for everyone: ${off.length} screens, behind a switch`);
  P();
  P('| Screen | Phase | What turns it on |');
  P('|---|---|---|');
  for (const r of off) P(`| \`${r.route}\` | ${r.phase} | ${esc((r.reason ?? '').replace(/^switched off: /, ''))} |`);
  P();
  if (dark) {
    const shortFile = (f: string) => f.replace(/^\d{4}-\d\d-\d\d-/, '').replace(/\.sql$/, '');
    P(`### 3b. Dark until its tables are applied: ${dark.rows.length} screens change when they are`);
    P();
    P('Measured: the same build was served on a second throwaway database with every file in `prisma/pending/` applied, and each screen\'s server HTML and each `/api` answer it loads were compared, as the same person (`scripts/every-screen/dark.mts`). "Reads from" is the pending file whose tables the screen (or a route it calls) can ask for; where several are listed, the screen has several parts.');
    P();
    P('| Screen | Phase | Today it says | With the tables | Reads from (`prisma/pending/`) |');
    P('|---|---|---|---|---|');
    for (const d of [...dark.rows].sort((a, b) => a.phase - b.phase || a.route.localeCompare(b.route))) {
      const says = d.darkOnly.slice(0, 2).join(' / ') || (d.apis[0] ? `\`${d.apis[0].url.split('?')[0]}\` → ${d.apis[0].dark.slice(0, 60)}` : d.statusDark !== d.statusLit ? `status ${d.statusDark}` : '');
      const lit = d.litOnly.slice(0, 2).join(' / ') || (d.apis[0] ? d.apis[0].lit.slice(0, 60) : d.statusDark !== d.statusLit ? `status ${d.statusLit}` : '');
      P(`| \`${d.route}\` | ${d.phase} | ${esc(says.slice(0, 110))} | ${esc(lit.slice(0, 110))} | ${d.files.map(shortFile).join(', ') || '–'} |`);
    }
    P();
  } else { P('### 3b. Dark until its tables are applied'); P(); P('Not measured yet: run `scripts/every-screen/dark.mts`.'); P(); }
  const soon = scored.filter((r) => r.facts!.unfinished.some((u) => /soon|not available/.test(u.mark)));
  P(`### 3c. Screens that say "opens soon" or "coming soon" today: ${soon.length}`);
  P();
  for (const r of soon) P(`- \`${r.route}\`: "${esc(r.facts!.unfinished.find((u) => /soon|not available/.test(u.mark))!.text)}"`);
  P();

  // ── not rendered ──
  P('## 4. What the rig cannot render, and what it did instead');
  P();
  P('- **3D play (Babylon / WebGL).** The rig has no real GPU; the scenes draw in software. A 3D screen is scored on what is around the game (words, buttons, links, first content, layout shift) and its tap time is left "not measured", so it cannot count as passing yet. What happens during play is not in this pass (the game lanes own it).');
  P('- **The camera.** The browser is given a fake camera, so a camera screen is scored up to the moment it needs a person in front of it. Jump, sprint, bar-speed and screen readings come from the recorded fixtures and benches (`scripts/tools-easy-bench.ts`), not from this rig.');
  P('- **Screens that need a row someone else made** (an emailed token, a purchase): listed in section 5 with the reason.');
  P('- **Network.** The rig serves from the same machine, so there is no mobile-network delay in the first-content number: a real phone on mobile data is slower than these numbers. The JavaScript each screen downloads is recorded (`jsKb` in the JSON) for the speed work in phase 10.');
  P('- **A shared machine.** Other lanes run at the same time. A screen that misses the first-content budget by less than double is read twice and the better number stands.');
  P('- **Contrast** is the accessibility scan\'s computed contrast, not the readable lane\'s pixel measurement (`docs/READABLE.md`), which stays that lane\'s number.');
  P('- **A tap time is one sample.** Re-reading the same screen moved one tap from 168 ms to 296 ms on the shared machine (the machine\'s load is recorded beside each screen, `load.machineLoad`). Phase 10 should take the median of three; until then a screen just over 200 ms is a candidate, not a verdict.');
  P('- **First content is measured from the same machine**, so it is a floor: every scored screen met 2.5 s here (median about 0.6 s), and that number says nothing about a phone on mobile data.');
  P('- **Only the main action is tapped.** The other buttons on a screen are not pressed by the scorer; in training and coaching the job walks press them (`docs/EVERY-SCREEN-JOBS.md`).');
  P();
  const ns = all.filter((r) => r.state === 'not-scored');
  P(`## 5. Not scored: ${ns.length + missing.length}`);
  P();
  P('| Screen | Phase | Why |');
  P('|---|---|---|');
  for (const r of ns) P(`| \`${r.route}\` | ${r.phase} | ${esc((r.reason ?? '').replace(/^not scored: /, ''))} |`);
  for (const s of missing) P(`| \`${s.route}\` | ${s.phase} | the crawl has not reached it yet |`);
  P();
  const al = all.filter((r) => r.state === 'alias');
  P(`**Not a screen of its own (${al.length}):** ${al.map((r) => `\`${r.route}\` ${r.reason?.replace('redirects to', '→').replace(/ (for everyone who is signed in|in the browser)/, '')}`).join('; ')}.`);
  P();

  // ── the table ──
  P('## 6. Every screen');
  P();
  P('✓ pass · ✗ fail · ? not measured. "Who" is measured: the rig opens each screen signed out, as an adult athlete, a coached client, a coach, an admin and a 15-year-old, and records who gets the page.');
  P();
  const PH: Record<number, string> = { 2: 'Phase 2 — from opening the app to finishing a workout', 3: 'Phase 3 — the AI program builder', 4: 'Phase 4 — numbers you can trust', 5: 'Phase 5 — booking, groups and the coach\'s day', 6: 'Phase 6 — the first five minutes', 7: 'Phase 7 — around the games', 8: 'Phase 8 — your things', 9: 'Phase 9 — learn, create and the public pages' };
  const whoWord: Record<string, string> = { anon: 'anyone', solo: 'signed-in', client: 'signed-in', coach: 'coach', admin: 'admin', teen: 'signed-in' };
  for (const ph of [2, 3, 4, 5, 6, 7, 8, 9]) {
    const rows = all.filter((r) => r.phase === ph);
    const sc = rows.filter((r) => r.state === 'scored');
    P(`### ${PH[ph]} (${rows.length} screens; ${sc.filter((r) => r.verdict!.passAll).length} of ${sc.length} scored pass all four)`);
    P();
    P('| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |');
    P('|---|---|---|---|---|---|---|---|');
    for (const r of rows) {
      const v = r.verdict;
      if (r.state !== 'scored' || !v) { P(`| \`${r.route}\` | ${r.audience || '–'} | ${r.kind} | – | – | – | – | *${esc(r.state === 'alias' ? `not its own screen: ${r.reason}` : r.state === 'off' ? `switched off: a 404 (${(r.reason ?? '').replace(/^switched off: /, '')})` : r.reason ?? 'not scored')}* |`); continue; }
      const extra = [v.review.length ? 'review: a number with no method line' : '', r.reason ? `(${r.reason})` : ''].filter(Boolean).join(' ');
      const as = r.persona && !r.audience.startsWith(whoWord[r.persona]) ? `; scored as ${r.persona}` : '';
      P(`| \`${r.route}\` | ${r.audience}${as} | ${r.kind} | ${mark(v.checks.clear)} | ${mark(v.checks.finished)} | ${mark(v.checks.fast)} | ${mark(v.checks.right)} | ${v.passAll ? '**passes all four**' : esc(v.worst?.say ?? (v.unmeasured[0] ? `not measured: ${v.unmeasured.join('; ')}` : ''))}${extra ? ` ${esc(extra)}` : ''} |`);
    }
    P();
  }
  P('## 7. Running it again');
  P();
  P('```sh');
  P('export ES_OUT=<a scratch folder>                                             # results, shots, the sign-ins; never the repo');
  P('/home/user/wt/cpu-run.sh npx tsx scripts/every-screen/rig.mts build         # next build into .next-every-screen (then: git checkout -- tsconfig.json)');
  P('/home/user/wt/gate-run.sh 900 npx tsx scripts/every-screen/score.mts --plant      # the controls: must print PLANT OK');
  P('/home/user/wt/gate-run.sh 900 npx tsx scripts/every-screen/score.mts --budget=850 # the crawl; run again until "0 screens left"');
  P('/home/user/wt/gate-run.sh 900 npx tsx scripts/every-screen/dark.mts               # dark vs lit');
  P('npx tsx scripts/every-screen/score.mts --report                              # this file and docs/every-screen/scorecard.json');
  P('npx tsx scripts/every-screen/rig.mts db-down && rm -rf .next-every-screen    # stop the database, drop the build');
  P('```');
  P();
  P('Re-score some screens: `--routes=/train,/coach --redo`. Training and coaching only: `--tc`. The rules and their tests: `lib/every-screen/judge.ts`, `lib/every-screen/judge.test.ts`.');
  writeFileSync(join(ROOT, 'docs/EVERY-SCREEN-SCORECARD.md'), L.join('\n') + '\n');

  console.log(`${pass.length} of ${n} pass all four  (scored ${scored.length}, alias ${json.totals.alias}, off ${json.totals.off}, not scored ${json.totals.notScored})`);
  for (const c of CHECKS) console.log(`  ${CHECK_NAME[c].padEnd(24)} pass ${byCheck[c].pass}  fail ${byCheck[c].fail}  n/m ${byCheck[c].nm}`);
  console.log('  top faults:'); ranked.slice(0, 12).forEach(([id, routes]) => console.log(`    ${String(routes.length).padStart(3)}  alone ${String(unlock(id)).padStart(3)}  ${nameOf(id)}`));
}

/**
 * EVERY-SCREEN P10 (part B): the plan's "before → after for every screen". Before is phase 1's baseline as it was committed
 * (docs/every-screen/scorecard-phase1.json, 3ab930cf, scorer version of that day); after is this run. A screen that does
 * not pass all four is named with its reason (the run's worst fault, or why it was not scored) and what it needs, from
 * docs/every-screen/needs.json (route → what it needs: an owner decision, a table, another lane, or a fix).
 */
function beforeAfter(P: (s?: string) => void, all: Result[], n: number, passNow: number): void {
  const f = join(ROOT, 'docs/every-screen/scorecard-phase1.json');
  if (!existsSync(f)) return;
  const before = JSON.parse(readFileSync(f, 'utf8')) as { measuredAt: string; commit: string; totals: { screens: number; passAll: number; scored: number }; screens: { route: string; state: string; checks: Record<string, string> | null; passAll: boolean }[] };
  const needsFile = join(ROOT, 'docs/every-screen/needs.json');
  const needs: Record<string, string> = existsSync(needsFile) ? JSON.parse(readFileSync(needsFile, 'utf8')) : {};
  const B = new Map(before.screens.map((s) => [s.route, s]));
  const cell = (st: string | undefined, c: Record<string, string> | null | undefined) =>
    st === 'scored' && c ? CHECKS.map((k) => mark(c[k])).join(' ') : st === 'alias' ? 'sends on' : st === 'off' ? 'off' : st === 'not-scored' ? 'not scored' : st ? st : 'not listed';
  P(`## Before (phase 1) → after (phase 10), every screen`);
  P();
  P(`**Phase 1 (${before.measuredAt?.slice(0, 10)}, \`${before.commit}\`): ${before.totals.passAll} of ${before.totals.screens} screens passed all four. Now: ${passNow} of ${n}.** ` +
    'The scorer was tightened between them (READABLE\'s body-size rule, the notices rule, clipped text at 150 % and 200 %), so a ✓ now is harder to get than a ✓ then.');
  P();
  P('Checks in order: 1 clear and quick · 2 looks finished · 3 fast and smooth · 4 right and trustworthy (✓ pass · ✗ fail · ? not measured).');
  P();
  P('| Screen | Phase 1 | Now | Passes | Why not (the single worst problem) | What it needs |');
  P('|---|---|---|---|---|---|');
  for (const r of [...all].sort((a, b) => a.route.localeCompare(b.route))) {
    const b = B.get(r.route);
    const v = r.verdict;
    const ok = r.state === 'scored' && v?.passAll;
    const why = ok ? '' : r.state === 'scored' && v ? (v.worst?.say ?? '') : (r.reason ?? r.state);
    const need = ok ? '' : needs[r.route] ?? (r.state === 'alias' ? 'nothing: it sends you on to its own screen' : '');
    P(`| \`${r.route}\` | ${cell(b?.state, b?.checks)} | ${cell(r.state, v?.checks)} | ${ok ? '**yes**' : 'no'} | ${esc(why)} | ${esc(need)} |`);
  }
  P();
}
