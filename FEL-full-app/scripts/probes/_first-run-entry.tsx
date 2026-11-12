// First run on a phone, with no Next server (FIRST-RUN, round 8, 2026-10-25). Bundled by scripts/probes/_first-run-probe.mts
// with esbuild and served by its small Node server, so a sign-up's full navigation really lands on the next page.
//   /signup    the real AuthForm (sign-up): the age step, the five paths, the credentials
//   /welcome   the real FirstWin with what app/welcome/page.tsx hands it (the server's verified-adult answer is the probe's)
//   /play/*, /closet, /coach, /learn, /train/*   a marker page: the door was reached
// Stubs: next-auth's signIn (succeeds), and the routes the pages call (answered here; what was sent is kept).
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { AuthForm } from '@/components/auth-form';
import { FirstWin } from '@/components/onboarding/first-win';
import { AttributionCapture } from '@/components/onboarding/attribution-capture';
import { firstPlaybookCard } from '@/lib/onboarding/welcomeData';
import { pathFor } from '@/lib/onboarding/firstRun';

const w = window as unknown as Window & { __SENT__: { method: string; url: string; body: string }[]; __ADULT__?: boolean };
w.__SENT__ = [];
const real = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  const method = (init?.method ?? 'GET').toUpperCase();
  if (path === '/api/analytics') return real(input, init);
  w.__SENT__.push({ method, url: path, body: typeof init?.body === 'string' ? init.body : '' });
  try { sessionStorage.setItem('rig:sent', JSON.stringify([...JSON.parse(sessionStorage.getItem('rig:sent') ?? '[]'), { method, url: path, body: typeof init?.body === 'string' ? init.body : '' }])); } catch { /* rig only */ }
  if (path === '/api/signup') return Response.json({ ok: true });
  if (path === '/api/coach/invite' && method === 'POST') return Response.json({ invite: { token: 'K7M2Q9XA~r1g0nly', use: 'once', joined: 0 } }, { status: 201 });
  return Response.json({ error: 'not_found' }, { status: 404 });
}) as typeof fetch;

const route = location.pathname;
const q = new URLSearchParams(location.search);
const adult = w.__ADULT__ === true;
let page;
if (route === '/signup') {
  page = h(AuthForm, { mode: 'signup' });
} else if (route === '/welcome') {
  page = h('div', { className: 'min-h-screen bg-[#050505]' }, h(FirstWin, {
    path: pathFor(q.get('path'), { adult }), adult, card: firstPlaybookCard(), gameHref: '/play/dunk', gameName: 'Dunk Contest',
  }));
} else {
  page = h('main', { className: 'p-6 text-white', 'data-door': route }, `door: ${route}`);
}
createRoot(document.getElementById('root')!).render(h('div', null, h(AttributionCapture), page, h(Toaster, { theme: 'dark', position: 'top-center' })));
