// THREE ATTEMPTS, AND A CALL YOU CAN BACK OUT OF (2026-09-14).
//
// P2 and P5 change the contest's RULES, so "tsc is clean" is not evidence. The two things that can only
// break at runtime are the retry loop and the call cycle:
//
//   · a MISS with attempts left must NOT advance the dunk and must NOT score — it must put the dunker back
//     on the runway with one fewer try. Getting this wrong either eats the whole round on one clank or
//     loops forever.
//   · L1 must cycle the call through every trick and back to NOT CALLED. If it cannot reach "no call" a
//     player who mis-pressed is trapped into a penalty they never wanted.
//
// Both are read off the HUD's own attempt chip, which is what the player sees.

import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const browser = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
await page.addInitScript({ content: 'window.__name = window.__name || function (f) { return f; };' });
const errs: string[] = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

await page.goto(`${BASE}/dev/mode/dunk`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(() => !!(window as any).__FEL_DEV__?.scene, null, { timeout: 180000 });
await page.waitForTimeout(5000);

const hud = () => page.evaluate(`(() => {
  const m = document.body.innerText.match(/"attempt":\\s*"([^"]*)"/);
  const d = document.body.innerText.match(/"dunkNum":\\s*"([^"]*)"/);
  const s = document.body.innerText.match(/"score":\\s*(\\d+)/);
  return { attempt: m ? m[1] : null, dunkNum: d ? d[1] : null, score: s ? +s[1] : null };
})()`) as Promise<{ attempt: string | null; dunkNum: string | null; score: number | null }>;

const press = (btn: string) => page.evaluate(`window.__FEL_DEV__.input.emit({ t: 'button', btn: '${btn}', pressed: true });
  window.__FEL_DEV__.input.emit({ t: 'button', btn: '${btn}', pressed: false });`);

// start the night
await page.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true }));`);
await page.waitForTimeout(5500);

console.log('[STAKES] at the runway:', JSON.stringify(await hud()));

// ── the call cycle: press L1 enough times to go all the way round ──
const cycle: (string | null)[] = [];
for (let i = 0; i < 10; i++) {
  await press('L1');
  await page.waitForTimeout(220);
  cycle.push((await hud()).attempt);
}
console.log('[STAKES] L1 cycle:', JSON.stringify(cycle));
const reachedNoCall = cycle.some((c) => c !== null && !c.includes('CALLED'));
const namedTricks = new Set(cycle.filter((c): c is string => !!c && c.includes('CALLED')));
console.log(`[VERDICT] call cycle reaches NOT CALLED again: ${reachedNoCall ? 'YES' : 'NO'}`);
console.log(`[VERDICT] distinct tricks offered: ${namedTricks.size}`);

// ── the retry loop: blow a dunk by jumping from the start line with no run ──
const seen: { attempt: string | null; dunkNum: string | null; score: number | null }[] = [];
for (let i = 0; i < 4; i++) {
  // A bare A press at the start line does nothing — the mode wants the hold-run first ("HOLD to run, then
  // tap jump"). Hold the trigger for a moment, then jump EARLY, a long way short of the rim: a real
  // attempt that misses, which is the only thing that spends a try.
  await page.evaluate(`window.__FEL_DEV__.input.emit({ t: 'trigger', side: 'R', value: 1 })`);
  await page.waitForTimeout(700);
  await press('A');
  await page.evaluate(`window.__FEL_DEV__.input.emit({ t: 'trigger', side: 'R', value: 0 })`);
  await page.waitForTimeout(5200);        // flight + the miss beat + the reset
  seen.push(await hud());
  console.log(`[STAKES] after blown attempt ${i + 1}:`, JSON.stringify(seen[seen.length - 1]));
}

const chips = seen.map((s) => s.attempt);
const dunks = seen.map((s) => s.dunkNum);
console.log(`\n[VERDICT] attempt chips: ${JSON.stringify(chips)}`);
console.log(`[VERDICT] dunk number:   ${JSON.stringify(dunks)}`);
// The shape a correct run makes: two unscored retries on the SAME dunk, then the third is judged and the
// contest moves on with a fresh allowance and the call cleared.
const retriesHeld = dunks[0] === dunks[1] && seen[0].score === 0 && seen[1].score === 0;
const exhaustedAdvanced = dunks[2] !== dunks[1] && (seen[2].score ?? 0) > 0;
const callCleared = !!chips[2] && !chips[2].includes('CALLED');
console.log(`[VERDICT] retries stayed on the same dunk and scored nothing: ${retriesHeld ? 'YES' : 'NO'}`);
console.log(`[VERDICT] running out judged the miss and advanced:          ${exhaustedAdvanced ? 'YES' : 'NO'}`);
console.log(`[VERDICT] the new dunk cleared the call:                     ${callCleared ? 'YES' : 'NO'}`);
console.log(`[VERDICT] errors: ${errs.length}${errs.length ? ' :: ' + errs.slice(0, 2).join(' | ') : ''}`);

await browser.close();
