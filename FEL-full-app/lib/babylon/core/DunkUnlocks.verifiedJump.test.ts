// DUNK-FLAGSHIP Phase 9 — modes and progression: the verified vertical on the unlock ladder, the friends battle on the ?c= link, and
// no knob in ranked, staked or paid play. The plan's gates, proved here:
//   · an unlock opens only on a verified ADULT jump (the device history's `verified`; a teen's or a kid's is never read);
//   · the friends battle runs on the existing ?c= link as the classic staked night (nightFormat), the card unchanged;
//   · no knob applies in ranked, staked or paid play.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DUNK_UNLOCKS, emptyUnlocks, isOpen, refOpen, needLine, jumpRoadLine, withVerifiedJump, verifiedVertical, recordNightWon, saveUnlocks,
  loadUnlocks, UNLOCKS_KEY, VERIFIED_JUMP_ROW5_CM, VERIFIED_JUMP_DUBBLE_CM, type VerifiedJumpEntry,
} from './DunkUnlocks';
import { nightFormat, cardDunks, isStakedRun } from './DunkField';
import { DUNK_CONTEST_ATTEMPTS } from '@/lib/arena-score-integrity';
import { challengePlayHref } from '@/lib/social/challenge-routes';
import { feelSessionBlock } from '@/lib/feel-panel/sessionGate';
import { FEEL_STORAGE_KEY, feel, resetFeelForTests, setFeelSession, setFeelUser } from '@/lib/feel-panel/feel';
import { FEEL_KNOBS } from '@/lib/feel-panel/knobs';
import { FINISH_OVER_RING, overRingOn } from './DunkOverRing';
import { keepJump, loadJumps, historyId, type JumpHistoryEntry } from '@/lib/jump/historyStore';

const DUNK = readFileSync(path.join(__dirname, '../modes/DunkMode.ts'), 'utf8');
const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m }; };
const jump = (cm: number, o: Partial<VerifiedJumpEntry> = {}): VerifiedJumpEntry => ({ test: 'check', bestCm: cm, verified: true, manualFrames: false, ...o });
const row5 = DUNK_UNLOCKS.find((u) => u.id === 'prop:row5')!, dubble = DUNK_UNLOCKS.find((u) => u.id === 'prop:dubble6')!;

describe('the verified vertical is a second road to the jumping feats', () => {
  it('50 cm opens OVER FIVE IN A ROW, 60 cm the Dubble Up over 6 to 10; 49 cm opens nothing', () => {
    expect([VERIFIED_JUMP_ROW5_CM, VERIFIED_JUMP_DUBBLE_CM]).toEqual([50, 60]);
    expect(withVerifiedJump(emptyUnlocks(), 49.9, false).opened).toEqual([]);
    expect(withVerifiedJump(emptyUnlocks(), 50, false).opened.map((u) => u.id)).toEqual(['prop:row5']);
    expect(withVerifiedJump(emptyUnlocks(), 61, false).opened.map((u) => u.id)).toEqual(['prop:row5', 'prop:dubble6']);
    expect(refOpen('prop', 'dubble8', withVerifiedJump(emptyUnlocks(), 61, false).state)).toBe(true);
  });
  it('the won nights still open them exactly as before (the jump is a road, never a gate)', () => {
    let s = emptyUnlocks();
    for (let i = 0; i < 3; i++) s = recordNightWon(s).state;
    expect(isOpen(row5, s)).toBe(true); expect(isOpen(dubble, s)).toBe(false);
    expect(needLine('prop', 'row5', emptyUnlocks())).toBe('LOCKED — OVER FIVE IN A ROW · WIN 3 MORE NIGHTS');   // unchanged
    expect(jumpRoadLine('prop', 'row5', emptyUnlocks())).toBe('OR A VERIFIED 50 CM JUMP');
    expect(jumpRoadLine('prop', 'oopbounce', emptyUnlocks())).toBe('');   // no jump road on the other rungs
  });
  it('a staked, ladder or challenge run never counts it (a real rep sells no advantage there)', () => {
    for (const search of ['?arena=1', '?c=ABC123', '?mp=room', '?signature=1']) {
      expect(isStakedRun(search)).toBe(true);
      expect(withVerifiedJump(emptyUnlocks(), 80, isStakedRun(search)).state.verifiedJumpCm).toBe(0);
      expect(withVerifiedJump(emptyUnlocks(), 80, isStakedRun(search)).opened).toEqual([]);
    }
  });
  it('the visit\'s jump is never stored: the next player on this phone starts from the won nights alone', () => {
    const store = memory();
    saveUnlocks(store, withVerifiedJump(emptyUnlocks(), 70, false).state);
    expect(store.getItem(UNLOCKS_KEY)).not.toMatch(/verifiedJumpCm/);
    expect(isOpen(row5, loadUnlocks(store))).toBe(false);
  });
});

describe('only a VERIFIED ADULT\'s jump is ever read', () => {
  it('without the adult answer the history is not even read', () => {
    let reads = 0;
    const read = () => { reads++; return [jump(80)]; };
    for (const who of [{ verifiedAdult: false }, {} as { verifiedAdult: boolean }, { verifiedAdult: 'true' as unknown as boolean }, { verifiedAdult: 1 as unknown as boolean }]) {
      expect(verifiedVertical(who, read)).toBeNull();
    }
    expect(reads).toBe(0);
    expect(verifiedVertical({ verifiedAdult: true }, read)).toBe(80);
    expect(reads).toBe(1);
  });
  it('only a verified hands-on-hips jump counts: not an unverified one, not hand-picked frames, not the arm-swing vertical', () => {
    const read = () => [jump(72, { verified: false }), jump(71, { manualFrames: true }), jump(70, { test: 'vertical' }), jump(55), jump(48), jump(Number.NaN)];
    expect(verifiedVertical({ verifiedAdult: true }, read)).toBe(55);
    expect(verifiedVertical({ verifiedAdult: true }, () => [])).toBeNull();
  });
  it('the phone\'s history holds adults\' jumps only: a kid\'s or a teen\'s is never kept to be read', () => {
    const store = memory();
    const e: JumpHistoryEntry = { id: historyId(() => 0.5), at: '2026-11-03T10:00:00.000Z', test: 'check', bestCm: 58, plusMinusCm: 2, jumps: 3, verified: true, manualFrames: false, source: 'live', fps: 60, rsi: null, contactMs: null, v0Mps: null, rsiMod: null };
    expect(keepJump(store, e, { adult: false })).toBe(false);
    expect(loadJumps(store)).toEqual([]);
    expect(keepJump(store, e, { adult: true })).toBe(true);
    expect(verifiedVertical({ verifiedAdult: true }, () => loadJumps(store))).toBe(58);
  });
  it('DunkMode reads the phone\'s history in one place, behind the server\'s adult answer, and counts it off a staked run only', () => {
    expect(DUNK.split('loadJumps(').length - 1).toBe(1);
    expect(DUNK).toMatch(/const serverCm = await fetchVerifiedJumpCm\(\);\n\s+const device = verifiedVertical\(\{ verifiedAdult: serverCm !== null \}, \(\) => loadJumps\(deviceStore\(\)\)\);/);
    expect(DUNK).toMatch(/withVerifiedJump\(unlocks, verifiedCm, stakedRun\(\)\)/);
    expect(DUNK).toMatch(/withVerifiedJump\(loadUnlocks\(deviceStore\(\)\), verifiedCm, stakedRun\(\)\)/);
    // read after dunk 1, from the contest set that waits out the flight gate (no request in the air)
    const set = DUNK.slice(DUNK.indexOf('function startContestSet('), DUNK.indexOf('async function bringRival('));
    expect(set).toMatch(/void rivalArrival\.finally\(\(\) => whenQuietBeat\(dunkQuiet, \(\) => ctx\.scene\.isDisposed\)\)\.then\(\(\) => \{[\s\S]*void readVerifiedVertical\(ctx\);/);
  });
});

describe('the friends battle: the ?c= link plays the classic staked night, the card unchanged', () => {
  it('a Flight Night challenge link (mode key dunkContest) opens /play/dunk?c=… — the classic night, four judged dunks, the integrity cap\'s count', () => {
    const href = challengePlayHref('dunkContest', 'FRIEND42')!;
    expect(href).toMatch(/^\/play\/dunk\?c=FRIEND42$/);
    const search = href.slice(href.indexOf('?'));
    expect(nightFormat(search)).toBe('classic');
    expect(cardDunks(nightFormat(search), false)).toBe(DUNK_CONTEST_ATTEMPTS);
    expect(cardDunks(nightFormat(search), true)).toBe(DUNK_CONTEST_ATTEMPTS);
  });
  it('no knob reaches it: the feel gate blocks a challenge link even with ?playtest=1', () => {
    const href = challengePlayHref('dunkContest', 'FRIEND42')!;
    const [p, q] = [href.slice(0, href.indexOf('?')), href.slice(href.indexOf('?'))];
    expect(feelSessionBlock(p, q)).not.toBeNull();
    expect(feelSessionBlock(p, `${q}&playtest=1`)).not.toBeNull();
    expect(feelSessionBlock('/play/dunk', '?arena=1&playtest=1')).not.toBeNull();
  });
  // P11 (extends the gate above): the over-the-ring finish's knob, on the real feel store. The owner's device HOLDS the override
  // and the server has opened the panel for them — and the mode still reads the shipped finish in every ranked, staked and
  // challenge session, with or without ?playtest=1, and on an ordinary run that pays. Only the unpaid playtest run takes it.
  it('`dunk.finishOverRing` held on the device reads 0 (the shipped finish) in ranked, staked and challenge play; 1 only in an unpaid playtest', () => {
    const g = globalThis as { window?: unknown };
    const dunkKnobs = FEEL_KNOBS.filter((k) => k.id.startsWith('dunk.'));
    const held: Record<string, number> = Object.fromEntries(dunkKnobs.map((k) => [k.id, k.def === k.max ? k.min : k.max]));   // every dunk knob moved off its default
    expect(held['dunk.finishOverRing']).toBe(1);
    resetFeelForTests();
    g.window = { localStorage: { getItem: (k: string) => (k === FEEL_STORAGE_KEY ? JSON.stringify(held) : null), setItem: () => {}, removeItem: () => {} } };
    try {
      setFeelUser(true);
      const link = challengePlayHref('dunkContest', 'FRIEND42')!;
      const blocked: [string, string][] = [
        [link.slice(0, link.indexOf('?')), link.slice(link.indexOf('?'))],             // the friends battle, as the app builds it
        ['/play/dunk', `${link.slice(link.indexOf('?'))}&playtest=1`],                   // …and with ?playtest=1 added on top
        ['/play/dunk', '?arena=match_1&playtest=1'],                                     // a staked Arena duel
        ['/play/dunk', '?mp=AB12CD&playtest=1'],                                         // an async friend challenge
        ['/play/dunk', '?signature=1&playtest=1'],                                       // the Signature ladder (ranked)
        ['/play/dunk', '?ranked=1&playtest=1'],                                          // a ranked session (reserved)
        ['/play/dunk', '?story=n7&playtest=1'],                                          // a Story node (pays)
        ['/play/dunk', '?net=r1&playtest=1'],                                            // online
        ['/play/dunk', ''],                                                              // an ordinary run: it pays and records a score
        ['/try', '?playtest=1'],                                                         // not a /play page
      ];
      for (const [p, q] of blocked) {
        setFeelSession(feelSessionBlock(p, q));
        expect(feelSessionBlock(p, q), `${p}${q}`).not.toBeNull();
        expect(feel('dunk.finishOverRing', FINISH_OVER_RING), `${p}${q}`).toBe(0);
        expect(overRingOn(feel('dunk.finishOverRing', FINISH_OVER_RING)), `${p}${q}`).toBe(false);
        for (const k of dunkKnobs) expect(feel(k.id, k.def), `${k.id} on ${p}${q}`).toBe(k.def);   // no dunk knob reaches it
      }
      setFeelSession(feelSessionBlock('/play/dunk', '?playtest=1'));
      expect(feel('dunk.finishOverRing', FINISH_OVER_RING)).toBe(1);   // the owner's unpaid playtest run: the A/B is live
      expect(overRingOn(feel('dunk.finishOverRing', FINISH_OVER_RING))).toBe(true);
      setFeelUser(false);                                               // …and for anyone the server has not opened the panel for: never
      expect(feel('dunk.finishOverRing', FINISH_OVER_RING)).toBe(0);
    } finally { resetFeelForTests(); delete g.window; }
  });
});
