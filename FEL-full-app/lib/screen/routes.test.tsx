// The Quick Screen's routes at render level (SCREEN-SHIP (a), (d), A3-4, gates 1 and 4; SCREEN-FIX S-2, the privacy
// page). vitest does not collect app/**, so the pages are pinned from here (the lib/mirror/screen-route.test.ts pattern).
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/play/mirror/assess',
}));

const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('(a) /play/mirror/assess renders for a guest', () => {
  it('no session read, no sign-in wall: the start step, the disclaimer, the "Early version" label and Start', async () => {
    const { default: Page } = await import('@/app/play/mirror/assess/page');
    const h = renderToStaticMarkup(createElement(Page));
    const t = text(h);
    expect(t).toContain('Quick Screen');
    expect(t).toContain('This is a free movement check, not a medical exam.');
    expect(t).toContain('Early version');                       // CHANGED (S-7): was 'PROPOSED · preview'
    expect(t).not.toMatch(/PROPOSED|preview/i);
    // S-7: the checks in plain words, and the privacy page linked from the start card
    expect(t).toContain('Ankle bend (knee-to-wall)');
    expect(t).toContain('Hands-on-hips jump');
    expect(t).not.toMatch(/dorsiflexion|countermovement/i);
    expect(h).toMatch(/<a[^>]*href="\/screen\/privacy"/);
    expect(h).toMatch(/<button[^>]*data-primary[^>]*>Start<\/button>/);
    expect(t).not.toMatch(/sign in|log in|create an account/i);
    // the page module reads no session any more
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    expect(readFileSync(join(__dirname, '../../app/play/mirror/assess/page.tsx'), 'utf8')).not.toMatch(/getServerSession|authOptions/);
  });

  it('the screen pages set the system font stack (gate 1), and no screen component asks for mono or the display chain', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(__dirname, '../../app/play/mirror/assess/_components');
    const ui = readFileSync(join(dir, 'screen-ui.tsx'), 'utf8');
    expect(ui).toMatch(/style=\{\{ fontFamily: SYSTEM_FONT_STACK \}\}/);
    expect(readFileSync(join(dir, 'camera-help.tsx'), 'utf8')).toMatch(/fontFamily: SYSTEM_FONT_STACK/);
    const files = [...readdirSync(dir).filter((f) => f.endsWith('.tsx')).map((f) => join(dir, f)), join(__dirname, '../../app/screen/program/[lane]/program-lane.tsx')];
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/font-mono|fel-heading|--fel-font-display|Courier/);
    const h = renderToStaticMarkup(createElement((await import('@/app/play/mirror/assess/page')).default));
    expect(h).toMatch(/data-screen-frame="true"[^>]*style="font-family:-apple-system, BlinkMacSystemFont, &#x27;Segoe UI&#x27;, Roboto, sans-serif"/);
  });
});

describe('(d) /screen: one stable QR address', () => {
  const digest = (fn: () => unknown): string => { try { fn(); } catch (e) { return String((e as { digest?: string }).digest); } return 'no redirect'; };
  it('sends to /play/mirror/assess with a temporary (307) redirect, keeping the query string, with no auth', async () => {
    const { default: ScreenEntry } = await import('@/app/screen/page');
    expect(digest(() => ScreenEntry({ searchParams: {} }))).toMatch(/^NEXT_REDIRECT;replace;\/play\/mirror\/assess;307;/);
    expect(digest(() => ScreenEntry({ searchParams: { src: 'qr' } }))).toMatch(/^NEXT_REDIRECT;replace;\/play\/mirror\/assess\?src=qr;307;/);
    expect(digest(() => ScreenEntry({ searchParams: { src: 'qr', a: ['1', '2'] } }))).toMatch(/\/play\/mirror\/assess\?src=qr&a=1&a=2;307;/);
    const { readFileSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    expect(readFileSync(join(__dirname, '../../app/screen/page.tsx'), 'utf8')).not.toMatch(/getServerSession|authOptions/);
    // SCREEN-HARDEN: middleware adds screen-path headers only; it must not gate auth.
    if (existsSync(join(__dirname, '../../middleware.ts'))) {
      expect(readFileSync(join(__dirname, '../../middleware.ts'), 'utf8')).not.toMatch(/getServerSession|authOptions|next-auth/);
    }
  });
});

describe('A3-4: /screen/program/[lane]', () => {
  it('three lanes are built; any other slug is a 404 (notFound)', async () => {
    const mod = await import('@/app/screen/program/[lane]/page');
    expect(mod.dynamicParams).toBe(false);
    expect(mod.generateStaticParams()).toEqual([{ lane: 'correctives' }, { lane: 'posture' }, { lane: 'dunking' }]);
    expect(digest404(() => mod.default({ params: { lane: 'snowboard' } }))).toBe('NEXT_NOT_FOUND');
    expect(digest404(() => mod.default({ params: { lane: 'dunking?flag=red' } }))).toBe('NEXT_NOT_FOUND');
    expect(digest404(() => mod.default({ params: { lane: 'dunking' } }))).toBe('rendered');
  });
});
function digest404(fn: () => unknown): string { try { fn(); return 'rendered'; } catch (e) { return String((e as { digest?: string }).digest); } }

describe('the results address carries no data and reads the tab', () => {
  it('its first paint is a neutral "reading" card; the result arrives from memory or sessionStorage after mount', async () => {
    const { default: Page } = await import('@/app/play/mirror/assess/results/page');
    const t = text(renderToStaticMarkup(createElement(Page)));
    expect(t).toContain('Reading your results');
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '../../app/play/mirror/assess/_components/results-page.tsx'), 'utf8');
    // CHANGED (SCREEN-FIX): was recall(tabStorage()); the tab is read once for the result and its age answer
    expect(src).toMatch(/const tab = tabStorage\(\);\s+const r = recall\(tab\);/);
    expect(src).not.toMatch(/searchParams|useSearchParams|fetch\(/);
  });
});

describe('S-2: the back arrow never leaves the screen', () => {
  const backHref = (h: string) => { const m = /<a[^>]*data-back[^>]*>/.exec(h) ?? /<a[^>]*aria-label="Back"[^>]*>/.exec(h); return m ? /href="([^"]+)"/.exec(m[0])![1] : null; };
  it('every back target the screen renders is a quick-screen path, and none is /login, /play/mirror or /try', async () => {
    const { isQuickScreenPath } = await import('@/components/providers');
    const { ScreenFrame } = await import('@/app/play/mirror/assess/_components/screen-ui');
    const { ProgramLane } = await import('@/app/screen/program/[lane]/program-lane');
    const pages = {
      frameDefault: renderToStaticMarkup(createElement(ScreenFrame, null, 'x')),
      start: renderToStaticMarkup(createElement((await import('@/app/play/mirror/assess/page')).default)),
      results: renderToStaticMarkup(createElement((await import('@/app/play/mirror/assess/results/page')).default)),
      program: renderToStaticMarkup(createElement(ProgramLane, { lane: 'dunking' })),
      privacy: renderToStaticMarkup(createElement((await import('@/app/screen/privacy/page')).default)),
    };
    const got = Object.fromEntries(Object.entries(pages).map(([k, h]) => [k, backHref(h)]));
    expect(got).toEqual({ frameDefault: '/screen', start: '/screen', results: '/screen', program: '/play/mirror/assess/results', privacy: '/screen' });
    for (const [k, href] of Object.entries(got)) {
      expect(isQuickScreenPath(href!), k).toBe(true);
      expect(href, k).not.toMatch(/^\/(login|try)\b|^\/play\/mirror$/);
    }
    for (const h of Object.values(pages)) expect(h).not.toMatch(/aria-label="Back to the Mirror"|>The Mirror</);
  });

  it('every route the screen links back to is a quick-screen path', async () => {
    const { isQuickScreenPath } = await import('@/components/providers');
    const R = await import('./routes');
    const { LANE_SLUGS } = await import('./PROPOSED-program-lanes');
    for (const r of [R.SCREEN_HOME, R.ASSESS_PATH, R.RESULTS_PATH, R.PRIVACY_PATH, ...LANE_SLUGS.map(R.programPath)]) expect(isQuickScreenPath(r), r).toBe(true);
  });

  it('a static scan: every `back=` in the screen is a routes constant or the flow\'s own step back; no /play/mirror or /login literal', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = join(__dirname, '../..');
    const files = ['app/play/mirror/assess/_components/assess-app.tsx', 'app/play/mirror/assess/_components/results-page.tsx',
      'app/screen/program/[lane]/program-lane.tsx', 'app/screen/privacy/page.tsx', 'app/play/mirror/assess/_components/screen-ui.tsx'];
    const backs = new Set<string>();
    for (const f of files) {
      const src = readFileSync(join(root, f), 'utf8');
      for (const m of src.matchAll(/\bback=\{([^}]+)\}/g)) backs.add(m[1]);
      expect(src, f).not.toMatch(/['"`]\/play\/mirror['"`]|['"`]\/login|['"`]\/try['"`]/);
    }
    expect([...backs].sort()).toEqual(['RESULTS_PATH', 'SCREEN_HOME', 'back']);
    // the page's own `back`: the flow's step back, and /screen from the start card
    const app = readFileSync(join(root, 'app/play/mirror/assess/_components/assess-app.tsx'), 'utf8');
    expect(app).toMatch(/const back: string \| \(\(\) => void\) = phase === 'intro' \|\| phase === 'toResults' \? SCREEN_HOME/);
    expect(readFileSync(join(root, 'app/play/mirror/assess/_components/screen-ui.tsx'), 'utf8')).toMatch(/back = SCREEN_HOME/);
  });
});

describe('/screen/privacy: plain words, no request, no form', () => {
  // CHANGED (SCREEN-FIX-2, retest 1 S-11): the owner's verbatim text (lib/screen/link-walk.test.tsx pins it word for
  // word); was the SCREEN-FIX points, a mailto link, the stop line and a link to the app's /privacy
  it('renders the owner\'s text, the clear button and the contact address as plain text; no link out', async () => {
    const { default: Page } = await import('@/app/screen/privacy/page');
    const { SCREEN_CONTACT_EMAIL, PRIVACY_POINTS, DONE_CLEAR } = await import('./copy');
    const h = renderToStaticMarkup(createElement(Page));
    const t = text(h);
    for (const p of PRIVACY_POINTS) expect(t).toContain(p);
    expect(t).toMatch(/The video isn't uploaded, recorded or saved/);
    expect(t).toMatch(/The only thing kept is your age answer, in this tab/);
    expect(t).toMatch(/your results stay in this browser tab only/);
    expect(h).toMatch(/<button[^>]*data-done-clear[^>]*>Done, clear my results</);
    expect(t).toContain(DONE_CLEAR);
    expect(SCREEN_CONTACT_EMAIL).toBe('FinalEvolution.us@gmail.com');
    expect(h).not.toContain('mailto:');
    expect(t).toContain(`Questions? Final Evolution LLC, ${SCREEN_CONTACT_EMAIL}`);
    expect(h).not.toMatch(/<form|<input|CONTACT_EMAIL/);
    expect(h).not.toMatch(/href="\/privacy"/);
  });
});

describe('gate 4: camera denied or missing → a full-screen card, never a banner', () => {
  it('PoseService\'s own words map to the right card', async () => {
    const { cameraProblem } = await import('@/app/play/mirror/assess/_components/camera-help');
    // lib/pose/PoseService.ts explain(): NotAllowedError / SecurityError, NotFoundError / OverconstrainedError
    expect(cameraProblem('Camera access was refused. Allow the camera for this site and try again.')).toBe('denied');
    expect(cameraProblem('No camera was found on this device.')).toBe('missing');
    expect(cameraProblem('This page cannot reach the camera (it needs https).')).toBe('insecure');
    expect(cameraProblem(null)).toBe('other');
  });

  it('each card fills the screen with a plain reason, Retry and a next step', async () => {
    const { CameraHelp } = await import('@/app/play/mirror/assess/_components/camera-help');
    for (const [why, kind, next] of [
      ['Camera access was refused. Allow the camera for this site and try again.', 'denied', 'Then press Try again.'],
      ['No camera was found on this device.', 'missing', 'try on a phone with a camera'],
    ] as const) {
      const h = renderToStaticMarkup(createElement(CameraHelp, { why, onRetry: () => {}, onBack: () => {} }));
      expect(h).toMatch(new RegExp(`data-camera-card="${kind}"`));
      expect(h).toMatch(/class="fixed inset-0 z-\[60\]/);
      expect(h).toMatch(/role="alertdialog"/);
      expect(h).toMatch(/data-retry[^>]*>Try again</);
      expect(text(h)).toContain(next);
      expect(h).not.toMatch(/<header/);
    }
  });
});
