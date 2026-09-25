import { describe, expect, it, vi, afterEach } from 'vitest';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CrashScreen, GENERIC_CRASH_COPY, GlobalErrorBoundary, PLAY_CRASH_COPY, reportCrash,
} from './global-error-boundary';
import GlobalError from '@/app/global-error';
import PlayLayout from '@/app/play/layout';
import { POST } from '@/app/api/telemetry/crash/route';

// HOTFIX (2026-09-24): the root crash screen. A crash outside /play, or in the root layout itself, used to get Next's
// default error page; app/global-error.tsx now shows the /play boundary's own screen and sends the same report.
// Pinned here: the screen carries its own styling (the root layout's stylesheets can be gone when it is up — checked in
// a real `next start`, where a server-render crash serves a shell with no stylesheet at all), the /play reassurance
// shows only where the /play layout mounts it — whatever the URL says — the buttons do what they say, and the report
// keeps the one field a server crash is traced by and says which catcher sent it.

// GlobalError is a function component whose only hook is the reporting effect. Capturing that effect lets the test call
// the component as a plain function, walk what it returns, and then run the effect by hand — no DOM needed.
const effects: Array<() => void> = [];
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useEffect: (fn: () => void) => { effects.push(fn); } };
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); effects.length = 0; });

const crash = () => Object.assign(new Error('boom in the rail'), { digest: '1234567890' });

/** Any import of a stylesheet: `import './x.css'`, `import s from './x.module.css'`, `require(…)`, `import(…)`. */
const STYLESHEET_IMPORT =
  /(?:^\s*import\s(?:[^'";]*\sfrom\s*)?|\b(?:require|import)\s*\(\s*)['"][^'"]+\.(?:css|scss|sass)['"]/m;

/** Every React element in a tree, depth first (function components are NOT expanded). */
function elements(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const props = node.props as { children?: ReactNode };
  return [node, ...elements(props.children)];
}
const text = (el: ReactElement): string =>
  elements((el.props as { children?: ReactNode }).children).length
    ? '' : String((el.props as { children?: ReactNode }).children ?? '').trim();
const button = (tree: ReactNode, label: string) =>
  elements(tree).find((e) => e.type === 'button' && text(e) === label) as ReactElement<{ onClick: () => void }>;

/** The /play boundary as the /play layout mounts it, already holding a crash, rendered to markup. */
function playBoundaryFallback(): string {
  const tree = PlayLayout({ children: null }) as ReactElement<{ copy?: string; children?: ReactNode }>;
  expect(tree.type).toBe(GlobalErrorBoundary);
  const boundary = new GlobalErrorBoundary(tree.props as never);
  boundary.state = GlobalErrorBoundary.getDerivedStateFromError(new Error('mode crashed'));
  return renderToStaticMarkup(boundary.render() as ReactElement);
}

// HOTFIX (2026-09-24): the copy follows where the screen is mounted, not the URL. On a client-side <Link> navigation
// Next pushes the new URL when the new page commits, and a crash in its first render comes before that — so in a real
// `next start` a URL-read picked the generic copy for hub -> a crashing mode, and the /play promise for a mode -> a
// crashing non-mode page. Each test below stubs the URL a crash really sees in one of those cases.
describe('which copy the crash screen shows', () => {
  it('the /play boundary promises the session is safe — even while the URL still names the hub it came from', () => {
    vi.stubGlobal('location', { pathname: '/' });
    const m = playBoundaryFallback();
    expect(m).toContain(PLAY_CRASH_COPY);
    expect(m).not.toContain(GENERIC_CRASH_COPY);
  });

  it('the root screen claims nothing — even while the URL still names the mode it came from', () => {
    vi.stubGlobal('location', { pathname: '/play/dunk' });
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const m = renderToStaticMarkup(createElement(GlobalError, { error: crash(), reset: () => {} }));
    expect(m).toContain(GENERIC_CRASH_COPY);
    expect(m).not.toMatch(/session|progress|currency/i);
  });

  it('a boundary or screen mounted anywhere else, with no copy given, claims nothing', () => {
    vi.stubGlobal('location', { pathname: '/play/karate' });
    const boundary = new GlobalErrorBoundary({ children: null });
    boundary.state = GlobalErrorBoundary.getDerivedStateFromError(new Error('shop crashed'));
    expect(renderToStaticMarkup(boundary.render() as ReactElement)).toContain(GENERIC_CRASH_COPY);
    expect(renderToStaticMarkup(createElement(CrashScreen, { onRetry: () => {} }))).toContain(GENERIC_CRASH_COPY);
    expect(GENERIC_CRASH_COPY).not.toMatch(/session|progress|currency|safe/i);
  });
});

describe('the crash screen needs no stylesheet', () => {
  it('styles every element inline and uses no class at all', () => {
    const tree = CrashScreen({ onRetry: () => {} });
    const hosts = elements(tree).filter((e) => typeof e.type === 'string');
    expect(hosts.map((e) => e.type)).toEqual(['div', 'p', 'h1', 'p', 'div', 'button', 'button']);
    for (const el of hosts) {
      const props = el.props as { style?: object; className?: string };
      expect(props.className, `<${String(el.type)}> has a class`).toBeUndefined();
      expect(props.style, `<${String(el.type)}> has no inline style`).toBeTypeOf('object');
    }
    const [root, , , , , retry, home] = hosts.map((e) => (e.props as { style: Record<string, unknown> }).style);
    // the brand colours and layout the Tailwind classes used to give it
    expect(root).toMatchObject({ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#05060a', color: '#f1f5f9' });
    expect(retry).toMatchObject({ background: '#22d3ee', color: '#000', fontWeight: 900, borderRadius: 16 });
    expect(home).toMatchObject({ border: '1px solid #475569', background: 'transparent', fontWeight: 900 });
  });

  it('the root document is inline-styled too, has a viewport, and imports no CSS', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const m = renderToStaticMarkup(createElement(GlobalError, { error: crash(), reset: () => {} }));
    expect(m.startsWith('<html')).toBe(true);
    expect(m).toMatch(/<body style="[^"]*background:#05060a/);
    expect(m).toContain('<meta name="viewport" content="width=device-width, initial-scale=1"/>');
    expect(m).not.toMatch(/\sclass=/);
    // Next 14.2 never links the CSS a global-error.tsx imports; an import here would only look like it did something.
    // Any kind of stylesheet import counts: a side-effect import, a CSS module, a require or a dynamic import — in the
    // root screen or in the module its CrashScreen comes from.
    for (const file of ['../../app/global-error.tsx', './global-error-boundary.tsx']) {
      const src = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(src, file).not.toMatch(STYLESHEET_IMPORT);
    }
  });

  it('the no-stylesheet guard catches every way a stylesheet can be imported', () => {
    for (const line of [
      "import './globals.css';",
      "import s from './crash.module.css';",
      "import { root } from \"./crash.module.scss\";",
      "import {\n  root,\n  title,\n} from '@/styles/crash.module.css'",
      "const s = require('./crash.css');",
      "await import('./crash.sass');",
    ]) expect(line, line).toMatch(STYLESHEET_IMPORT);
    for (const line of [
      "import { useEffect } from 'react';",
      "// a class-styled screen leaned on globals.css",
      "import { CrashScreen } from '@/components/reliability/global-error-boundary';",
    ]) expect(line, line).not.toMatch(STYLESHEET_IMPORT);
  });

  it('the /play boundary falls back to the very same screen', () => {
    const boundary = new GlobalErrorBoundary({ children: null, copy: PLAY_CRASH_COPY });
    boundary.state = GlobalErrorBoundary.getDerivedStateFromError(new Error('mode crashed'));
    const fallback = boundary.render() as ReactElement<{ copy?: string }>;
    expect(fallback.type).toBe(CrashScreen);
    expect(fallback.props.copy).toBe(PLAY_CRASH_COPY);
  });
});

describe('the buttons', () => {
  it('RETRY calls back and BACK TO HUB goes home (to / when no handler is given)', () => {
    const onRetry = vi.fn();
    const onHome = vi.fn();
    button(CrashScreen({ onRetry, onHome }), 'RETRY').props.onClick();
    expect(onRetry).toHaveBeenCalledTimes(1);
    button(CrashScreen({ onRetry, onHome }), 'BACK TO HUB').props.onClick();
    expect(onHome).toHaveBeenCalledTimes(1);

    const assign = vi.fn();
    vi.stubGlobal('location', { pathname: '/shop', assign });
    button(CrashScreen({ onRetry }), 'BACK TO HUB').props.onClick();
    expect(assign).toHaveBeenCalledWith('/');
  });

  it("the root screen's RETRY reloads the page rather than re-rendering the payload that failed", () => {
    const reload = vi.fn();
    const reset = vi.fn();
    vi.stubGlobal('location', { pathname: '/kitchens', reload });
    const doc = GlobalError({ error: crash(), reset }) as ReactElement;
    const screen = elements(doc).find((e) => e.type === CrashScreen) as ReactElement<{ onRetry: () => void }>;
    expect(screen).toBeTruthy();
    screen.props.onRetry();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });
});

describe('the crash report', () => {
  it('the root screen reports once it is up, with the digest', () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', { pathname: '/profile' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    GlobalError({ error: crash(), reset: () => {} });
    expect(fetchMock).not.toHaveBeenCalled();         // rendering alone does not report…
    expect(effects).toHaveLength(1);
    effects[0]();                                     // …the effect does, once the screen is committed
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body).toMatchObject({ message: 'boom in the rail', digest: '1234567890', path: '/profile', caughtBy: 'root' });
  });

  it('the /play boundary reports as the boundary, so a root report\'s stale path can be told apart', () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', { pathname: '/play/dunk' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    new GlobalErrorBoundary({ children: null }).componentDidCatch(crash(), { componentStack: '' } as never);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({ path: '/play/dunk', caughtBy: 'boundary' });
  });

  it('posts to our own telemetry route with the digest, and the route logs it', async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);
    reportCrash(crash(), 'root');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/telemetry/crash');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ message: 'boom in the rail', digest: '1234567890', caughtBy: 'root' });

    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(new Request('http://x/api/telemetry/crash', { method: 'POST', body: init.body }) as never);
    expect(res.status).toBe(200);
    const [tag, line] = log.mock.calls[0];
    expect(tag).toBe('[FEL-CRASH]');
    expect(JSON.parse(String(line))).toMatchObject({ message: 'boom in the rail', digest: '1234567890', caughtBy: 'root' });
  });

  it('never throws, whether fetch throws or rejects — a reporter must not crash the crash screen', () => {
    vi.stubGlobal('fetch', vi.fn(() => { throw new TypeError('fetch is gone'); }));
    expect(() => reportCrash(crash(), 'boundary')).not.toThrow();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    expect(() => reportCrash(crash(), 'boundary')).not.toThrow();
  });
});

// HOTFIX (2026-09-24): the route takes anything from anyone and writes it to the log, so it reads only a plain object's
// own fields, caps every one, and always answers 200.
describe('the crash route', () => {
  async function logged(raw: string): Promise<Record<string, unknown>> {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(new Request('http://x/api/telemetry/crash', { method: 'POST', body: raw }) as never);
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(log.mock.calls[0][1])) as Record<string, unknown>;
    log.mockRestore();
    return line;
  }

  it('never logs a prototype member for a body that is not an object', async () => {
    for (const raw of ['"str"', '42', 'true', 'null', '[1,2]', 'not json']) {
      const line = await logged(raw);
      expect(line.message, raw).toBe('');
      expect(line.path, raw).toBe('');
      expect(String(line.at), raw).not.toMatch(/function|native code/);
      expect(line.at, raw).toMatch(/^\d{4}-\d\d-\d\dT/);   // a real timestamp, not String.prototype.at
      expect(line.digest, raw).toBeNull();
      expect(line.caughtBy, raw).toBeNull();
    }
  });

  it('caps every field and still answers when a field is an object that cannot be turned into a string', async () => {
    const line = await logged(JSON.stringify({
      message: { toString: 1 }, path: '/' + 'p'.repeat(5000), at: 'x'.repeat(500), stack: 's'.repeat(5000),
      digest: 'd'.repeat(500), caughtBy: 'root',
    }));
    expect(line.message).toBe('{"toString":1}');
    expect(String(line.path)).toHaveLength(256);
    expect(String(line.at)).toHaveLength(64);
    expect(String(line.stack)).toHaveLength(1200);
    expect(String(line.digest)).toHaveLength(64);
    expect(line.caughtBy).toBe('root');
  });

  it('keeps only the two catchers it knows', async () => {
    expect((await logged('{"caughtBy":"boundary"}')).caughtBy).toBe('boundary');
    expect((await logged('{"caughtBy":"<script>"}')).caughtBy).toBeNull();
  });
});
