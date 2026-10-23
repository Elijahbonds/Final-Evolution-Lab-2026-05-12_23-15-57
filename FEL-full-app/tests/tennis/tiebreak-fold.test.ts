// TN-4 (ALL-MODES-TO-75 §1, TENNIS-TIEBREAK-FOLD 2026-10-22): /play/tiebreak lands in the Tennis tiebreak variant, and the
// variant's config resolves to a Tennis net-sport definition scored as a tiebreak.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isValidElement, type ReactElement } from 'react';

const redirect = vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); });
let session: unknown = { user: { id: 'u1' } };
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }));
vi.mock('next-auth', () => ({ getServerSession: async () => session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/components/games/game-shell', () => ({ GameShell: () => null }));

import TiebreakPage from '@/app/play/tiebreak/page';
import TennisPage from '@/app/play/tennis/page';
import { TennisLoader } from '@/app/play/tennis/_components/loader';
import { TENNIS_VARIANTS, TIEBREAK_VARIANT_PATH, tennisVariantOf } from '@/lib/babylon/modes/tennisVariant';

const ROOT = path.resolve(__dirname, '../..');

beforeEach(() => { redirect.mockClear(); session = { user: { id: 'u1' } }; });

// FN-0 COUCH (#383) wraps the page as <><TennisLoader/><CouchStart/></>, so find the loader inside the fragment.
function loaderOf(el: ReactElement): ReactElement {
  if (el.type === TennisLoader) return el;
  const kids = ([] as unknown[]).concat((el.props as { children?: unknown }).children ?? []);
  const hit = kids.find((k) => isValidElement(k) && k.type === TennisLoader);
  if (!hit) throw new Error('no TennisLoader in the page');
  return hit as ReactElement;
}

describe('TN-4 /play/tiebreak lands in the Tennis tiebreak variant', () => {
  it('/play/tiebreak redirects to /play/tennis?variant=tiebreak', () => {
    expect(TIEBREAK_VARIANT_PATH).toBe('/play/tennis?variant=tiebreak');
    expect(() => TiebreakPage()).toThrow('REDIRECT /play/tennis?variant=tiebreak');
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it('/play/tennis?variant=tiebreak renders the Tennis loader in its tiebreak variant', async () => {
    const page = await TennisPage({ searchParams: { variant: 'tiebreak' } }) as ReactElement;
    expect(isValidElement(page)).toBe(true);
    const el = loaderOf(page);
    expect(el.type).toBe(TennisLoader);
    expect((el.props as { variant: string }).variant).toBe('tiebreak');
  });

  it('and the loader mounts the tiebreak game under the tiebreak session key', () => {
    const shell = TennisLoader({ variant: 'tiebreak' }) as ReactElement<{ mode: string; ownControls?: boolean }>;
    expect(shell.props.mode).toBe('tiebreak');
    expect(shell.props.ownControls).toBe(true);
    const match = TennisLoader({}) as ReactElement<{ mode: string }>;
    expect(match.props.mode).toBe('tennis');
  });

  it('plain /play/tennis is still the match; a signed-out tiebreak visit comes back to the variant after login', async () => {
    const el = loaderOf(await TennisPage({}) as ReactElement);
    expect((el.props as { variant: string }).variant).toBe('match');
    session = null;
    await expect(TennisPage({ searchParams: { variant: 'tiebreak' } })).rejects.toThrow(`REDIRECT /login?next=${encodeURIComponent('/play/tennis?variant=tiebreak')}`);
  });

  it('the loader hosts the variant through the registry key `tiebreak`', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app/play/tennis/_components/loader.tsx'), 'utf8');
    expect(src).toMatch(/modeKey:\s*'tiebreak'/);
  });
});

describe('the tennis_tiebreak variant config resolves', () => {
  it('?variant= reads tiebreak, and everything else is the match', () => {
    expect(tennisVariantOf('tiebreak')).toBe('tiebreak');
    expect(tennisVariantOf(['tiebreak', 'x'])).toBe('tiebreak');
    for (const v of [undefined, null, '', 'match', 'TIEBREAK', 'blitz']) expect(tennisVariantOf(v), String(v)).toBe('match');
    expect(TENNIS_VARIANTS.tiebreak).toEqual({ modeKey: 'tiebreak', sessionMode: 'tiebreak', path: '/play/tennis?variant=tiebreak' });
    expect(TENNIS_VARIANTS.match.modeKey).toBe('tennis');
  });

  it('the tiebreak route mounts the Tennis tiebreak variant (NetSportMode) as its definition, not TiebreakMode', async () => {
    const { TennisMode, TennisTiebreakMode } = await import('@/lib/babylon/modes/TennisMode');
    expect(TennisTiebreakMode.modeId).toBe('tiebreak');
    expect(TennisTiebreakMode.camPreset).toBe(TennisMode.camPreset);
    expect(typeof TennisTiebreakMode.load).toBe('function');
    const loader = fs.readFileSync(path.join(ROOT, 'app/play/tennis/_components/loader.tsx'), 'utf8');
    expect(loader).toMatch(/modeKey: 'tiebreak', def: t\.TennisTiebreakMode/);
    expect(loader).not.toMatch(/TiebreakMode'|tiebreak-game/);
    // /play/tiebreak no longer mounts the old Blitz host
    const page = fs.readFileSync(path.join(ROOT, 'app/play/tiebreak/page.tsx'), 'utf8');
    expect(page).not.toMatch(/import .*TiebreakLoader/);
    // the files stay (deleting them is Elijah's call)
    expect(fs.existsSync(path.join(ROOT, 'lib/babylon/modes/TiebreakMode.ts'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'lib/babylon/core/TiebreakBlitz.ts'))).toBe(true);
  });

  it('the variant is Tennis\'s config with tiebreak scoring: same venue, cage and swing clip', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/babylon/modes/TennisMode.ts'), 'utf8');
    const variant = src.slice(src.indexOf('export const TennisTiebreakMode'));
    expect(variant).toMatch(/\.\.\.TENNIS_OPTIONS/);
    expect(variant).toMatch(/modeId: 'tiebreak'/);
    expect(variant).toMatch(/scoring: 'tiebreak'/);
    expect(variant).not.toMatch(/venueId|cage:|swingClip/);   // inherited, not overridden
    expect(src).toMatch(/venueId: 'tennis'[\s\S]*cage: true[\s\S]*swingClip: 'tennis_swing'/);
  });

  it('NetSportMode wires the tiebreak into the "what it takes to win" read and the HUD round line', () => {
    const net = fs.readFileSync(path.join(ROOT, 'lib/babylon/modes/NetSportMode.ts'), 'utf8');
    expect(net).toMatch(/scoring: 'tennis' \| 'volley' \| 'tiebreak';/);
    expect(net).toMatch(/tiebreakScore = o\.scoring === 'tiebreak' \? new TiebreakScore\(\) : null;\s*\n\s*if \(tiebreakScore\) volleyScore = tiebreakScore;/);
    // aiStanding reads volleyScore!.target, which the tiebreak fills with TIEBREAK_TARGET
    expect(net).toMatch(/const toWin = tennisScore \? tennisScore\.gamesToWin : volleyScore!\.target;/);
    expect(net).toMatch(/if \(tiebreakScore\) ctx\.setHud\(\{ round: `TIEBREAK · FIRST TO \$\{tiebreakScore\.target\} · WIN BY 2` \}\);/);
    expect(net).toMatch(/if \(tiebreakScore\) server = tiebreakScore\.serverFor\(0\);/);
  });
});
