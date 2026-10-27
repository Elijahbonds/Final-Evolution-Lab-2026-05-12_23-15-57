// ONB-01 / ONB-04 through the REAL AuthForm (next-auth mocked, window and fetch stubbed, the no-DOM drive pattern of
// auth-form.test.tsx): the sign-up form offers five paths, holds teach until the age step says verified adult, lands
// each path on its first win (play: the game itself), and posts the first visit's utm / ref tags with the account.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drive, field, findAll, typeInto, type Step } from '@/tests/helpers/driveRender';

const signIn = vi.fn();
vi.mock('next-auth/react', () => ({ signIn: (...a: unknown[]) => signIn(...a), signOut: vi.fn() }));

import { AuthForm } from './auth-form';
import { AgeStep } from './age-step';
import { PathPicker } from './onboarding/path-picker';
import { ATTRIBUTION_KEY } from '@/lib/marketing/utm';

const ADULT = new Date().getFullYear() - 30;
const TEEN = new Date().getFullYear() - 16;
const sent: Array<{ url: string; body: any }> = [];
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});

let win: { location: { href: string; replace: ReturnType<typeof vi.fn> }; localStorage: Pick<Storage, 'getItem' | 'setItem'> };
function stubWindow(stored: Record<string, string> = {}) {
  const m = new Map(Object.entries(stored));
  win = {
    location: { href: 'http://127.0.0.1/signup', replace: vi.fn() },
    localStorage: { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } },
  };
  vi.stubGlobal('window', win);
}

const lockAge = (year: number): Step => (tree) => {
  const [age] = findAll(tree, (el) => el.type === AgeStep);
  age.props.onLocked(year, `${year}-05-01`);
};
const pick = (path: string): Step => (tree) => {
  const [picker] = findAll(tree, (el) => el.type === PathPicker);
  picker.props.onChange(path);
};
const fill: Step[] = [
  (tree) => typeInto(field(tree, /^Email$/), 'new@example.com'),
  (tree) => typeInto(field(tree, /Password/), 'correct-horse-battery'),
  (tree) => { const [box] = findAll(tree, (el) => el.type === 'span' && typeof el.props.onClick === 'function'); box.props.onClick(); },
];

async function signUp(steps: Step[]) {
  const r = drive(() => AuthForm({ mode: 'signup' }), steps);
  const [form] = findAll(r.tree, (el) => el.type === 'form');
  await form.props.onSubmit({ preventDefault() {} });
  return r;
}

beforeEach(() => {
  signIn.mockReset();
  signIn.mockResolvedValue({ error: undefined });
  fetchMock.mockClear();
  sent.length = 0;
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('ONB-01: five ways in', () => {
  it('offers play, train, learn, teach and create, and holds teach until the age step says verified adult', () => {
    stubWindow();
    const before = drive(() => AuthForm({ mode: 'signup' })).html;
    for (const p of ['play', 'train', 'learn', 'teach', 'create']) expect(before).toContain(`data-path="${p}"`);
    expect(before).toMatch(/data-path="teach" data-held="true"/);
    const teen = drive(() => AuthForm({ mode: 'signup' }), [lockAge(TEEN)]).html;
    expect(teen).toMatch(/data-path="teach" data-held="true"/);
    expect(teen).toContain('For adults (18+).');
    const adult = drive(() => AuthForm({ mode: 'signup' }), [lockAge(ADULT)]).html;
    expect(adult).not.toMatch(/data-held="true"/);
  });

  it.each([
    ['train', '/welcome?path=train'],
    ['learn', '/welcome?path=learn'],
    ['create', '/welcome?path=create'],
    ['teach', '/welcome?path=teach'],
  ])('%s lands on its first win (%s), one full navigation', async (path, dest) => {
    stubWindow();
    await signUp([lockAge(ADULT), pick(path), ...fill]);
    expect(win.location.replace).toHaveBeenCalledTimes(1);
    expect(win.location.replace).toHaveBeenCalledWith(dest);
  });

  it('play opens the game itself, as before', async () => {
    stubWindow();
    await signUp([lockAge(ADULT), ...fill]);
    expect(win.location.replace).toHaveBeenCalledWith('/play/dunk');
  });

  it('a teen who somehow holds teach lands on train, never on the coach first run', async () => {
    stubWindow();
    await signUp([lockAge(ADULT), pick('teach'), lockAge(TEEN), ...fill]);
    expect(win.location.replace).toHaveBeenCalledWith('/welcome?path=train');
  });
});

describe('ONB-04: the sign-up carries the first visit\'s tags', () => {
  it('posts utm / ref kept by the first page view', async () => {
    stubWindow({ [ATTRIBUTION_KEY]: JSON.stringify({ source: 'x', medium: null, campaign: 'fall', ref: 'CODE', day: new Date().toISOString().slice(0, 10) }) });
    await signUp([lockAge(ADULT), ...fill]);
    const signup = sent.find((s) => s.url === '/api/signup')!;
    expect(signup.body.utm).toEqual({ source: 'x', medium: null, campaign: 'fall', ref: 'CODE' });
  });

  it('posts nothing about it when the visit carried no tags', async () => {
    stubWindow();
    await signUp([lockAge(ADULT), ...fill]);
    expect(sent.find((s) => s.url === '/api/signup')!.body).not.toHaveProperty('utm');
  });
});
