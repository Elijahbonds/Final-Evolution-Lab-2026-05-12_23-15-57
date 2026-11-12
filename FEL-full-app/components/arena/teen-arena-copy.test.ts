// ARENA-AGE-1 — Cyber addendum T6, EOU-37 and EOU-42 (teen copy): the teen Arena's user text uses "entry" and "prize"
// and one name per currency, and never says stake, pot, wager, forfeit, odds, "double or nothing" or "LC".
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEEN_ARENA_COPY } from '@/lib/arena-teen-copy';
import { ARENA_AGE_MESSAGES } from '@/lib/age/arenaAgeBand';
import { isPracticeRow, practiceRowLabel } from './teen-arena-view';
import { practiceResultLine } from '../games/end-screen/outcome-cards';
import { NOT_STAKEABLE_HERE, checkStakeScore } from '@/lib/arena-score-integrity';

const BANNED = /\bLC\b|\bstak(e|ed|es|ing)\b|\bpots?\b|\bwager|\bforfeit|\bodds\b|double or nothing|\bbet(s|ting)?\b|\brake\b|\bgambl/i;

function allCopy(): string[] {
  return Object.values(TEEN_ARENA_COPY).map((v) => (typeof v === 'function' ? (v as (...a: number[]) => string)(25, 100) : v)) as string[];
}

describe('teen Arena copy', () => {
  it('no banned word in any teen string', () => {
    for (const s of [...allCopy(), ...Object.values(ARENA_AGE_MESSAGES)]) expect(s, s).not.toMatch(BANNED);
  });

  it('uses "entry" and "prize", and "Credits" as the one currency name', () => {
    const all = allCopy().join(' ');
    expect(all).toMatch(/\bentry\b/i);
    expect(all).toMatch(/\bprize\b/i);
    expect(all).toMatch(/\bCredits\b/);
  });

  it('no countdown or near-miss pressure', () => {
    expect(allCopy().join(' ')).not.toMatch(/hurry|last chance|so close|almost won|only \d+ (left|minutes)|ends in/i);
  });

  it('every literal and JSX text in the teen view and the teen page branch is clean', () => {
    const files = ['components/arena/teen-arena-view.tsx'];
    // the end-of-run card's practice branch is checked through practiceResultLine below (the adult branch keeps its words)
    for (const f of files) {
      const code = readFileSync(join(process.cwd(), f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      const literals = [...code.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`|>([^<>{}\n]+)</g)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4] ?? '');
      for (const l of literals) expect(l, `${f}: ${l}`).not.toMatch(BANNED);
    }
  });

  it('row helpers: a practice row is entry 0 with no house cut, and its labels are clean', () => {
    expect(isPracticeRow({ feeLc: 0, rakePercent: 0 })).toBe(true);
    expect(isPracticeRow({ feeLc: 50, rakePercent: 10 })).toBe(false);
    for (const status of ['ACTIVE', 'SETTLED', 'VOIDED', 'EXPIRED']) {
      for (const iWon of [true, false, null]) {
        expect(practiceRowLabel({ status, iWon, mySubmitted: status !== 'ACTIVE', pastExpiry: false })).not.toMatch(BANNED);
      }
    }
  });

  it('end-of-run card, practice branch: prize wording for every outcome, never the entry-duel words', () => {
    const lines = [
      practiceResultLine({ settled: true, result: 'p1', iWon: true, prize: 25 }),
      practiceResultLine({ settled: true, result: 'p1', iWon: true, prize: 0 }),
      practiceResultLine({ settled: true, result: 'p2', iWon: false, prize: 0 }),
      practiceResultLine({ settled: true, result: 'tie', iWon: false, prize: 0 }),
      practiceResultLine({ settled: false }),
    ];
    for (const l of lines) expect(l).not.toMatch(BANNED);
    expect(lines[0]).toContain('Prize: +25 Credits');
    expect(lines[1]).toMatch(/prize limit/);
  });

  it('end-of-run card: the practice branch is chosen by teenPractice, and the adult branch is untouched', () => {
    const cards = readFileSync(join(process.cwd(), 'components/games/end-screen/outcome-cards.tsx'), 'utf8');
    expect(cards).toContain('if (r.teenPractice)');
    expect(cards).toContain('You won the duel — +{r.payout} LC');
    const shell = readFileSync(join(process.cwd(), 'components/games/game-shell.tsx'), 'utf8');
    expect(shell).toMatch(/ar\.teenPractice \? \{ teenPractice: true, prize:/);
  });

  it('the two score-refusal messages a result card can show say "entry", never "stake"', () => {
    const notHere = NOT_STAKEABLE_HERE.detail('music');
    const noCeiling = checkStakeScore({ mode: 'notARealMode', score: 1 });
    expect(noCeiling.ok).toBe(false);
    const noCeilingDetail = noCeiling.ok ? '' : noCeiling.detail;
    for (const m of [notHere, noCeilingDetail]) {
      expect(m, m).not.toMatch(/\bstak(e|ed|es|ing)\b/i);
      expect(m, m).toMatch(/\bent(ry|ered)\b/i);
    }
  });
});
