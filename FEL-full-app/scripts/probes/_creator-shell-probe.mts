// DOES THE CREATOR ACTUALLY RENDER (2026-09-14).
//
// The route compiled and returned a 307 to /login, which proves the auth guard runs and nothing else. This
// logs in and looks at the screen: does the sidebar list the sections, does the generic editor draw rows
// for a section it has never been specialised for, and do the steppers move a value.
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3061';
const EMAIL = process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local';
const PASS = process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only';
const OUT = '/tmp/claude-501/creator';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: false, args: ['--use-gl=angle'] });
const p = await b.newPage({ viewport: { width: 1280, height: 820 } });
const errs: string[] = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

// /dev/creator is the no-auth dev route, the same pattern /dev/mode uses — a screen you cannot open
// without a session is a screen nobody can verify, and this probe already lost a run to a silent login.
await p.goto(`${BASE}/dev/creator`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await p.waitForTimeout(2500);


console.log('[CREATOR] at:', p.url());

const out = await p.evaluate(`(() => {
  // innerText returns the RENDERED text, and these labels are CSS-uppercased — a case-sensitive match
  // here reported "the sidebar is empty" on a sidebar that was plainly on screen.
  const txt = document.body.innerText.toUpperCase();
  const btn = [...document.querySelectorAll('button')].map(b => b.textContent?.trim() ?? '');
  return {
    onCreator: location.pathname.includes('/creator'),
    sidebarHas: ['ATTRIBUTES','TENDENCIES','HOT ZONES','MECHANICS','TRAITS','FINALIZE'].filter(s => txt.includes(s)),
    showsBudgets: /ATTR \\d+\\/\\d+/.test(txt),
    showsRows: txt.includes('INTANGIBLES') || txt.includes('CEILING'),
    steppers: btn.filter(t => t === '◀' || t === '▶').length,
    tabButtons: btn.filter(t => ['Misc','Offense','Defense','Athleticism','Durability','Mental'].includes(t)).length,
  };
})()`) as Record<string, unknown>;
console.log('[CREATOR]', JSON.stringify(out, null, 1));
await p.screenshot({ path: `${OUT}/01-attributes.png` });

// click a row to focus it, then step it. Playwright's own text locator rather than a DOM scan: the row is
// nested divs and a textContent match hits the wrong one.
await p.getByText('Intangibles', { exact: false }).first().click().catch(() => {});
await p.waitForTimeout(400);
const steppersNow = await p.evaluate(`[...document.querySelectorAll('button')].filter(b=>b.textContent==='\u25c0'||b.textContent==='\u25b6').length`) as number;
const readVal = async () => (await p.evaluate(`(() => { const m = document.body.innerText.match(/INTANGIBLES\\s+(\\d+)/); return m ? +m[1] : null; })()`)) as number | null;
const before = await readVal();
await p.evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='\u25b6'); b && b.click(); })()`);
await p.waitForTimeout(350);
const after = await readVal();
console.log(`[CREATOR] steppers on focus: ${steppersNow} · value ${before} -> ${after} · changed: ${before !== after ? 'YES' : 'NO'}`);
await p.screenshot({ path: `${OUT}/02-focused.png` });

// and a section the editor has never been specialised for
await p.evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='Hot Zones'); b && b.click(); })()`);
await p.waitForTimeout(600);
const zones = await p.evaluate(`(() => {
  const t = document.body.innerText.toUpperCase();
  return { title: t.includes('HOT ZONES'), zoneRow: t.includes('CORNER THREE LEFT'), state: /NEUTRAL|HOT|COLD/.test(t) };
})()`) as Record<string, unknown>;
console.log('[CREATOR] hot zones through the SAME component:', JSON.stringify(zones));
await p.screenshot({ path: `${OUT}/03-hotzones.png` });
console.log(`[CREATOR] errors: ${errs.length}${errs.length ? ' :: ' + errs.slice(0,2).join(' | ') : ''}`);
await b.close();
