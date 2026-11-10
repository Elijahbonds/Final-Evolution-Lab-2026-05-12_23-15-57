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
import { playSwitchBlocked, SLAM_VARIANTS_ON } from './DunkSlamVariant';
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
  // DUNK SWITCH-ON (extends the gate above; test changed from P11's, which held the over-the-ring knob OFF by default): the owner
  // turned four switches ON by default on 2026-11-10. The two that change PLAY — the slam variants and the over-the-ring finish —
  // are off in every staked, ranked and challenge run WHATEVER the default (playSwitchBlocked, read by DunkMode on both); the two
  // that only change the look (the run-up's stride, the landing absorb) are not play and stay on. And no override reaches any of it.
  it('the play-changing switches are off in ranked, staked and challenge play whatever the default; no override reaches those runs', () => {
    const link = challengePlayHref('dunkContest', 'FRIEND42')!;
    const q = link.slice(link.indexOf('?'));
    const blocked = [q, `${q}&playtest=1`, '?arena=match_1', '?arena=match_1&playtest=1', '?mp=AB12CD', '?signature=1', '?ranked=1', '?ranked=1&playtest=1'];
    for (const b of blocked) expect(playSwitchBlocked(b), b).toBe(true);
    for (const open of ['', '?playtest=1', '?prop=alleyoop', '?arena=']) expect(playSwitchBlocked(open), open).toBe(false);   // an empty ?arena= stakes nothing (isStakedRun)
    expect(SLAM_VARIANTS_ON).toBe(1); expect(FINISH_OVER_RING).toBe(1);   // ON by default…
    expect(DUNK).toContain("const switchBlocked = (): boolean => typeof location !== 'undefined' && playSwitchBlocked(location.search);");
    expect(DUNK).toContain("const finishOverRing = (): boolean => !switchBlocked() && overRingOn(feel('dunk.finishOverRing', FINISH_OVER_RING));");
    expect(DUNK).toContain("const slamVariantsOn = (): boolean => !switchBlocked() && feel('dunk.slamVariants', SLAM_VARIANTS_ON) >= 0.5;");
    expect(DUNK.split("feel('dunk.slamVariants'").length - 1).toBe(1);    // …read in one place each, behind the block
    expect(DUNK.split("feel('dunk.finishOverRing'").length - 1).toBe(1);
    // and the feel store: with every dunk knob moved off its default on the owner's device and the panel open, a blocked run reads
    // the defaults (the switches' own block then turns the play ones off); only the unpaid playtest takes the override
    const g = globalThis as { window?: unknown };
    const dunkKnobs = FEEL_KNOBS.filter((k) => k.id.startsWith('dunk.'));
    const held: Record<string, number> = Object.fromEntries(dunkKnobs.map((k) => [k.id, k.def === k.max ? k.min : k.max]));
    resetFeelForTests();
    g.window = { localStorage: { getItem: (k: string) => (k === FEEL_STORAGE_KEY ? JSON.stringify(held) : null), setItem: () => {}, removeItem: () => {} } };
    try {
      setFeelUser(true);
      for (const [p, s] of [[link.slice(0, link.indexOf('?')), q], ['/play/dunk', `${q}&playtest=1`], ['/play/dunk', '?arena=match_1&playtest=1'], ['/play/dunk', '?ranked=1&playtest=1'], ['/play/dunk', '']] as const) {
        setFeelSession(feelSessionBlock(p, s));
        for (const k of dunkKnobs) expect(feel(k.id, k.def), `${k.id} on ${p}${s}`).toBe(k.def);
      }
      setFeelSession(feelSessionBlock('/play/dunk', '?playtest=1'));
      expect(feel('dunk.finishOverRing', FINISH_OVER_RING)).toBe(0);   // the owner's playtest: the A/B back to the old finish works
      expect(feel('dunk.slamVariants', SLAM_VARIANTS_ON)).toBe(0);
    } finally { resetFeelForTests(); delete g.window; }
  });
});
