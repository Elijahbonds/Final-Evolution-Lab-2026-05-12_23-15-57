// MUSIC-SUITE P6 phone-replay (2026-09-26) — the two P5 phone follow-ups (owner decision #36; P5 REPORT 'Not done'):
//   1. THE PHONE THROUGH REPLAY. The shell's REPLAY remounted the Academy, which disposed HostLobby's session: the paired
//      phone was left on a dead room and had to scan a new code, and the splash + stage pick came back. The room now
//      registers an in-place restart with GameShell's existing seam (replay-in-place.ts; game-shell.tsx is held and needs no
//      edit). Pinned: the restart resets PERFORM and the transport, keeps the project and the phone room, skips the splash;
//      an Arena set and a mode that registers nothing still remount exactly as before.
//   2. THE PHONE SEES THE ROOM — phoneRoomState (what the room puts on the new opt-in back channel; the channel itself is
//      lib/controller-link/roomState.test.ts, the page components/controller-link/controller-page.roomstate.test.tsx).
// The React half runs in a browser in scripts/probes/_music-p6-phone-replay.mts (two pages: /dev/music and the phone).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { academyReplayRefusal, replayAcademyInPlace, type AcademyReplayRoom, type AcademyReplayStep } from './academyReplay';
import { PHONE_BANKS, phoneCommand, phoneRoomState } from './phonePad';
import { PerformSet } from './performSet';
import { MODE_CONTROLLERS } from '@/lib/controller-link/schemas/registry';
import { parseRoomState, ROOM_STATE_MAX_TEXT } from '@/lib/controller-link/roomState';

const ROOT = join(__dirname, '..', '..', '..');
/** The code, not the prose: comments out, so a comment NAMING the old behaviour never trips a pin. */
const code = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

// ── 2. what the phone sees ─────────────────────────────────────────────────────────────────────────────────────────────
describe('phoneRoomState: the live bank, PLAYING and REC, in the MPC page\'s own actions', () => {
  const flipActions = new Set(MODE_CONTROLLERS.music_flip.schemas.flatMap((s) => (s.kind === 'button' ? s.buttons.map((b) => b.action) : [])));

  it('every combination: the bank\'s button lit, PLAY lit only while playing, REC lit only while armed', () => {
    for (let bank = 0; bank < 4; bank++) for (const playing of [false, true]) for (const recArm of [false, true]) {
      const s = phoneRoomState({ bank, bankLabel: 'Theme', playing, recArm });
      expect(s.lit).toEqual([`bank_${PHONE_BANKS[bank]}`, ...(playing ? ['play'] : []), ...(recArm ? ['rec'] : [])]);
      // each lit action is one of the phone's own buttons, and means what it says to the host (phoneCommand)
      for (const a of s.lit) { expect(flipActions.has(a), a).toBe(true); expect(phoneCommand({ a }), a).not.toBeNull(); }
      expect(s.chips.map((c) => c.text)).toEqual([
        `BANK ${PHONE_BANKS[bank]} · Theme`,
        playing ? '▶ PLAYING' : '■ STOPPED',
        recArm ? (playing ? '● RECORDING' : '● REC ARMED') : '○ REC OFF',
      ]);
      expect(s.chips.map((c) => !!c.on)).toEqual([false, playing, recArm]);
    }
  });

  it('an empty bank says so; a bad bank index is clamped (never "BANK undefined")', () => {
    expect(phoneRoomState({ bank: 2, bankLabel: null, playing: false, recArm: false }).chips[0].text).toBe('BANK C · empty');
    expect(phoneRoomState({ bank: 2, bankLabel: '   ', playing: false, recArm: false }).chips[0].text).toBe('BANK C · empty');
    expect(phoneRoomState({ bank: 9, playing: false, recArm: false }).lit[0]).toBe('bank_D');
    expect(phoneRoomState({ bank: -3, playing: false, recArm: false }).lit[0]).toBe('bank_A');
    expect(phoneRoomState({ bank: Number.NaN, playing: false, recArm: false }).lit[0]).toBe('bank_A');
  });

  it('it is a state the wire keeps as it is (parseRoomState is a no-op on it), and a long label is cut, not the room', () => {
    const s = phoneRoomState({ bank: 1, bankLabel: 'Pocket Bass', playing: true, recArm: true });
    expect(parseRoomState(s)).toEqual(s);
    const long = parseRoomState(phoneRoomState({ bank: 3, bankLabel: 'My very long upload name from the phone mic.m4a', playing: false, recArm: false }))!;
    expect(long.chips[0].text.length).toBe(ROOM_STATE_MAX_TEXT);
    expect(long.chips[0].text.startsWith('BANK D · My very')).toBe(true);
    expect(long.lit).toEqual(['bank_D']);
  });
});

// ── 1. the phone through REPLAY ──────────────────────────────────────────────────────────────────────────────────────
describe('academyReplayRefusal / replayAcademyInPlace', () => {
  const room = (over: Partial<AcademyReplayRoom> = {}, calls: string[] = []): AcademyReplayRoom => ({
    arenaSet: false, shown: true, engine: { stop: () => calls.push('engine.stop') }, takeRecording: false,
    stopTake: () => calls.push('stopTake'), transportStopped: () => calls.push('transportStopped'), disarmRec: () => calls.push('disarmRec'),
    showStudio: () => calls.push('showStudio'), enterPerform: () => calls.push('enterPerform'), wakeKeys: () => calls.push('wakeKeys'),
    ...over,
  });

  it('refuses an Arena set (one attempt per match), a room behind its splash, and a room with no engine — touching nothing', () => {
    expect(academyReplayRefusal({ arenaSet: true, shown: true, engine: true })).toBe('arena');
    expect(academyReplayRefusal({ arenaSet: false, shown: false, engine: true })).toBe('not-shown');
    expect(academyReplayRefusal({ arenaSet: false, shown: true, engine: false })).toBe('no-engine');
    expect(academyReplayRefusal({ arenaSet: false, shown: true, engine: true })).toBeNull();
    for (const over of [{ arenaSet: true }, { shown: false }, { engine: null }] as Partial<AcademyReplayRoom>[]) {
      const calls: string[] = [];
      expect(replayAcademyInPlace(room(over, calls)), JSON.stringify(over)).toBe(false);
      expect(calls).toEqual([]);
    }
  });

  it('a free-play room: engine stopped, transport off, REC off, STUDIO, a fresh PERFORM set, keys back — in that order', () => {
    const calls: string[] = [];
    const steps: AcademyReplayStep[] = [];
    expect(replayAcademyInPlace(room({}, calls), (s) => steps.push(s))).toBe(true);
    expect(steps).toEqual(['stop-engine', 'transport', 'disarm', 'studio', 'perform', 'keys']);
    expect(calls).toEqual(['engine.stop', 'transportStopped', 'disarmRec', 'showStudio', 'enterPerform', 'wakeKeys']);
  });

  it('a take still recording is stopped first (it lands in its project, as the remount\'s unmount landed it)', () => {
    const calls: string[] = [];
    expect(replayAcademyInPlace(room({ takeRecording: true }, calls))).toBe(true);
    expect(calls[0]).toBe('stopTake');
  });

  it('it reads only its own handles — there is no project, store or phone room for it to touch', () => {
    const read = new Set<string>();
    const r = room();
    const spy = new Proxy(r, { get: (t, k) => { read.add(String(k)); return Reflect.get(t, k); } });
    replayAcademyInPlace(spy);
    expect([...read].sort()).toEqual(['arenaSet', 'disarmRec', 'engine', 'enterPerform', 'showStudio', 'shown', 'takeRecording', 'transportStopped', 'wakeKeys'].sort());
  });
});

// ── the shell's REPLAY, end to end on a model of the mounted room ─────────────────────────────────────────────────────
// GameShell.replay (game-shell.tsx, HELD — pinned below): `if (inPlace.current?.()) { … return; } setGameKey((k) => k + 1);`
// — the registered restart first; a key bump (the Game and everything under it, HostLobby included, unmount and mount
// fresh) only when there is none or it answers false. The model mounts a room the way StudioMode's state starts (the
// splash up, a new phone room code from HostSession.start) and wires its restart exactly as StudioMode does.
interface Room {
  mountId: number;
  started: boolean;                        // false = the boot splash + stage pick are up
  project: { id: string; tracks: boolean[][] };
  phone: { code: string; disposed: boolean; paired: string[] };
  set: PerformSet; mode: 'build' | 'perform'; view: string;
  playing: boolean; playhead: number; recArm: boolean; keysSuspended: boolean; engineStops: number;
}
function shellWith(opts: { registers: boolean; arena?: boolean }) {
  let codes = 0;
  let inPlace: (() => boolean) | null = null;
  const mount = (id: number): Room => {
    const r: Room = {
      mountId: id, started: false, project: { id: `p${id}`, tracks: [[true, false, false, false]] },
      phone: { code: `ROOM${++codes}`, disposed: false, paired: [] },
      set: new PerformSet({ arena: !!opts.arena }), mode: 'build', view: 'studio',
      playing: false, playhead: -1, recArm: false, keysSuspended: false, engineStops: 0,
    };
    inPlace = opts.registers ? () => replayAcademyInPlace({
      arenaSet: !!opts.arena, shown: r.started, engine: { stop: () => { r.engineStops++; } }, takeRecording: false, stopTake: () => undefined,
      transportStopped: () => { r.playing = false; r.playhead = -1; }, disarmRec: () => { r.recArm = false; },
      showStudio: () => { r.view = 'studio'; }, enterPerform: () => { r.set = new PerformSet({ arena: !!opts.arena }); r.mode = 'perform'; },
      wakeKeys: () => { r.keysSuspended = false; },
    }) : null;
    return r;
  };
  let gameKey = 0;
  let room = mount(gameKey);
  return {
    get room() { return room; },
    /** game-shell.tsx replay(), as it is written */
    replay(): 'in-place' | 'remount' {
      if (inPlace?.()) return 'in-place';
      room.phone.disposed = true;             // HostLobby's session effect cleanup (host-lobby.tsx) on the unmount
      gameKey += 1; room = mount(gameKey);
      return 'remount';
    },
  };
}
/** The splash's TAP TO START on the PERFORM stage, a paired phone, a played set that scored, then the end card. */
function playASet(r: Room): void {
  r.started = true; r.mode = 'perform';
  r.phone.paired.push('phone-1');
  r.playing = true; r.playhead = 7; r.recArm = true; r.view = 'flip';
  r.set.note(0, 1.0, 0.95); r.set.tap(1.0); r.set.note(4, 1.5, 1.45); r.set.tap(1.5);
  r.project.tracks[0][2] = true;           // the player's own work, edited during the session
  r.keysSuspended = true; r.mode = 'build'; // endSet: the card covers the room
}

describe('REPLAY in place: the Academy (it registers)', () => {
  it('the same room: same project (object and content), the SAME phone room code, still paired — no splash', () => {
    const shell = shellWith({ registers: true });
    const before = shell.room;
    playASet(before);
    const project = before.project;
    const tracks = JSON.stringify(project.tracks);
    expect(before.set.result(2).score).toBeGreaterThan(0);
    expect(shell.replay()).toBe('in-place');
    const after = shell.room;
    expect(after).toBe(before);
    expect(after.mountId).toBe(0);
    expect(after.project).toBe(project);
    expect(JSON.stringify(after.project.tracks)).toBe(tracks);
    expect(after.phone).toEqual({ code: 'ROOM1', disposed: false, paired: ['phone-1'] });
    expect(after.started).toBe(true);        // no splash, no stage pick
  });

  it('PERFORM reset (a fresh set: no notes, no score) and the transport reset (stopped, bar 0 next, REC off), keys back', () => {
    const shell = shellWith({ registers: true });
    const r = shell.room;
    playASet(r);
    const oldSet = r.set;
    shell.replay();
    expect(r.set).not.toBe(oldSet);
    expect(r.set.result(3)).toMatchObject({ notes: 0, hits: 0, score: 0, maxCombo: 0 });
    expect(r.mode).toBe('perform');
    expect(r.view).toBe('studio');
    expect({ playing: r.playing, playhead: r.playhead, recArm: r.recArm, stops: r.engineStops, keysSuspended: r.keysSuspended })
      .toEqual({ playing: false, playhead: -1, recArm: false, stops: 1, keysSuspended: false });
  });

  it('REPLAY twice: still the one room and the one code', () => {
    const shell = shellWith({ registers: true });
    playASet(shell.room); shell.replay();
    playASet(shell.room); shell.replay();
    expect(shell.room.mountId).toBe(0);
    expect(shell.room.phone.code).toBe('ROOM1');
  });
});

describe('REPLAY as before: a mode that registers nothing, and an Arena set', () => {
  it('a mode without a registration remounts: a new room, the splash back, the old phone room disposed, a NEW code', () => {
    const shell = shellWith({ registers: false });
    const before = shell.room;
    playASet(before);
    expect(shell.replay()).toBe('remount');
    expect(shell.room).not.toBe(before);
    expect(shell.room.mountId).toBe(1);
    expect(shell.room.started).toBe(false);
    expect(before.phone.disposed).toBe(true);
    expect(shell.room.phone.code).not.toBe(before.phone.code);
  });

  it('an Arena set: the Academy\'s restart answers false, so the shell remounts exactly as before (one attempt per match)', () => {
    const shell = shellWith({ registers: true, arena: true });
    const before = shell.room;
    playASet(before);
    expect(shell.replay()).toBe('remount');
    expect(shell.room.mountId).toBe(1);
    expect(before.engineStops).toBe(0);      // the restart touched nothing
  });

  it('REPLAY before the room was ever shown (still on the splash) remounts', () => {
    const shell = shellWith({ registers: true });
    expect(shell.replay()).toBe('remount');
  });
});

// ── the wiring (source pins: the model above is only true while these hold) ──────────────────────────────────────────
describe('the wiring (source pins)', () => {
  const shell = code('components/games/game-shell.tsx');
  const studio = code('lib/babylon/music/StudioMode.tsx');
  const lobby = code('components/controller-link/host-lobby.tsx');
  const seam = code('components/games/replay-in-place.ts');
  const dev = code('app/dev/music/loader.tsx');

  it('GameShell (held, unedited): the registered restart first; the key bump only when there is none or it said false', () => {
    expect(shell).toMatch(/if \(inPlace\.current\?\.\(\)\) \{ inputCount\.current = 0; return; \}\s*setGameKey\(\(k\) => k \+ 1\);/);
    expect(shell).toMatch(/<ReplayInPlaceContext\.Provider value=\{registerReplay\}>\s*<Game key=\{gameKey\}/);
    expect(seam).toContain('export function useReplayInPlace(restart: () => boolean): void {');
    expect(code('app/play/music/_components/loader.tsx')).toMatch(/<GameShell[\s\S]*?Game=\{StudioMode\}/);
  });

  it('the Academy registers its restart (stable, reading this render through a ref) before the splash can return early', () => {
    expect(studio).toContain('const replayInPlace = useCallback((): boolean => replayRef.current(), []);');
    expect(studio).toContain('useReplayInPlace(replayInPlace);');
    expect(studio.indexOf('useReplayInPlace(replayInPlace);')).toBeLessThan(studio.indexOf('if (!ready || !room.restored || !started) {'));
    expect(studio).toMatch(/const ok = replayAcademyInPlace\(\{\s*arenaSet, shown: roomShown, engine: engineRef\.current,/);
    expect(studio).toContain('transportStopped: () => { setPlaying(false); setPlayhead(-1); stepMarksRef.current = []; },');
    expect(studio).toContain('disarmRec: () => setFlipRecArm(false),');
    expect(studio).toMatch(/showStudio: \(\) => \{ setView\('studio'\); setCreatorId\(null\); \},\s*enterPerform,\s*wakeKeys: \(\) => \{ keysSuspended\.current = false; \},/);
  });

  it('nothing REPLAY in place does re-creates the phone room: one HostLobby, unkeyed, a module-constant config, and its session made only when config / armed / attempt change', () => {
    expect(studio.match(/<HostLobby /g)).toHaveLength(1);
    expect(studio).not.toMatch(/<HostLobby[^\n]*\bkey=/);
    // a registry constant (the P6 lanes may pick music_perform — latched when the room first opens), never a fresh object
    expect(studio).toMatch(/<HostLobby config=\{[^}{]*MODE_CONTROLLERS\.music_flip[^}{]*\}/);
    expect(studio).not.toMatch(/<HostLobby config=\{\{/);
    expect(lobby).toMatch(/return \(\) => \{ disposed = true; session\.dispose\(\); \};\s*\}, \[config, armed, attempt\]\);/);
  });

  it('the phone sees the room: the state goes to HostLobby, which sends it on its session', () => {
    expect(studio).toContain('const phoneState = useMemo(() => phoneRoomState({ bank: flipBank, bankLabel: phoneBankLabel, playing, recArm: flipRecArm }), [flipBank, phoneBankLabel, playing, flipRecArm]);');
    expect(studio).toMatch(/<HostLobby [^\n]*roomState=\{phoneState\}/);
    expect(lobby).toContain('useEffect(() => { if (roomState) sessionRef.current?.sendState(roomState); }, [roomState]);');
    expect(lobby).toContain('if (roomStateRef.current) session.sendState(roomStateRef.current);');
  });

  it('/dev/music stands in for the shell the same way — through `registerReplay`, never ReplayInPlaceContext (the streak post)', () => {
    expect(dev).not.toContain('ReplayInPlaceContext');
    expect(dev).toMatch(/if \(!forceRemount && inPlace\.current\?\.\(\)\) \{[^}]*return; \}/);
    expect(dev.match(/registerReplay=\{registerReplay\}/g)).toHaveLength(2);
    expect(studio).toMatch(/if \(!registerReplay\) return undefined;\s*registerReplay\(replayInPlace\);\s*return \(\) => registerReplay\(null\);/);
  });
});
