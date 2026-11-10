// EVERY-SCREEN phase 1, part B: the job table, written out. Reads the walks scripts/every-screen/jobs.mts saved
// (<ES_OUT>/jobs-before/walks.json and, when the fixes have been walked, <ES_OUT>/jobs-after/walks.json) and writes
// docs/EVERY-SCREEN-JOBS.md. No browser, no server.
//
//   npx tsx scripts/every-screen/jobs.mts --report
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, STATE } from './rig.mts';
import type { Walk } from './jobs.mts';

const WHO: Record<string, string> = { solo: 'An athlete training alone', client: 'A coached client', coach: 'The coach' };
const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const read = (label: string): Walk[] | null => { const f = join(STATE, `jobs-${label}`, 'walks.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) as Walk[] : null; };
const how = (w: Walk) => (w.done ? (w.endsAt ? `reaches it: ${w.endsAt}` : 'finishes') : `**stops** at step ${w.stop?.step} (${w.stop?.say}): ${w.stop?.why}`);

export async function jobsReport(): Promise<void> {
  const before = read('before'), after = read('after');
  const now = after ?? before ?? read('walk');
  if (!now) { console.error('no walks saved: run scripts/every-screen/jobs.mts under the gate lock first'); process.exit(1); }
  const L: string[] = [];
  const P = (s = '') => L.push(s);
  P('# Training and coaching: every job, walked');
  P();
  P('**Phase 1, part B of `docs/PLAN-EVERY-SCREEN-10PHASE.md`.** Fifteen jobs, walked on the real app as three people. Written by `scripts/every-screen/jobs.mts --report`; the walks are `scripts/every-screen/jobs-list.mts`.');
  P();
  P('**How to read it.** Taps are counted from the signed-in home; the Train tab is one tap. Typing is counted apart. Seconds are the rig\'s own, with no reading time: a floor, not a person\'s time. A camera job is walked to the moment it needs a person in front of the camera. "Stops" means a person cannot go further on that path today, and says where.');
  P();
  const done = now.filter((w) => w.done).length;
  P(`**Today: ${done} of ${now.length} jobs can be walked to their end** (or to the camera); ${now.length - done} stop.${before && after ? ` Before this phase's fixes: ${before.filter((w) => w.done).length} of ${before.length}.` : ''}`);
  P();
  for (const who of ['solo', 'client', 'coach']) {
    const rows = now.filter((w) => w.who === who);
    if (!rows.length) continue;
    P(`## ${WHO[who]}`);
    P();
    P(`| Job | Taps | Typing | Seconds | ${before && after ? 'Before | ' : ''}What happens | The plan's budget |`);
    P(`|---|---|---|---|${before && after ? '---|' : ''}---|---|`);
    for (const w of rows) {
      const b = before && after ? before.find((x) => x.id === w.id) : null;
      const was = before && after ? `${b ? (b.done ? `${b.taps} taps, ${b.seconds} s` : `stopped at step ${b.stop?.step}`) : '–'} | ` : '';
      P(`| ${esc(w.name)} | ${w.taps} | ${w.typed || '–'} | ${w.seconds} | ${was}${esc(how(w))} | ${esc(w.planBudget ?? '–')} |`);
    }
    P();
  }
  const stops = now.filter((w) => !w.done);
  if (stops.length) {
    P('## Where the stopped jobs stop');
    P();
    for (const w of stops) {
      P(`### ${w.name} (${WHO[w.who].toLowerCase()})`);
      P();
      P(`- **Where:** \`${w.stop?.path}\`, step ${w.stop?.step} (${w.stop?.say}). ${w.stop?.why}.`);
      P(`- **The screen says:** "${esc((w.stop?.screen ?? '').slice(0, 260))}"`);
      P(`- **What can be tapped there:** ${(w.stop?.actions ?? []).slice(0, 10).map((a) => `\`${esc(a)}\``).join(', ') || 'nothing'}`);
      if (w.endsAt) P(`- **Why it ends:** ${w.endsAt}`);
      P();
    }
  }
  const extra = join(ROOT, 'docs/every-screen/JOBS-NOTES.md');
  if (existsSync(extra)) { P(readFileSync(extra, 'utf8').trim()); P(); }
  writeFileSync(join(ROOT, 'docs/EVERY-SCREEN-JOBS.md'), L.join('\n') + '\n');
  for (const w of now) console.log(`${w.done ? 'done' : 'STOP'}  ${w.who.padEnd(6)} ${w.name.padEnd(46)} ${String(w.taps).padStart(2)} taps ${String(w.seconds).padStart(6)} s  ${w.done ? '' : w.stop?.why}`);
}
