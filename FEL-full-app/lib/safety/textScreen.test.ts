// SAFETY lane (SAF-06, 2026-10-25): the shared text screen — the lines that MUST pass (the Scunthorpe set and the
// vocabulary of coaching and hoops), the lines that MUST fail, and PARITY with the party list netd ships.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isProfane } from '@/server/netd/src/partyRules';
import {
  PARTY_ALLOW, PARTY_STEMS, PARTY_WORDS, cleanTyped, isListedWord, maskForDisplay, passesScreen, screenAbuse, screenRefusal,
} from './textScreen';

const MUST_PASS = [
  // Scunthorpe-style: a listed stem or word inside a real one
  'Scunthorpe United', 'my assistant coach', 'the cockpit view', 'a classic crossover', 'Essex and Sussex', 'Middlesex',
  'read the document', 'cumulative minutes', 'shiitake risotto', 'a small niggle in my calf', 'the therapist said rest',
  'grasshopper drill', 'bass guitar', 'pass the ball', 'passion for the game', 'Dickens on the bus', 'cocktail party',
  'the peacock logo', 'analysis of my jump', 'skyscraper dunk', 'a hancock-style layup', 'Matsushita', 'fuchsia jersey',
  'specialist coach', 'raccoon city', 'cocoon wrap', 'title IX', 'Hello there', 'Assess the jump', 'pros and cons',
  'as in a lift', 'a con artist', 'the bass drops', 'shuttlecock', 'jizzle',
  // coaching and hoops vocabulary
  'kill it on the court today', 'you killed that drill', 'dead heat at the line', 'shoot your shot', 'that dunk was sick',
  'beast mode', 'we are going to beat you next week', 'I will shoot you a text', 'watch your back foot on the landing',
  "don't hurt yourself — stop if it hurts", 'stop if you feel pain in the knee', 'sex differences in ACL injury rates',
  'damn that was close', 'what the hell was that pass', 'game on 2026-10-25 at 6pm', 'score 21-19', 'sets 3x8 @ 60kg',
  'bang bang', 'the defender got cooked', 'and one!', 'he got posterized', 'ice in the veins',
];

const MUST_FAIL: [string, string][] = [
  ['you are a fucking loser', 'profanity'], ['f u c k this', 'profanity'], ['f.u.c.k', 'profanity'], ['sh1t pass', 'profanity'],
  ['fuuuuck', 'profanity'], ['@sshole', 'profanity'], ['what a b1tch', 'profanity'], ['fück off', 'profanity'],
  ['FUCK', 'profanity'], ['ass', 'profanity'], ['asssss', 'profanity'], ['dickhead move', 'profanity'],
  ['nigger', 'slur'], ['n1gg@', 'slur'], ['faggot', 'slur'], ['you retard', 'slur'], ['dirty kike', 'slur'], ['spic', 'slur'],
  ['kys', 'self_harm'], ['just kill yourself', 'self_harm'], ['go die', 'self_harm'], ['you should just die', 'self_harm'],
  ['I will kill you', 'threat'], ["I'm gonna stab you", 'threat'], ['i know where you live', 'threat'],
  ['send nudes', 'sexual'], ['send me a pic', 'sexual'], ['are you a virgin', 'sexual'], ['ur so sexy', 'sexual'],
  ['add me on snap', 'contact'], ["what's your insta", 'contact'], ['how old are you', 'contact'],
  ['call 555-123-4567', 'contact'], ['text me 07700 900123', 'contact'], ['mail me at kid@example.com', 'contact'],
  ['meet up irl?', 'contact'], ['find me @hoops_kid_09', 'contact'],
];

describe('the text screen', () => {
  it.each(MUST_PASS)('passes: %s', (line) => {
    expect(screenAbuse(line)).toEqual([]);
    expect(passesScreen(line)).toBe(true);
  });

  it.each(MUST_FAIL)('fails: %s (%s)', (line, kind) => {
    const hits = screenAbuse(line);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((h) => h.kind)).toContain(kind);
  });

  it('reports what tripped, where, as written', () => {
    expect(screenAbuse('nice pass, shit defence')).toEqual([{ kind: 'profanity', found: 'shit', at: 11 }]);
  });

  it('masks for display only (relayed chat), same length', () => {
    const m = maskForDisplay('what the fuck man');
    expect(m).toBe('what the **** man');
    expect(m).toHaveLength('what the fuck man'.length);
  });

  it('clean, then cap; control characters and bidi overrides out', () => {
    expect(cleanTyped('  a‮ b\n\nc ', 100)).toBe('a b c');
    expect(cleanTyped('x'.repeat(500), 280)).toHaveLength(280);
    expect(cleanTyped('   ', 10)).toBeNull();
    expect(cleanTyped(42, 10)).toBeNull();
  });

  it('the refusal names contact details plainly, and says nothing else for the rest', () => {
    expect(screenRefusal(screenAbuse('add me on snap'))).toMatch(/contact details/);
    expect(screenRefusal(screenAbuse('shit'))).toMatch(/can’t go on FEL/);
    expect(screenRefusal([])).toBeNull();
  });
});

/** Real words netd's party chat masks and this screen lets through (see the parity test). */
const NETD_OVER_MASKS = ['as', 'assess', 'con', 'cons'];

describe('PARITY with the party list (server/netd/src/partyRules.ts, read only)', () => {
  const src = readFileSync(join(__dirname, '../../server/netd/src/partyRules.ts'), 'utf8');
  const arr = (name: string) => {
    const m = new RegExp(`const ${name}\\s*=\\s*(?:new Set\\()?\\[([\\s\\S]*?)\\]`).exec(src);
    expect(m, `${name} not found in partyRules.ts`).not.toBeNull();
    return [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  };

  it('control: the extraction sees the lists netd ships', () => {
    expect(arr('STEMS')).toContain('fuck');
    expect(arr('WORDS')).toContain('kys');
    expect(arr('ALLOW')).toContain('shiitake');
  });

  it('every netd stem, word and allowed word is in the copy (the copy may only add)', () => {
    expect(arr('STEMS').filter((w) => !PARTY_STEMS.includes(w))).toEqual([]);
    expect(arr('WORDS').filter((w) => !PARTY_WORDS.includes(w))).toEqual([]);
    expect(arr('ALLOW').filter((w) => !PARTY_ALLOW.includes(w))).toEqual([]);
  });

  it('netd isProfane and this screen agree on every listed and allowed word, and on the fixtures', () => {
    for (const w of [...arr('STEMS'), ...arr('WORDS')]) {
      expect(isProfane(w), `netd ${w}`).toBe(true);
      expect(isListedWord(w), `screen ${w}`).toBe(true);
    }
    for (const w of arr('ALLOW')) {
      expect(isProfane(w)).toBe(false);
      expect(isListedWord(w)).toBe(false);
    }
    // anything the party masks, this screen refuses — EXCEPT netd's known over-masks: its collapsed-letter match turns
    // "as" into "ass", "assess" into "asses", "con" into "coon" and "cons" into "coons" (a finding for the owner's next netd deploy,
    // docs/TEEN-SAFE-AUDIT.md). The list is pinned so a new disagreement fails here.
    const disagree = new Set<string>();
    for (const line of [...MUST_PASS, ...MUST_FAIL.map(([l]) => l)]) {
      for (const word of line.match(/[A-Za-z0-9@$!|]+/g) ?? []) {
        if (isProfane(word) && !isListedWord(word)) disagree.add(word.toLowerCase());
      }
    }
    expect([...disagree].sort()).toEqual(NETD_OVER_MASKS);
  });
});
