'use client';
// RecordBooth — THE RECORDING BOOTH (MUSIC-SUITE P4, "Pocket studio + melody", 2026-09-25). Replaces SongPanel's RECORD
// TAKE (SongPanel.tsx ~:54, :250-274 before this phase).
//
// What was wrong (outbox musicsuite/understand-wf_3a55346f-032.json, take findings): the ARMED button did nothing until
// the engine's onBar fired — up to ~125 ms BEFORE the bar was audible — and only then called getUserMedia (the first time,
// behind a permission prompt) and started a MediaRecorder, with echo cancellation, noise suppression and AGC on. The take
// was placed on the bar anyway, so it was late by the scheduler lead + the prompt + the recorder's start-up + the device
// round trip, a different amount each time (takeCapture.test.ts models the generous case: 142 ms late). A take played
// once, at its absolute bar (armed on the 2nd pass = after the song ended), STOP only cleared a timer, there was no gain,
// trim, mute or choice between attempts, and nothing on screen said the mic was open.
//
// Now:
//   1. ARM opens the mic AHEAD of time — permission is asked HERE, never on a bar line — with raw input (echoCancellation,
//      noiseSuppression, autoGainControl all false: takeCapture RAW_MIC_CONSTRAINTS) and a live input meter (peak dBFS,
//      clip light). "● MIC ON" shows while the track is live; the room's chip shows it on the other tabs (onRecording).
//   2. RECORD counts in (the engine's count-in, contract 3, when it has one; stopped, it starts the song) and captures PCM
//      through an AudioWorklet (ScriptProcessor fallback) stamped on the AudioContext clock (takeCapture BoothMic). The
//      take is CUT from the tape at the start bar's audio time + the round-trip latency (takeCapture boothLatency: the
//      formula is written there) — sample-accurate, not MediaRecorder. It ends on its region's last bar line by itself,
//      or on ■ STOP, or when the transport stops.
//   3. A take is stored as a WAV blob (studioStore via saveAudio) with its region {atBar, bars, loopBars} and is handed to
//      the engine as engine.setTakes (contract 4): it plays on EVERY pass of its bars and stops with STOP.
//   4. Per take: gain, trim in / out (gates — the audio keeps its place), mute, delete (asked; UNDO brings it back). BEST
//      OF N: record again over the same bars and every attempt is kept; the newest plays until you PICK another.
//   5. CLOSE MIC (and the booth unmounting: another project, REPLAY, leaving the room, the page hidden while only armed)
//      stops the mic track, so the browser's mic light goes out.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BOOTH_COUNT_INS, BOOTH_LENGTHS, BOOTH_LOOPS, BoothMic, DEFAULT_BOOTH_LOOP, MAX_TAKE_SEC, barSec, clampRegion, engineTakeList,
  levels, meterFill, muteRecordingSlot, pickTake, pickedTakeIds, takeGroups, takeSilence, takeSlot, takeStartBar, takeStartFrame, toDb, watchBarLine,
  wavFromPcm, type BarClock, type BoothLatency, type BoothRegion,
} from '../takeCapture';
import type { EngineTake } from '../AudioEngine';
import { newTakeId, type AudioRef, type ProjectTake, type SongSlice } from '../StudioProject';
import { loadSavedOffsetMs } from '@/lib/feel/rhythm-calibrate';

/**
 * The engine surface the booth uses. AudioEngine has all of it; the phase-4 contract methods are optional here so the
 * booth still records (and plays takes through the P3 one-shots) against an engine without them.
 */
export interface BoothEngine extends BarClock {
  readonly context: AudioContext;
  readonly isRunning: boolean;
  start(): void;
  stop(): void;
  /** Contract (4): takes on the bar grid, looping with the song, cut on stop(). */
  setTakes?(list: EngineTake[]): void;
  /** P3's one-shots (first pass only) — used only by an engine without setTakes. */
  setOneShots?(list: { id: string; buffer: AudioBuffer; atBar: number; gain: number }[]): void;
  /** Contract (3): START the transport after `bars` bars of count clicks; bar 0 is after them (AudioEngine.countIn). */
  countIn?(bars: number): unknown;
  /** Contract (3): running and still inside the count-in / bar 0's audio time for this run. */
  readonly countingIn?: boolean;
  readonly songStartSec?: number;
  /** MUSIC-SUITE P4 FIX PASS: count clicks over the bars before song bar `bar` of the RUNNING song (AudioEngine.countInBefore). */
  countInBefore?(bar: number, bars: number): unknown;
  /** MUSIC-SUITE P4 FIX PASS: the desk's own delay (AudioEngine.graphLatencySec) — part of the formula's L_out. */
  readonly graphLatencySec?: number;
}

declare global {
  interface Window {
    __FEL_BOOTH__?: {
      phase: string; micOn: boolean; kind: string | null;
      settings: { echoCancellation?: boolean; noiseSuppression?: boolean; autoGainControl?: boolean; latency?: number; sampleRate?: number } | null;
      latency: BoothLatency | null; peakDb: number; recentPeakDb: number;
      region: BoothRegion; countIn: number; startBar: number | null; barsToGo: number | null;
      takes: number; playing: string[]; engineTakes: number; engineApi: 'setTakes' | 'setOneShots' | 'none';
      lastTake: { id: string; startTime: number; startFrame: number; frames: number; gaps: number; atBar: number; bars: number; loopBars: number; latencyMs: number; sampleRate: number; peakDb: number } | null;
      clockCheck?: () => Promise<{ errorMs: number | null; kind: 'worklet' | 'script' }>;
    };
  }
}

/** Each take's decoded audio (the project holds only its bytes' ref), and the takes whose bytes are not on this device. */
export function useTakeBuffers(ctx: BaseAudioContext | null, takes: readonly ProjectTake[], loadAudio: (ref: AudioRef) => Promise<ArrayBuffer | null>, say: (m: string) => void) {
  const [buffers, setBuffers] = useState<ReadonlyMap<string, AudioBuffer>>(new Map());
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set());
  const loadingRef = useRef(new Set<string>());
  const sayRef = useRef(say); sayRef.current = say;
  // MUSIC-SUITE P3: a take restored from the project (a reload, a REPLAY, another project opened) is decoded from its bytes
  useEffect(() => {
    if (!ctx) return;
    for (const t of takes) {
      if (buffers.has(t.id) || missing.has(t.id) || loadingRef.current.has(t.id)) continue;
      loadingRef.current.add(t.id);
      void (async () => {
        try {
          const bytes = await loadAudio(t.audio);
          if (!bytes) throw new Error('not on this device');
          const buf = await ctx.decodeAudioData(bytes);
          setBuffers((m) => new Map(m).set(t.id, buf));
        } catch {
          setMissing((s) => new Set(s).add(t.id));
          sayRef.current('A take\'s recording isn\'t on this device any more — it is marked "audio missing" in the booth');
        } finally { loadingRef.current.delete(t.id); }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, takes]);
  const addBuffer = useCallback((id: string, b: AudioBuffer) => setBuffers((m) => new Map(m).set(id, b)), []);
  return { buffers, missing, addBuffer };
}

export interface RecordBoothProps {
  engine: BoothEngine | null;
  bpm: number; steps: number;
  /** Song mode loops the song (its bars); off it, the booth's LOOP. */
  songMode: boolean; songBars: number;
  takes: ProjectTake[];
  /** The project a take started in gets it (StudioMode onTake redirects it if another is open by then). */
  projectId: string;
  /** THE STUDIO tier (MusicTiers `takes`). Without it the takes are listed and play, and nothing records. */
  canRecord: boolean;
  buffers: ReadonlyMap<string, AudioBuffer>; missing: ReadonlySet<string>; addBuffer: (id: string, b: AudioBuffer) => void;
  onSongChange: (fn: (s: SongSlice) => SongSlice) => void;
  onTake?: (take: ProjectTake, projectId: string) => void;
  saveAudio: (blob: Blob) => Promise<AudioRef>;
  say: (m: string) => void;
  S: Record<string, React.CSSProperties>;
  /** The mic is open (`what` 'mic') or a take is counting in / recording ('take'): the room holds MY PROJECTS and shows its chip. */
  onRecording?: (on: boolean, what: 'mic' | 'take') => void;
  /** Filled with the booth's STOP (a take: punch out; only armed: close the mic), for the room's chip on other tabs. */
  stopRef?: React.MutableRefObject<(() => void) | null>;
  /** Start the room's transport (so its PLAY/STOP stays true). Without it the booth starts the engine itself. */
  onTransport?: (play: boolean) => void;
}

type Phase = 'off' | 'opening' | 'armed' | 'waiting' | 'recording' | 'saving';
interface Rec {
  startedIn: string; region: BoothRegion; startBar: number; bpm: number; steps: number; songMode: boolean;
  startTime: number | null; startFrame: number; endFrame: number; latency: BoothLatency | null;
  sawRunning: boolean; unwatch: () => void;
  /** The booth started the engine itself (no room transport to ask): it stops it again when the take is done. */
  selfStarted: boolean;
}
type Draft = Partial<Pick<ProjectTake, 'gain' | 'trimStart' | 'trimEnd'>>;

const barsLabel = (atBar: number, bars: number): string => (bars === 1 ? `bar ${atBar + 1}` : `bars ${atBar + 1}–${atBar + bars}`);

export default function RecordBooth(p: RecordBoothProps) {
  const { engine, bpm, steps, songMode, songBars, takes, canRecord, buffers, missing, say, S } = p;
  const [phase, setPhaseState] = useState<Phase>('off');
  const phaseRef = useRef<Phase>('off');
  const setPhase = useCallback((ph: Phase) => { phaseRef.current = ph; setPhaseState(ph); }, []);
  const micRef = useRef<BoothMic | null>(null);
  const recRef = useRef<Rec | null>(null);
  const timerRef = useRef<number | null>(null);
  const [status, setStatus] = useState<string>('');
  const [latency, setLatency] = useState<BoothLatency | null>(null);
  const lastTakeRef = useRef<NonNullable<Window['__FEL_BOOTH__']>['lastTake']>(null);
  // the region: FROM / LENGTH / LOOP (grid) and the count-in
  const [gridLoop, setGridLoop] = useState<number>(DEFAULT_BOOTH_LOOP);
  const [fromBar, setFromBar] = useState(0);
  const [lenBars, setLenBars] = useState<number>(DEFAULT_BOOTH_LOOP);
  const [countIn, setCountIn] = useState<number>(1);
  const loopBars = songMode && songBars > 0 ? songBars : gridLoop;
  const region = clampRegion({ fromBar, bars: lenBars, loopBars });
  const [confirmTake, setConfirmTake] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const draftsRef = useRef(drafts); draftsRef.current = drafts;

  // latest props for the async paths (a take can finish after this booth unmounted: another project, a REPLAY)
  const live = useRef(p); live.current = p;

  // ── what the engine plays: each group's pick, looping on its bars (contract 4) ──────────────────────────────────
  const merged = useMemo(() => takes.map((t) => (drafts[t.id] ? { ...t, ...drafts[t.id] } : t)), [takes, drafts]);
  const engineList = useMemo(() => engineTakeList(merged, buffers, { songMode, songBars, bpm, stepsPerBar: steps }), [merged, buffers, songMode, songBars, bpm, steps]);
  const engineApi: 'setTakes' | 'setOneShots' | 'none' = engine?.setTakes ? 'setTakes' : engine?.setOneShots ? 'setOneShots' : 'none';
  /**
   * MUSIC-SUITE P4 FIX PASS (2026-09-25): the takes the engine plays go to it as they are — the trim-in is the engine's own
   * gate now (takeCapture gatedBuffer says why the gated copies went), so the SAME buffer reaches the engine on every
   * re-render and a GAIN or TRIM move is a glide / an in-place restart of the sounding pass (AudioEngine.setTakes).
   * And WHILE A TAKE IS WAITING OR RECORDING, its region's current pick is muted: it played under the performer (echo
   * cancellation is deliberately off — RAW_MIC_CONSTRAINTS — so on speakers take 1 bled into take 2); a DAW replaces a
   * track's playback while it records. It comes back (as the new take, the group's pick now) when the take is done.
   */
  const recordingSlot = phase === 'waiting' || phase === 'recording' ? takeSlot({ atBar: region.fromBar, bars: region.bars }) : null;
  const toPlay = useMemo(() => muteRecordingSlot(engineList, takes, recordingSlot), [engineList, takes, recordingSlot]);
  useEffect(() => {
    if (!engine) return;
    const list: EngineTake[] = toPlay;
    if (engine.setTakes) engine.setTakes(list);
    // an engine without the contract: the P3 one-shots (first pass only) — never silence a take that exists
    else engine.setOneShots?.(list.filter((t) => !t.muted).map((t) => ({ id: t.id, buffer: t.buffer, atBar: t.startBar, gain: t.gain })));
  }, [engine, toPlay]);

  // ── the mic ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const onRecordingRef = useRef(p.onRecording); onRecordingRef.current = p.onRecording;
  useEffect(() => {
    const on = phase !== 'off';
    onRecordingRef.current?.(on, phase === 'waiting' || phase === 'recording' || phase === 'saving' ? 'take' : 'mic');
  }, [phase]);

  const stopTimer = (): void => { if (timerRef.current !== null) { window.clearInterval(timerRef.current); timerRef.current = null; } };

  const closeMic = useCallback((line?: string): void => {
    // a take still counting in is called off with it (one being recorded is finished by its caller first)
    const r = recRef.current;
    if (r && r.startTime === null) {
      recRef.current = null; r.unwatch(); setStatus('');
      if (timerRef.current !== null) { window.clearInterval(timerRef.current); timerRef.current = null; }
      if (r.selfStarted && engine?.isRunning) engine.stop();
    }
    const mic = micRef.current; micRef.current = null;
    mic?.close();
    if (phaseRef.current !== 'saving') setPhase('off');
    setLatency(null);
    if (line) live.current.say(line);
  }, [setPhase, engine]);

  const arm = async (): Promise<void> => {
    if (!engine || micRef.current || phaseRef.current !== 'off') return;
    setPhase('opening');
    try {
      const mic = await BoothMic.open(engine.context);
      micRef.current = mic;
      mic.track?.addEventListener('ended', () => { if (micRef.current === mic) { if (recRef.current?.startTime != null) void finish('the mic went away'); else closeMic('The mic stopped (unplugged, or taken by another app) — ARM it again'); } });
      setLatency(mic.latency(loadSavedOffsetMs(), engine.graphLatencySec ?? 0));
      setPhase('armed');
      const s = mic.settings();
      const raw = s.echoCancellation === false && s.noiseSuppression !== true && s.autoGainControl !== true;
      say(`Mic on${raw ? ' — raw input (no echo cancelling, no auto gain)' : ' — this browser kept some voice processing on'}. Use headphones; RECORD counts you in.`);
    } catch (e) {
      setPhase('off');
      const name = (e as { name?: string })?.name;
      say(name === 'NotAllowedError' ? 'The mic is blocked for FEL — allow it in the browser\'s site settings, then ARM again'
        : name === 'NotFoundError' ? 'No microphone found' : 'The mic could not be opened');
    }
  };

  // ── a take ──────────────────────────────────────────────────────────────────────────────────────────────────────
  /** The start bar's line was scheduled: its audio time is known, so the take's first frame is (the formula). */
  const begin = (r: Rec, time: number): void => {
    const mic = micRef.current;
    if (!mic || recRef.current !== r) return;
    const L = mic.latency(loadSavedOffsetMs(), live.current.engine?.graphLatencySec ?? 0);
    r.startTime = time; r.latency = L;
    r.bpm = live.current.bpm;   // the tempo the region is played at (it may have moved during the count-in)
    r.startFrame = takeStartFrame(time, L.totalSec, mic.sampleRate);
    const lenSec = Math.min(MAX_TAKE_SEC, r.region.bars * barSec(r.bpm, r.steps));
    r.endFrame = takeStartFrame(time + lenSec, L.totalSec, mic.sampleRate);
    mic.hold(r.startFrame - 256);
    setLatency(L);
    setPhase('recording');
  };

  /** Where a punch-out (■ STOP, the transport stopping) ends the take: what the mic has heard up to now. */
  const punchOutFrame = (r: Rec): number => {
    const mic = micRef.current;
    if (!mic || !engine || r.startTime === null) return r.startFrame;
    const now = takeStartFrame(engine.context.currentTime, r.latency?.inSec ?? 0, mic.sampleRate);
    return Math.max(r.startFrame, Math.min(r.endFrame, now));
  };

  const cancelWait = (line: string): void => {
    const r = recRef.current; recRef.current = null;
    r?.unwatch(); stopTimer();
    if (r?.selfStarted && engine?.isRunning) engine.stop();
    if (micRef.current) setPhase('armed'); else setPhase('off');
    setStatus('');
    live.current.say(line);
  };

  /** Cut the take off the tape, keep its bytes, hand it to the project it started in. */
  const finish = async (why?: string, to?: number): Promise<void> => {
    const r = recRef.current; const mic = micRef.current;
    if (!r || !mic || r.startTime === null || phaseRef.current === 'saving') return;
    const end = to ?? punchOutFrame(r);
    recRef.current = null; r.unwatch(); stopTimer();
    // the booth started the song for this take (the room had no transport to hand it): it stops it again
    if (r.selfStarted && engine?.isRunning) engine.stop();
    setPhase('saving'); setStatus('saving the take…');
    try {
      const { pcm, gaps } = await mic.cut(r.startFrame, end);
      mic.hold(null);
      const sr = mic.sampleRate;
      if (pcm.length < 0.1 * sr) { live.current.say('That take was under a tenth of a second — nothing was kept'); return; }
      const buf = mic.ctx.createBuffer(1, pcm.length, sr);
      buf.copyToChannel(pcm, 0);
      const audio = await live.current.saveAudio(new Blob([wavFromPcm(pcm, sr)], { type: 'audio/wav' }));
      const take: ProjectTake = {
        id: newTakeId(), atBar: r.region.fromBar, bars: r.region.bars, loopBars: r.region.loopBars,
        gain: 0.9, durationSec: pcm.length / sr, trimStart: 0, trimEnd: 0, muted: false, pickedAt: Date.now(), audio,
      };
      lastTakeRef.current = {
        id: take.id, startTime: r.startTime, startFrame: r.startFrame, frames: pcm.length, gaps,
        atBar: take.atBar, bars: take.bars, loopBars: take.loopBars, latencyMs: Math.round((r.latency?.totalSec ?? 0) * 1000), sampleRate: sr,
        peakDb: Math.round(toDb(levels(pcm).peak) * 10) / 10,
      };
      live.current.addBuffer(take.id, buf);
      const same = live.current.takes.filter((t) => t.atBar === take.atBar && t.bars === take.bars).length;
      if (live.current.onTake) live.current.onTake(take, r.startedIn);
      else live.current.onSongChange((x) => ({ ...x, takes: [...x.takes, take] }));
      const dropped = gaps ? ` · ${Math.round((gaps / sr) * 1000)} ms of input never arrived (silence in its place)` : '';
      if (r.startedIn === live.current.projectId) {
        live.current.say(`${why ? `${why} — ` : ''}take kept: ${barsLabel(take.atBar, take.bars)}, ${take.durationSec.toFixed(1)} s${same ? ` · take ${same + 1} of these bars, playing now (PICK another any time)` : ' · it plays on every pass'}${dropped}`);
      }
    } catch {
      live.current.say("That take couldn't be kept — record it again");
    } finally {
      setStatus('');
      if (micRef.current) setPhase('armed'); else setPhase('off');
    }
  };

  const tick = (): void => {
    const r = recRef.current; const mic = micRef.current;
    if (!r || !engine) { stopTimer(); return; }
    if (engine.isRunning) r.sawRunning = true;
    if (r.startTime === null) {
      if (r.sawRunning && !engine.isRunning) { cancelWait('Stopped before the take began — nothing recorded'); return; }
      const toGo = r.startBar - engine.currentBar;
      if (engine.countingIn && typeof engine.songStartSec === 'number') {
        const beats = Math.max(1, Math.ceil((engine.songStartSec - engine.context.currentTime) / (60 / r.bpm)));
        setStatus(`count-in · ${beats}${r.startBar > 0 ? ` · then ${r.startBar} bar${r.startBar === 1 ? '' : 's'} of the song` : ''}`);
      } else setStatus(toGo > 0 ? `counting in · the take starts in ${toGo} bar${toGo === 1 ? '' : 's'} (${barsLabel(r.region.fromBar, r.region.bars)})` : 'the take starts on this bar line…');
      return;
    }
    if (!mic) { recRef.current = null; r.unwatch(); stopTimer(); setStatus(''); setPhase('off'); return; }
    if (mic.endFrame >= r.endFrame) { void finish(undefined, r.endFrame); return; }
    if (r.sawRunning && !engine.isRunning) { void finish('the song stopped'); return; }
    if (!mic.live) { void finish('the mic went away'); return; }
    const done = Math.max(0, (mic.endFrame - r.startFrame) / mic.sampleRate);
    setStatus(`● REC ${done.toFixed(1)} s of ${((r.endFrame - r.startFrame) / mic.sampleRate).toFixed(1)} s · ${barsLabel(r.region.fromBar, r.region.bars)}`);
  };

  const record = (): void => {
    const mic = micRef.current;
    if (!engine || !mic || phaseRef.current !== 'armed' || !canRecord) return;
    const running = engine.isRunning;
    const engineCounts = typeof engine.countIn === 'function';
    const startBar = takeStartBar({ currentBar: engine.currentBar, running, countInBars: countIn, region, engineCounts });
    const r: Rec = {
      startedIn: p.projectId, region, startBar, bpm, steps, songMode, startTime: null, startFrame: 0, endFrame: 0, latency: null,
      sawRunning: running, unwatch: () => undefined, selfStarted: !running && !p.onTransport,
    };
    recRef.current = r;
    r.unwatch = watchBarLine(engine, startBar, (time) => begin(r, time));
    setPhase('waiting');
    if (!running) {
      // the engine's count-in STARTS the transport (bar 0 after the clicks); the room is then told it is playing (its own
      // start() is a no-op on a running engine). Without a count-in: the room's PLAY, or the engine's start().
      if (engineCounts && countIn > 0) { engine.countIn!(countIn); p.onTransport?.(true); }
      else if (p.onTransport) p.onTransport(true);
      else engine.start();
    } else if (countIn > 0) {
      // MUSIC-SUITE P4 FIX PASS: over a playing song the count-in is HEARD too — its clicks over the `countIn` bars before
      // the take's bar (it was only a countdown on screen while the booth said "RECORD counts you in")
      engine.countInBefore?.(startBar, countIn);
    }
    stopTimer();
    timerRef.current = window.setInterval(tick, 50);
    tick();
  };

  /** ■ STOP: a recording take punches out (kept); a take still counting in is called off; only armed = close the mic. */
  const stop = (): void => {
    const ph = phaseRef.current;
    if (ph === 'recording') void finish('stopped');
    else if (ph === 'waiting') cancelWait('Take called off before it began');
    else if (ph === 'armed' || ph === 'opening') closeMic('Mic closed');
  };
  const stopFn = useRef(stop); stopFn.current = stop;
  useEffect(() => {
    if (!p.stopRef) return;
    p.stopRef.current = () => stopFn.current();
    const ref = p.stopRef;
    return () => { ref.current = null; };
  }, [p.stopRef]);

  // the page hidden with the mic open and nothing recording: close it (a mic is never left open in a background tab)
  useEffect(() => {
    const onVis = (): void => { if (document.visibilityState === 'hidden' && phaseRef.current === 'armed') closeMic(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [closeMic]);

  // the booth goes away (another project, REPLAY, leaving the room): a take being recorded is kept, then the mic stops
  const finishRef = useRef(finish); finishRef.current = finish;
  useEffect(() => () => {
    const r = recRef.current; const mic = micRef.current;
    if (r && r.startTime !== null && mic) void finishRef.current('the booth closed').finally(() => { mic.close(); if (micRef.current === mic) micRef.current = null; });
    else { r?.unwatch(); recRef.current = null; mic?.close(); micRef.current = null; }
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    onRecordingRef.current?.(false, 'mic');
  }, []);

  // ── edits: each an undo step (the room's onSongChange) ────────────────────────────────────────────────────────────
  const setDraft = (id: string, d: Draft): void => setDrafts((m) => ({ ...m, [id]: { ...m[id], ...d } }));
  const commit = (id: string): void => {
    const d = draftsRef.current[id];
    if (!d) return;
    p.onSongChange((x) => ({ ...x, takes: x.takes.map((t) => (t.id === id ? { ...t, ...d } : t)) }));
    setDrafts((m) => { const n = { ...m }; delete n[id]; return n; });
  };
  const toggleMute = (t: ProjectTake): void => p.onSongChange((x) => ({ ...x, takes: x.takes.map((y) => (y.id === t.id ? { ...y, muted: !y.muted } : y)) }));
  const pick = (t: ProjectTake, others: number): void => {
    p.onSongChange((x) => ({ ...x, takes: pickTake(x.takes, t.id, Date.now()) }));
    say(`Take ${takes.indexOf(t) + 1} plays ${barsLabel(t.atBar, t.bars)} now — the other ${others} ${others === 1 ? 'is' : 'are'} kept`);
  };
  const removeTake = (id: string): void => {
    const i = takes.findIndex((t) => t.id === id);
    p.onSongChange((x) => ({ ...x, takes: x.takes.filter((t) => t.id !== id) }));
    setConfirmTake(null);
    if (i >= 0) say(`Take ${i + 1} removed — UNDO brings it back`);
  };

  // ── the dev probe's window ───────────────────────────────────────────────────────────────────────────────────────
  const picked = useMemo(() => pickedTakeIds(takes), [takes]);
  useEffect(() => {
    const mic = micRef.current; const r = recRef.current;
    const st = mic?.settings();
    window.__FEL_BOOTH__ = {
      phase, micOn: !!mic?.live, kind: mic?.kind ?? null,
      settings: st ? { echoCancellation: st.echoCancellation, noiseSuppression: st.noiseSuppression, autoGainControl: st.autoGainControl, latency: st.latency, sampleRate: st.sampleRate } : null,
      latency, get peakDb() { return toDb(micRef.current?.level.peak ?? 0); }, get recentPeakDb() { return toDb(micRef.current?.recentPeak(1) ?? 0); },
      region, countIn, startBar: r?.startBar ?? null, barsToGo: r && engine ? r.startBar - engine.currentBar : null,
      takes: takes.length, playing: engineList.filter((t) => !t.muted).map((t) => t.id), engineTakes: engineList.length, engineApi,
      lastTake: lastTakeRef.current,
      ...(process.env.NODE_ENV !== 'production' && engine ? { clockCheck: () => BoothMic.clockCheck(engine.context) } : {}),
    };
  });

  // ── view ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  const micOn = phase !== 'off' && phase !== 'opening';
  const busy = phase === 'waiting' || phase === 'recording' || phase === 'saving';
  const groups = takeGroups(merged);
  const small: React.CSSProperties = { fontSize: 12, opacity: 0.8 };
  const sel: React.CSSProperties = { padding: '6px 6px', borderRadius: 8, border: '1px solid #7a5c9e', background: '#241736', color: '#f5ead9', minHeight: 36 };
  const mini: React.CSSProperties = { background: 'transparent', border: '1px solid #5a4470', borderRadius: 6, color: 'inherit', cursor: 'pointer', fontSize: 11, padding: '4px 8px', minHeight: 30 };
  const lengths = [...new Set([...BOOTH_LENGTHS.filter((n) => n <= loopBars - region.fromBar), loopBars - region.fromBar, region.bars])].sort((a, b) => a - b);
  // MUSIC-SUITE P4 FIX PASS: the line names every term — the output delay's source, the desk's own (the limiter), the mic's
  const latLine = latency
    ? `in sync by ${Math.round(latency.totalSec * 1000)} ms (${latency.outFrom === 'calibration' ? 'your calibration' : latency.outFrom === 'device' ? 'this device\'s output' : 'no output figure'}${latency.graphSec > 0 ? ` + the mixer's ${Math.round(latency.graphSec * 1000)} ms` : ''}${latency.inFrom === 'track' ? ' + the mic\'s' : ''})`
    : null;

  return (
    <div data-qa="record-booth" style={{ marginTop: 10, padding: 10, borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: micOn ? '1px solid #ff5c5c' : '1px solid transparent' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 12, letterSpacing: 1 }}>RECORDING BOOTH</b>
        {micOn
          ? <span data-qa="mic-on" style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: '#d93636', borderRadius: 10, padding: '2px 8px' }}>● MIC ON</span>
          : <span style={small}>mic off</span>}
        {status && <span data-qa="booth-status" style={{ fontSize: 12, fontWeight: 700, color: phase === 'recording' ? '#ff8a8a' : '#ffd75e' }}>{status}</span>}
      </div>

      {canRecord ? (
        <>
          <div style={S.row}>
            {micOn || phase === 'opening'
              ? <button data-qa="booth-close" style={S.btnAlt} disabled={busy} onClick={() => closeMic('Mic closed')}>CLOSE MIC</button>
              : <button data-qa="booth-arm" style={S.btnAlt} disabled={!engine} onClick={() => void arm()}>● ARM MIC</button>}
            {micOn && <InputMeter micRef={micRef} />}
            {latLine && <span style={{ fontSize: 11, opacity: 0.7 }}>{latLine}</span>}
          </div>
          <div style={S.row}>
            <label style={small}>FROM{' '}
              <select aria-label="take starts on bar" data-qa="booth-from" style={sel} disabled={busy} value={region.fromBar} onChange={(e) => setFromBar(+e.target.value)}>
                {Array.from({ length: loopBars }, (_, i) => <option key={i} value={i}>bar {i + 1}</option>)}
              </select>
            </label>
            <label style={small}>LENGTH{' '}
              <select aria-label="take length in bars" data-qa="booth-length" style={sel} disabled={busy} value={region.bars} onChange={(e) => setLenBars(+e.target.value)}>
                {lengths.map((n) => <option key={n} value={n}>{n} bar{n === 1 ? '' : 's'}</option>)}
              </select>
            </label>
            {songMode && songBars > 0
              ? <span style={small}>loops with the song ({songBars} bars)</span>
              : (
                <label style={small}>LOOP{' '}
                  <select aria-label="loop length in bars" data-qa="booth-loop" style={sel} disabled={busy} value={gridLoop} onChange={(e) => setGridLoop(+e.target.value)}>
                    {BOOTH_LOOPS.map((n) => <option key={n} value={n}>{n} bar{n === 1 ? '' : 's'}</option>)}
                  </select>
                </label>
              )}
            <label style={small}>COUNT-IN{' '}
              <select aria-label="count-in bars" data-qa="booth-countin" style={sel} disabled={busy} value={countIn} onChange={(e) => setCountIn(+e.target.value)}>
                {BOOTH_COUNT_INS.map((n) => <option key={n} value={n}>{n === 0 ? 'none' : `${n} bar${n === 1 ? '' : 's'}`}</option>)}
              </select>
            </label>
            {phase === 'waiting' || phase === 'recording'
              ? <button data-qa="booth-stop" style={{ ...S.btn, background: '#ff5c5c', color: '#fff' }} onClick={stop}>■ STOP TAKE</button>
              : <button data-qa="booth-record" style={{ ...S.btn, ...(micOn ? { background: '#ff5c5c', color: '#fff' } : { opacity: 0.5 }) }} disabled={phase !== 'armed'} title={micOn ? undefined : 'ARM the mic first'} onClick={record}>● RECORD</button>}
          </div>
          {!micOn && <div style={{ ...small, marginTop: 6 }}>ARM opens the mic first (the browser asks once), so the take can start exactly on the bar.</div>}
        </>
      ) : <div style={{ ...small, marginTop: 6 }}>Recording takes opens at THE STUDIO — your takes below still play.</div>}

      {groups.length > 0 && (
        <div data-qa="booth-takes" style={{ marginTop: 8, display: 'grid', gap: 6 }}>
          {groups.map((g) => (
            <div key={g.slot} data-qa="take-group" data-slot={g.slot} style={{ padding: 8, borderRadius: 8, background: '#2b1f40' }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                {barsLabel(g.atBar, g.bars).toUpperCase()}{g.takes.length > 1 ? ` · BEST OF ${g.takes.length}` : ''}
              </div>
              {g.takes.map((t) => {
                const i = takes.findIndex((x) => x.id === t.id);
                const isPick = picked.has(t.id);
                const silent = takeSilence(t, { picked: isPick, songMode, songBars, loaded: buffers.has(t.id), missing: missing.has(t.id) });
                const dur = Math.max(0.05, t.durationSec);
                return (
                  <div key={t.id} data-qa="song-take" data-take={t.id} data-picked={isPick ? '1' : '0'} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: 12, minWidth: 120 }}>
                      take {i + 1} · {t.durationSec.toFixed(1)}s · {silent ?? (isPick ? '▶ plays' : '')}
                    </span>
                    {g.takes.length > 1 && !isPick && <button data-qa="take-pick" style={{ ...mini, borderColor: '#ffb347', color: '#ffd75e' }} onClick={() => pick(t, g.takes.length - 1)}>PICK</button>}
                    <button data-qa="take-mute" aria-pressed={t.muted} style={{ ...mini, ...(t.muted ? { background: '#7a5c9e', color: '#fff' } : {}) }} onClick={() => toggleMute(t)}>{t.muted ? 'MUTED' : 'MUTE'}</button>
                    <label style={{ fontSize: 11, display: 'inline-flex', gap: 4, alignItems: 'center' }}>GAIN
                      <input aria-label={`take ${i + 1} gain`} data-qa="take-gain" type="range" min={0} max={2} step={0.01} value={t.gain}
                        onChange={(e) => setDraft(t.id, { gain: +e.target.value })} onPointerUp={() => commit(t.id)} onKeyUp={() => commit(t.id)} onBlur={() => commit(t.id)} style={{ width: 80 }} />
                      <span style={{ width: 34 }}>{toDb(t.gain) <= -90 ? '−∞' : `${toDb(t.gain) >= 0 ? '+' : ''}${toDb(t.gain).toFixed(0)}`} dB</span>
                    </label>
                    <label style={{ fontSize: 11, display: 'inline-flex', gap: 4, alignItems: 'center' }}>IN
                      <input aria-label={`take ${i + 1} trim start`} data-qa="take-trim-start" type="range" min={0} max={dur} step={0.01} value={t.trimStart}
                        onChange={(e) => setDraft(t.id, { trimStart: Math.min(+e.target.value, Math.max(0, dur - t.trimEnd - 0.05)) })} onPointerUp={() => commit(t.id)} onKeyUp={() => commit(t.id)} onBlur={() => commit(t.id)} style={{ width: 70 }} />
                      <span style={{ width: 32 }}>{t.trimStart.toFixed(2)}</span>
                    </label>
                    <label style={{ fontSize: 11, display: 'inline-flex', gap: 4, alignItems: 'center' }}>OUT
                      <input aria-label={`take ${i + 1} trim end`} data-qa="take-trim-end" type="range" min={0} max={dur} step={0.01} value={t.trimEnd}
                        onChange={(e) => setDraft(t.id, { trimEnd: Math.min(+e.target.value, Math.max(0, dur - t.trimStart - 0.05)) })} onPointerUp={() => commit(t.id)} onKeyUp={() => commit(t.id)} onBlur={() => commit(t.id)} style={{ width: 70 }} />
                      <span style={{ width: 32 }}>{t.trimEnd.toFixed(2)}</span>
                    </label>
                    <button aria-label={`remove take ${i + 1}`} data-qa="take-remove" style={{ ...mini, color: '#ffb4a2' }} onClick={() => setConfirmTake(t.id)}>DELETE</button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {/* MUSIC-SUITE P3 FIX PASS: a take is the player's own recording — removing it asks, and UNDO brings it back */}
      {(() => {
        const i = confirmTake ? takes.findIndex((t) => t.id === confirmTake) : -1;
        if (i < 0) return null;
        const t = takes[i];
        return (
          <div data-qa="take-remove-confirm" role="group" aria-label={`Remove take ${i + 1}?`} style={{ ...S.card, border: '1px solid #ffb4a2' }}>
            <span style={{ fontWeight: 700 }}>Remove take {i + 1} ({barsLabel(t.atBar, t.bars)}, {t.durationSec.toFixed(1)} s)?</span>
            <span style={{ fontSize: 12, opacity: 0.8 }}>UNDO brings it back, with its recording.</span>
            <button data-qa="take-remove-yes" style={S.btn} onClick={() => removeTake(t.id)}>REMOVE</button>
            <button style={S.btnAlt} onClick={() => setConfirmTake(null)}>KEEP</button>
          </div>
        );
      })()}
    </div>
  );
}

/** The live input meter: peak level as a bar (−60…0 dBFS), a clip light held for a second. No React render per frame. */
function InputMeter({ micRef }: { micRef: React.MutableRefObject<BoothMic | null> }) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const clipRef = useRef<HTMLSpanElement | null>(null);
  const dbRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    let raf = 0; let clipUntil = 0; let shown = 0;
    const loop = (): void => {
      const mic = micRef.current;
      const peak = mic ? Math.max(mic.level.peak, 0) : 0;
      const held = mic ? mic.takePeak() : 0;
      shown = Math.max(meterFill(peak), shown * 0.9);                       // fast up, eased down
      if (held >= 0.98) clipUntil = performance.now() + 1000;
      if (barRef.current) barRef.current.style.width = `${Math.round(shown * 100)}%`;
      if (clipRef.current) clipRef.current.style.opacity = performance.now() < clipUntil ? '1' : '0.15';
      if (dbRef.current) dbRef.current.textContent = `${toDb(peak).toFixed(0)} dB`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [micRef]);
  return (
    <span data-qa="input-meter" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 120, height: 10, borderRadius: 5, background: '#241736', overflow: 'hidden', display: 'inline-block' }}>
        <div ref={barRef} style={{ height: '100%', width: '0%', background: 'linear-gradient(90deg,#22c55e,#eab308 75%,#ef4444)' }} />
      </span>
      <span ref={dbRef} style={{ fontSize: 11, width: 44, opacity: 0.8 }}>−90 dB</span>
      <span ref={clipRef} title="clip" style={{ fontSize: 10, fontWeight: 800, color: '#ff5c5c', opacity: 0.15 }}>CLIP</span>
    </span>
  );
}
