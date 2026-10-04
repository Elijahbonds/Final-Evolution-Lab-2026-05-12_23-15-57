import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { DunkTracker, DUNK_POSE_IDX, type TrackerFrame, type TrackerLandmark } from '@/lib/irl/dunkTracker';
import {
  ADULT_ROSTER_KEY, DEFAULT_DUNKS, MAX_DUNKS, MAX_PLAYERS, effectiveBand, persistableAthletes,
  readAdults, rosterReady, sealRoster, writeAdults, type Athlete, type KeyValueStore,
} from './roster';
import { REARM_MS, freshBoard, recordDunk, runRotationUntapped } from './rotation';
import { goWhenReadyLine, nextUpLine, resultLine, speakCues, type Speaker } from './voice';
import { KIDS_IN_SHOT, mayRecord, recordingOnHandoff } from './record';
import { endSession, readSession, rememberSession } from './memory';
import { adultCsv } from './summary';
import { postOptInSession, serverJumpForm, type MeasuredJump } from './saveNumbers';
import { ADULT_NUMBER_SYNC_ENABLED, queueAdultNumbers } from './sync';
import { drillPhase } from './drills';

const ROOT = join(__dirname, '..', '..');

function memoryStore(): KeyValueStore & { dump(): string } {
  const box = new Map<string, string>();
  return {
    getItem: (k) => box.get(k) ?? null,
    setItem: (k, v) => { box.set(k, v); },
    removeItem: (k) => { box.delete(k); },
    dump: () => [...box.values()].join('\n'),
  };
}

const kid = 'nix-kid-77';
const adultName = 'Avery';

function jump(over: Partial<MeasuredJump> = {}): MeasuredJump {
  return {
    playerIndex: 0,
    band: '18+',
    name: adultName,
    family: 'ONE-HAND JAM',
    takeoff: 'two-foot',
    verticalCm: 40,
    flightTimeMs: 500,
    landingStability: 0.9,
    ...over,
  };
}

afterEach(() => { endSession(); });

describe('Prove It roster', () => {
  it('allows 1 to 8 players and 1 to 5 dunks, default 3', () => {
    expect(DEFAULT_DUNKS).toBe(3);
    expect(MAX_PLAYERS).toBe(8);
    expect(MAX_DUNKS).toBe(5);
    expect(rosterReady([{ name: 'Solo', claimed: 'unknown' }], 1)).toBe(true);
    expect(rosterReady(Array.from({ length: 8 }, (_, i) => ({ name: `P${i}`, claimed: 'unknown' as const })), 5)).toBe(true);
    expect(rosterReady([], 3)).toBe(false);
    expect(rosterReady([{ name: 'Solo', claimed: 'unknown' }], 6)).toBe(false);
    expect(rosterReady([{ name: 'Solo', claimed: 'unknown' }], 0)).toBe(false);
  });

  it('blocks under 13 and tags 18+ only when the account is server-verified', () => {
    expect(effectiveBand('under-13', true)).toBe('blocked');
    expect(rosterReady([{ name: 'Tiny', claimed: 'under-13' }], 3)).toBe(false);
    expect(sealRoster([{ name: 'Tiny', claimed: 'under-13' }], true).blocked).toBe(true);
    expect(effectiveBand('18+', false)).toBe('unknown');
    expect(effectiveBand('18+', true)).toBe('18+');
    const unverified = sealRoster([{ name: adultName, claimed: '18+' }], false);
    expect(unverified.athletes[0].band).toBe('unknown');
  });

  it('never writes a kid or unknown nickname', () => {
    const store = memoryStore();
    const athletes: Athlete[] = [
      { id: 'p0', name: adultName, band: '18+' },
      { id: 'p1', name: kid, band: '13-17' },
      { id: 'p2', name: 'quiet', band: 'unknown' },
    ];
    writeAdults(store, athletes, true);
    expect(store.dump()).not.toContain(kid);
    expect(store.dump()).not.toContain('quiet');
    expect(readAdults(store).map((a) => a.name)).toEqual([adultName]);
    expect(store.getItem(ADULT_ROSTER_KEY)).toContain(adultName);

    const kidOnly = memoryStore();
    writeAdults(kidOnly, [{ id: 'p1', name: kid, band: '13-17' }], true);
    expect(kidOnly.dump()).toBe('');

    const offline = memoryStore();
    writeAdults(offline, athletes, false);
    expect(offline.dump()).toBe('');
    expect(persistableAthletes(athletes, false)).toEqual([]);
  });
});

describe('rotation', () => {
  it('finishes a solo session after one dunk', () => {
    const players = [{ id: 'p0', name: 'Solo', band: 'unknown' as const }];
    const ran = runRotationUntapped(players, 1);
    expect(ran.final).toBe(true);
    expect(ran.attempts).toBe(1);
    expect(ran.autoArms).toBe(0);
  });

  it('rotates 8 players through 5 dunks and re-arms with no taps', () => {
    const players = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `N${i}`, band: 'unknown' as const }));
    const ran = runRotationUntapped(players, 5);
    expect(ran.attempts).toBe(40);
    expect(ran.autoArms).toBe(39);
    expect(ran.final).toBe(true);
    expect(REARM_MS).toBe(3000);
    let board = freshBoard(players, 5);
    const first = recordDunk(board);
    expect(first.next?.name).toBe('N1');
    board = first.board;
    expect(board.index).toBe(1);
  });
});

describe('voice and recording', () => {
  it('speaks the next athlete, the go cue, and the result in inches', () => {
    expect(nextUpLine('Jalen')).toBe('Next up: Jalen');
    expect(goWhenReadyLine()).toBe('Go when ready');
    expect(resultLine('Jalen', 86.36, 8.5)).toBe('Jalen, 34 inches, judges 8.5');
  });

  it('mute cancels speech and blocks the next line', () => {
    const spoken: string[] = [];
    let cancelled = 0;
    const speaker: Speaker = {
      cancel() { cancelled += 1; },
      speak(line, onend) { spoken.push(line); onend?.(); },
    };
    speakCues(speaker, ['Next up: Nix'], true);
    expect(spoken).toEqual([]);
    expect(cancelled).toBe(1);
    speakCues(speaker, [nextUpLine(kid), goWhenReadyLine()], false);
    expect(spoken).toEqual([`Next up: ${kid}`, goWhenReadyLine()]);
  });

  it('hides record for a kid or unknown age, and stops it on the handoff', () => {
    const now = new Date('2026-10-04T12:00:00Z');
    const adultYear = 2007;
    const notYet = 2008;
    expect(mayRecord('13-17', adultYear, now)).toBe(false);
    expect(mayRecord('unknown', adultYear, now)).toBe(false);
    expect(mayRecord('18+', notYet, now)).toBe(false);
    expect(mayRecord('18+', null, now)).toBe(false);
    expect(mayRecord('18+', adultYear, now)).toBe(true);
    expect(recordingOnHandoff(true, '13-17', adultYear, now)).toEqual({ recording: false, discard: true });
    expect(recordingOnHandoff(true, 'unknown', adultYear, now)).toEqual({ recording: false, discard: true });
    expect(recordingOnHandoff(true, '18+', adultYear, now)).toEqual({ recording: true, discard: false });
    expect(KIDS_IN_SHOT).toMatch(/kids/i);
  });
});

describe('server save is opt-in only', () => {
  it('does not build a body for a kid, an unknown age, or an account that has not opted in', () => {
    expect(serverJumpForm([jump({ name: kid, band: '13-17' })], { serverVerified: true, optedIn: true })).toBeNull();
    expect(serverJumpForm([jump({ band: 'unknown' })], { serverVerified: true, optedIn: true })).toBeNull();
    expect(serverJumpForm([jump()], { serverVerified: true, optedIn: false })).toBeNull();
    expect(serverJumpForm([jump()], { serverVerified: false, optedIn: true })).toBeNull();
    const mixed = serverJumpForm([
      jump(),
      jump({ playerIndex: 1, name: kid, band: '13-17' }),
    ], { serverVerified: true, optedIn: true });
    const text = JSON.stringify(mixed);
    expect(text).not.toContain(kid);
    expect(text).toContain('heightCm');
    expect(text).toContain('flightMs');
    expect(mixed?.attempts).toHaveLength(1);
    expect(mixed?.attempts[0].player).toBe(1);
  });

  it('does not call the network unless the gate is open', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return { ok: true, json: async () => ({ ok: true, runId: 'run-1' }) } as Response;
    }) as typeof fetch;
    expect(await postOptInSession([jump({ name: kid, band: '13-17' })], { serverVerified: true, optedIn: true }, fetchImpl)).toBe('skipped');
    expect(await postOptInSession([jump()], { serverVerified: true, optedIn: false }, fetchImpl)).toBe('skipped');
    expect(calls).toEqual([]);
    expect(await postOptInSession([jump()], { serverVerified: true, optedIn: true }, fetchImpl)).toBe('saved');
    expect(calls).toEqual(['/api/sessions/start', '/api/sessions']);
    expect(ADULT_NUMBER_SYNC_ENABLED).toBe(false);
    expect(queueAdultNumbers()).toEqual({ sent: false, reason: 'ab-04-opt-in-missing' });
  });
});

describe('coach memory and summary', () => {
  it('drops kid nicknames when the session ends and keeps them out of the CSV', () => {
    const store = memoryStore();
    rememberSession([
      { id: 'p0', name: adultName, band: '18+' },
      { id: 'p1', name: kid, band: '13-17' },
    ], true, 3, store);
    expect(readSession()?.athletes.map((a) => a.name)).toEqual([adultName, kid]);
    expect(store.dump()).not.toContain(kid);
    endSession();
    expect(readSession()).toBeNull();
    const csv = adultCsv([
      { name: adultName, band: '18+', verticalCm: 86.36, judges: 8.5 },
      { name: kid, band: '13-17', verticalCm: 40, judges: 7 },
    ]);
    expect(csv).toContain(adultName);
    expect(csv).not.toContain(kid);
  });

  it('runs a drill clock through work, rest, and done', () => {
    expect(drillPhase(0, 40, 20).phase).toBe('work');
    expect(drillPhase(40_000, 40, 20).phase).toBe('rest');
    expect(drillPhase(60_000, 40, 20).phase).toBe('done');
  });
});

describe('the tracker re-arms without a new floor', () => {
  it('measures a second jump after rearm', () => {
    const tr = new DunkTracker();
    let t = 0;
    const frame = (rise: number): TrackerFrame => {
      t += 33;
      const landmarks: TrackerLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
      const set = (idx: number, x: number, y: number) => { landmarks[idx] = { x, y, visibility: 0.95 }; };
      set(DUNK_POSE_IDX.leftShoulder, 0.42, 0.4);
      set(DUNK_POSE_IDX.rightShoulder, 0.58, 0.4);
      set(DUNK_POSE_IDX.leftHip, 0.45, 0.55 - rise * 0.6);
      set(DUNK_POSE_IDX.rightHip, 0.55, 0.55 - rise * 0.6);
      set(DUNK_POSE_IDX.leftAnkle, 0.46, 0.9 - rise);
      set(DUNK_POSE_IDX.rightAnkle, 0.54, 0.9 - rise);
      set(DUNK_POSE_IDX.nose, 0.5, 0.33);
      set(DUNK_POSE_IDX.leftWrist, 0.38, 0.35);
      set(DUNK_POSE_IDX.rightWrist, 0.62, 0.35);
      return { landmarks, timestampMs: t, present: true };
    };
    const jump = () => {
      let got: unknown = null;
      const air = Math.floor(500 / 33);
      for (let i = 0; i < air; i++) {
        const k = i / Math.max(1, air - 1);
        const hit = tr.feed(frame(0.06 + Math.sin(k * Math.PI) * 0.06));
        if (hit) got = hit;
      }
      for (let i = 0; i < 20; i++) {
        const hit = tr.feed(frame(0));
        if (hit) got = hit;
      }
      return got;
    };
    for (let i = 0; i < 25; i++) tr.feed(frame(0));
    expect(jump()).not.toBeNull();
    expect(tr.state).toBe('ready');
    tr.rearm();
    expect(tr.state).toBe('ready');
    expect(jump()).not.toBeNull();
  });
});

describe('Prove It source', () => {
  const prove = readFileSync(join(ROOT, 'app/play/dunkduel/_components/prove-it.tsx'), 'utf8');
  const save = readFileSync(join(ROOT, 'lib/session-setup/saveNumbers.ts'), 'utf8');
  const record = readFileSync(join(ROOT, 'lib/session-setup/record.ts'), 'utf8');
  const home = readFileSync(join(ROOT, 'app/coach/session/_components/session-home.tsx'), 'utf8');

  it('keeps gym-readable type, voice, framing, and a gated record button', () => {
    expect(prove).not.toMatch(/text-\[(9|10|11)px\]/);
    expect(prove).toContain('SET UP THE CAMERA');
    expect(prove).toContain('Mute');
    expect(prove).toContain('dunkFraming');
    expect(prove).toContain('SwitchCamera');
    expect(prove).toContain('mayRecord');
    expect(prove).toContain('verifiedAdult(dobYear)');
    expect(prove).toContain('min-h-12');
    expect(prove).not.toContain("fetch('/api/sessions");
  });

  it('the clip path and the coach page do not upload', () => {
    expect(record).toContain("from '@/lib/privacy/verifiedAdult'");
    expect(record).toContain('verifiedAdult(dobYear, now)');
    expect(record).not.toMatch(/serverVerified/);
    expect(record).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|indexedDB/);
    expect(home).not.toMatch(/fetch\(|indexedDB|sessionStorage/);
    expect(save).toMatch(/if \(!form\) return 'skipped'/);
  });

  it('routes the camp recovery drill at the shipped baseball page', () => {
    const blueprint = readFileSync(join(ROOT, 'lib/curriculum/blueprint.ts'), 'utf8');
    expect(blueprint).not.toMatch(/modeKey: 'derby'/);
    expect(blueprint).toMatch(/modeKey: 'baseball'/);
  });
});
