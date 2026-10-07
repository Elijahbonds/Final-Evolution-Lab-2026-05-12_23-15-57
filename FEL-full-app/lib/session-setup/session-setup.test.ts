import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { DunkTracker, DUNK_POSE_IDX, type TrackerFrame, type TrackerLandmark } from '@/lib/irl/dunkTracker';
import {
  ADULT_ROSTER_KEY, DEFAULT_DUNKS, MAX_DUNKS, MAX_PLAYERS, effectiveBand, persistableAthletes,
  readAdults, rosterReady, sealRoster, writeAdults, type Athlete, type KeyValueStore,
} from './roster';
import {
  REARM_MS, REST_PRESETS_MS, TEN_SECONDS_LINE, freshBoard, normalizeRestMs, recordDunk, restSecondsLeft, runRotationUntapped,
  tenSecondWarningAt,
} from './rotation';
import {
  CONSENT_CONTROLS, SOLO_TAPS_FROM_PLAY, WATCHING_SHOWS, WATCHING_STATUS_MIN_VH, consentControls, soloClaimedAge, soloDefaults, watchingChrome,
} from './roster';
import { DUNK_FILL_MIN, armAllowed, autoArmReady, dunkFramingCheck, newAutoArmGate, shotLight } from './framing';
import { FILL_MIN, checkFraming, type FramingCheck, type FramingFrame } from '@/lib/mirror/framing';
import { NEXT_UP_SPOKEN, cuesAfterDunk, goWhenReadyLine, nextUpLine, resultLine, speakCues, spokenResultLine, type Speaker } from './voice';
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

  // IMPROVE (2026-10-06), the owner's decision: a recorded "Next up!" and the name shown big on screen, never the name read aloud.
  it('never speaks a name: the result and "Next up!" are said, the name only shown', () => {
    expect(NEXT_UP_SPOKEN).toBe('Next up!');
    expect(spokenResultLine(86.36, 8.5)).toBe('34 inches, judges 8.5');
    expect(cuesAfterDunk(86.36, 8.5, true)).toEqual(['34 inches, judges 8.5', 'Next up!']);
    expect(cuesAfterDunk(86.36, 8.47, false)).toEqual(['34 inches, judges 8.5']);
    for (const name of ['Jalen', kid, 'Nix']) {
      for (const line of [...cuesAfterDunk(90, 7, true), goWhenReadyLine()]) expect(line).not.toContain(name);
    }
    // on screen the result and the next name stay as they were
    expect(resultLine('Jalen', 86.36, 8.5)).toBe('Jalen, 34 inches, judges 8.5');
    expect(nextUpLine('Jalen')).toBe('Next up: Jalen');
  });

  it('Prove It speaks the name-free cues and shows the next name big', () => {
    const src = readFileSync(join(ROOT, 'app/play/dunkduel/_components/prove-it.tsx'), 'utf8');
    expect(src).toContain('cuesAfterDunk(got.verticalCm');
    expect(src).not.toMatch(/speakCues\([^;]*(nextUpLine|resultLine)\(/);
    expect(src).toContain('data-testid="next-up-name"');
    expect(src).toMatch(/text-5xl font-black[^"]*"[^>]*>\s*\{boardRef\.current\.players\[boardRef\.current\.index\]\.name\}/);
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
    expect(prove).toContain('cta="START"');
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


// A side-on body: shoulders collapsed, centred, feet in shot. `fill` is head-to-ankle height.
function sideFrame(fill: number, over: { x?: number; vis?: number } = {}): FramingFrame {
  const x = over.x ?? 0.5;
  const v = over.vis ?? 1;
  const top = 0.5 - fill / 2;
  const pt = (px: number, y: number) => ({ x: px, y, visibility: v });
  const L = Array.from({ length: 33 }, () => pt(x, 0.5));
  L[0] = pt(x, top);
  L[11] = pt(x - 0.01, top + fill * 0.2); L[12] = pt(x + 0.01, top + fill * 0.2);
  L[23] = pt(x - 0.01, top + fill * 0.5); L[24] = pt(x + 0.01, top + fill * 0.5);
  L[25] = pt(x, top + fill * 0.75); L[26] = pt(x, top + fill * 0.75);
  L[27] = pt(x, top + fill); L[28] = pt(x, top + fill);
  return { landmarks: L, present: true };
}
const green = () => dunkFramingCheck(sideFrame(0.6));
const yellow = () => dunkFramingCheck(sideFrame(0.6, { x: 0.8 }));
const red = () => dunkFramingCheck({ landmarks: [], present: false });

describe('dunk loop: hands-free re-arm', () => {
  it('lights: centred is green, off-centre yellow, no body red', () => {
    expect(shotLight(green())).toBe('green');
    expect(shotLight(yellow())).toBe('yellow');
    expect(shotLight(red())).toBe('red');
  });

  it('1. red then green after the countdown re-arms with zero taps', () => {
    const gate = newAutoArmGate();
    expect(autoArmReady(gate, red(), 0, true)).toBe(false);
    expect(autoArmReady(gate, green(), 100, true)).toBe(false);
    expect(autoArmReady(gate, green(), 500, true)).toBe(false);
    expect(autoArmReady(gate, green(), 900, true)).toBe(true);
  });

  it('2. yellow re-arms but never arms the first attempt', () => {
    expect(armAllowed('yellow', true)).toBe(true);
    expect(armAllowed('yellow', false)).toBe(false);
    expect(armAllowed('red', true)).toBe(false);
    const rearm = newAutoArmGate();
    autoArmReady(rearm, yellow(), 0, true);
    expect(autoArmReady(rearm, yellow(), 800, true)).toBe(true);
    const first = newAutoArmGate();
    autoArmReady(first, green(), 0, false);
    expect(autoArmReady(first, green(), 5000, false)).toBe(false);
    const firstYellow = newAutoArmGate();
    autoArmReady(firstYellow, yellow(), 0, false);
    expect(autoArmReady(firstYellow, yellow(), 5000, false)).toBe(false);
  });

  it('dunk framing accepts a smaller body than the Mirror, which keeps FILL_MIN', () => {
    expect(DUNK_FILL_MIN).toBe(0.3);
    expect(FILL_MIN).toBe(0.45);
    const small = sideFrame(0.35);
    expect(checkFraming(small, 'side').issues).toContain('tooFar');
    expect(dunkFramingCheck(small).ok).toBe(true);
    expect(dunkFramingCheck(sideFrame(0.2)).issues).toContain('tooFar');
  });

  it('3. rest preset sets the countdown; the default stays 3000 ms', () => {
    expect(REARM_MS).toBe(3000);
    expect([...REST_PRESETS_MS]).toEqual([3000, 30000, 60000, 90000]);
    expect(normalizeRestMs(undefined)).toBe(3000);
    expect(normalizeRestMs(7)).toBe(3000);
    expect(normalizeRestMs(60000)).toBe(60000);
    expect(restSecondsLeft(90000, 0)).toBe(90);
    expect(restSecondsLeft(3000, 0)).toBe(3);
    expect(tenSecondWarningAt(3000)).toBeNull();
    expect(tenSecondWarningAt(30000)).toBe(20000);
    expect(tenSecondWarningAt(90000)).toBe(80000);
    expect(TEN_SECONDS_LINE).toBe('10 seconds');
    expect(goWhenReadyLine()).toBe('Go when ready');
  });
});

describe('dunk loop: solo Start, consent, hard rule', () => {
  it('5. solo happy path is 2 taps from /play (Dunk session, Start)', () => {
    const d = soloDefaults(false);
    expect(SOLO_TAPS_FROM_PLAY).toBe(2);
    expect(d.players).toBe(1);
    expect(d.rows.map((r) => r.name)).toEqual(['You']);
    expect(d.dunksEach).toBe(DEFAULT_DUNKS);
    expect(d.voiceOn).toBe(true);
    expect(d.restMs).toBe(REARM_MS);
    expect(rosterReady(d.rows, d.dunksEach)).toBe(true);
    const play = readFileSync(join(ROOT, 'app/play/page.tsx'), 'utf8');
    expect(play).toContain('data-testid="play-dunk-session-entry"');
    expect(play).toContain('href="/play/dunkduel"');
  });

  it('6. consent shows at most 3 controls until Settings opens, then the roster controls', () => {
    expect([...CONSENT_CONTROLS]).toEqual(['start', 'settings', 'mute']);
    expect(consentControls(false).length).toBeLessThanOrEqual(3);
    expect(consentControls(true)).toEqual(expect.arrayContaining(['players', 'dunks-each', 'name', 'age', 'level', 'saved-adults', 'save-card', 'rest']));
    const prove = readFileSync(join(ROOT, 'app/play/dunkduel/_components/prove-it.tsx'), 'utf8');
    const consent = prove.slice(prove.indexOf("{stage === 'consent' && ("), prove.indexOf("{roster.length > 0 && stage !== 'consent'"));
    const settingsAt = consent.indexOf('{settingsOpen && (');
    expect(settingsAt).toBeGreaterThan(0);
    const beforeSettings = consent.slice(0, settingsAt);
    expect(beforeSettings).not.toMatch(/<button|<input|ScanSaveCard/);
    const settings = consent.slice(settingsAt);
    for (const needle of ['Players', 'Dunks each', 'Name or nickname', 'Under 13', 'Level, optional', 'Add saved adults', 'ScanSaveCard', 'REST_PRESETS_MS']) {
      expect(settings).toContain(needle);
    }
    expect(prove).toContain('sealRoster(rows, serverVerified)');
    expect(sealRoster([{ name: 'Tiny', claimed: 'under-13' }], true).blocked).toBe(true);
    const store = memoryStore();
    writeAdults(store, [{ id: 'p0', name: kid, band: '13-17' }, { id: 'p1', name: 'You', band: 'unknown' }], true);
    expect(store.dump()).toBe('');
  });

  it('7. watching shows only video, wash, one status, corner mute; status is at least 30vh', () => {
    expect(WATCHING_STATUS_MIN_VH).toBeGreaterThanOrEqual(30);
    const w = watchingChrome('watching');
    expect([...w.show]).toEqual([...WATCHING_SHOWS]);
    for (const hidden of ['title', 'intro', 'score-cards', 'camera', 'record', 'attempts', 'up-next']) {
      expect(w.hidden).toContain(hidden);
      expect(w.show).not.toContain(hidden);
    }
    expect(watchingChrome('countdown').hidden).toEqual([]);
    const prove = readFileSync(join(ROOT, 'app/play/dunkduel/_components/prove-it.tsx'), 'utf8');
    expect(prove).toContain('fontSize: `${WATCHING_STATUS_MIN_VH}vh`');
    expect(prove).toContain('!watching && (<>');
    expect(prove).toContain("stage !== 'consent' && !watching");
    expect(prove).toContain("stage === 'prop-phone' && <div");
    expect(prove).toContain('{cameraButtons}');
  });

  it('8. an unverified account starts at "Rather not say" and may not record, whatever the client says', () => {
    expect(soloDefaults(false).rows[0].claimed).toBe('unknown');
    expect(soloDefaults(true).rows[0].claimed).toBe('18+');
    // every client-side adult signal is set; the preset takes none of them
    const store = memoryStore();
    store.setItem('band', '18+');
    store.setItem(ADULT_ROSTER_KEY, JSON.stringify([{ id: 'p0', name: 'You', band: '18+' }]));
    const url = new URL('https://x.test/play/dunkduel?band=18');
    expect(url.searchParams.get('band')).toBe('18');
    const typedAge: string = '18+';
    expect(typedAge).toBe('18+');
    expect(soloDefaults(false).rows[0].claimed).toBe('unknown');
    expect(soloClaimedAge(false)).toBe('unknown');
    expect(soloClaimedAge(undefined as unknown as boolean)).toBe('unknown');
    expect(soloDefaults.length).toBe(1);
    expect(soloClaimedAge.length).toBe(1);
    const sealed = sealRoster(soloDefaults(false).rows, false);
    expect(sealed.athletes[0].band).toBe('unknown');
    expect(mayRecord(sealed.athletes[0].band, null)).toBe(false);
    expect(mayRecord('18+', null)).toBe(false);
    expect(mayRecord('unknown', 1980)).toBe(false);
    const roster = readFileSync(join(ROOT, 'lib/session-setup/roster.ts'), 'utf8');
    const preset = roster.slice(roster.indexOf('export function soloClaimedAge'), roster.indexOf('export const SOLO_NAME'));
    expect(preset).not.toMatch(/localStorage|sessionStorage|location|searchParams|navigator|profile/);
    const prove = readFileSync(join(ROOT, 'app/play/dunkduel/_components/prove-it.tsx'), 'utf8');
    expect(prove).toContain('soloDefaults(serverVerified)');
  });

  it('4. no new network calls in the touched session-setup files or the camera constraints', () => {
    for (const f of ['framing', 'rotation', 'roster']) {
      const src = readFileSync(join(ROOT, `lib/session-setup/${f}.ts`), 'utf8');
      expect(src).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon/);
    }
    const prove = readFileSync(join(ROOT, 'app/play/dunkduel/_components/prove-it.tsx'), 'utf8');
    expect(prove.match(/fetch\(/g)?.length).toBe(3);
    expect(prove).not.toMatch(/XMLHttpRequest|sendBeacon/);
    expect(prove).toContain('width: { ideal: 1280 }, height: { ideal: 720 }');
  });
});
