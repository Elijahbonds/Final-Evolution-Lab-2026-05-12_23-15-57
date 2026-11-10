// EVERY-SCREEN phase 1, part B: walk every training and coaching job as three people, on the real app.
//
// A job is what a person came to do ("log a set", "book a 1:1"). Each is walked from the signed-in home the way a
// finger would: every tap is counted, the clock runs from the first screen to the job's end, and where a job cannot be
// finished the walk records the screen it stopped on and why. The plan's phase-1 gate: 0 dead ends in training and
// coaching, every switched-off feature says why and what to do instead, and this table exists with a tap count and a
// time for every job (docs/PLAN-EVERY-SCREEN-10PHASE.md).
//
//   /home/user/wt/gate-run.sh 900 npx tsx scripts/every-screen/jobs.mts [--label=before|after] [--only=log-a-set]
//   npx tsx scripts/every-screen/jobs.mts --report          writes docs/EVERY-SCREEN-JOBS.md from the saved walks
//
// Taps are counted from the signed-in home (/play); the Train tab is one tap (the tools-easy convention). Typing is
// counted apart. Seconds are the rig's, with no reading time and the CPU at full speed: a floor, not a person's time.
// A camera job is walked to the moment it needs a person in front of the camera; what the camera then reads is
// measured on the recorded fixtures (scripts/tools-easy-bench.ts), not here.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import sharp from 'sharp';
import { chromiumExe } from '../probes/_chromium.mts';
import { LOOK, tapLabel } from './explore.mts';
import { ORIGIN, ROOT, STATE, dbUp, people as makePeople, seedCoaching, serve, storageState, type Person } from './rig.mts';

export interface Step {
  /** open an address directly (not a tap: a link from outside, or the job's stated starting point) */
  goto?: string;
  /** tap the thing with this label / this CSS selector: one tap */
  tap?: string;
  css?: string;
  /** type into a field: counted as typing, not a tap */
  fill?: [string, string];
  /** tap `css` until `until` shows, at most `max` times: each is a tap */
  loop?: [string, string, number];
  /** the step succeeds only if this shows afterwards (a CSS selector, or /a pattern/ over the screen's words) */
  expect?: string;
  /** wait this long after the step (ms) */
  wait?: number;
  /** what this step is, in the table's words */
  say?: string;
  /** getting to the job's starting point (a session already open, say): done, but not counted in the job's taps or time */
  pre?: boolean;
}
export interface Job {
  id: string;
  who: Exclude<Person, 'anon' | 'admin' | 'teen'>;
  name: string;
  /** the plan's own budget for this job, when it names one (a later phase's gate; reported, not judged here) */
  planBudget?: string;
  steps: Step[];
  /** the walk ends here by design: the reason (a camera needs a person; a switched-off feature) */
  endsAt?: string;
}



export interface Walk {
  id: string; who: string; name: string; planBudget?: string;
  taps: number; typed: number; seconds: number;
  done: boolean;
  /** where it stopped, when it did not finish: the step, the address, what the screen said, what could be tapped */
  stop?: { step: number; say: string; why: string; path: string; screen: string; actions: string[] };
  endsAt?: string;
  path: string[];
  errors: string[];
  shot?: string;
}

async function see(page: Page, expect: string): Promise<boolean> {
  const m = /^\/(.*)\/([a-z]*)$/.exec(expect);
  if (m) return new RegExp(m[1], m[2] || 'i').test(await page.evaluate('document.body.innerText') as string);
  return (await page.locator(expect).count()) > 0;
}

export async function walk(page: Page, job: Job, shotDir: string): Promise<Walk> {
  const w: Walk = { id: job.id, who: job.who, name: job.name, planBudget: job.planBudget, taps: 0, typed: 0, seconds: 0, done: false, path: [], errors: [], endsAt: job.endsAt };
  const onErr = (e: Error) => w.errors.push(String(e).slice(0, 160));
  page.on('pageerror', onErr);
  let t0 = 0;
  const settle = async (ms = 400) => { await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {}); await page.waitForTimeout(ms); };
  for (let i = 0; i < job.steps.length; i++) {
    const s = job.steps[i];
    let ok = true; let why = '';
    const tapsBefore = w.taps, typedBefore = w.typed;
    if (!s.pre && !t0 && !s.goto) t0 = Date.now();
    try {
      if (s.goto) { await page.goto(ORIGIN + s.goto, { waitUntil: 'load', timeout: 45000 }); await settle(); if (!t0 && !s.pre) t0 = Date.now(); }
      if (s.tap) { ok = await tapLabel(page, s.tap); if (ok) w.taps++; else why = `nothing to tap called "${s.tap}"`; await settle(s.wait); }
      if (s.css) { ok = await page.locator(s.css).first().tap({ timeout: 5000 }).then(() => true).catch(() => false); if (ok) w.taps++; else why = `nothing to tap at ${s.css}`; await settle(s.wait); }
      if (s.fill) { ok = await page.locator(s.fill[0]).first().fill(s.fill[1], { timeout: 5000 }).then(() => true).catch(() => false); if (ok) w.typed++; else why = `no field at ${s.fill[0]}`; }
      if (s.loop) {
        let n = 0;
        while (n < s.loop[2] && !(await page.locator(s.loop[1]).count())) {
          if (!(await page.locator(s.loop[0]).first().tap({ timeout: 5000 }).then(() => true).catch(() => false))) break;
          n++; w.taps++;
          await page.waitForTimeout(300);
        }
        ok = (await page.locator(s.loop[1]).count()) > 0;
        if (!ok) why = `${n} taps on ${s.loop[0]} never reached ${s.loop[1]}`;
      }
      if (ok && s.expect) {
        ok = false;
        for (let k = 0; k < 16 && !ok; k++) { ok = await see(page, s.expect); if (!ok) await page.waitForTimeout(500); }
        if (!ok) why = `the screen never showed ${s.expect}`;
      }
    } catch (e) { ok = false; why = String(e).slice(0, 160); }
    if (s.pre) { w.taps = tapsBefore; w.typed = typedBefore; }
    w.path.push(new URL(page.url()).pathname);
    if (!ok) {
      const look = await page.evaluate(LOOK).catch(() => ({ path: '?', text: '', actions: [] })) as { path: string; text: string; actions: string[] };
      w.stop = { step: i + 1, say: s.say ?? s.tap ?? s.css ?? s.goto ?? '', why, path: look.path, screen: look.text.slice(0, 400), actions: look.actions.slice(0, 25) };
      break;
    }
    if (i === job.steps.length - 1) w.done = true;
  }
  w.seconds = t0 ? Math.round((Date.now() - t0) / 100) / 10 : 0;
  const png = await page.screenshot().catch(() => null);
  if (png) { w.shot = join(shotDir, `${job.id}.jpg`); await sharp(png).jpeg({ quality: 70 }).toFile(w.shot); }
  page.off('pageerror', onErr);
  return w;
}

const args = process.argv.slice(2);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

export async function runJobs(): Promise<void> {
  const { JOBS } = await import('./jobs-list.mts');
  const label = flag('label') ?? 'walk';
  const only = flag('only')?.split(',');
  const dir = join(STATE, `jobs-${label}`);
  mkdirSync(dir, { recursive: true });
  dbUp();
  const stop = await serve(join(STATE, 'server.log'));
  try {
    const ppl = await makePeople();
    console.log(await seedCoaching(ppl).catch((e) => `coached pair: failed (${String(e).slice(0, 160)})`));
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXE ?? chromiumExe(), headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const walks: Walk[] = existsSync(join(dir, 'walks.json')) && only ? JSON.parse(readFileSync(join(dir, 'walks.json'), 'utf8')) : [];
    for (const job of JOBS) {
      if (only && !only.includes(job.id)) continue;
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, storageState: storageState(ppl, job.who), permissions: ['camera', 'microphone'] });
      const page = await ctx.newPage();
      const w = await walk(page, job, dir);
      await ctx.close();
      const at = walks.findIndex((x) => x.id === w.id);
      if (at >= 0) walks[at] = w; else walks.push(w);
      console.log(`${w.done ? 'done ' : 'STOP '} ${job.who.padEnd(6)} ${job.name.padEnd(44)} ${String(w.taps).padStart(2)} taps  ${String(w.seconds).padStart(5)} s${w.stop ? `  step ${w.stop.step} (${w.stop.say}): ${w.stop.why}` : ''}${w.errors.length ? `  errors: ${w.errors[0]}` : ''}`);
      writeFileSync(join(dir, 'walks.json'), JSON.stringify(walks, null, 1));
    }
    await browser.close();
  } finally { stop(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (args.includes('--report')) { const { jobsReport } = await import('./jobs-report.mts'); await jobsReport(); }
  else { await runJobs(); process.exit(0); }
}
void ROOT;
