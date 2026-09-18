// _login-check — what the login page actually offers, on whichever server BASE points at.
//
// Written because the hoops lab's login silently failed against `next dev`: the submit click retried for its whole
// timeout ("<img src=/venues/surfbreak.jpg> intercepts pointer events"), pressing Enter made no POST either, and the
// run went on to play nine hollow possessions against a redirect. A run that measures nothing has to be impossible to
// mistake for a run that measures zero, so this prints the form before anything tries to drive it.
import { chromium } from 'playwright-core';
import { chromiumExe } from './_chromium.mts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3098';
const b = await chromium.launch({ executablePath: chromiumExe(), headless: true });
const p = await b.newPage();
p.on('console', (m) => { if (/error|fail/i.test(m.text())) console.log('[console]', m.text().slice(0, 160)); });
p.on('response', (r) => {
  if (/api\/auth/.test(r.url())) console.log('[auth]', r.status(), r.url().replace(BASE, ''));
  // a 404 on a CHUNK means the page never hydrates, which means the form is a picture of a form
  else if (r.status() >= 400) console.log('[' + r.status() + ']', r.url().replace(BASE, '').slice(0, 110));
});
await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await p.waitForTimeout(5000);
console.log('url', p.url());
console.log(await p.evaluate(`Array.from(document.querySelectorAll('form, button, input')).map((e) => e.tagName + ' [' + (e.getAttribute('type') || '') + '] ' + (e.getAttribute('name') || '') + ' ' + (e.textContent || '').trim().slice(0, 40)).join('\\n')`));

// …and then actually sign in, reporting every auth response, because "the form is there" is not the question.
await p.fill('input[type="email"]', process.env.PLAYTEST_EMAIL ?? 'playtest@fel.local');
await p.fill('input[type="password"]', process.env.PLAYTEST_PASSWORD ?? 'playtest-local-only');
await p.click('button[type="submit"]', { force: true });
await p.waitForTimeout(8000);
console.log('after submit:', p.url());
console.log('session:', await p.evaluate(`fetch('/api/auth/session').then((r) => r.text()).then((t) => t.slice(0, 200)).catch((e) => 'ERR ' + e)`));
const play = await p.goto(`${BASE}/play/onevone?agent=1`, { waitUntil: 'domcontentloaded', timeout: 300000 });
console.log('play:', play?.status(), p.url());
await b.close();
