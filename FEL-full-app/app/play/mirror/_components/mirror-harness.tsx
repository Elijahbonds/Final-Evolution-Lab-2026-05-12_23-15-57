'use client';

// Neuro-Mechanic Mirror (v1) harness.
//
// Wires a live camera <video> to the transparent Babylon overlay and the
// client-side pose/rule pipeline (lib/babylon/nexus/neuro-mirror). Everything
// runs in the browser — the camera stream is never uploaded.
//
// COPY RULE (brief §2.4): all wording here describes ESTIMATED / INFERRED
// engagement from movement, never "measured muscle activation" or clinical
// claims. No biomechanical statistics are fabricated — the only numbers shown
// are the ones the engine actually computes for this session.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, ScanLine, Volume2, VolumeX } from 'lucide-react';
// CODE-SPLIT (2026-09-12). `NeuroMirror` reaches @babylonjs through render/overlay-compositor and
// rig/zone-binding, so importing it here as a VALUE pulled the whole engine into this route's
// first-load bundle: /play/mirror shipped 2.03 MB against ~160 kB for every other /play route,
// which lazy-load Babylon via dynamicImport (see app/play/onevone/_components/loader.tsx).
// The labels and zone tables below are plain data and stay static; the engine loads on demand.
// Pulled from the SOURCE modules, not the barrel. The barrel's own top-level import of
// render/overlay-compositor reaches @babylonjs, so importing even a label through index.ts loads
// the engine — which is why splitting only the NeuroMirror value changed nothing (measured:
// still 2.03 MB). These two modules are plain data and carry no engine.
import { PATTERN_ZONES, ZONE_LABEL } from '@/lib/babylon/nexus/neuro-mirror/patterns/split-stance-press-row';
import { ZONE_STATE_COLOR, ZONE_STATE_LABEL, type ZoneState } from '@/lib/babylon/nexus/neuro-mirror/rules/config';
import type { ZoneId } from '@/lib/babylon/nexus/neuro-mirror/patterns/split-stance-press-row';
import type { MirrorRuntime, SessionSummary } from '@/lib/babylon/nexus/neuro-mirror/render/overlay-compositor';

type MirrorModule = typeof import('@/lib/babylon/nexus/neuro-mirror');
/** Cached so a second session does not re-fetch the chunk. */
let mirrorModPromise: Promise<MirrorModule> | null = null;
const loadMirror = (): Promise<MirrorModule> =>
  (mirrorModPromise ??= import('@/lib/babylon/nexus/neuro-mirror'));
import { DunkTracker, refusalLine, type DunkMetrics } from '@/lib/irl/dunkTracker';
// THE REASON TO COME BACK. DunkTracker has always measured a jump beautifully and then thrown it away when the
// session ended. This keeps the numbers — and only the numbers; the clip never leaves the phone.
import { attemptFrom, progressLine, readProgress, type DunkProgress } from '@/lib/irl/dunkProgress';
import type { PoseFrame } from '@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';
import { RepCounter, type RepState } from '@/lib/babylon/nexus/neuro-mirror/rules/rep-counter';
import type { SquatFault } from '@/lib/babylon/nexus/neuro-mirror/rules/squat-audit';
import { CueEngine, VALGUS_CUE_VERIFIED, cueableFaults, type CueEvent } from '@/lib/babylon/nexus/neuro-mirror/rules/cue-engine';
// MIRROR-COACH P1 (2026-09-25): the guided squat's stage clock is a pure step now (lib/mirror/squatStage.ts) — see
// the onFrame squat branch for why it left the setSquatStage updater.
import {
  DEEPER_LINE, EMPTY_KNEE_RECORD, SQUARE_UP_LINE, SQUAT_BREATH_PACER, SQUAT_CHECK_REPS, SQUAT_FAULT_LABEL, SQUAT_WORK_REPS, squatBreathLine,
  breathElapsedSec, initialSquatSession, kneeReadLine, paintableFaults, squatReviewVerdict, stepKneeRecord, stepSquatSession,
  type KneeRecord, type SquatStage,
} from '@/lib/mirror/squatStage';
// MIRROR-COACH P7 (2026-09-29): the breathe-first stage draws the ONE pacer (lib/breath/pacer.ts, components/breath/
// Pacer.tsx) — the same ring and count as the warm-up's Pressurize, the cool-down's breath and the settle between sets —
// on the stage's own pose clock. It was a CSS loop (app/globals.css .fel-breath) timed from the moment the div mounted,
// beside the pose clock that actually ends the stage, with no count on screen. The 4-2-6 × 3 count is unchanged.
import { BreathPacer } from '@/components/breath/Pacer';
// MIRROR-COACH P2 (2026-09-26): the knee arrows' geometry and the top-left chip are pure modules now, so their tests
// hold what this file paints — the arrows point out from the hip midline, and the Movement Screen's chip names its
// station (it read BREATHE through the whole screen).
import { KNEE_OVERLAY_LINE, kneeArrows, type KneeSides } from '@/lib/mirror/kneeOverlay';
import { SQUAT_THRESHOLDS } from '@/lib/babylon/nexus/neuro-mirror/rules/squat-audit';
import { chipLabel } from '@/lib/mirror/hudChip';
// MIRROR-COACH P4 lane 1 (registry-and-lunge, 2026-09-25): the pattern-audit registry (lib/mirror/patterns.ts) —
// the squat and the lunge tabs read their labels and order from here, entry one and two per the phase brief. LungeAudit
// runs live off the raw pose stream exactly the way the 'jump' pattern's DunkTracker already does (no overlay-compositor
// changes: `pose` is handed to onFrame for every analysis mode already). RepCounter is REUSED for the rep count (the
// phase brief's own words), the same class the press/row pattern already counts by — one instance, reset at the
// left→right hand-over. lungeStage.ts is the pure per-frame step (the same discipline squatStage.ts explains).
import { MIRROR_PATTERNS } from '@/lib/mirror/patterns';
import { LungeAudit, type LungeFault } from '@/lib/mirror/lungeAudit';
import { checkFraming, framingLine } from '@/lib/mirror/framing';
import {
  LUNGE_FAULT_LABEL, LUNGE_REPS_PER_SIDE, initialLungeSession, lungePhaseToMovement,
  lungeSideResult, stepLungeSession, type LungeSessionState, type LungeSide,
} from '@/lib/mirror/lungeStage';
// THE GUIDED MOVEMENT SCREEN. Every one of these was written for this and then never mounted — the runner, the
// reward and the scoring sat in lib/mirror with no importer at all. lib/nav/modules.test.ts is what found them.
import { ScreenRunner, spokenKey, type RunnerState, type StationRecord } from '@/lib/mirror/screenRunner';
import { selfReportReached } from '@/lib/mirror/selfReport';
import {
  NOT_GRADED_LINE, cameraChecksRead, notReadLines, scoreLine, scoreScreen, type ScreenId, type CheckResult, type ScreenResultSummary,
} from '@/lib/mirror/screen';
// MIRROR-COACH P3 (2026-09-26): the screen GRADES now — the runner grades each station over the frames its hold clock ran
// on (lib/mirror/stationGraders.ts) and keeps every grade, unreadable included; the card says what each check read.
import type { StationGrade } from '@/lib/mirror/stationGraders';
import { StationResults } from './station-results';
// MIRROR-COACH P3 (2026-09-25): the breath station's answers (asked after the screen, by tap) and the coach's stations
// named as the coach's — never graded, never scored (lib/mirror/selfReport.ts).
import { ScreenSelfReport } from '@/components/mirror/screen-self-report';
// MIRROR-COACH P3 (2026-09-26): what to work on after the screen — the same flag → FIX line + corrective block mapping the
// coach's draft uses (lib/mirror/screenCorrectives.ts), in plain words, "what the camera saw, not a diagnosis".
import { ScreenNextSteps } from '@/components/mirror/screen-next-steps';
import type { YouthGate } from '@/lib/mirror/screenCorrectives';

/** What the screen panel says when a finished screen was not kept (offline, signed out, a server error). */
const SCREEN_NOT_SAVED = 'Screen finished — it could not be saved, so nothing was paid for it.';
/** A protected line (square-up, deeper) holds ordinary cue speech at most this long, even if the voice never ends. */
const PROTECT_MAX_MS = 6_000;

type Status = 'idle' | 'requesting' | 'loading-model' | 'live' | 'error';
type Pattern = 'pressRow' | 'squat' | 'lunge' | 'jump' | 'screen';
/** The squat and the lunge, in MIRROR_PATTERNS's own order (the registry's entries one and two — MIRROR-COACH P4 lane
 *  1: "the existing squat is registered as the first entry"). Looked up once, not on every render. */
const SQUAT_PATTERN = MIRROR_PATTERNS.find((p) => p.id === 'squat')!;
const LUNGE_PATTERN = MIRROR_PATTERNS.find((p) => p.id === 'lunge')!;
// The guided corrective session: breathe → check → work → review (SquatStage and its rep counts live in
// lib/mirror/squatStage.ts). The Blueprint is emphatic that the breath comes FIRST — the pacer is not a warm-up
// nicety, it is the foundation the book insists on. inhale 4s · hold 2s · exhale 6s, BREATH_CYCLES times.

// (The knee record — worst inward read per side over the frames read square, flagged frames, frames not square — is
// lib/mirror/squatStage.ts KneeRecord / stepKneeRecord since MIRROR-COACH P2, 2026-09-26: it counted display frames here.)

/** Pose skeleton bone pairs (MediaPipe indices) — the visible proof the
 *  tracker is locked on you. */
const BONES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],   // shoulders + arms
  [11, 23], [12, 24], [23, 24],                        // torso
  [23, 25], [25, 27], [24, 26], [26, 28],              // legs
];

/**
 * `youth` (MIRROR-COACH P3 review, 2026-09-26): the athlete's youth gate from their birth year (app/play/mirror/page.tsx
 * youthGateFor) — under 18 or no birth year on file, the screen's written corrective blocks are off (PLAN item 9).
 * Absent → youth rules, the conservative side (decision #20: blank = youth until answered).
 */
export function MirrorHarness({ youth = 'unknownAge' }: { youth?: YouthGate } = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runtimeRef = useRef<MirrorRuntime | null>(null);

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<string>('hold');
  const [frameMs, setFrameMs] = useState<number>(0);
  const [zoneStates, setZoneStates] = useState<Record<ZoneId, ZoneState>>({
    posterior_chain: 'unavailable', lat_rhomboid: 'unavailable', upper_traps: 'unavailable',
    rib_thoracic: 'unavailable', lumbo_pelvic: 'unavailable',
  });
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [pattern, setPattern] = useState<Pattern>('pressRow');
  // the onFrame closure is created once per session — it reads the pattern
  // through a ref so switching patterns never needs a session restart
  const patternRef = useRef<Pattern>('pressRow');
  patternRef.current = pattern;
  const [reps, setReps] = useState<RepState | null>(null);
  const [jumps, setJumps] = useState<DunkMetrics[]>([]);
  const [dunkProgress, setDunkProgress] = useState<DunkProgress | null>(null);
  const [dunkSaid, setDunkSaid] = useState<string>('');
  const [jumpState, setJumpState] = useState('idle');
  const skeletonRef = useRef<HTMLCanvasElement | null>(null);
  const jumpTrackerRef = useRef(new DunkTracker());
  const cueEngineRef = useRef(new CueEngine());
  const [squatStage, setSquatStage] = useState<SquatStage>('breathe');
  // seconds into the breathe stage on the POSE clock (squatStage.ts breathElapsedSec) — what the pacer is drawn at
  const [breathSec, setBreathSec] = useState(0);
  const [squatReps, setSquatReps] = useState(0);
  const [squatFaults, setSquatFaults] = useState<SquatFault[]>([]);
  // Whether the latest squat read saw a body. The four checks said "Estimated stable" with nobody in frame — and
  // before the camera had even started — because "no fault" was all they looked at (MIRROR-COACH P1, 2026-09-25).
  const [squatSeen, setSquatSeen] = useState(false);
  const [squatFindings, setSquatFindings] = useState<SquatFault[]>([]);
  // Each finished work-set rep's faults, for the review's "did it hold" (set once, when the review opens).
  const [squatWorkReps, setSquatWorkReps] = useState<SquatFault[][]>([]);
  const [cue, setCue] = useState<CueEvent | null>(null);
  const [cueLog, setCueLog] = useState<CueEvent[]>([]);
  const [voiceOn, setVoiceOn] = useState(true);
  // The guided squat's session state, stepped once per frame by the pure stepSquatSession; the React state above
  // (squatStage, squatReps, squatFindings) is only its mirror for rendering.
  const squatSessionRef = useRef(initialSquatSession());
  const kneeRecordRef = useRef<KneeRecord>(EMPTY_KNEE_RECORD);
  const [kneeRecord, setKneeRecord] = useState<KneeRecord>(EMPTY_KNEE_RECORD);
  // MIRROR-COACH P2 (2026-09-26): the knee is read only square to the camera (squat-audit.ts squareOn). The latest
  // read's squareness, for the knee row ("Not square · not read"), and whether the one-time square-up line was said.
  const [squatSquare, setSquatSquare] = useState<boolean | null>(null);
  const [squareUpSaid, setSquareUpSaid] = useState(false);
  // MIRROR-COACH P2 review (2026-09-26): the one-time "sit a little deeper" line (squatStage.ts DEEPER_LINE), said on the
  // first shallow descent of a session; after it, shallow reps count and are marked shallow.
  const [deeperSaid, setDeeperSaid] = useState(false);

  // THE LUNGE (MIRROR-COACH P4 lane 1, 2026-09-25, owner decision #9: "lunge — mount"). LungeAudit runs live off the
  // raw pose stream (no analysis mode needed — see the import comment above); lib/mirror/lungeStage.ts is the pure
  // per-frame step (the same discipline as the squat's), and RepCounter is the reused rep book — ONE instance, reset
  // at the left→right hand-over, since the two sides are separate sets. React state below mirrors the session ref
  // for rendering only; lungeSessionRef is what stepLungeSession actually reads and writes.
  const lungeAuditRef = useRef(new LungeAudit());
  const lungeRepCounterRef = useRef(new RepCounter());
  const lungeSessionRef = useRef(initialLungeSession());
  const [lungeSession, setLungeSession] = useState<LungeSessionState>(initialLungeSession());
  const [lungeFaults, setLungeFaults] = useState<LungeFault[]>([]);
  const [lungeSeen, setLungeSeen] = useState(false);
  const [lungeFramedRight, setLungeFramedRight] = useState<boolean | null>(null);
  // MIRROR-COACH P4 fix (2026-09-29): this used to be its own flat, never-reset-per-side boolean, so the one-time
  // "turn side-on" line said during the LEFT side's set stayed lit through the whole RIGHT side and into review even
  // when the athlete squared up perfectly for the second leg. lungeSessionRef's own `turnPromptSaid: Record<LungeSide,
  // boolean>` (lungeStage.ts) already tracks this correctly PER SIDE — the banner below now reads that directly
  // instead of keeping a second, side-blind copy of the same fact.

  // The screen runs as a state machine over the same pose stream; nothing here decides anything itself.
  const runnerRef = useRef<ScreenRunner | null>(null);
  const [screenId, setScreenId] = useState<ScreenId>('modified');
  // start() is created once ([] deps) and must read the picker's CURRENT value, not the one it closed over — the
  // same reason the pattern is read through patternRef (MIRROR-COACH P1, 2026-09-25: it read the first value, so
  // every runner was 'modified' whatever the picker said).
  const screenIdRef = useRef<ScreenId>('modified');
  screenIdRef.current = screenId;
  const [runner, setRunner] = useState<RunnerState | null>(null);
  const [screenSummary, setScreenSummary] = useState<ScreenResultSummary | null>(null);
  const [screenMessage, setScreenMessage] = useState<string>('');
  /** The id the finished screen was SAVED under (the answers card PATCHes it); 'unsaved' when the save failed. */
  const [savedScreenId, setSavedScreenId] = useState<string | null | 'unsaved'>(null);
  /**
   * What End posted (ScreenRunner.readSoFar): the cards below are drawn from THIS after End, not from the last runner
   * state (MIRROR-COACH P3 follow-up review, 2026-09-28) — runner.grades holds only FINISHED stations, so End during a
   * pending retest posted a hip flag the panel headlined while "What to work on" said nothing was flagged.
   */
  const [endedWith, setEndedWith] = useState<{ grades: StationGrade[]; stations: StationRecord[] } | null>(null);
  const lastSaidRef = useRef('');
  const screenSentRef = useRef(false);
  const voiceRef = useRef(true);
  voiceRef.current = voiceOn;

  // MIRROR-COACH P2 review (2026-09-26): a PROTECTED line (the one-time square-up and deeper lines) is not cut off. speak()
  // cancels whatever is playing before each utterance, so the first work-set cue after the check cut SQUARE_UP_LINE off
  // mid-word; while a protected line plays, an ordinary cue is not spoken (it is still shown on screen). The guard clears
  // when the line ends, errors, or after PROTECT_MAX_MS — a voice that never fires onend cannot mute the coach for good.
  const protectedUntilRef = useRef(0);
  const speak = useCallback((text: string, opts: { protect?: boolean } = {}) => {
    if (!voiceRef.current || typeof speechSynthesis === 'undefined') return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!opts.protect && now < protectedUntilRef.current) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.96; u.pitch = 0.9;
    if (opts.protect) {
      protectedUntilRef.current = now + PROTECT_MAX_MS;
      u.onend = u.onerror = () => { protectedUntilRef.current = 0; };
    }
    speechSynthesis.speak(u);
  }, []);

  /** Paint the user's skeleton on the 2D canvas — every frame, outside
   *  React state (a setState per pose frame would thrash). When a knee fault
   *  the coach may speak about is active, paint the correction: arrows pushing
   *  each knee OUT, away from the body's midline.
   *
   *  MIRROR-COACH P1 (2026-09-25): this used to paint "MY BAND PULLS IN — YOU
   *  PUSH OUT" with arrows drawn from a fixed per-index direction. There is no
   *  band, and the knee fault behind it was inverted (it fired on knees already
   *  OUT). The overlay now takes only cueable faults — so it stays dark while
   *  VALGUS_CUE_VERIFIED is false — names the action, and points each arrow
   *  away from the midpoint of the hips, whichever side of the image a leg is on.
   *  MIRROR-COACH P2 (2026-09-26): the knee cue is on, so the arrows paint; their
   *  geometry is lib/mirror/kneeOverlay.ts kneeArrows, which its test holds. */
  const paintSkeleton = useCallback((pose: PoseFrame, ph: string, faults: readonly SquatFault[] = [], valgusBySide?: { left: number; right: number }) => {
    const c = skeletonRef.current;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    if (c.width !== c.clientWidth || c.height !== c.clientHeight) {
      c.width = c.clientWidth; c.height = c.clientHeight;
    }
    g.clearRect(0, 0, c.width, c.height);
    if (!pose.present || !pose.landmarks.length) return;
    const W = c.width, H = c.height;
    const color = ph === 'pull' ? '#00E5FF' : ph === 'press' ? '#FFD700' : 'rgba(255,255,255,0.75)';
    g.strokeStyle = color;
    g.lineWidth = 2.5;
    g.lineCap = 'round';
    for (const [a, b] of BONES) {
      const pa = pose.landmarks[a], pb = pose.landmarks[b];
      if (!pa || !pb || pa.visibility < 0.5 || pb.visibility < 0.5) continue;
      g.beginPath();
      g.moveTo(pa.x * W, pa.y * H);
      g.lineTo(pb.x * W, pb.y * H);
      g.stroke();
    }
    // joints pop on top
    g.fillStyle = color;
    for (const idx of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
      const p = pose.landmarks[idx];
      if (!p || p.visibility < 0.5) continue;
      g.beginPath();
      g.arc(p.x * W, p.y * H, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    // the knee correction — only when the caller passed a CUEABLE knee fault (cueableFaults), so never while unverified,
    // and the audit raises that fault only on a body square to the camera (squat-audit.ts squareOn)
    if (VALGUS_CUE_VERIFIED && faults.includes('kneeValgus')) {
      // MIRROR-COACH P4 review (2026-09-25): paint only the side(s) actually over the warn line. The whole-frame
      // fault above only says "some knee is caving" — painting both arrows for a ONE-SIDED cave told the clean leg
      // to press out too, when there was nothing wrong with it (kneeOverlay.ts's own `sides` filter is new for this).
      const sides: KneeSides | undefined = valgusBySide
        ? { left: valgusBySide.left >= SQUAT_THRESHOLDS.valgusWarn, right: valgusBySide.right >= SQUAT_THRESHOLDS.valgusWarn }
        : undefined;
      const arrows = kneeArrows(pose.landmarks, W, H, sides);
      for (const a of arrows) {
        g.strokeStyle = '#FF3366';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(a.tail.x, a.tail.y);
        g.lineTo(a.tip.x, a.tip.y);
        g.lineTo(a.barbs[0].x, a.barbs[0].y);
        g.moveTo(a.tip.x, a.tip.y);
        g.lineTo(a.barbs[1].x, a.barbs[1].y);
        g.stroke();
      }
      if (arrows.length) {
        g.fillStyle = '#FF3366';
        g.font = 'bold 11px monospace';
        g.textAlign = 'center';
        // top centre, clear of the chips: at H − 18 (P1) it sat under the stage's button bar — the P2 live frame
        // (p2/live-proof/arrows), the first time the line was ever painted, shows it unreadable there
        g.fillText(KNEE_OVERLAY_LINE, W / 2, 30);
      }
    }
  }, []);

  const stop = useCallback(() => {
    runtimeRef.current?.dispose();
    runtimeRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => { stop(); }, [stop]);

  // (The check → work → review hand-overs used to run here, in an effect one render after the rep that earned them.
  // They are part of stepSquatSession now, on the frame the rep lands.)

  const start = useCallback(async () => {
    // A fresh runner per session, so a second screen is a second screen rather than a resumed one.
    if (patternRef.current === 'screen') {
      runnerRef.current = new ScreenRunner(screenIdRef.current);
      screenSentRef.current = false;
      lastSaidRef.current = '';
      setRunner(null); setScreenSummary(null); setScreenMessage(''); setSavedScreenId(null); setEndedWith(null);
    }
    setError('');
    setJumps([]);
    setReps(null);
    jumpTrackerRef.current.reset();
    cueEngineRef.current.reset();
    setSquatStage('breathe');
    setBreathSec(0);
    setSquatReps(0);
    setSquatFaults([]);
    setSquatSeen(false);
    setSquatFindings([]);
    setSquatWorkReps([]);
    setCue(null);
    setCueLog([]);
    squatSessionRef.current = initialSquatSession();
    kneeRecordRef.current = EMPTY_KNEE_RECORD;
    setKneeRecord(EMPTY_KNEE_RECORD);
    setSquatSquare(null);
    setSquareUpSaid(false);
    setDeeperSaid(false);
    lungeAuditRef.current.reset();
    lungeRepCounterRef.current = new RepCounter();
    lungeSessionRef.current = initialLungeSession();
    setLungeSession(initialLungeSession());
    setLungeFaults([]);
    setLungeSeen(false);
    setLungeFramedRight(null);
    protectedUntilRef.current = 0;
    setSummary(null);
    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // front camera preferred for form work, but as an IDEAL: a hard
        // 'user' constraint rejects devices that don't declare facing modes
        // at all (measured: some webcams/fake devices refuse and the session
        // never starts)
        video: { facingMode: { ideal: 'user' }, width: { ideal: 960 }, height: { ideal: 720 } }, audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      // the graders take lengths and angles in pixels, so they need the frame's shape (MediaPipe reads the raw frame; the
      // stage's object-cover crop is display only)
      if (v.videoWidth > 0 && v.videoHeight > 0) runnerRef.current?.setAspect(v.videoWidth / v.videoHeight);

      setStatus('loading-model');
      const { NeuroMirror } = await loadMirror();
      const runtime = await NeuroMirror.session({
        video: v,
        overlayCanvas: canvasRef.current!,
        analysis: patternRef.current === 'squat' ? 'squat' : 'zones',
        onReady: () => setStatus('live'),
        onFrame: ({ phase: p, frameMs: fm, zones, reps: r, pose, squat }) => {
          setPhase(p);
          setFrameMs(fm);
          setZoneStates(zones);
          setReps(r);
          // THE GUIDED SCREEN. The runner owns the protocol: it says the turn, holds the clock only while the
          // shot is good, and pauses rather than fails when somebody steps out to move a chair.
          if (patternRef.current === 'screen' && runnerRef.current) {
            // MIRROR-COACH P3 (2026-09-26): the whole pose frame — the graders read z and visibility, and a frame the hold
            // clock runs on is kept for the station's grade (one per camera frame: render/pose-frame-gate.ts)
            // P3 review (2026-09-26): the camera's shape re-read every frame — it was read once after play(), so a phone
            // turned between portrait and landscape after Start graded every length at the wrong aspect (a 2.5 cm shoulder
            // raise read as a flag). The runner stamps it on each frame it keeps; a station held across a turn reads
            // 'cameraMoved' (lib/mirror/stationGraders.ts).
            if (v.videoWidth > 0 && v.videoHeight > 0) runnerRef.current.setAspect(v.videoWidth / v.videoHeight);
            const st = runnerRef.current.tick(pose, pose.timestampMs);
            setRunner(st);
            paintSkeleton(pose, p);
            // Said once per change, because the athlete is across the room and cannot read the phone — and
            // because repeating a cue every frame would be unusable. MIRROR-COACH P3 follow-up (2026-09-28): a change is
            // the line OR the runner's reminder count (spokenKey) — the turn line is said again at spaced intervals while
            // the view is wrong (STATION_THRESHOLDS.wrongView), where it used to be said once and never again.
            if (st.say && spokenKey(st) !== lastSaidRef.current) {
              lastSaidRef.current = spokenKey(st);
              // MIRROR-COACH P3 (2026-09-26): the retest line is PROTECTED (P2's mechanism, PROTECT_MAX_MS): it runs up to
              // ~7 s and the station cue comes back after RETEST_PAUSE_MS, which cancelled it mid-sentence in the live proof
              // — the "why" and the "what to change" are the half that got cut. The cue is still shown on the stage.
              speak(st.say, { protect: st.phase === 'retest' });
            }
          }

          // the vertical-jump pattern runs the Prove It tracker on the same
          // stream — floor calibration, flight time, landing
          if (patternRef.current === 'jump') {
            const got = jumpTrackerRef.current.feed(pose);
            setJumpState(jumpTrackerRef.current.state);
            if (got) {
              setJumps((prev) => [...prev, got]);
              void recordDunk(got);
              jumpTrackerRef.current.reset();
            }
            // a jump the route would refuse is refused here first, and said, rather than shown and then dropped
            const why = jumpTrackerRef.current.takeRefusal();
            if (why) { const line = refusalLine(why); setDunkSaid(line); speak(line); }
          }
          // the corrective squat: the guided session breathes, checks, works
          //
          // MIRROR-COACH P1 (2026-09-25). This used to run inside a setSquatStage((stage) => …) updater that counted
          // the rep (setSquatReps), asked the stateful CueEngine for a cue and spoke it. Updaters must be pure: React
          // may call one twice (StrictMode does) and keep one answer, so one squat could count twice and a cue could
          // fire — and escalate — twice. Now the transition is the pure stepSquatSession, called ONCE per frame here,
          // and its effects are applied once, below, outside any updater (lib/mirror/squatStage.test.ts runs the same
          // transition twice to hold that).
          //
          // MIRROR-COACH P2 (2026-09-26): this runs once per CAMERA frame now — the compositor hands on only frames whose
          // timestamp advanced (render/pose-frame-gate.ts), and stepSquatSession / stepKneeRecord ignore a repeat as
          // well. It used to run on every display frame, and a repeated frame counted a rep (P1 live proof: 11 reps
          // inside one squat). The knee's squareness reaches the session too: a body turned from the camera, or a few
          // degrees off square, is "not square — not read" (squat-audit.ts squareOn).
          if (patternRef.current === 'squat' && squat) {
            const now = pose.timestampMs;
            setSquatFaults(squat.faults);
            setSquatSeen(squat.present);
            if (squat.present && squat.phase !== 'standing' && squat.square !== undefined) setSquatSquare(squat.square);
            const was = squatSessionRef.current.stage;
            // the painter gets only what the coach may cue — an unverified knee read is never painted as a correction —
            // and only in the WORK set, where the voice cues too (MIRROR-COACH P2 review, 2026-09-26): painted during the
            // breath and the movement check, "KNEES OUT" corrected the athlete during the very measurement the review's
            // "did the correction hold" is judged against, while the voice stayed silent by design (squatStage.ts)
            paintSkeleton(pose, p, paintableFaults(was, cueableFaults(squat.faults)), squat.valgusBySide);
            const step = stepSquatSession(squatSessionRef.current, {
              nowMs: now, phase: squat.phase, present: squat.present, faults: squat.faults, square: squat.square, hipDrop: squat.hipDrop,
            });
            squatSessionRef.current = step.state;
            // the pacer rides the same pose clock the step ends the breath on (MIRROR-COACH P7)
            if (step.state.stage === 'breathe') setBreathSec(breathElapsedSec(step.state, now));
            // the knee read over the check and the work set, per POSE frame, square frames only (kept in memory for
            // this session's review — nothing is sent or saved)
            kneeRecordRef.current = stepKneeRecord(kneeRecordRef.current, was, squat, now);
            if (step.repCounted || step.stageChanged) setSquatReps(step.state.reps);
            if (step.findingsChanged) setSquatFindings(step.state.findings);
            if (step.stageChanged) {
              setSquatStage(step.state.stage);
              if (step.state.stage === 'review') {
                setKneeRecord(kneeRecordRef.current);
                setSquatWorkReps(step.state.workReps);
                if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
              }
            }
            // a whole stage read off square: said ONCE a session, as the stage ends — never looped
            if (step.squareUp) {
              setSquareUpSaid(true);
              speak(SQUARE_UP_LINE, { protect: true });
            }
            // the first shallow descent of the session: say it once, then shallow reps count, marked (squatStage.ts)
            if (step.deeperPrompt) {
              setDeeperSaid(true);
              speak(DEEPER_LINE, { protect: true });
            }
            if (step.cueFaults) {
              const evt = cueEngineRef.current.decide(now, step.cueFaults);
              if (evt) {
                setCue(evt);
                setCueLog((l) => [...l, evt]);
                speak(evt.text);
              }
            }
          } else if (patternRef.current === 'lunge') {
            // THE LUNGE (MIRROR-COACH P4 lane 1, owner decision #9). No live cue voice or knee overlay here (not asked
            // for — the squat's is a whole coaching-escalation subsystem this phase does not extend); the skeleton
            // paints plain, and the per-side rep count, faults and the review card come off lungeSessionRef below.
            const now = pose.timestampMs;
            paintSkeleton(pose, p);
            const lungeRead = lungeAuditRef.current.evaluate({ landmarks: pose.landmarks, timestampMs: now, present: pose.present });
            setLungeFaults(lungeRead.faults);
            setLungeSeen(lungeRead.present);
            // VIEW AWARENESS (baseline F5): lib/mirror/framing.ts's own front-view test, reused rather than
            // re-derived — the same check lib/mirror/lungeAudit.ts's auditLunge uses for the batch contract.
            // framing.ts's own FramingPoint never reads z, so present + landmarks is genuinely everything it takes.
            const framingFrame = { present: pose.present, landmarks: pose.landmarks };
            const framing = checkFraming(framingFrame, 'front');
            setLungeFramedRight(framing.ok);
            if (lungeSessionRef.current.stage !== 'review') {
              const repInfo = lungeRepCounterRef.current.feed(lungePhaseToMovement(lungeRead.phase), now);
              const step = stepLungeSession(lungeSessionRef.current, {
                nowMs: now, present: lungeRead.present, framedRight: framing.ok, phase: lungeRead.phase,
                faults: lungeRead.faults, repCompleted: !!repInfo,
              });
              lungeSessionRef.current = step.state;
              if (step.repCounted || step.stageChanged || step.findingsChanged) setLungeSession(step.state);
              // the left→right hand-over (and review) gets a FRESH rep counter: the two sides are separate sets
              if (step.stageChanged) lungeRepCounterRef.current = new RepCounter();
              // the turn line is said ONCE per side, never looped (P1's lesson — see lungeStage.ts); the banner
              // itself reads lungeSession.turnPromptSaid[stage] directly, so no separate "said" flag is kept here
              if (step.turnPrompt) {
                speak(framingLine('turned'), { protect: true });
              }
            }
          } else {
            paintSkeleton(pose, p);
          }
        },
      });
      runtimeRef.current = runtime;
    } catch (e: any) {
      console.error('[FEL-MIRROR] start failed', e);
      // Honest errors: a denied camera, a missing camera, and a dead 3D
      // overlay are three different problems (measured: a WebGL-less
      // environment hit the overlay path and the page blamed the camera).
      setError(
        e?.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access and try again.'
          : e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError' || e?.name === 'NotReadableError'
            ? 'Camera unavailable in this browser/environment.'
            : 'The coaching overlay failed to start (3D renderer). Try a WebGL-capable browser.');
      setStatus('error');
    }
  }, []);

  // What End does to the camera and the press/row zone summary. endSession (below submitScreen) wraps it: End also posts
  // the screen read so far — MIRROR-COACH P3 follow-up, 2026-09-28.
  const endZoneSession = useCallback(() => {
    const rt = runtimeRef.current;
    // the module is necessarily loaded by now (a runtime only exists after session() resolved),
    // but this stays async-safe rather than assuming it
    if (rt) void loadMirror().then((m) => {
      const s = m.NeuroMirror.sessionSummary(rt);
      setSummary(s);
      // PERSIST IT (2026-09-12). This summary — reps, tempo, per-zone time-in-stable and fault
      // counts — was computed on every session and then discarded when the tab closed, so the
      // Mirror could never show whether anyone was improving. Saving is best-effort and silent:
      // a failed write must never interrupt the end of a workout.
      void fetch('/api/mirror/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          patternId: s.patternId,
          startedAtMs: s.startedAtMs,
          durationMs: s.durationMs,
          reps: s.reps,
          avgTempoMs: s.avgTempo ?? null,
          avgFrameMs: s.avgFrameMs,
          timeInStableMs: s.timeInStableMs,
          faultCounts: s.faultCounts,
        }),
      }).catch(() => { /* offline or signed out: the session still showed on screen */ });
    });
    stop();
    setStatus('idle');
  }, [stop]);

  const secs = (ms: number) => (ms / 1000).toFixed(1);

  /**
   * Keep a measured jump. Numbers only — the clip is never uploaded, which is the promise the schema has carried
   * since M17 and the one the owner chose to keep.
   *
   * A refusal is not an error worth interrupting a session for: an implausible measurement (the tracker losing
   * the feet and reporting a three-metre vertical) is REFUSED by the route rather than stored, and the athlete
   * simply does not see a new number for that one.
   */
  const recordDunk = useCallback(async (m: DunkMetrics) => {
    const attempt = attemptFrom(m);
    try {
      const res = await fetch('/api/mirror/dunks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(attempt),
      });
      if (!res.ok) return;
      const j = await res.json().catch(() => null);
      if (!j?.progress) return;
      setDunkProgress(j.progress);
      const line = progressLine(j.progress, attempt);
      setDunkSaid(line);
      speak(line);
    } catch {
      // Offline in a gym is the normal case, not a failure state. The jump still showed on screen.
      const local = readProgress([attempt]);
      setDunkSaid(progressLine(local, attempt));
    }
  }, [speak]);

  // The history, so the screen opens on what there is to beat rather than on nothing.
  useEffect(() => {
    if (pattern !== 'jump') return;
    let live = true;
    fetch('/api/mirror/dunks')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j?.progress) setDunkProgress(j.progress); })
      .catch(() => {});
    return () => { live = false; };
  }, [pattern]);

  /**
   * A finished screen goes to the server, which recomputes the score and decides the payout. A screen the
   * camera could not grade pays nothing — the reward is for the measurement, not for standing near a phone.
   *
   * MIRROR-COACH P1 (2026-09-25). `ran` is the variant the RUNNER walked, not the picker's value: the two disagreed
   * (the runner was always built 'modified'), so a "Full" screen was stored over modified stations. And nothing is
   * marked `provisional` here any more: that used to be `results.length === 0`, which is "no grader exists yet", not
   * "the shot was bad" — it earned the athlete a step-back-and-retry message for a grader that is not there. An
   * ungraded screen is decided by the server from its zero results (NOT_GRADED_LINE); provisional is left for a
   * grader that reports low confidence, when one exists.
   */
  // MIRROR-COACH P3 (2026-09-26): the grades ride with the results — every camera check's summary numbers, unreadable
  // included — so the server can re-decide each one against the same table (lib/mirror/stationGraders.ts
  // regradeFromSummary) instead of taking the client's pass/flag on trust.
  // MIRROR-COACH P3 follow-up review (2026-09-28): `ended` marks what End posts — kept and scored, and not paid unless every
  // camera station was attempted (lib/mirror/screenReward.ts ENDED_EARLY_LINE, until the owner decides).
  const submitScreen = useCallback(async (results: CheckResult[], ran: ScreenId, grades: StationGrade[] = [], opts: { ended?: boolean } = {}) => {
    if (screenSentRef.current) return;
    screenSentRef.current = true;
    // shown immediately; the server's is authoritative. attempted: the camera sent grades — a screen it read none of says
    // so (NOT_READ_LINE), not "not graded yet" (P3 review)
    setScreenSummary(scoreScreen(ran, results, { attempted: grades.length > 0 }));
    try {
      const res = await fetch('/api/mirror/screen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          // A uuid, because this file is forbidden randomness on purpose — scripts/mirror-v2-tests.ts asserts
          // "no fabricated jump numbers in the harness", which is what stops an invented figure ever being
          // shown to an athlete as a measurement. An id is not a measurement, and crypto.randomUUID says so
          // without tripping a guard that is worth more than the convenience of the shorter call.
          screenId: crypto.randomUUID(),
          screen: ran,
          results,
          ...(opts.ended ? { ended: true } : {}),
          grades,
        }),
      });
      // A refused post (signed out, a server error) is not saved either, and says so like a network failure does
      // (MIRROR-COACH P1 review, 2026-09-25: it said nothing, and the ungraded panel hid even the network line).
      // MIRROR-COACH P3 (2026-09-25): a screen the server refused to check (422) says the server's own line.
      if (!res.ok) {
        const refusal = res.status === 422 ? await res.json().then((x: { message?: unknown }) => x?.message).catch(() => null) : null;
        setScreenMessage(typeof refusal === 'string' && refusal ? refusal : SCREEN_NOT_SAVED);
        setSavedScreenId('unsaved');
        return;
      }
      const j = await res.json().catch(() => null);
      if (j?.summary) setScreenSummary(j.summary);
      if (j?.message) setScreenMessage(j.message);
      if (j?.message) speak(j.message);
      setSavedScreenId(typeof j?.screenId === 'string' && j.screenId ? j.screenId : 'unsaved');
    } catch {
      setScreenMessage(SCREEN_NOT_SAVED);
      setSavedScreenId('unsaved');
    }
  }, [speak]);

  // The screen ends itself. Nothing else in the Mirror does, which is the point of a protocol.
  //
  // MIRROR-COACH P2 (2026-09-26): …and now it lets go of the camera when it does. A finished screen used to leave the
  // camera stream, the pose model and the render loop running — the LIVE chip on, the camera light on, the runner
  // ticking over a complete screen — until somebody found "End session" (P1 report, "Minor"). The results are already
  // posted by then; stop() is what End session does to the camera, without End session's press/row zone summary, which
  // says nothing about a screen.
  useEffect(() => {
    if (pattern !== 'screen' || runner?.phase !== 'complete') return;
    void submitScreen(runner.results, runner.screen, runner.grades);
    if (runtimeRef.current || streamRef.current) {
      stop();
      setStatus('idle');
    }
  }, [pattern, runner, submitScreen, stop]);

  // END POSTS WHAT WAS READ (MIRROR-COACH P3 follow-up, 2026-09-28). The screen was posted only at 'complete', so End —
  // the only way out of a station that never started (the P3 live proof's row 5) — threw away every station already
  // read. Now End posts the runner's readSoFar(): the finished stations' grades, and a station waiting on its retest with
  // its first run's grades, through the same submitScreen (the server regrades, scores what was read, and decides pay by
  // the unchanged bar). A screen that never finished a station has no grade to post, and is not stored as a run.
  // Its review (2026-09-28): the post is marked `ended`, and the cards are drawn from what was posted (endedWith).
  const endSession = useCallback(() => {
    if (patternRef.current === 'screen' && runnerRef.current && !screenSentRef.current) {
      const soFar = runnerRef.current.readSoFar();
      if (soFar.grades.length) {
        setEndedWith({ grades: soFar.grades, stations: soFar.stations });
        void submitScreen(soFar.results, soFar.screen, soFar.grades, { ended: true });
      }
    }
    endZoneSession();
  }, [endZoneSession, submitScreen]);

  /** The short label on the control, beside the full one it is announced by. A ternary here silently labelled
   *  the new pattern "Jump" — a map cannot, because TypeScript makes it name every case. */
  const PATTERN_SHORT: Record<Pattern, string> = {
    pressRow: 'Press / Row',
    squat: 'Squat',
    lunge: 'Lunge',
    jump: 'Jump',
    screen: 'Screen',
  };

  // MIRROR-COACH P4 lane 1: the squat and the lunge read their full title straight from MIRROR_PATTERNS (the
  // registry's own label, entry one and two) — pressRow/jump/screen are not pattern-audit entries and keep their own.
  const PATTERN_TITLE: Record<Pattern, string> = {
    pressRow: 'Split-Stance Press / Row',
    squat: SQUAT_PATTERN.label,
    lunge: LUNGE_PATTERN.label,
    jump: 'Vertical Jump',
    screen: 'Movement Screen',
  };
  const live = status === 'live';
  // ms/frame is an engineering number. It belongs to whoever is tuning the pipeline, not to an athlete standing
  // in their front room trying to squat, so it shows in development and stays out of the way in a shipped build.
  const showFrameBudget = process.env.NODE_ENV !== 'production';

  return (
    <div className="relative min-h-screen bg-[#050505] text-white">
      {/* One wash of colour behind the stage, so the page has a light source instead of being a flat black sheet. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{ background: 'radial-gradient(120% 90% at 50% 0%, rgba(0,229,255,0.10) 0%, transparent 70%)' }}
      />

      <div className="relative mx-auto max-w-[1180px] px-4 pb-16 pt-4">
        {/* THE WAY OUT. This route sits under /play/, where the app shell hides itself so a running mode owns the
            screen — correct for a game, wrong for a tool, and it left the Mirror with no way back at all. A camera
            surface should not carry a navigation bar anyway; it should carry one explicit exit. */}
        <header className="mb-5 flex items-center gap-3">
          <Link
            href="/train"
            aria-label="Back to Train"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.03]
                       text-white/55 transition-colors hover:border-white/25 hover:text-white"
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </Link>
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#00E5FF]">The Mirror</p>
            <h1 className="fel-heading truncate text-[22px] font-black leading-none tracking-tight text-white md:text-[26px]">
              {PATTERN_TITLE[pattern]}
            </h1>
          </div>
          <span
            className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 font-mono
                       text-[10px] font-bold uppercase tracking-[0.14em]"
            style={{
              borderColor: live ? 'rgba(0,255,157,0.35)' : 'rgba(255,255,255,0.12)',
              color: live ? '#00FF9D' : 'rgba(255,255,255,0.4)',
              background: live ? 'rgba(0,255,157,0.07)' : 'transparent',
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: live ? '#00FF9D' : 'rgba(255,255,255,0.3)' }}
            />
            {live ? 'Live' : status === 'requesting' ? 'Camera' : status === 'loading-model' ? 'Loading' : 'Ready'}
          </span>
        </header>

        {/* One segmented control instead of three loose pills, so the three patterns read as one choice.
            MIRROR-COACH P4 fix (2026-09-29): this was a plain `inline-flex` with no wrap/scroll escape hatch, fine
            for the pre-phase-4 four tabs at phone widths but not the fifth (Lunge) this phase adds — measured at
            375x812/390x844, the widest label ("Press / Row") wrapped to two lines while the rest stayed one, a
            lopsided control. `overflow-x-auto` + `flex-nowrap` on the container and `whitespace-nowrap shrink-0` on
            each tab make it scroll horizontally instead of wrapping, however many patterns get registered. */}
        <div
          role="tablist"
          aria-label="Movement pattern"
          className="mb-4 flex max-w-full flex-nowrap overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-1"
        >
          {(Object.keys(PATTERN_TITLE) as Pattern[]).map((key) => {
            const on = pattern === key;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={on}
                // The visible label is short because a segmented control should be; the accessible name is the
                // full one, so what a screen reader announces is the pattern's actual name.
                aria-label={PATTERN_TITLE[key]}
                onClick={() => setPattern(key)}
                disabled={live}
                className={`shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2 text-[12.5px] font-bold transition-all duration-200
                            disabled:cursor-not-allowed disabled:opacity-40
                            ${on ? 'bg-white/[0.07] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]'
                                 : 'text-white/45 hover:text-white/75'}`}
              >
                {PATTERN_SHORT[key]}
              </button>
            );
          })}
        </div>

        {/* THE STAGE. The camera is the product here, so it gets the whole width and everything else floats over
            it. Before, it was a 4:3 box in a two-column grid beside a 260px column of bullet lists — the shape of
            a settings page, not of a thing you stand in front of. */}
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl border border-white/10 bg-black
                        shadow-[0_40px_120px_-60px_rgba(0,229,255,0.5)] sm:aspect-[16/10]">
          <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          {/* the proof-of-tracking skeleton — drawn from the pose stream */}
          <canvas ref={skeletonRef} className="pointer-events-none absolute inset-0 h-full w-full" />

          {/* IDLE: the invitation, and the disclaimer where it is actually read — before you start, not shouting
              above the fold forever. The wording is unchanged (brief §2.4): estimated / inferred engagement, no
              clinical claim, nothing uploaded. */}
          {!live && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/70 px-6 text-center backdrop-blur-[2px]">
              {status === 'requesting' || status === 'loading-model' ? (
                <>
                  <Loader2 className="h-7 w-7 animate-spin text-[#00E5FF]" />
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/55">
                    {status === 'requesting' ? 'Asking for the camera' : 'Loading the pose model'}
                  </p>
                </>
              ) : (
                <>
                  <ScanLine className="h-8 w-8 text-[#00E5FF]" strokeWidth={1.6} />
                  <div>
                    <p className="fel-heading text-[20px] font-black leading-tight text-white">Stand where it can see you</p>
                    <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-white/50">
                      Prop the phone up, step back until your whole body is in frame, and start when you are ready.
                    </p>
                  </div>
                  <p className="mx-auto max-w-md text-[11.5px] leading-relaxed text-white/35">
                    This shows <span className="text-white/60">estimated engagement</span> inferred from joint
                    movement. It does not measure muscle activation, and it is not a medical assessment. Everything
                    runs in your browser — the camera feed is never uploaded.
                  </p>
                </>
              )}
            </div>
          )}

          {/* LIVE HUD. The readout used to be one comma-separated line in a black box: "Phase: hold · REPS 0 ·
              12.4 ms/frame". That is a debug print. What somebody mid-rep can actually use is the count, big, and
              the phase word — so those are the two things, and they are legible from across a room. */}
          {live && (
            <>
              <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2">
                {/* MIRROR-COACH P2 (2026-09-26): a map over every pattern (lib/mirror/hudChip.ts). The ternary here sent
                    the Movement Screen to its last arm, `squatStage`, so the chip read BREATHE through the whole screen. */}
                <span className="max-w-[58vw] truncate rounded-lg bg-black/55 px-2.5 py-1.5 font-mono text-[10px] font-bold
                                 uppercase tracking-[0.16em] text-white/75 backdrop-blur-sm sm:max-w-none">
                  {chipLabel({ pattern, phase, jumpState, squatStage, lungeStage: lungeSession.stage, runner })}
                </span>
                {showFrameBudget && (
                  <span
                    className="rounded-lg bg-black/55 px-2 py-1.5 font-mono text-[10px] backdrop-blur-sm"
                    style={{ color: frameMs > 50 ? '#FFC24B' : 'rgba(255,255,255,0.4)' }}
                  >
                    {frameMs.toFixed(1)}ms
                  </span>
                )}
              </div>

              {/* THE SCREEN'S OWN HUD. The athlete is across the room with the phone propped up, so the cue is the
                  biggest thing on the stage and the countdown is a ring rather than a number to squint at. */}
              {pattern === 'screen' && runner && runner.phase !== 'complete' && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 top-16 flex flex-col items-center justify-between px-6 pb-28">
                  <p
                    className="max-w-2xl text-center text-[22px] font-bold leading-snug text-white sm:text-[28px]"
                    style={{ textShadow: '0 2px 18px rgba(0,0,0,0.95)' }}
                  >
                    {runner.say}
                  </p>

                  {runner.station && (
                    <div className="flex flex-col items-center gap-2">
                      <span
                        className="fel-heading text-[52px] font-black leading-none tabular-nums"
                        style={{
                          color: runner.phase === 'holding' ? '#00FF9D' : 'rgba(255,255,255,0.45)',
                          textShadow: '0 2px 20px rgba(0,0,0,0.9)',
                        }}
                      >
                        {Math.ceil(runner.remainingSec)}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">
                        {runner.phase === 'holding' ? 'Hold' : runner.phase === 'retest' ? 'Once more' : 'Get set'} · station {runner.stationIndex + 1}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="pointer-events-none absolute right-4 top-4 text-right">
                {pattern === 'screen' ? (
                  runner && (
                    <>
                      {/* MIRROR-COACH P3: the checks the camera READ (a pass or a flag); a check it could not read is not one.
                          P3 follow-up (2026-09-28): counted the server's way (cameraChecksRead — both legs are one check);
                          it counted results, so both legs read as two */}
                      <p className="fel-heading text-[40px] font-black leading-none text-white">
                        {cameraChecksRead(runner.screen, runner.results).readCount}
                      </p>
                      <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/45">Checks read</p>
                    </>
                  )
                ) : pattern === 'jump' ? (
                  jumps.length > 0 && (
                    <>
                      <p className="fel-heading text-[40px] font-black leading-none text-[#FFD700]">
                        {Math.max(...jumps.map((j) => j.verticalCm))}
                        <span className="ml-1 text-[16px]">cm</span>
                      </p>
                      <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/45">Best jump · estimated</p>
                    </>
                  )
                ) : pattern === 'lunge' ? (
                  <>
                    <p className="fel-heading text-[40px] font-black leading-none text-white">
                      {lungeSession.stage === 'review' ? lungeSession.workReps.left.length + lungeSession.workReps.right.length : lungeSession.reps}
                    </p>
                    <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/45">
                      {lungeSession.stage === 'review' ? 'Reps' : `Reps · ${lungeSession.stage} leg`}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="fel-heading text-[40px] font-black leading-none text-white">
                      {pattern === 'squat' ? squatReps : reps?.reps ?? 0}
                    </p>
                    <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/45">Reps</p>
                  </>
                )}
              </div>

              {/* the breath pacer, centred on the stage where the eye already is — the one pacer (MIRROR-COACH P7), drawn
                  at the stage's pose-clock seconds, so its last breath out ends on the frame the check begins */}
              {pattern === 'squat' && squatStage === 'breathe' && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div className="rounded-3xl bg-black/40 px-5 py-4 backdrop-blur-sm">
                    <BreathPacer id="mirror-breathe" spec={SQUAT_BREATH_PACER} elapsedSec={breathSec} size="lg" />
                  </div>
                </div>
              )}

              {/* THE COACH'S VOICE, one cue at a time, over the picture rather than in a panel below it — you are
                  looking at yourself when the correction lands, not at a sidebar. */}
              {cue && pattern === 'squat' && squatStage === 'work' && (
                <div className="pointer-events-none absolute inset-x-4 bottom-24 flex justify-center">
                  <p
                    className="max-w-lg rounded-2xl border px-5 py-3 text-center text-[15px] font-bold backdrop-blur-md"
                    style={{
                      borderColor: cue.level === 'regress' ? '#FF336688' : cue.level === 'escalate' ? '#FFD70088' : cue.level === 'confirm' ? '#00FF9D88' : '#00E5FF55',
                      color: cue.level === 'regress' ? '#FF3366' : cue.level === 'escalate' ? '#FFD700' : cue.level === 'confirm' ? '#00FF9D' : '#00E5FF',
                      background: 'rgba(0,0,0,0.55)',
                    }}
                  >
                    {cue.level === 'regress' ? 'Regress: ' : cue.level === 'escalate' ? 'Stronger: ' : ''}{cue.text}
                  </p>
                </div>
              )}
            </>
          )}

          {/* The action is docked to the stage, the way a camera's shutter is part of the camera. */}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t
                          from-black/80 to-transparent px-4 pb-5 pt-12">
            {!live ? (
              <button
                onClick={start}
                disabled={status === 'requesting' || status === 'loading-model'}
                className="rounded-2xl bg-[#00E5FF] px-7 py-3 text-[14px] font-black text-black shadow-[0_10px_40px_-12px_#00E5FF]
                           transition-transform hover:scale-[1.02] active:scale-[0.99] disabled:opacity-50"
              >
                Start session
              </button>
            ) : (
              <>
                <button
                  onClick={endSession}
                  className="rounded-2xl border border-white/20 bg-black/50 px-6 py-3 text-[14px] font-bold text-white
                             backdrop-blur-md transition-colors hover:border-[#FF3366]/60 hover:text-[#FF3366]"
                >
                  End session
                </button>
                {/* MIRROR-COACH P3: the station's ONE retest runs by itself (the athlete is across the room); someone at the
                    phone can decline it, and the check is then kept as not read */}
                {pattern === 'screen' && runner?.stations.some((r) => r.retesting) && (
                  <button
                    onClick={() => runnerRef.current?.skipRetest()}
                    className="rounded-2xl border border-white/20 bg-black/50 px-5 py-3 text-[13px] font-bold text-white/80
                               backdrop-blur-md transition-colors hover:border-white/40"
                  >
                    Skip the retest
                  </button>
                )}
                {(pattern === 'squat' || pattern === 'lunge') && (
                  <button
                    onClick={() => setVoiceOn((v) => !v)}
                    aria-pressed={voiceOn}
                    aria-label={voiceOn ? 'Turn coaching voice off' : 'Turn coaching voice on'}
                    className="grid h-12 w-12 place-items-center rounded-2xl border border-white/20 bg-black/50 backdrop-blur-md transition-colors"
                    style={{ color: voiceOn ? '#00E5FF' : 'rgba(255,255,255,0.35)' }}
                  >
                    {voiceOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* The stage direction for the guided squat, under the picture where a caption belongs. */}
        {pattern === 'squat' && live && (
          <p className="mt-4 text-[13px] leading-relaxed text-white/55">
            {squatStage === 'breathe' && (
              <><span className="font-bold text-white">Breathe first.</span> {squatBreathLine()} The breath is the bedrock — everything else builds on it.</>
            )}
            {squatStage === 'check' && (
              <><span className="font-bold text-white">The movement check.</span> {SQUAT_CHECK_REPS} slow squats — heels, shoulders and shift{VALGUS_CUE_VERIFIED ? ', and knees (face the camera square-on)' : ' (knees measured, not judged)'}. Squat {Math.min(squatReps + 1, SQUAT_CHECK_REPS)} of {SQUAT_CHECK_REPS}.</>
            )}
            {squatStage === 'work' && (
              <><span className="font-bold text-white">The work set.</span> {SQUAT_WORK_REPS} squats — cued from what the camera measures. Squat {Math.min(squatReps + 1, SQUAT_WORK_REPS)} of {SQUAT_WORK_REPS}.</>
            )}
            {squatStage === 'review' && (
              <><span className="font-bold text-white">Review.</span> What faulted, what was cued, and whether the correction held.</>
            )}
          </p>
        )}
        {/* The one-time square-up line (MIRROR-COACH P2), shown where it was said so it is not lost if the voice is off. */}
        {pattern === 'squat' && squareUpSaid && (
          <p className="mt-2 text-[13px] font-semibold leading-relaxed text-[#FFC24B]">{SQUARE_UP_LINE}</p>
        )}
        {pattern === 'squat' && deeperSaid && squatStage !== 'review' && (
          <p className="mt-2 text-[13px] font-semibold leading-relaxed text-[#FFC24B]">{DEEPER_LINE}</p>
        )}

        {/* The stage direction for the guided lunge — front view, left leg forward then right (MIRROR-COACH P4 lane 1,
            owner decision #9). No breath pacer or live cue voice here (not asked for), unlike the squat's. */}
        {pattern === 'lunge' && live && lungeSession.stage !== 'review' && (
          <p className="mt-4 text-[13px] leading-relaxed text-white/55">
            <span className="font-bold text-white">{lungeSession.stage === 'left' ? 'Left leg forward.' : 'Right leg forward.'}</span>{' '}
            Face the camera square-on. {LUNGE_REPS_PER_SIDE} lunges this side — {Math.min(lungeSession.reps + 1, LUNGE_REPS_PER_SIDE)} of {LUNGE_REPS_PER_SIDE}.
          </p>
        )}
        {pattern === 'lunge' && lungeSession.stage === 'review' && (
          <p className="mt-4 text-[13px] leading-relaxed text-white/55">
            <span className="font-bold text-white">Review.</span> What each side measured, side by side.
          </p>
        )}
        {/* The one-time turn line (the same "one retry, then record it" policy the squat's square-up line follows).
            Read per-side off lungeSession.turnPromptSaid (lungeStage.ts) and hidden once review starts, so a wrong
            turn on the LEFT side's set does not keep the banner lit through a perfectly square RIGHT side or into
            the review screen (MIRROR-COACH P4 fix, 2026-09-29 — see the state declaration above). */}
        {pattern === 'lunge' && lungeSession.stage !== 'review' && lungeSession.turnPromptSaid[lungeSession.stage] && (
          <p className="mt-2 text-[13px] font-semibold leading-relaxed text-[#FFC24B]">{framingLine('turned')}</p>
        )}

        {error && (
          <p className="mt-4 rounded-xl border border-[#FF3366]/30 bg-[#FF3366]/10 px-4 py-3 text-[13px] text-[#ff8da8]">
            {error}
          </p>
        )}

        {/* Which screen, chosen before it starts. The full one adds the stations a coach has to answer for,
            because a phone cannot palpate a pelvis — the protocol says so and the picker should too. */}
        {pattern === 'screen' && !live && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {([['modified', 'Modified', 'Six stations, about two minutes.'],
               ['full', 'Full', 'Adds the stations a coach answers.']] as [ScreenId, string, string][])
              .map(([id, label, blurb]) => {
                const on = screenId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setScreenId(id)}
                    aria-pressed={on}
                    className="rounded-xl border px-4 py-2.5 text-left transition-colors"
                    style={{
                      borderColor: on ? 'rgba(0,255,157,0.45)' : 'rgba(255,255,255,0.10)',
                      background: on ? 'rgba(0,255,157,0.07)' : 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <span className="block text-[13.5px] font-bold text-white">{label} screen</span>
                    <span className="mt-0.5 block text-[11.5px] text-white/45">{blurb}</span>
                  </button>
                );
              })}
          </div>
        )}

        {/* STATION BY STATION (MIRROR-COACH P3, 2026-09-26): each graded station's card as it finishes — the value and
            its unit, pass / flagged for a closer look / not read, one fix line under a flag, and the one retest. */}
        {pattern === 'screen' && runner && (endedWith?.stations ?? runner.stations).length > 0 && (
          <StationResults screen={runner.screen} stations={endedWith?.stations ?? runner.stations} />
        )}

        {/* What the screen found. The book counts movement flags and ranks the one-sided ones above the rest.
            MIRROR-COACH P1 (2026-09-25): "Movement flags", not "Red flags" — red flags are clinical warning signs
            and will mean that in the health intake; a kneecap pointing in is a movement finding. The stored key
            stays `redFlags` beside the new `movementFlags` (lib/mirror/screen.ts). And a screen nothing graded shows
            NO score: it used to show Score 100 beside Checks 0, because 100 is what nothing deducted looks like. */}
        {pattern === 'screen' && screenSummary && (
          <section className="mt-6 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
            <h2 className="fel-heading text-[15px] font-bold text-white/80">What the screen found</h2>
            {screenSummary.graded ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Figure label="Score" value={String(screenSummary.score ?? '—')} accent="#00FF9D" />
                  <Figure label="Movement flags" value={String(screenSummary.movementFlags)} accent={screenSummary.movementFlags > 0 ? '#FF3366' : undefined} />
                  <Figure label="One-sided" value={String(screenSummary.asymmetries)} accent={screenSummary.asymmetries > 0 ? '#FFD700' : undefined} />
                  {/* MIRROR-COACH P3 follow-up (2026-09-28): the summary's readCount — the server's readableCameraChecks, one
                      definition (screen.ts cameraChecksRead). It showed runner.results.length: "Checks 6" beside the server's 5 */}
                  <Figure label="Checks read" value={`${screenSummary.readCount ?? 0} of ${screenSummary.totalCount ?? 0}`} />
                </div>
                {/* OWNER DECISION #31: the score is over what was read, so it is said with the count, and what was not read
                    is listed as not read ("Score 78 · from 5 of 6 checks read" · "Head float · not read") */}
                {scoreLine(screenSummary) && (
                  <p className="mt-4 text-[13px] font-semibold leading-relaxed text-white/80" data-score-line>{scoreLine(screenSummary)}</p>
                )}
                {notReadLines(screenSummary).length > 0 && (
                  <ul className="mt-1 text-[12.5px] leading-relaxed text-white/55" data-not-read>
                    {notReadLines(screenSummary).map((line) => <li key={line}>{line}</li>)}
                  </ul>
                )}
                {/* the headline says what the numbers mean — and, for a partly graded screen, that it is not clear */}
                <p className="mt-4 text-[13px] leading-relaxed text-white/70">{screenSummary.headline}</p>
                {screenMessage && <p className="mt-2 text-[13px] leading-relaxed text-white/60">{screenMessage}</p>}
              </>
            ) : (
              // One line, the same everywhere it is said (the server's message is this line too), and nothing to retry.
              // MIRROR-COACH P1 (2026-09-25): a save failure is said here too. Every screen is ungraded today, and this
              // branch showed only the not-graded line, so an athlete whose run was never kept was never told.
              <>
                {/* P3 review (2026-09-26): the summary's own line — NOT_READ_LINE when the camera tried and read nothing,
                    NOT_GRADED_LINE when there were no grades at all */}
                <p className="mt-3 text-[14px] leading-relaxed text-white/70">{screenSummary.headline || NOT_GRADED_LINE}</p>
                {screenMessage && screenMessage !== (screenSummary.headline || NOT_GRADED_LINE) && (
                  <p className="mt-2 text-[13px] leading-relaxed text-white/60">{screenMessage}</p>
                )}
              </>
            )}
          </section>
        )}

        {/* WHAT TO WORK ON (MIRROR-COACH P3, 2026-09-26): each flag's FIX line and corrective block, what to run again,
            and "what the camera saw, not a diagnosis" — from the runner's final grades, once a station has one. */}
        {pattern === 'screen' && screenSummary && runner && (endedWith?.grades ?? runner.grades).length > 0 && (
          <ScreenNextSteps screen={runner.screen} grades={endedWith?.grades ?? runner.grades} youth={youth} />
        )}

        {/* THE BREATH STATION'S ANSWERS, and the coach's stations (MIRROR-COACH P3, 2026-09-25). Asked once the screen is
            over — the athlete was across the room during it — and saved to the screen that ran; not graded, not scored. */}
        {/* …only when the station they ask about was HELD (MIRROR-COACH P3 follow-up review, 2026-09-28): End before it, or a
            breath station the runner ended because the shot never came good, has no breath to ask about */}
        {pattern === 'screen' && screenSummary && runner && (
          <ScreenSelfReport
            screen={runner.screen} screenId={savedScreenId}
            asked={selfReportReached(runner.screen, endedWith?.stations ?? runner.stations)}
          />
        )}

        {/* THE READOUT, under the stage and across the full width. It was a 260px column of 11px bullet lists
            squeezed beside the camera; there is no reason for the picture to be narrow so a legend can sit next
            to it. */}
        <section className={pattern === 'screen' ? 'hidden' : 'mt-6'}>
          {pattern === 'squat' ? (
            <>
              <h2 className="fel-heading mb-3 text-[15px] font-bold text-white/80">The four checks</h2>
              {/* MIRROR-COACH P1 (2026-09-25): a check the coach may not judge yet (the knee, until VALGUS_CUE_VERIFIED)
                  never lights red — it says it is measured, not judged. ("Recording" was the first wording, and on a
                  live camera page it reads as the video being recorded: nothing is — the read stays in this tab.)
                  And 'armFall' is read from the shoulders' SIDEWAYS drift (a front camera reads x; squat-audit.ts), so
                  its row says that rather than "Chest stays tall". One spelling across the list: centred. */}
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {([
                  ['kneeValgus', 'Knees track over toes'],
                  ['heelRise', 'Heels stay down'],
                  ['armFall', 'Shoulders stay centred'],
                  ['lateralShift', 'Weight stays centred'],
                ] as [SquatFault, string][]).map(([id, label]) => {
                  const judged = cueableFaults([id]).length > 0;
                  const seen = live && squatSeen;
                  // MIRROR-COACH P2 (2026-09-26): the knee is read only square to the camera (squat-audit.ts squareOn);
                  // off square its row says so rather than "stable" — a knee that was not read is not a clean knee
                  // (P2 review: the sideways reads — shoulders and weight — are gated on square too, squat-audit.ts)
                  const notRead = (id === 'kneeValgus' || id === 'armFall' || id === 'lateralShift') && squatSquare === false;
                  const faulting = seen && judged && !notRead && squatFaults.includes(id);
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors duration-300"
                      style={{
                        borderColor: faulting ? 'rgba(255,51,102,0.35)' : 'rgba(255,255,255,0.08)',
                        background: faulting ? 'rgba(255,51,102,0.06)' : 'rgba(255,255,255,0.02)',
                      }}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: !judged || !seen || notRead ? 'rgba(255,255,255,0.25)' : faulting ? '#FF3366' : '#00FF9D' }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-white/85">{label}</span>
                        <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/35">
                          {!seen ? (live ? 'Not in view' : 'Waiting for the camera')
                            : !judged ? 'Measured · not judged yet'
                              : notRead ? 'Not square · not read'
                                : faulting ? 'Estimated fault' : 'Estimated stable'}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : pattern === 'lunge' ? (
            <>
              <h2 className="fel-heading mb-3 text-[15px] font-bold text-white/80">
                The five checks · {lungeSession.stage === 'review' ? 'review' : `${lungeSession.stage} leg forward`}
              </h2>
              {/* Same discipline as the squat's four checks: a check the view will not let the camera take says so
                  (Not square · not read) rather than lighting green — baseline F5, closed for the lunge this phase. */}
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(Object.keys(LUNGE_FAULT_LABEL) as LungeFault[]).map((id) => {
                  const seen = live && lungeSeen;
                  const notRead = lungeFramedRight === false;
                  const faulting = seen && !notRead && lungeFaults.includes(id);
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors duration-300"
                      style={{
                        borderColor: faulting ? 'rgba(255,51,102,0.35)' : 'rgba(255,255,255,0.08)',
                        background: faulting ? 'rgba(255,51,102,0.06)' : 'rgba(255,255,255,0.02)',
                      }}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: !seen || notRead ? 'rgba(255,255,255,0.25)' : faulting ? '#FF3366' : '#00FF9D' }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-white/85">{LUNGE_FAULT_LABEL[id]}</span>
                        <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/35">
                          {!seen ? (live ? 'Not in view' : 'Waiting for the camera')
                            : notRead ? 'Not square · not read'
                              : faulting ? 'Estimated fault' : 'Estimated stable'}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : pattern === 'jump' ? (
            <>
              {/* WHAT YOU CAME BACK FOR. The best to beat, the rhythm you are keeping, the line over weeks, and
                  the next dunk named — the four the owner asked for, in the order they matter when you are
                  standing in a gym with your phone propped against a bag. */}
              {dunkProgress && dunkProgress.attempts > 0 && (
                <section className="mb-5 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-white/35">
                        Your best · estimated
                      </p>
                      <p className="fel-heading text-[40px] font-black leading-none text-[#FFD700]">
                        {Math.round(dunkProgress.best?.verticalCm ?? 0)}
                        <span className="ml-1 text-[16px]">cm</span>
                      </p>
                      {dunkProgress.trendCmPerWeek !== null && (
                        <p
                          className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em]"
                          style={{ color: dunkProgress.trendCmPerWeek >= 0 ? '#00FF9D' : '#FF7A2F' }}
                        >
                          {dunkProgress.trendCmPerWeek >= 0 ? '+' : ''}{dunkProgress.trendCmPerWeek} cm / week · estimated
                        </p>
                      )}
                    </div>

                    <div className="flex gap-5 text-right">
                      <div>
                        <p className="fel-heading text-[22px] font-black leading-none text-white">
                          {dunkProgress.streakDays}
                        </p>
                        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">
                          Day streak
                        </p>
                      </div>
                      <div>
                        <p className="fel-heading text-[22px] font-black leading-none text-white">
                          {dunkProgress.thisWeek}
                        </p>
                        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">
                          This week
                        </p>
                      </div>
                      <div>
                        <p className="fel-heading text-[22px] font-black leading-none text-white">
                          {dunkProgress.attempts}
                        </p>
                        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">
                          Jumps
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* The trend, drawn as the session bests. Eight weeks of stall and breakthrough is the proof
                      the Playbook's whole thesis asks for. */}
                  {dunkProgress.trend.length > 1 && (() => {
                    const pts = dunkProgress.trend.slice(-14);
                    const lo = Math.min(...pts.map((t) => t.bestCm));
                    const hi = Math.max(...pts.map((t) => t.bestCm));
                    const span = Math.max(1, hi - lo);
                    return (
                      <div className="mt-5 flex h-16 items-end gap-1.5" role="img"
                           aria-label={`Session bests from ${Math.round(lo)} to ${Math.round(hi)} centimetres`}>
                        {pts.map((t) => (
                          <span
                            key={t.day}
                            title={`${t.day} · ${Math.round(t.bestCm)} cm`}
                            className="flex-1 rounded-t"
                            style={{
                              height: `${18 + ((t.bestCm - lo) / span) * 82}%`,
                              background: t.bestCm >= hi ? '#FFD700' : 'rgba(255,255,255,0.16)',
                            }}
                          />
                        ))}
                      </div>
                    );
                  })()}

                  {dunkProgress.next && (
                    <div className="mt-5 border-t border-white/[0.06] pt-4">
                      <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-[#00E5FF]">
                        Next dunk · {dunkProgress.next.family}
                      </p>
                      <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/70">{dunkProgress.next.ask}</p>
                    </div>
                  )}

                  {dunkProgress.landed.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {dunkProgress.landed.map((f) => (
                        <span key={f} className="rounded-md bg-[#00FF9D]/12 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#00FF9D]">
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {dunkSaid && (
                <p className="mb-4 text-[15px] font-bold text-[#FFD700]">{dunkSaid}</p>
              )}

              {/* "estimated", not "measured" (MIRROR-COACH P1, 2026-09-25): a 2-D camera read at ~30 fps, where one frame of
                  flight time is several centimetres. Every camera number says so. */}
              <h2 className="fel-heading mb-3 text-[15px] font-bold text-white/80">Jumps · estimated from flight time</h2>
              {jumps.length === 0 ? (
                <p className="text-[13px] text-white/45">
                  Stand tall, let the floor calibrate, then jump. The landing settles the rep.
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {jumps.map((j, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">Jump {i + 1}</span>
                      <span className="text-right">
                        <span className="fel-heading text-[20px] font-black text-[#FFD700]">{j.verticalCm}<span className="text-[12px]">cm</span></span>
                        <span className="mt-0.5 block font-mono text-[9.5px] text-white/30">{j.flightTimeMs}ms · {j.takeoff}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <h2 className="fel-heading mb-3 text-[15px] font-bold text-white/80">Estimated engagement</h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PATTERN_ZONES.map((id) => {
                  const st = zoneStates[id];
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: ZONE_STATE_COLOR[st] }} />
                      {/* Stacked, not side by side: these zone names are long ("Lumbo-pelvic control") and the
                          state is longer still ("not computable from view"), so on one line every label truncated
                          to "Lumbo-pelvi…" and the row said nothing. The name is the thing being read. */}
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold leading-tight text-white/85">{ZONE_LABEL[id]}</span>
                        <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/35">
                          {ZONE_STATE_LABEL[st]}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        {/* The review of a guided squat — what faulted, what was said, and whether it held. */}
        {pattern === 'squat' && squatStage === 'review' && (
          <section className="mt-6 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
            <h2 className="fel-heading text-[15px] font-bold text-white/80">What the camera measured</h2>
            <div className="mt-3 grid gap-5 sm:grid-cols-2">
              <div>
                <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">Findings</p>
                {/* Only faults the coach may judge are findings; the knee is reported separately below while unverified. */}
                {/* MIRROR-COACH P2 (2026-09-26): "Clean structure — load it" was the verified line; with the knee on, a
                    check with nothing flagged says only that — the knee line below says whether the knees were read. */}
                {cueableFaults(squatFindings).length === 0 ? (
                  <p className="mt-2 text-[13px] text-white/60">
                    {VALGUS_CUE_VERIFIED ? 'No faults measured in the check.' : 'No judged faults in the check.'}
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {cueableFaults(squatFindings).map((f) => (
                      <li key={f} className="flex gap-2 text-[13px] text-white/70">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#FF3366]" />
                        {SQUAT_FAULT_LABEL[f]}
                      </li>
                    ))}
                  </ul>
                )}
                {/* THE KNEE, MEASURED BUT NOT JUDGED (MIRROR-COACH P1, 2026-09-25). Said every time, so a quiet knee
                    is never mistaken for a clean one. The numbers are for the owner's verification capture: they show
                    in development builds only, labelled estimated, beside the frames the audit flagged. Nothing about
                    the knee read is sent or saved. */}
                {/* MIRROR-COACH P2 (2026-09-26): with the knee judged, what is said is whether it was READ — a set off
                    square to the camera never was (squat-audit.ts squareOn; lib/mirror/squatStage.ts kneeReadLine). The
                    dev-only numbers stay, per camera frame now, with the frames that were not square counted apart. */}
                {(() => {
                  const kneeLine = VALGUS_CUE_VERIFIED
                    ? kneeReadLine(kneeRecord)
                    : 'Knee tracking is measured but not judged yet — it stays quiet until a real capture confirms the read.';
                  const numbers = showFrameBudget && kneeRecord.left !== null && kneeRecord.right !== null;
                  if (!kneeLine && !numbers) return null;
                  return (
                    <p className="mt-3 text-[12px] leading-relaxed text-white/40">
                      {kneeLine}
                      {numbers && (
                        <span className="mt-1 block font-mono text-[10.5px] text-white/35">
                          estimated worst inward (hip half-widths): L {kneeRecord.left!.toFixed(2)} · R {kneeRecord.right!.toFixed(2)}
                          {' '}· flagged frames {kneeRecord.flaggedFrames} · square frames {kneeRecord.squareFrames}
                          {' '}· not square {kneeRecord.notSquareFrames}
                        </span>
                      )}
                    </p>
                  );
                })()}
              </div>
              <div>
                <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">What was cued</p>
                {cueLog.length === 0 ? (
                  <p className="mt-2 text-[13px] text-white/60">No corrections were cued during the work set.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {cueLog.map((c, i) => (
                      <li key={i} className="text-[13px] text-white/70">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-white/30">{c.level}</span>{' '}{c.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {/* MIRROR-COACH P1 (2026-09-25): "held" is read from the last reps (lib/mirror/squatStage.ts
                squatReviewVerdict). It used to be "any cue and no regress", which said "The correction held" over a
                set whose heels rose on all eight reps. */}
            <p className="mt-4 border-t border-white/[0.06] pt-4 text-[13px] leading-relaxed text-white/50">
              {squatReviewVerdict(squatWorkReps, cueLog, {
                cueable: (f) => cueableFaults(f),
                // a knee never read square was not judged, cue or no cue (MIRROR-COACH P2)
                kneeJudged: VALGUS_CUE_VERIFIED && kneeRecord.squareFrames > 0,
              }).line}
            </p>
          </section>
        )}

        {/* The lunge's review — the PER-SIDE result (MIRROR-COACH P4 lane 1: "the review card, and the per-side
            result"). A squat lets the strong side hide; the lunge cannot, so the two sides are read side by side. */}
        {pattern === 'lunge' && lungeSession.stage === 'review' && (
          <section className="mt-6 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
            <h2 className="fel-heading text-[15px] font-bold text-white/80">What the camera measured — each side</h2>
            <div className="mt-3 grid gap-5 sm:grid-cols-2">
              {(['left', 'right'] as LungeSide[]).map((side) => {
                const r = lungeSideResult(lungeSession, side);
                return (
                  <div key={side}>
                    <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">
                      {side === 'left' ? 'Left leg forward' : 'Right leg forward'}
                    </p>
                    <p className="fel-heading mt-1 text-[24px] font-black leading-none text-white">
                      {r.reps}<span className="ml-1.5 text-[12px] font-mono uppercase tracking-[0.14em] text-white/35">reps</span>
                    </p>
                    {r.unreadable ? (
                      <p className="mt-2 text-[13px] text-[#FFC24B]">Not square to the camera through this set — not read.</p>
                    ) : Object.keys(r.faultRepCounts).length === 0 ? (
                      <p className="mt-2 text-[13px] text-white/60">{r.reps ? 'No faults measured.' : 'Not reached.'}</p>
                    ) : (
                      <ul className="mt-2 space-y-1.5">
                        {(Object.entries(r.faultRepCounts) as [LungeFault, number][]).map(([id, n]) => (
                          <li key={id} className="flex gap-2 text-[13px] text-white/70">
                            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#FF3366]" />
                            {LUNGE_FAULT_LABEL[id]} — {n} of {r.reps} reps
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* SESSION SUMMARY. Real accumulated stats only (brief §4) — but read as figures, not as a bare <table>. */}
        {summary && (
          <section className="mt-6 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
            <h2 className="fel-heading text-[15px] font-bold text-white/80">Session summary · estimated</h2>

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Figure label="Duration" value={`${secs(summary.durationMs)}s`} />
              {summary.reps > 0 && <Figure label="Reps" value={String(summary.reps)} />}
              {summary.avgTempo && (
                <Figure label="Avg tempo" value={`${summary.avgTempo.pullSec}s / ${summary.avgTempo.pressSec}s`} />
              )}
              {jumps.length > 0 && (
                <Figure label="Best jump" value={`${Math.max(...jumps.map((j) => j.verticalCm))}cm`} accent="#FFD700" />
              )}
            </div>

            <ul className="mt-5 space-y-1.5 border-t border-white/[0.06] pt-4">
              {PATTERN_ZONES.map((id) => (
                <li key={id} className="flex items-baseline gap-3 text-[13px]">
                  <span className="min-w-0 flex-1 truncate text-white/70">{ZONE_LABEL[id]}</span>
                  <span className="shrink-0 font-mono text-[12px] text-white/45">
                    {secs(summary.timeInStableMs[id])}s stable
                  </span>
                  <span
                    className="w-16 shrink-0 text-right font-mono text-[12px]"
                    style={{ color: summary.faultCounts[id] > 0 ? '#FF3366' : 'rgba(255,255,255,0.25)' }}
                  >
                    {summary.faultCounts[id]} {summary.faultCounts[id] === 1 ? 'fault' : 'faults'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

/** A number worth reading from a distance, with the quiet label under it. */
function Figure({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <p className="fel-heading text-[24px] font-black leading-none" style={{ color: accent ?? '#FFFFFF' }}>{value}</p>
      <p className="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">{label}</p>
    </div>
  );
}
