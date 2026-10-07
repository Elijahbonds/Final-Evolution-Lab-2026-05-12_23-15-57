'use client';

// PROVE IT — a court session on one phone. 1 to 8 athletes, 1 to 5 dunks each
// (3 is the default). The pose model loads only after SET UP THE CAMERA.
// The camera feed stays on this device. A clip can be saved to the phone for a
// server-verified adult only, through the download or share sheet, never uploaded.
// Jump numbers reach the server only when this account is a verified adult who
// opted in, and only that account's own jumps: one AB-04 Prove It record per dunk
// (/api/mirror/prove-it), roster slot 0 only. There is no second session-form save.
// Under 18 and unknown age stay in page memory.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { setReady } from '@/lib/babylon/core/readyMarker';
import { Camera, CameraOff, Pause, Play, RotateCcw, SwitchCamera, Trophy, Volume2, VolumeX } from 'lucide-react';
import { MediaPipePoseAdapter, onVideoFrames, type VideoFrameTick } from '@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';
import { DunkTracker, scoreIrlDunk, refusalLine, type DunkMetrics, type DunkRefusal } from '@/lib/irl/dunkTracker';
import { judgeDunk, type JudgeScore } from '@/lib/babylon/core/JudgePanel';
import { clipWasSaved, downloadBlob } from '@/lib/capture/shareClip';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import {
  DEFAULT_DUNKS, MAX_DUNKS, MAX_PLAYERS, MIN_DUNKS, MIN_PLAYERS, WATCHING_STATUS_MIN_VH,
  readAdults, rosterReady, sealRoster, soloDefaults,
  type Athlete, type ClaimedAge, type RosterRow, type SessionBand,
} from '@/lib/session-setup/roster';
import {
  REARM_MS, REST_PRESETS_MS, TEN_SECONDS_LINE, freshBoard, normalizeRestMs, phaseAfterCountdown, phaseAfterDunk, recordDunk,
  restLabel, restSecondsLeft, tenSecondWarningAt, type Board,
} from '@/lib/session-setup/rotation';
import {
  MUTE_KEY, cuesAfterDunk, goWhenReadyLine, judgeAverage, nextUpLine, readMuted, resultLine, speakCues, writeMuted,
  type Speaker,
} from '@/lib/session-setup/voice';
import { KIDS_IN_SHOT, mayRecord, recordingOnHandoff, saveClipOnDevice } from '@/lib/session-setup/record';
import {
  PLACEMENT_LINES, armAllowed, autoArmReady, dunkFraming, firstAttemptAllowed, newAutoArmGate, shotLight, type FramingLight,
} from '@/lib/session-setup/framing';
import { FpsMeter, errorBandInches } from '@/lib/session-setup/accuracy';
import { endSession, readSession } from '@/lib/session-setup/memory';
import { adultCsv, adultShareText, type SummaryRow } from '@/lib/session-setup/summary';
import { ScanSaveCard } from '@/components/privacy/scan-save-card';
import { naturalSpeaker } from '@/lib/babylon/audio/voice/speakNatural';

const CYAN = '#00E5FF';
const GOLD = '#FFD700';
const GREEN = '#00FF9D';
const PINK = '#FF2D95';
const RED = '#FF3366';

type Stage =
  | 'consent' | 'camera-off' | 'loading-model' | 'prop-phone'
  | 'watching' | 'countdown' | 'paused' | 'final';

interface Attempt { metrics: DunkMetrics; scores: JudgeScore[]; total: number; playerIndex: number }

const CLAIMS: { id: ClaimedAge; label: string }[] = [
  { id: '13-17', label: '13–17' },
  { id: '18+', label: '18+' },
  { id: 'unknown', label: 'Rather not say' },
];

// VOICEOVER (2026-10-06): the device's least robotic voice (was the engine's default), a rendered take where one exists, and every
// spoken line logged as a content gap until it is recorded (lib/babylon/audio/voice/speakNatural.ts).
function browserSpeaker(): Speaker {
  return naturalSpeaker('prove-it', 0.96);
}

export default function ProveIt({
  dobYear = null,
  optedIn: optedInProp = false,
}: {
  /** User.dobYear from the database. Record calls verifiedAdult on this year. */
  dobYear?: number | null;
  /** Verified adult AND the AB-04 opt-in. False until that record exists, so nothing is posted. */
  optedIn?: boolean;
} = {}) {
  const serverVerified = verifiedAdult(dobYear);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const adapterRef = useRef<MediaPipePoseAdapter | null>(null);
  const trackerRef = useRef(new DunkTracker());
  const stopFramesRef = useRef<(() => void) | null>(null);
  const fpsMeterRef = useRef(new FpsMeter());
  const cameraFpsRef = useRef(0);
  const liveRef = useRef(false);
  const genRef = useRef(0);
  const facingRef = useRef<'environment' | 'user'>('environment');
  const rosterRef = useRef<Athlete[]>([]);
  const boardRef = useRef<Board>(freshBoard([], DEFAULT_DUNKS));
  const attemptsRef = useRef<Attempt[][]>([]);
  const pausedRef = useRef(false);
  const mutedRef = useRef(false);
  const framingRef = useRef<FramingLight>('red');
  const speakerRef = useRef<Speaker>(browserSpeaker());
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const remindedRef = useRef(false);
  const saveOnceRef = useRef(false);
  const proveSavesRef = useRef<Promise<boolean>[]>([]);
  const prqRef = useRef(60);
  const levelsRef = useRef<(number | null)[]>([]);
  const attemptedRef = useRef(false);
  const gateRef = useRef(newAutoArmGate());

  const [stage, setStage] = useState<Stage>('consent');
  const [error, setError] = useState<string | null>(null);
  const [prq, setPrq] = useState(60);
  // Solo defaults. The starting age comes from the server's verified-adult answer only (soloDefaults).
  const [rows, setRows] = useState<RosterRow[]>(() => soloDefaults(serverVerified).rows);
  const [levels, setLevels] = useState<string[]>(['']);
  const [dunksEach, setDunksEach] = useState(DEFAULT_DUNKS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [restMs, setRestMs] = useState<number>(REARM_MS);
  const [blockedUnder13, setBlockedUnder13] = useState(false);
  const [roster, setRoster] = useState<Athlete[]>([]);
  const [attempts, setAttempts] = useState<Attempt[][]>([]);
  const [index, setIndex] = useState(0);
  const [current, setCurrent] = useState<Attempt | null>(null);
  const [trackerState, setTrackerState] = useState('idle');
  const [refused, setRefused] = useState<DunkRefusal | null>(null);
  const [muted, setMuted] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [light, setLight] = useState<FramingLight>('red');
  const [framingLine, setFramingLine] = useState('Step into the shot.');
  const [secondsLeft, setSecondsLeft] = useState(REARM_MS / 1000);
  const [recording, setRecording] = useState(false);
  const [remind, setRemind] = useState(false);
  const [saveLine, setSaveLine] = useState('');
  const [savedAdults, setSavedAdults] = useState(0);
  const [pendingClip, setPendingClip] = useState<Blob | null>(null);
  const [clipNote, setClipNote] = useState('');
  const trackerSeen = useRef('');

  prqRef.current = prq;
  mutedRef.current = muted;
  attemptsRef.current = attempts;

  // AB-04: the page reads the opt-in on the server (canSaveScanNumbers) and the
  // birth year (verifiedAdult), so the first paint already shows the right card.
  const serverAdult = serverVerified;
  const [optedIn, setOptedIn] = useState(optedInProp);
  const [saveChecked, setSaveChecked] = useState(optedInProp);
  const saveRef = useRef({ adult: false, optedIn: false, checked: false });
  saveRef.current = { adult: serverAdult, optedIn, checked: saveChecked };

  useEffect(() => {
    fetch('/api/profile').then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (typeof j?.prq === 'number') setPrq(Math.round(j.prq));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const held = readSession();
    if (!held || held.athletes.length === 0) return;
    setRows(held.athletes.map((a) => ({ name: a.name, claimed: a.band })));
    setLevels(held.athletes.map(() => ''));
    if (held.dunksEach != null) setDunksEach(held.dunksEach);
  }, []);

  useEffect(() => {
    if (typeof sessionStorage === 'undefined') return;
    try { setMuted(readMuted(sessionStorage)); } catch { /* private mode */ }
  }, []);

  useEffect(() => {
    try {
      if (typeof localStorage === 'undefined') return;
      setSavedAdults(readAdults(localStorage).length);
    } catch { /* private mode */ }
  }, []);

  useEffect(() => { setReady('dunkduel', 'loaded'); return () => setReady('dunkduel', 'loading'); }, []);
  useEffect(() => {
    if (stage === 'watching' || stage === 'countdown' || stage === 'paused') setReady('dunkduel', 'playing');
    else if (stage === 'final') setReady('dunkduel', 'ended');
  }, [stage]);

  const stopRecorder = useCallback((discard: boolean) => {
    const rec = recRef.current;
    recRef.current = null;
    setRecording(false);
    if (!rec || rec.state === 'inactive') { chunksRef.current = []; return; }
    rec.onstop = () => {
      const parts = chunksRef.current;
      chunksRef.current = [];
      if (discard || parts.length === 0) return;
      const blob = new Blob(parts, { type: parts[0].type || 'video/webm' });
      // Stashed, not auto-saved: navigator.share must run inside a fresh tap, and this fires from
      // the recorder's own async onstop event, not a click. The "Save clip" button below is the tap.
      setPendingClip(blob);
      setClipNote('');
    };
    try { rec.stop(); } catch { chunksRef.current = []; }
  }, []);

  const stopAll = useCallback(() => {
    genRef.current++;
    liveRef.current = false;
    stopFramesRef.current?.();
    stopFramesRef.current = null;
    stopRecorder(true);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    adapterRef.current?.dispose();
    adapterRef.current = null;
    speakerRef.current.cancel();
  }, [stopRecorder]);
  useEffect(() => () => stopAll(), [stopAll]);

  const openCamera = useCallback(async (facingMode: 'environment' | 'user', gen: number) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    if (gen !== genRef.current) { stream.getTracks().forEach((t) => t.stop()); return false; }
    streamRef.current = stream;
    const v = videoRef.current;
    if (!v) { stream.getTracks().forEach((t) => t.stop()); return false; }
    v.srcObject = stream;
    // ask for 60 fps (the assess screen's pattern); a camera that refuses keeps its rate, and the ± band says so
    const track = stream.getVideoTracks?.()?.[0];
    cameraFpsRef.current = track?.getSettings?.().frameRate ?? 0;
    track?.applyConstraints?.({ frameRate: { ideal: 60 } })
      .then(() => { cameraFpsRef.current = track.getSettings?.().frameRate ?? cameraFpsRef.current; })
      .catch(() => { /* keep the camera's own rate */ });
    fpsMeterRef.current = new FpsMeter();
    await v.play();
    return gen === genRef.current;
  }, []);

  const startCamera = useCallback(async () => {
    stopAll();
    const gen = genRef.current;
    const stale = () => gen !== genRef.current;
    setError(null);
    setRemind(false);
    const sealed = sealRoster(rows, serverVerified);
    const athletes = sealed.athletes.length > 0
      ? sealed.athletes
      : [{ id: 'p0', name: rows[0]?.name.trim() || 'Athlete', band: 'unknown' as SessionBand }];
    rosterRef.current = athletes;
    attemptedRef.current = false;
    const dunks = dunksEach;
    boardRef.current = freshBoard(athletes, dunks);
    levelsRef.current = athletes.map((_, i) => {
      const n = Number(levels[i]);
      return Number.isFinite(n) && n >= 1 && n <= 100 ? Math.round(n) : null;
    });
    setRoster(athletes);
    setAttempts(athletes.map(() => []));
    setIndex(0);
    setStage('loading-model');
    try {
      const adapter = new MediaPipePoseAdapter();
      adapterRef.current = adapter;
      await adapter.init();
      if (stale()) { adapter.dispose(); return; }
      const ok = await openCamera(facingRef.current, gen);
      if (!ok || stale()) return;
      setStage('prop-phone');
    } catch (e) {
      if (stale()) return;
      stopAll();
      setError(e instanceof DOMException && e.name === 'NotAllowedError'
        ? 'Camera access was denied. Prove It measures your dunk through the camera — allow it to play.'
        : 'No usable camera on this device. Prove It needs to see you.');
      setStage('camera-off');
    }
  }, [dunksEach, levels, openCamera, rows, serverVerified, stopAll]);

  const flipCamera = useCallback(async () => {
    if (!streamRef.current) return;
    const gen = genRef.current;
    const next = facingRef.current === 'environment' ? 'user' : 'environment';
    facingRef.current = next;
    setFacing(next);
    stopRecorder(true);
    streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackerRef.current.reset();
    try {
      const ok = await openCamera(next, gen);
      if (!ok) return;
      setStage('prop-phone');
    } catch {
      setError('The other camera did not start.');
      setStage('camera-off');
    }
  }, [openCamera, stopRecorder]);

  const onMeasured = useCallback((got: DunkMetrics) => {
    const board = boardRef.current;
    const idx = board.index;
    const athlete = board.players[idx];
    if (!athlete) return;
    const level = levelsRef.current[idx] ?? prqRef.current;
    const s = scoreIrlDunk(got, level);
    const scores = judgeDunk(s.difficulty, s.execution, s.style);
    const total = scores.reduce((sum, j) => sum + j.score, 0);
    const attempt: Attempt = { metrics: got, scores, total, playerIndex: idx };
    // AB-04 Prove It history: only roster slot 0 (the signed-in athlete), only 18+,
    // only with the opt-in on and the box checked. Other athletes on this phone are never saved.
    const gate = saveRef.current;
    if (idx === 0 && athlete.band === '18+' && gate.adult && gate.optedIn && gate.checked) {
      const raw = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}proveit`).replace(/-/g, '');
      const runId = raw.length >= 8 ? raw.slice(0, 40) : `proveit${raw}00000000`.slice(0, 32);
      const saved = fetch('/api/mirror/prove-it', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId,
          verticalCm: got.verticalCm,
          flightTimeMs: got.flightTimeMs,
          takeoff: got.takeoff,
          landingStability: got.landingStability,
          family: got.family,
          judgesScore: total,
        }),
      }).then((r) => r.ok).catch(() => false);
      proveSavesRef.current.push(saved);
    }
    setCurrent(attempt);
    setAttempts((prev) => {
      const next = prev.map((list) => list.slice());
      while (next.length <= idx) next.push([]);
      next[idx] = [...next[idx], attempt];
      return next;
    });
    // Save this jumper's clip only when they may be recorded. The index effect
    // discards anything still rolling when the next athlete is a kid or unknown.
    stopRecorder(!mayRecord(athlete.band, dobYear));
    attemptedRef.current = true;
    const adv = recordDunk(board);
    boardRef.current = adv.board;
    setIndex(adv.board.index);
    // IMPROVE (2026-10-06), the owner's decision: no name is spoken. The result and a recorded "Next up!" are said; the next
    // athlete's name is shown big on the countdown card below (lib/session-setup/voice.ts cuesAfterDunk).
    speakCues(speakerRef.current, cuesAfterDunk(got.verticalCm, judgeAverage(scores.map((j) => j.score)), !!adv.next), mutedRef.current);
    const phase = phaseAfterDunk(pausedRef.current, adv.done);
    setStage(phase === 'paused' ? 'paused' : phase === 'final' ? 'final' : 'countdown');
  }, [dobYear, stopRecorder]);

  const armNext = useCallback((forceRecalibrate: boolean, isRearm: boolean) => {
    if (!armAllowed(framingRef.current, isRearm)) {
      trackerRef.current.reset();
      setStage('prop-phone');
      return;
    }
    if (forceRecalibrate || trackerRef.current.state !== 'ready') trackerRef.current.reset();
    else trackerRef.current.rearm();
    setRefused(null);
    setCurrent(null);
    setStage('watching');
    speakCues(speakerRef.current, [goWhenReadyLine()], mutedRef.current);
  }, []);

  useEffect(() => {
    if (stage !== 'prop-phone') gateRef.current.reset();
    const preview = stage === 'prop-phone' || stage === 'watching' || stage === 'countdown' || stage === 'paused';
    if (!preview) return;
    liveRef.current = true;
    const v0 = videoRef.current;
    if (!v0) return;
    const onTick = (tick: VideoFrameTick) => {
      if (!liveRef.current) return;
      const v = videoRef.current;
      const adapter = adapterRef.current;
      fpsMeterRef.current.push(tick.timestampMs);
      if (v && adapter?.ready) {
        const frame = adapter.detect(v, tick.timestampMs, { frameId: tick.frameId });
        const check = dunkFraming({ landmarks: frame.landmarks, present: frame.present });
        const nextLight = shotLight(check);
        if (nextLight !== framingRef.current) {
          framingRef.current = nextLight;
          setLight(nextLight);
          setFramingLine(check.ok ? 'Framing looks good.' : check.instruction);
        }
        if (stage === 'prop-phone' && attemptedRef.current && !pausedRef.current
          && autoArmReady(gateRef.current, check, performance.now(), true)) {
          liveRef.current = false;
          stopFramesRef.current?.();
          armNext(false, true);
          return;
        }
        if (stage === 'watching') {
          const got = trackerRef.current.feed(frame);
          const st = trackerRef.current.state;
          if (st !== trackerSeen.current) { trackerSeen.current = st; setTrackerState(st); }
          const why = trackerRef.current.takeRefusal();
          if (why) setRefused(why);
          else if (st === 'airborne') setRefused(null);
          if (got) {
            liveRef.current = false;
            stopFramesRef.current?.();
            onMeasured(got);
            return;
          }
        }
      }
    };
    const stop = onVideoFrames(v0, onTick);
    stopFramesRef.current = stop;
    return () => { liveRef.current = false; stop(); };
  }, [armNext, onMeasured, stage]);

  useEffect(() => {
    if (stage !== 'countdown') return;
    const rest = normalizeRestMs(restMs);
    setSecondsLeft(restSecondsLeft(rest, 0));
    const started = Date.now();
    const tick = window.setInterval(() => {
      setSecondsLeft(restSecondsLeft(rest, Date.now() - started));
    }, 200);
    const warnAt = tenSecondWarningAt(rest);
    const warn = warnAt === null ? 0 : window.setTimeout(() => {
      if (!pausedRef.current) speakCues(speakerRef.current, [TEN_SECONDS_LINE], mutedRef.current);
    }, warnAt);
    const done = window.setTimeout(() => {
      if (pausedRef.current) return;
      gateRef.current.reset();
      const phase = phaseAfterCountdown(false, false, armAllowed(framingRef.current, true));
      if (phase === 'watching') armNext(false, true);
      else setStage('prop-phone');
    }, rest);
    return () => { window.clearInterval(tick); window.clearTimeout(done); if (warn) window.clearTimeout(warn); };
  }, [armNext, restMs, stage]);

  useEffect(() => {
    const athlete = roster[index];
    if (!athlete) return;
    const off = recordingOnHandoff(recRef.current != null, athlete.band, dobYear);
    if (!off.recording) stopRecorder(off.discard);
  }, [dobYear, index, roster, stopRecorder]);

  useEffect(() => {
    if (stage !== 'final' || saveOnceRef.current) return;
    saveOnceRef.current = true;
    // AB-04's per-dunk Prove It record is the only save path. This line reports it.
    const pending = proveSavesRef.current.slice();
    if (pending.length === 0) { setSaveLine('Stays on this phone.'); return; }
    void Promise.all(pending).then((oks) => {
      setSaveLine(oks.every(Boolean)
        ? 'Jump numbers saved for this account.'
        : 'Some jump numbers could not be saved. The result stays on this screen.');
    });
  }, [stage]);

  function toggleMute() {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      if (next) speakerRef.current.cancel();
      try {
        if (typeof sessionStorage !== 'undefined') writeMuted(sessionStorage, next);
      } catch { /* private mode */ }
      return next;
    });
  }

  function pauseToggle() {
    pausedRef.current = !pausedRef.current;
    if (pausedRef.current) {
      speakerRef.current.cancel();
      setStage('paused');
    } else {
      setStage('countdown');
    }
  }

  function startRecording() {
    const athlete = roster[index];
    if (!athlete || !mayRecord(athlete.band, dobYear)) return;
    if (!remindedRef.current) { setRemind(true); return; }
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === 'undefined' || recRef.current) return;
    let rec: MediaRecorder;
    try { rec = new MediaRecorder(stream); } catch { return; }
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
    rec.start(200);
    recRef.current = rec;
    setRecording(true);
  }

  /** Called from the "Save clip" tap, so navigator.share runs inside a real user gesture. */
  async function saveClip() {
    const blob = pendingClip;
    if (!blob) return;
    const share = typeof navigator !== 'undefined' && navigator.share ? (data: ShareData) => navigator.share(data) : undefined;
    const canShare = typeof navigator !== 'undefined' && navigator.canShare ? (data: ShareData) => navigator.canShare!(data) : undefined;
    const plan = await saveClipOnDevice(blob, { share, canShare, download: downloadBlob });
    if (!clipWasSaved(plan)) {
      // Cancelled sheet: not a save. Keep the clip pending so the button stays available.
      setClipNote('Save cancelled. Tap Save clip to try again.');
      return;
    }
    setClipNote('Stays on this phone.');
    setPendingClip(null);
  }

  const watching = stage === 'watching';
  const ready = rosterReady(rows, dunksEach) && !blockedUnder13;
  const up = roster[index];
  const showRecord = !!up && mayRecord(up.band, dobYear) && stage !== 'consent' && stage !== 'loading-model' && stage !== 'camera-off';
  const totals = roster.map((_, i) => (attempts[i] ?? []).reduce((s, a) => s + a.total, 0));
  const best = (i: number) => (attempts[i] ?? []).reduce((m, a) => Math.max(m, a.metrics.verticalCm), 0);
  const summaryRows: SummaryRow[] = roster.map((p, i) => ({
    name: p.name,
    band: p.band,
    verticalCm: best(i),
    judges: judgeAverage((attempts[i] ?? []).flatMap((a) => a.scores.map((s) => s.score))),
  }));

  function runItBack() {
    saveOnceRef.current = false;
    proveSavesRef.current = [];
    setSaveLine('');
    setPendingClip(null);
    setClipNote('');
    boardRef.current = freshBoard(rosterRef.current, boardRef.current.dunksEach || dunksEach);
    setAttempts(rosterRef.current.map(() => []));
    setIndex(0);
    setCurrent(null);
    trackerRef.current.reset();
    attemptedRef.current = false;
    setStage('prop-phone');
  }

  async function setProveOptIn(next: boolean) {
    setSaveChecked(next);
    try {
      const res = await fetch('/api/account/scan-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ granted: next }),
      });
      if (!res.ok) { setSaveChecked(false); setOptedIn(false); return; }
      setOptedIn(next);
    } catch {
      setSaveChecked(false);
    }
  }


  const cameraButtons = (
    <>
      <button type="button" onClick={() => void flipCamera()} className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-white/20 px-4 text-base font-bold">
        <SwitchCamera className="h-5 w-5" />
        {facing === 'environment' ? 'Rear camera' : 'Front camera'}
      </button>
      {showRecord && (
        <button type="button" onClick={startRecording} className="inline-flex min-h-12 items-center gap-2 rounded-lg px-4 text-base font-bold text-black" style={{ background: recording ? RED : GREEN }}>
          {recording ? 'Recording' : 'Record'}
        </button>
      )}
    </>
  );

  return (
    <div className="mx-auto max-w-[880px] overflow-x-hidden px-4 py-6 text-base text-white">
      {!watching && (<>
      <div className="flex items-center gap-3">
        <Camera className="h-8 w-8" style={{ color: PINK }} />
        <h1 className="fel-heading text-3xl font-bold">PROVE <span style={{ color: PINK }}>IT</span></h1>
        <button
          type="button"
          onClick={toggleMute}
          aria-pressed={muted}
          className="ml-auto inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-lg border border-white/20 px-4 text-base font-bold"
        >
          {muted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
          {muted ? 'Muted' : 'Mute'}
        </button>
      </div>
      <p className="mt-2 max-w-2xl text-base text-white/70">
        One phone, up to eight athletes. Voice is on. A clip stays on this phone, and only for a verified adult.
        No video is uploaded.
      </p>
      </>)}

      {stage === 'consent' && (
        <div className="mt-4 rounded-xl border border-white/15 bg-white/[0.03] p-4">
          <h2 className="text-xl font-bold">Set the phone</h2>
          <ul className="mt-2 space-y-1 text-base text-white/80">
            {PLACEMENT_LINES.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <svg viewBox="0 0 320 120" className="mt-3 h-28 w-full max-w-md" role="img" aria-label="Phone on its side, athlete side-on, feet and rim in frame">
            <rect x="8" y="36" width="70" height="40" rx="6" fill="#111" stroke="#00E5FF" strokeWidth="3" />
            <text x="18" y="60" fill="#00E5FF" fontSize="14">phone</text>
            <path d="M100 90 L140 40 L160 90" fill="none" stroke="#fff" strokeWidth="3" />
            <circle cx="140" cy="32" r="8" fill="#fff" />
            <rect x="230" y="28" width="70" height="8" fill="#FFD700" />
            <text x="232" y="22" fill="#FFD700" fontSize="14">rim</text>
            <text x="96" y="112" fill="#fff" fontSize="14">side-on, landscape</text>
          </svg>
          {settingsOpen && (<div data-testid="dunk-settings">
          {serverAdult && (
            <div className="mt-3">
              <ScanSaveCard checked={saveChecked} onChange={(next) => { void setProveOptIn(next); }} />
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-white/70">Rest between dunks</span>
            {REST_PRESETS_MS.map((ms) => (
              <button
                key={ms}
                type="button"
                onClick={() => setRestMs(ms)}
                aria-pressed={restMs === ms}
                className="min-h-12 min-w-12 rounded-lg border border-white/20 px-3 text-base font-bold"
                style={{ background: restMs === ms ? GOLD : 'transparent', color: restMs === ms ? '#000' : '#fff' }}
              >
                {restLabel(ms)}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="self-center text-sm text-white/70">Players</span>
            {Array.from({ length: MAX_PLAYERS }, (_, n) => n + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setRows((prev) => {
                    const next = prev.slice(0, n);
                    while (next.length < n) next.push({ name: '', claimed: 'unknown' });
                    return next;
                  });
                  setLevels((prev) => {
                    const next = prev.slice(0, n);
                    while (next.length < n) next.push('');
                    return next;
                  });
                }}
                className="min-h-12 min-w-12 rounded-lg border border-white/20 text-base font-bold"
                style={{ background: rows.length === n ? CYAN : 'transparent', color: rows.length === n ? '#000' : '#fff' }}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-white/70">Dunks each</span>
            {Array.from({ length: MAX_DUNKS }, (_, n) => n + MIN_DUNKS).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDunksEach(n)}
                className="min-h-12 min-w-12 rounded-lg border border-white/20 text-base font-bold"
                style={{ background: dunksEach === n ? PINK : 'transparent', color: dunksEach === n ? '#000' : '#fff' }}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            {rows.map((row, i) => (
              <div key={i} className="rounded-lg border border-white/10 p-3">
                <label className="block text-sm text-white/70" htmlFor={`name-${i}`}>Name or nickname</label>
                <input
                  id={`name-${i}`}
                  value={row.name}
                  onChange={(e) => setRows((prev) => prev.map((r, j) => j === i ? { ...r, name: e.target.value } : r))}
                  className="mt-1 min-h-12 w-full rounded-lg border border-white/20 bg-black px-3 text-base text-white"
                  autoComplete="off"
                  maxLength={40}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {CLAIMS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setBlockedUnder13(false);
                        setRows((prev) => prev.map((r, j) => j === i ? { ...r, claimed: c.id } : r));
                      }}
                      className="min-h-12 rounded-lg border border-white/20 px-3 text-base"
                      style={{ background: row.claimed === c.id ? GREEN : 'transparent', color: row.claimed === c.id ? '#000' : '#fff' }}
                    >
                      {c.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setBlockedUnder13(true)}
                    className="min-h-12 rounded-lg border border-white/20 px-3 text-base text-white/80"
                  >
                    Under 13
                  </button>
                </div>
                {row.claimed === '18+' && !serverVerified && (
                  <p className="mt-2 text-base text-white/70">18+ counts only after this account is verified. Until then this athlete stays in this session only.</p>
                )}
                <label className="mt-2 block text-sm text-white/70" htmlFor={`level-${i}`}>Level, optional. Blank uses {prq}.</label>
                <input
                  id={`level-${i}`}
                  inputMode="numeric"
                  value={levels[i] ?? ''}
                  onChange={(e) => setLevels((prev) => prev.map((v, j) => j === i ? e.target.value : v))}
                  className="mt-1 min-h-12 w-28 rounded-lg border border-white/20 bg-black px-3 text-base text-white"
                />
              </div>
            ))}
          </div>
          {blockedUnder13 && <p className="mt-3 text-base" style={{ color: RED }}>Under 13 can&apos;t be added.</p>}
          {savedAdults > 0 && (
            <button
              type="button"
              className="mt-3 min-h-12 rounded-lg border border-white/20 px-4 text-base"
              onClick={() => {
                try {
                  const saved = readAdults(localStorage);
                  if (saved.length === 0) return;
                  const take = saved.slice(0, MAX_PLAYERS);
                  setRows(take.map((a) => ({ name: a.name, claimed: '18+' as const })));
                  setLevels(take.map(() => ''));
                } catch { /* private mode */ }
              }}
            >
              Add saved adults
            </button>
          )}
          </div>)}
        </div>
      )}

      {roster.length > 0 && stage !== 'consent' && !watching && (
        <div className="mt-4 grid grid-cols-2 gap-2 overflow-x-hidden sm:grid-cols-4">
          {roster.map((p, i) => (
            <div key={p.id} className="rounded-xl border border-white/10 px-3 py-2" style={{ outline: i === index && stage !== 'final' ? `2px solid ${CYAN}` : undefined }}>
              <div className="truncate text-sm text-white/70">{p.name}{i === index && stage !== 'final' ? ' · up' : ''}</div>
              <div className="text-2xl font-black" style={{ color: i % 2 === 0 ? CYAN : PINK }}>{totals[i] ?? 0}</div>
              <div className="text-sm text-white/70">{(attempts[i] ?? []).length}/{boardRef.current.dunksEach || dunksEach} dunks</div>
            </div>
          ))}
        </div>
      )}

      <div
        className={watching
          ? 'fixed inset-0 z-50 overflow-hidden bg-black'
          : 'relative mt-4 aspect-[16/9] w-full overflow-hidden rounded-xl border border-white/10 bg-black'}
        data-testid={watching ? 'dunk-watching' : undefined}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-cover ${stage === 'watching' || stage === 'prop-phone' || stage === 'countdown' || stage === 'paused' ? '' : 'opacity-0'}`}
        />

        {stage === 'consent' && (
          <Gate
            icon={<Camera className="h-8 w-8" style={{ color: CYAN }} />}
            title="READY WHEN YOU ARE"
            body="One tap. The tracker downloads after you start, and it runs on this phone."
            cta="START"
            big
            testId="dunk-start"
            disabled={!ready || rows.length < MIN_PLAYERS}
            onClick={startCamera}
          >
            <button
              type="button"
              data-testid="dunk-settings-toggle"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((v) => !v)}
              className="min-h-12 rounded-lg border border-white/30 px-5 text-base font-bold text-white"
            >
              Settings
            </button>
          </Gate>
        )}
        {stage === 'camera-off' && (
          <Gate
            icon={<CameraOff className="h-8 w-8" style={{ color: RED }} />}
            title="NO CAMERA, NO CONTEST"
            body={error ?? 'Camera unavailable.'}
            cta="TRY AGAIN"
            onClick={startCamera}
          />
        )}
        {stage === 'loading-model' && (
          <Gate icon={<RotateCcw className="h-8 w-8 animate-spin" style={{ color: CYAN }} />} title="LOADING THE TRACKER" body="The pose model downloads once and runs entirely on this device." />
        )}
        {stage === 'prop-phone' && (
          <Gate
            icon={<Camera className="h-8 w-8" style={{ color: light === 'green' ? GREEN : light === 'yellow' ? GOLD : RED }} />}
            title={light === 'green' ? 'FRAMING LOOKS GOOD' : light === 'yellow' ? 'ALMOST' : 'FIX THE SHOT'}
            body={framingLine}
            cta={up ? `${up.name} — start the attempt` : 'START THE ATTEMPT'}
            disabled={!firstAttemptAllowed(light)}
            onClick={() => armNext(true, false)}
          />
        )}
        {watching && (() => {
          const w = trackerState === 'airborne' ? { word: 'UP', color: GOLD }
            : trackerState === 'ready' ? (refused ? { word: 'AGAIN', color: RED } : { word: 'GO', color: GREEN })
            : trackerState === 'settling' ? { word: 'LAND', color: GOLD }
            : { word: 'HOLD', color: CYAN };
          return (
            <>
              <div className="pointer-events-none absolute inset-0" style={{ background: w.color, opacity: 0.3 }} data-testid="dunk-wash" />
              <div
                role="status"
                aria-label={trackerState === 'ready' && refused ? refusalLine(refused) : w.word}
                className="pointer-events-none absolute inset-0 flex items-center justify-center text-center font-black leading-none text-white"
                style={{ fontSize: `${WATCHING_STATUS_MIN_VH}vh`, textShadow: '0 4px 24px rgba(0,0,0,0.8)' }}
                data-testid="dunk-status"
              >
                {w.word}
              </div>
              <button
                type="button"
                onClick={toggleMute}
                aria-pressed={muted}
                data-testid="dunk-corner-mute"
                className="absolute right-3 top-3 z-10 inline-flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-lg border border-white/30 bg-black/60 px-4 text-base font-bold"
              >
                {muted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
                {muted ? 'Muted' : 'Mute'}
              </button>
            </>
          );
        })()}
        {(stage === 'countdown' || stage === 'paused') && current && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-black/80 p-4 text-center">
            <div className="text-xl font-bold" style={{ color: GOLD }}>{current.metrics.family}</div>
            <p className="text-base text-white">
              {resultLine(roster[current.playerIndex]?.name ?? '', current.metrics.verticalCm, judgeAverage(current.scores.map((j) => j.score)), errorBandInches(fpsMeterRef.current.fps || cameraFpsRef.current, current.metrics.verticalCm))}
            </p>
            <p className="text-2xl font-black">{stage === 'paused' ? 'Paused' : `Next up in ${secondsLeft}`}</p>
            {boardRef.current.players[boardRef.current.index] && (
              // IMPROVE (2026-10-06): the name is shown big, not read aloud (the voice says only "Next up!").
              <div role="status" aria-label={nextUpLine(boardRef.current.players[boardRef.current.index].name)} className="flex max-w-full flex-col items-center gap-1" data-testid="next-up-name">
                <span className="text-base font-bold uppercase tracking-widest text-white/80">Next up</span>
                <span className="max-w-full break-words text-5xl font-black leading-tight sm:text-6xl" style={{ color: CYAN }}>
                  {boardRef.current.players[boardRef.current.index].name}
                </span>
              </div>
            )}
            <button type="button" onClick={pauseToggle} className="inline-flex min-h-12 items-center gap-2 rounded-lg px-4 text-base font-bold text-black" style={{ background: GOLD }}>
              {stage === 'paused' ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
              {stage === 'paused' ? 'Resume' : 'Pause'}
            </button>
            {cameraButtons}
          </div>
        )}
        {stage === 'final' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-black/85 p-4 text-center">
            <Trophy className="h-10 w-10" style={{ color: GOLD }} />
            <div className="text-2xl font-black">Session done</div>
            <ul className="w-full max-w-md space-y-1 text-left text-base">
              {roster.map((p, i) => (
                <li key={p.id} className="flex justify-between gap-3">
                  <span className="truncate">{p.name}</span>
                  <span>{Math.round(best(i) / 2.54)} in · {totals[i]}</span>
                </li>
              ))}
            </ul>
            {saveLine && <p className="text-base text-white/80">{saveLine}</p>}
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={runItBack} className="min-h-12 rounded-lg px-4 text-base font-bold text-black" style={{ background: CYAN }}>Run it back</button>
              {serverVerified && summaryRows.some((r) => r.band === '18+') && (
                <button
                  type="button"
                  className="min-h-12 rounded-lg border border-white/20 px-4 text-base font-bold"
                  onClick={() => downloadBlob(new Blob([adultCsv(summaryRows)], { type: 'text/csv' }), 'fel-prove-it.csv')}
                >
                  CSV on this phone
                </button>
              )}
              <button
                type="button"
                className="min-h-12 rounded-lg border border-white/20 px-4 text-base font-bold"
                onClick={() => { endSession(); setRoster([]); setStage('consent'); }}
              >
                End session
              </button>
            </div>
          </div>
        )}
      </div>

      {stage === 'prop-phone' && <div className="mt-3 flex flex-wrap gap-2">{cameraButtons}</div>}
      {!watching && pendingClip && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void saveClip()}
            className="inline-flex min-h-12 items-center gap-2 rounded-lg px-4 text-base font-bold text-black"
            style={{ background: GOLD }}
          >
            Save clip
          </button>
          {clipNote && <p className="text-base text-white/80">{clipNote}</p>}
        </div>
      )}
      {!watching && !pendingClip && clipNote && (
        <p className="mt-3 text-base text-white/80">{clipNote}</p>
      )}
      {!watching && remind && showRecord && (
        <div className="mt-3 rounded-xl border border-white/15 p-4">
          <p className="text-base">{KIDS_IN_SHOT}</p>
          <button
            type="button"
            className="mt-3 min-h-12 rounded-lg px-4 text-base font-bold text-black"
            style={{ background: CYAN }}
            onClick={() => { remindedRef.current = true; setRemind(false); startRecording(); }}
          >
            The shot is clear
          </button>
        </div>
      )}

      {!watching && attempts.some((list) => list.length > 0) && stage !== 'consent' && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {roster.map((p, i) => (
            <div key={p.id} className="rounded-xl border border-white/10 p-3">
              <div className="text-base font-bold" style={{ color: i % 2 === 0 ? CYAN : PINK }}>{p.name}</div>
              {(attempts[i] ?? []).map((a, n) => (
                <div key={n} className="mt-1 flex justify-between gap-2 text-base text-white/80">
                  <span className="truncate">{a.metrics.family} · {a.metrics.verticalCm} cm</span>
                  <b>{a.total}</b>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {stage === 'final' && adultShareText(summaryRows) && (
        <p className="mt-3 text-base text-white/70">{adultShareText(summaryRows)}</p>
      )}
    </div>
  );
}

function Gate(props: {
  icon: React.ReactNode; title: string; body: string; cta?: string; onClick?: () => void; disabled?: boolean;
  big?: boolean; testId?: string; children?: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-black/70 p-6 text-center">
      {props.icon}
      <div className="text-xl font-bold text-white">{props.title}</div>
      <p className="max-w-md text-base leading-relaxed text-white/80">{props.body}</p>
      {props.cta && props.onClick && (
        <button
          type="button"
          onClick={props.onClick}
          disabled={props.disabled}
          data-testid={props.testId}
          className={`mt-2 rounded-lg px-5 font-bold text-black disabled:opacity-40 ${props.big ? 'min-h-16 min-w-48 text-3xl' : 'min-h-12 text-base'}`}
          style={{ background: CYAN }}
        >
          {props.cta}
        </button>
      )}
      {props.children}
    </div>
  );
}
