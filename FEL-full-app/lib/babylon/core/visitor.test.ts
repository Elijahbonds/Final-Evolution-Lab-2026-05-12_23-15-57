// FIRST-DUNK-BUDGET (2026-10-17): a logged-out visitor is not asked for what a guest is refused, and the spawn asks once.
//
// AM's /try runs, every one: /api/v1/card-slot, /api/season and /api/v1/closet answered 401 for the guest, the closet three times
// and hero-body twice. /try renders the dunk only for a visitor the server found signed out, so its host KNOWS — it says so
// (HarnessOpts.guest → visitor.ts), and the reads a guest can only be refused are not sent. A host that says nothing asks as before.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { identityFrom, invalidateIdentity, resolveIdentity } from './playerIdentity';
import { readSeasonLane } from './SeasonSpecials';
import { setSignedOutVisitor, signedOutVisitor } from './visitor';

const GUEST_BODY = { body: 'kit-male', guest: true, frame: null, palette: null, scanOwned: false };
let calls: string[] = [];
beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(String(url).split('?')[0]);
    if (String(url).startsWith('/api/v1/hero-body')) return new Response(JSON.stringify(GUEST_BODY), { status: 200 });
    return new Response('{}', { status: 401 });   // the closet and the season, for a guest
  }));
});
afterEach(() => { vi.unstubAllGlobals(); setSignedOutVisitor(false); invalidateIdentity(); });

const count = (u: string) => calls.filter((c) => c === u).length;

describe('the spawn asks for the identity once', () => {
  it('control: a host that does not know asks the closet — once, though two callers ask at the same moment', async () => {
    // characterPipeline's Promise.all and CharacterLibrary.spawn's own call: both in flight before either answers
    const [a, b] = await Promise.all([resolveIdentity(), resolveIdentity()]);
    expect(a).toBe(b);
    expect(count('/api/v1/closet')).toBe(1);
    expect(count('/api/v1/hero-body')).toBe(1);
  });
  it('a visitor the host knows is signed out: no closet read at all, and the identity a 401 would have given', async () => {
    setSignedOutVisitor(true);
    expect(signedOutVisitor()).toBe(true);
    const id = await resolveIdentity();
    expect(count('/api/v1/closet')).toBe(0);
    expect(count('/api/v1/hero-body')).toBe(1);   // a guest's body is the server's call (200, never a 401): still asked
    expect(id).toEqual(identityFrom(null, GUEST_BODY as never, null));
  });
  it('an identity made without the closet is not kept for a mount that may be signed in', async () => {
    setSignedOutVisitor(true);
    await resolveIdentity();
    setSignedOutVisitor(false);   // the next mount's host does not know (a guest who signed in, /play/dunk)
    await resolveIdentity();
    expect(count('/api/v1/closet')).toBe(1);
  });
});

describe('the season lane', () => {
  it('a known guest is the guest lane without asking (a 401 IS the guest lane)', async () => {
    setSignedOutVisitor(true);
    expect(await readSeasonLane()).toBe('guest');
    expect(count('/api/season')).toBe(0);
  });
});

describe('the hosts say so', () => {
  const root = join(__dirname, '../../..');
  const read = (p: string) => readFileSync(join(root, p), 'utf8');
  it('/try: the guest shell tells the dunk host, which tells the harness; the harness sets it on every mount', () => {
    expect(read('app/try/page.tsx')).toMatch(/if \(session\) \{\s*redirect\(/);   // why /try can say it: only a guest reaches the shell
    expect(read('components/games/guest-dunk-shell.tsx')).toMatch(/<DunkBabylon[^>]*\n\s*guest\n/);
    expect(read('components/games/dunk-babylon.tsx')).toContain('guest: guestRef.current,');
    expect(read('lib/babylon/core/ModeHarness.ts')).toContain('setSignedOutVisitor(opts.guest === true);');
  });
  it('the harness clears the known-guest flag when the mode unmounts', () => {
    const src = read('lib/babylon/core/ModeHarness.ts');
    const disposer = src.slice(src.indexOf('return () => {'));
    expect(disposer).toContain('setSignedOutVisitor(false);');
    expect(disposer.indexOf('setSignedOutVisitor(false);')).toBeLessThan(disposer.indexOf('FloatingOriginCurrentScene.getScene = NO_SCENE;'));
  });
  it('the start screen asks for the card slot and the saved characters only for a signed-in player', () => {
    for (const f of ['components/games/card-slot.tsx', 'components/closet/play-as-switcher.tsx']) {
      const src = read(f);
      expect(src, f).toContain("const signedIn = useContext(SessionContext)?.status === 'authenticated';");
      const effect = src.slice(src.indexOf('useEffect(() => {'));
      expect(effect.indexOf('if (!signedIn) return;'), f).toBeGreaterThan(0);
      expect(effect.indexOf('if (!signedIn) return;'), f).toBeLessThan(effect.indexOf('fetch('));
      expect(effect, f).toMatch(/\}, \[signedIn\]\);/);
    }
  });
});
