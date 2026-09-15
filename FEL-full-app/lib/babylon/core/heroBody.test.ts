import { describe, it, expect } from 'vitest';
import {
  decideHeroBody, parseOwnerEmails, urlForHeroBody, isPlayerBodyUrl, proportionsFromFrame, bodyTypeOf,
  SCAN_BODY_URL, KIT_BODY_URL,
} from './heroBody';

describe('heroBody — the scan is the owner\'s body only; everyone else wears the creator\'s kit body', () => {
  const owners = parseOwnerEmails(' Owner@Example.com , ,second@example.com');

  it('parses the allowlist case- and whitespace-insensitively, dropping empties', () => {
    expect([...owners].sort()).toEqual(['owner@example.com', 'second@example.com']);
    expect(parseOwnerEmails(undefined).size).toBe(0);
    expect(parseOwnerEmails('').size).toBe(0);
  });

  it('an allowlisted account plays the scan whatever its creator frame says', () => {
    expect(decideHeroBody('OWNER@example.com', owners, { bodyType: 'female' })).toBe('scan');
  });

  it('any other account plays the kit body its creator frame chose', () => {
    expect(decideHeroBody('someone@else.com', owners, { bodyType: 'female' })).toBe('kit-female');
    expect(decideHeroBody('someone@else.com', owners, { bodyType: 'male' })).toBe('kit-male');
    expect(decideHeroBody('someone@else.com', owners, null)).toBe('kit-male');
  });

  it('a guest never gets the scan — even with an empty allowlist and no email', () => {
    expect(decideHeroBody(null, owners, null)).toBe('kit-male');
    expect(decideHeroBody(undefined, new Set(), null)).toBe('kit-male');
    expect(decideHeroBody('', new Set(['']), null)).toBe('kit-male');
  });

  it('maps kinds to files, and every player file counts as a player body', () => {
    expect(urlForHeroBody('scan')).toBe(SCAN_BODY_URL);
    expect(urlForHeroBody('kit-female')).toBe(KIT_BODY_URL.female);
    expect(urlForHeroBody('kit-male')).toBe(KIT_BODY_URL.male);
    for (const u of [SCAN_BODY_URL, KIT_BODY_URL.male, KIT_BODY_URL.female]) expect(isPlayerBodyUrl(u)).toBe(true);
    expect(isPlayerBodyUrl('/models/athletes/atlas.glb')).toBe(false);
  });

  it('reads the frame\'s percent scales as multipliers, 1 for anything unset or junk', () => {
    expect(proportionsFromFrame({ heightScale: 110, buildScale: 92, reachScale: 'x' })).toEqual({ heightScale: 1.1, buildScale: 0.92, reachScale: 1 });
    expect(proportionsFromFrame(null)).toBeNull();
    expect(bodyTypeOf('Female')).toBe('female');
    expect(bodyTypeOf(42)).toBe('male');
  });
});

describe('the creator offers exactly the bodies heroBody can spawn', async () => {
  const { BODY } = await import('../../creator/schema/body');
  it('has a Body Type row whose options are the shipped kit bodies, defaulting to the guest body', () => {
    const r = BODY.rows.find((x) => x.id === 'bodyType') as { options: readonly string[]; defaultOption: string; allowNone: boolean } | undefined;
    expect(r).toBeDefined();
    expect([...r!.options]).toEqual(['male', 'female']);
    expect(r!.defaultOption).toBe('male');
    expect(r!.allowNone).toBe(false);
    for (const o of r!.options) expect(urlForHeroBody(decideHeroBody('x@y.z', new Set(), { bodyType: o }))).toBe(KIT_BODY_URL[o as 'male' | 'female']);
  });
});
