// FN-BOX-1 FIGHT-BODY-AGE-GATE (2026-10-19): under 18 plays a fight with a controller or a phone, never the camera.
// The body path of Karate VS (the boxing slot), Mixed Combat and Showdown is offered only to a birth year that is
// certainly 18+ (ageRules.isVerifiedAdultStrict since FN-BOX-1-STRICT: born 2008 waits for 2027), never in couch mode
// (FN-0, modelled as a flag), and an unknown year is refused.
// Held here on the definitions the harness mounts, the card READY reads, and the header's Body button.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';
import { bodySeamFor, bodyFightAllowed, gateBodyFight, isBodyFightMode, type BodyAgeGate } from './bodySeam';
import { FIGHT_CARD_LINES, FIGHT_CLAIMS } from '../combat/bodyFight';
import { bodyButtonAction, bodyPlayOffer, kicksOptInOffer } from '@/lib/move/bodyPlayChoice';
import { bodyPlayDobYear, setBodyPlayDobYear } from '@/lib/move/bodyPlayGrownUp';
import type { ModeDefinition } from './ModeHarness';

const NOW = new Date('2026-10-19T12:00:00Z');
const TEEN: BodyAgeGate = { dobYear: 2011, couch: false };          // 15
const UNKNOWN: BodyAgeGate = { dobYear: null, couch: false };
const NO_YEAR: BodyAgeGate = { dobYear: undefined, couch: false };
const ADULT: BodyAgeGate = { dobYear: 1990, couch: false };
const ADULT_COUCH: BodyAgeGate = { dobYear: 1990, couch: true };
const BORN_2008: BodyAgeGate = { dobYear: 2008, couch: false };     // an 18 gap in 2026: may still be 17
const BORN_2007: BodyAgeGate = { dobYear: 2007, couch: false };     // a 19 gap in 2026: certainly 18
// Local-clock instants: the rule reads now.getFullYear(), the local year, so a UTC string at midnight would still be
// 2026 on a Pacific machine.
const FIRST_OF_2026 = new Date(2026, 0, 1);
const LAST_OF_2026 = new Date(2026, 11, 31, 23, 59, 59, 999);
const NEW_YEAR_2027 = new Date(2027, 0, 1);
const ALL_OF_2026 = [FIRST_OF_2026, NOW, LAST_OF_2026];

type Def = Pick<ModeDefinition, 'modeId' | 'body' | 'onBody'> & { update: () => void; load: () => Promise<void> };

/** A fight definition shaped like the real ones with their BODY_FIGHT flag on (KarateVSMode.ts's spread). */
function fightDef(modeId: string): Def {
  return {
    modeId,
    update: () => {},
    load: async () => {},
    body: { claims: FIGHT_CLAIMS, lines: FIGHT_CARD_LINES },
    onBody: () => true,
  };
}

const FIGHTS = ['karate-vs', 'mixedcombat', 'showdown'] as const;

/** What a player sees for this mount: the READY offer, the Body button, and the kicks opt-in after a passed check. */
function prompts(def: Def) {
  const { card, drives, claimed, profile } = bodySeamFor(def);
  return {
    offer: bodyPlayOffer(card),
    button: bodyButtonAction({ ...card, phase: 'ready' }, false),
    kicks: kicksOptInOffer({ ...card, key: card.key }, 'ready'),
    drives,
    claimed: claimed.size,
    bindings: profile.bindings.length,
    lines: card.lines.length,
  };
}

describe('the gate itself', () => {
  it('a teen, an unknown year and couch mode are refused; an adult alone is allowed', () => {
    expect(bodyFightAllowed(TEEN, NOW)).toBe(false);
    expect(bodyFightAllowed(UNKNOWN, NOW)).toBe(false);
    expect(bodyFightAllowed(NO_YEAR, NOW)).toBe(false);
    expect(bodyFightAllowed({ dobYear: 0, couch: false }, NOW)).toBe(false);
    expect(bodyFightAllowed({ dobYear: 2009, couch: false }, NOW)).toBe(false);   // 17 by year gap
    expect(bodyFightAllowed(ADULT_COUCH, NOW)).toBe(false);
    expect(bodyFightAllowed(ADULT, NOW)).toBe(true);
    expect(bodyFightAllowed({ dobYear: 2008, couch: false }, NOW)).toBe(false);   // STRICT: an 18 gap may be 17
  });

  it('FN-BOX-1-STRICT: born 2008 is refused all of 2026 and plays from 2027-01-01; born 2007 plays', () => {
    for (const now of ALL_OF_2026) expect(bodyFightAllowed(BORN_2008, now), now.toString()).toBe(false);
    expect(bodyFightAllowed(BORN_2008, NEW_YEAR_2027)).toBe(true);
    for (const now of ALL_OF_2026) expect(bodyFightAllowed(BORN_2007, now), now.toString()).toBe(true);
    // the couch still refuses everyone
    expect(bodyFightAllowed({ ...BORN_2007, couch: true }, NOW)).toBe(false);
    expect(bodyFightAllowed({ ...BORN_2008, couch: true }, NEW_YEAR_2027)).toBe(false);
  });

  it('covers the five combat rows (registry key or modeId), and nothing else', () => {
    for (const m of FIGHTS) expect(isBodyFightMode({ modeId: m }), m).toBe(true);
    expect(isBodyFightMode({ modeId: 'duel' })).toBe(true);
    expect(isBodyFightMode({ modeId: 'karate' })).toBe(true);
    for (const m of ['skateboard', 'dunk', 'sprint', 'threepoint', 'a-new-mode']) expect(isBodyFightMode({ modeId: m }), m).toBe(false);
  });
});

describe('Karate VS, Mixed Combat and Showdown at mount', () => {
  for (const modeId of FIGHTS) {
    describe(modeId, () => {
      for (const [who, gate] of [['teen', TEEN], ['unknown age', UNKNOWN], ['no year on file', NO_YEAR], ['adult in couch mode', ADULT_COUCH]] as const) {
        it(`${who}: no body path, no camera or "coming" prompt, pad play unchanged`, () => {
          const def = fightDef(modeId);
          const gated = gateBodyFight(def, gate, NOW);
          expect(gated).not.toBe(def);
          expect(gated.onBody).toBeUndefined();
          expect(gated.body?.claims).toBeUndefined();
          const p = prompts(gated);
          expect(p.offer).toBeNull();
          expect(p.button).toBe('unavailable');
          expect(p.kicks).toBe(false);
          expect(p.drives).toBe(false);
          expect(p.claimed).toBe(0);
          expect(p.bindings).toBe(0);   // the P3 row's punch → A / kick → B do not come back either
          expect(p.lines).toBe(0);
          // pad play: everything that is not the body path is the very same
          expect(gated.update).toBe(def.update);
          expect(gated.load).toBe(def.load);
          expect(gated.modeId).toBe(modeId);
          // and the input definition is untouched
          expect(def.onBody).toBeTypeOf('function');
          expect(def.body?.claims).toBe(FIGHT_CLAIMS);
        });
      }

      it('adult: the definition is handed back as is, and READY offers body play', () => {
        const def = fightDef(modeId);
        expect(gateBodyFight(def, ADULT, NOW)).toBe(def);
        const p = prompts(def);
        expect(p.offer).toBe('play');
        expect(p.button).toBe('begin');
        expect(p.kicks).toBe(true);
        expect(p.drives).toBe(true);
        expect(p.claimed).toBe(FIGHT_CLAIMS.length);
      });

      it('born 2008, any day of 2026: refused (strict year rule) — no body path, no camera or "coming" prompt', () => {
        const def = fightDef(modeId);
        for (const now of ALL_OF_2026) {
          const gated = gateBodyFight(def, BORN_2008, now);
          expect(gated, now.toString()).not.toBe(def);
          expect(gated.onBody).toBeUndefined();
          expect(gated.body?.claims).toBeUndefined();
          const p = prompts(gated);
          expect(p.offer).toBeNull();
          expect(p.button).toBe('unavailable');
          expect(p.kicks).toBe(false);
          expect(p.drives).toBe(false);
          expect(p.bindings).toBe(0);
          expect(p.lines).toBe(0);
          expect(gated.update).toBe(def.update);
        }
      });

      it('born 2007 in 2026, and born 2008 from 2027-01-01: the definition is handed back as is', () => {
        const def = fightDef(modeId);
        for (const now of ALL_OF_2026) expect(gateBodyFight(def, BORN_2007, now), now.toString()).toBe(def);
        expect(gateBodyFight(def, BORN_2008, NEW_YEAR_2027)).toBe(def);
        expect(prompts(gateBodyFight(def, BORN_2008, NEW_YEAR_2027)).offer).toBe('play');
      });
    });
  }

  it('a fight mode whose flag is off (its P3 row only) is refused too: the row\'s presses and its "coming" go', () => {
    const teen = gateBodyFight({ modeId: 'karate-vs' }, TEEN, NOW);
    expect(bodySeamFor(teen).profile.bindings).toEqual([]);
    expect(bodyPlayOffer(bodySeamFor(teen).card)).toBeNull();
    const duel = gateBodyFight({ modeId: 'duel' }, UNKNOWN, NOW);
    expect(bodyPlayOffer(bodySeamFor(duel).card)).toBeNull();
    // the adult keeps the row exactly as it was
    expect(bodySeamFor(gateBodyFight({ modeId: 'karate-vs' }, ADULT, NOW)).profile.bindings.length).toBe(2);
  });

  it('a non-fight mode is never touched by this gate (other body modes keep the grown-up step)', () => {
    const skate = { modeId: 'skateboard' };
    expect(gateBodyFight(skate, TEEN, NOW)).toBe(skate);
    expect(gateBodyFight(skate, ADULT_COUCH, NOW)).toBe(skate);
  });
});

describe('the wiring', () => {
  afterEach(() => setBodyPlayDobYear(undefined));
  const ROOT = join(__dirname, '../../..');
  const read = (rel: string): string => stripComments(readFileSync(join(ROOT, rel), 'utf8'));

  it('runMode gates the definition before the seam: the host\'s year, else the page\'s held year, and the couch flag', () => {
    const harness = read('lib/babylon/core/ModeHarness.ts');
    expect(harness).toMatch(/def = gateBodyFight\(def, \{ dobYear: opts\.dobYear !== undefined \? opts\.dobYear : bodyPlayDobYear\(\), couch: opts\.couch === true \}\);\s*const seam = bodySeamFor\(def\);/);
  });

  it('the page slot starts unknown, so a host that says nothing fails closed', () => {
    expect(bodyPlayDobYear()).toBeUndefined();
    expect(bodyFightAllowed({ dobYear: bodyPlayDobYear(), couch: false }, NOW)).toBe(false);
  });

  it('the three fight pages read the account\'s birth year and their loaders hold it for the harness', () => {
    for (const d of ['karate-vs', 'mixedcombat', 'showdown']) {
      const page = read(`app/play/${d}/page.tsx`);
      expect(page, d).toMatch(/prisma\.user\.findUnique\(\{ where: \{ id: userId \}, select: \{ dobYear: true \} \}\)\.catch\(\(\) => null\)/);
      expect(page, d).toMatch(/dobYear=\{user\?\.dobYear \?\? null\}/);
      const loader = read(`app/play/${d}/_components/loader.tsx`);
      expect(loader, d).toMatch(/useHeldDobYear\(dobYear\);/);
    }
  });
});
