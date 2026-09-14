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
const readVal = async () => (await p.evaluate(`(() => {
  for (const el of document.querySelectorAll('div')) {
    const p0 = el.querySelector(':scope > div > div > p');
    const v = el.querySelector(':scope > div > div > span');
    if (p0 && v && p0.textContent?.trim().toUpperCase() === 'INTANGIBLES') return v.textContent?.trim() ?? null;
  }
  return null;
})()`)) as string | null;
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
  // The old check tested the whole page for /HOT|COLD/ and passed on the words in the TITLE "Hot Zones".
  // Read the row's own value control.
  let state = null;
  for (const el of document.querySelectorAll('div')) {
    const p0 = el.querySelector(':scope > div > div > p');
    const v = el.querySelector(':scope > div > div > span');
    // textContent is the RAW text; only innerText applies the CSS uppercase. Matching an uppercased
    // literal against textContent reported "no zone row" on a row that was on screen — the third time
    // this probe has been fooled by that.
    if (p0 && v && /CORNER THREE LEFT/.test((p0.textContent || '').toUpperCase())) state = v.textContent?.trim() ?? null;
  }
  return { title: t.includes('HOT ZONES'), zoneRow: t.includes('CORNER THREE LEFT'), state };
})()`) as Record<string, unknown>;
console.log('[CREATOR] hot zones through the SAME component:', JSON.stringify(zones));
await p.screenshot({ path: `${OUT}/03-hotzones.png` });

// THE COSMETIC SECTIONS. Each one is a different row shape reaching the same screen: Vitals is a rated
// row with a unit, Appearance is a catalog list, Gear is an item name that has to resolve back to an id.
const open = async (label: string) => {
  await p.evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent===${JSON.stringify(label)}); b && b.click(); })()`);
  await p.waitForTimeout(500);
};

await open('Vitals');
await p.getByText('Height', { exact: false }).first().click().catch(() => {});
await p.waitForTimeout(300);
// READ THE ROW, NOT THE PAGE TEXT. A regex over innerText looked like the obvious thing and reported null
// on a value plainly on screen: once the row is focused the ◀ sits BETWEEN the label and the number, so
// /HEIGHT\s+(\d+)%/ cannot match. Walk the row's own elements instead — label from its first <p>, value
// from the .fel-stat span.
const readRow = async (label: string) => (await p.evaluate(`(() => {
  for (const el of document.querySelectorAll('div')) {
    const p0 = el.querySelector(':scope > div > div > p');
    const v = el.querySelector(':scope > div > div > span');
    if (p0 && v && p0.textContent?.trim().toUpperCase() === ${JSON.stringify(label)}.toUpperCase()) return v.textContent?.trim() ?? null;
  }
  return null;
})()`)) as string | null;
const readPct = async () => readRow('Height');
const pctBefore = await readPct();
await p.evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='▶'); b && b.click(); })()`);
await p.waitForTimeout(300);
console.log(`[CREATOR] vitals: HEIGHT ${pctBefore} -> ${await readPct()} · unit printed: ${/%$/.test(pctBefore ?? '') ? 'YES' : 'NO'}`);
await p.screenshot({ path: `${OUT}/04-vitals.png` });

await open('Appearance');
const look = await p.evaluate(`(() => {
  const t = document.body.innerText.toUpperCase();
  const btn = [...document.querySelectorAll('button')].map(b => b.textContent?.trim() ?? '');
  return { title: t.includes('APPEARANCE'), hairRow: t.includes('HAIR'), skinHex: /#[0-9A-F]{6}/.test(t), tabs: btn.filter(x => x === 'Face' || x === 'Fine Tune').length };
})()`) as Record<string, unknown>;
console.log('[CREATOR] appearance:', JSON.stringify(look));
await p.screenshot({ path: `${OUT}/05-appearance.png` });

await open('Footwear / Gear');
const gear = await p.evaluate(`(() => {
  const t = document.body.innerText.toUpperCase();
  return { footwear: t.includes('FOOTWEAR'), realItem: t.includes('FLIGHT TRAINERS') || t.includes('EVOLUTION HI-TOPS'), colourTab: t.includes('COLOURS') };
})()`) as Record<string, unknown>;
console.log('[CREATOR] gear:', JSON.stringify(gear));
await p.screenshot({ path: `${OUT}/06-gear.png` });

// and the one section that is still closed says WHY, rather than "not built yet"
await open('Ink');
const ink = await p.evaluate(`(() => { const t = document.body.innerText; return { saysWhy: /artwork|decal/i.test(t), notJustNotBuilt: t.length > 0 && !/^\\s*Not built yet\\.?\\s*$/.test(t) }; })()`) as Record<string, unknown>;
console.log('[CREATOR] ink (closed, on purpose):', JSON.stringify(ink));
await p.screenshot({ path: `${OUT}/07-ink.png` });
console.log(`[CREATOR] errors: ${errs.length}${errs.length ? ' :: ' + errs.slice(0,2).join(' | ') : ''}`);
await b.close();
