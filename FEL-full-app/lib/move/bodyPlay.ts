'use client';

// bodyPlay — the READY screen's body play: the camera, the space check, and the rulers they hand the game (movement
// play, phase 4, 2026-09-25).
//
// The plan row's "BodyPlayProvider" is this module store, read the way sessionStore is (useSyncExternalStore): the one
// place a provider could wrap the stage is GameShell, and the readers — BootSplash in twenty hosts, the shell's Body
// button — already read sessionStore like this. It owns no camera: the page's one PoseSource (lib/input/poseSource)
// does, check-gated — it reads the body into the game but never takes rulers of its own. This store runs the space
// check (lib/move/spaceCheck) on the same frames, and hands the source the check's rulers the moment it passes:
//
//   begin(key)   a TAP (the camera never starts on its own, the remembered choice only pre-selects the button): the
//                sound unlocks (the hands-up START presses nothing, so this is the game's one gesture), the choice is
//                remembered for this game, the source starts, and the check runs;
//   the frames   go to the check while it has not passed, in any phase (a tap may start the game first: the body joins
//                when it is set); once set, at READY (so GO AGAIN starts over when the player has moved) and over a pause
//                a check was asked for — never in play, where BodySession and the reader own the body;
//   set          on the check's `ready`, the source reads with its calibration (setCalibration), once. A settled issue
//                that drops it back from ready (the player walked off, someone else stepped in) re-centres the source:
//                its final packet makes the game let go, and nothing more reaches it until the check passes again;
//   re-take      the first frame the check reads after a stretch it did not (play, the end card, a pause nobody asked
//                for, or a second without frames) takes the stand again (again(), the source re-centred): whoever stands
//                there at GO AGAIN may not be the body the rulers came from, and neither of the check's rules can tell
//                across the gap (the one-body rule compares frames a frame apart; a new player standing where the old one
//                stood breaks no framing rule). An unchanged spot skips the reach, so it costs the frame hold and the
//                stand, ~1.4 s;
//   hidden       the page going to the background turns the camera off (end(), the choice still remembered): a hidden
//                tab never keeps it running. Back on the page, the READY button (pre-selected) starts it again;
//   again()      "Check my space again": the same body, a new stand (a game in play is paused first);
//   handOver()   a new body — the feed taking the camera's place, Dunk Duel's next player (P5): the whole check;
//   end(key)     "Camera off": remembered off for this game, the source stopped (its final packet), the self-views gone.
//
// Also here: the Coach speaking the check's lines (spaceVoice, VoiceKit's pre-rendered coach.space.* takes), and the
// brightness sample (a small canvas read of the <video>, at most every LUMA_EVERY_MS while checking: 32 numbers, never
// sent). Nothing leaves the page.
//
// createBodyPlay takes its page as deps, so the node tests drive it with stand-ins (as poseSource.test does); the
// page's own (`bodyPlay`) is built on first use in the browser.
import { SpaceCheck, spaceOverlay, SAFETY_NOTE, RATE_WINDOW_MS, type SpaceNote, type SpaceOverlay, type SpaceStage, type SpaceState, type LumaSample, type SpaceIssue, type SpaceInstructionId } from './spaceCheck';
import { SpaceVoice, COACH_CAST } from './spaceVoice';
import { bodyButtonAction, readBodyPlay, writeBodyPlay, type BodyButtonAction } from './bodyPlayChoice';
import { bodyBox, lumaHistogram } from './luma';
import { sharedPoseSource, type PoseSource, type PoseSourceState } from '@/lib/input/poseSource';
import { poseService, type PoseService, type PoseStatus } from '@/lib/pose/PoseService';
import { sessionStore } from '@/lib/babylon/core/sessionStore';
import { emitToLive } from '@/lib/babylon/core/InputBus';
import { SoundKit } from '@/lib/babylon/audio/SoundKit';
import { VoiceKit } from '@/lib/babylon/audio/mic/VoiceKit';
import { feedHookAllowed } from '@/lib/pose/feed';
import { agentEnabled } from '@/lib/babylon/core/AgentBridge';
import type { Lm, PoseFrame } from '@/lib/pose/landmarks';

/** The brightness is sampled at most this often (ms), only while the check runs. */
export const LUMA_EVERY_MS = 250;
/** The sample canvas: small, the aspect of the 640×480 the camera is asked for. */
export const LUMA_W = 64, LUMA_H = 48;

export type BodyPlayStage = 'off' | 'starting' | 'checking' | 'set' | 'error';

/** What the check panel and the corner draw. */
export interface SpaceView {
  stage: SpaceStage;
  say: { id: SpaceInstructionId; text: string };
  oneLine: string;
  /** 0..1 through the stage's hold. */
  hold: number;
  issue: SpaceIssue | null;
  notes: SpaceNote[];
  /** The ceiling and the clearance: shown for the whole check. */
  safety: SpaceNote;
  headroom: SpaceState['headroom'];
  /** The floor line, the headroom band and the body's box, in image units (the self-view flips them with the picture). */
  overlay: SpaceOverlay;
  /** When the check began (the capture clock of its first frame): the setup hint shows for its first seconds. */
  since: number;
  t: number;
}

export interface BodyPlayView {
  /** The game (registry key) body play was begun for. */
  key: string | null;
  stage: BodyPlayStage;
  /** The panel is folded to a chip ("Hide"): the camera and the check keep running. */
  collapsed: boolean;
  /** Frames go to the check right now. */
  checking: boolean;
  camera: { state: PoseSourceState; why: string | null; aspect: number; portrait: boolean; source: PoseStatus['source'] };
  space: SpaceView | null;
  /** For P5 / P10: the pose rate, and whether a jump height can be read at it — absence is never 0. */
  poseHz: number | null;
  jumpHeight: 'read' | 'unread' | null;
}

export interface BodyPlayDeps {
  source: Pick<PoseSource, 'start' | 'stop' | 'listen' | 'snapshot' | 'setCalibration' | 'recalibrate'>;
  service: Pick<PoseService, 'onFrame' | 'onStatus' | 'status'>;
  session: Pick<typeof sessionStore, 'view' | 'subscribe'>;
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  unlockAudio(): void;
  voice: { load(): void; play(clip: string, caption: string): void; bank(): ReadonlySet<string> };
  /** The brightness sample (the page's canvas read of the <video>): null on the feed, in tests, or with no video. */
  sampleLuma(image: readonly Lm[] | null): LumaSample | null;
  /** START pressed and released on every running bus: the same event every host's pause sends. */
  pauseGame(): void;
  /** Calls `fn` whenever the page goes to the background (document.visibilityState 'hidden'). */
  onPageHidden(fn: () => void): void;
  now(): number;
}

export interface BodyPlay {
  view(): BodyPlayView;
  subscribe(fn: () => void): () => void;
  /** The player chose body play for this game last time (the READY button is pre-selected; nothing starts). */
  remembered(key: string): boolean;
  /** A TAP: the sound unlocked, the choice remembered, the source started (check-gated) and the check run. */
  begin(key: string): Promise<boolean>;
  /** "Check my space again": the same body, a new stand. */
  again(): void;
  /** A new body (the feed taking the camera's place, P5's Dunk Duel): the whole check. */
  handOver(): void;
  /** "Camera off" (remembered off for `key`, when the player chose it). */
  end(key?: string | null): void;
  collapse(on: boolean): void;
  /** The header Body button: its action for the running game, done. */
  button(): Promise<BodyButtonAction>;
}

const cameraOn = (s: PoseSourceState) => s !== 'idle' && s !== 'error';
const DEFAULT_ASPECT = 4 / 3;

export function createBodyPlay(deps: BodyPlayDeps): BodyPlay {
  const check = new SpaceCheck();
  const voice = new SpaceVoice();
  const listeners = new Set<() => void>();
  let key: string | null = null;
  let stage: BodyPlayStage = 'off';
  let why: string | null = null;
  let collapsed = false;
  let handed = false;
  /** A check was asked for over a pause (the shortcut mid-play, again()): cleared when the game plays again. */
  let asked = false;
  /** The check had passed and then went unread for a stretch (play, the end card, an unasked pause): re-take the stand. */
  let unfed = false;
  /** The capture time of the last frame the check read. */
  let fedAt = -Infinity;
  let last: SpaceState | null = null;
  let lastImage: readonly Lm[] | null = null;
  let since = 0;
  let lumaAt = -Infinity;
  let voiceLoaded = false;
  let aspect = DEFAULT_ASPECT;
  let portrait = false;
  let lastSource: PoseStatus['source'] = null;
  let phase = deps.session.view().phase;
  let view: BodyPlayView;

  const notify = (): void => { view = build(); for (const fn of [...listeners]) fn(); };

  /** Frames go to the check: while it has not passed, in any phase; once set, at READY and over a pause it was asked for. */
  const feeding = (): boolean => {
    if (stage !== 'checking' && stage !== 'set') return false;
    if (stage === 'checking') return phase !== 'loading';
    return phase === 'ready' || (phase === 'paused' && asked);
  };

  function build(): BodyPlayView {
    const src = deps.source.snapshot;
    const space: SpaceView | null = last && (stage === 'checking' || stage === 'set') ? {
      stage: last.stage, say: { id: last.instruction.id, text: last.instruction.text }, oneLine: last.oneLine, hold: last.hold,
      issue: last.issue, notes: last.notes, safety: SAFETY_NOTE, headroom: last.headroom,
      overlay: spaceOverlay(last, lastImage), since, t: last.t,
    } : null;
    return {
      key, stage, collapsed, checking: feeding(),
      camera: { state: src.state, why: stage === 'error' ? why : null, aspect, portrait, source: lastSource },
      space, poseHz: last?.poseHz ?? null, jumpHeight: last?.jumpHeight ?? null,
    };
  }

  function startCheck(fresh: boolean): void {
    if (fresh) { check.handOver(); voice.reset(); } else check.again();
    handed = false; last = null; lastImage = null; since = 0; lumaAt = -Infinity;
  }

  /** The same body's stand again (again(), a re-take): the rulers dropped, the source re-centred until the check passes. */
  function restand(): void {
    startCheck(false);
    stage = 'checking';
    deps.source.recalibrate();
  }

  // ── the page's events ──
  deps.service.onFrame((f: PoseFrame) => {
    if (!feeding()) { if (stage === 'set') unfed = true; return; }
    // back from a stretch the check did not read (GO AGAIN, a pause after play, the camera stalled): take the stand again
    if (stage === 'set' && (unfed || f.t - fedAt > RATE_WINDOW_MS)) restand();
    unfed = false;
    fedAt = f.t;
    const s = check.push(f);
    if (!last) since = s.t;
    last = s;
    if (f.present) lastImage = f.image;
    const now = deps.now();
    if (now - lumaAt >= LUMA_EVERY_MS) {
      lumaAt = now;
      check.light(deps.sampleLuma(f.present ? f.image : null));
    }
    const clip = voice.next(s, deps.voice.bank());
    if (clip) deps.voice.play(clip, s.instruction.text);
    if (s.ready && !handed && s.calibration) {
      handed = true;
      stage = 'set';
      deps.source.setCalibration(s.calibration);
    } else if (!s.ready && handed) {
      // dropped back from ready (the player walked off, someone else stepped in): the game lets go, the check runs again
      handed = false;
      stage = 'checking';
      deps.source.recalibrate();
    }
    notify();
  });

  deps.service.onStatus((st: PoseStatus) => {
    const cam = st.camera;
    const a = cam && cam.width > 0 && cam.height > 0 ? cam.width / cam.height : DEFAULT_ASPECT;
    const changedShape = a !== aspect;
    aspect = a; portrait = cam?.portrait ?? false;
    if (changedShape) check.setAspect(a);
    // the feed took the camera's place (or the other way round): a different body
    const swapped = !!lastSource && !!st.source && st.source !== lastSource;
    lastSource = st.source ?? lastSource;
    if (swapped && (stage === 'checking' || stage === 'set')) { startCheck(true); stage = 'checking'; deps.source.recalibrate(); }
    notify();
  });

  deps.source.listen((snap) => {
    if (stage === 'off') { notify(); return; }
    if (snap.state === 'idle') { stage = 'off'; handed = false; asked = false; last = null; lastSource = null; }
    else if (snap.state === 'error') { stage = 'error'; why = snap.detail || 'The camera could not be started.'; handed = false; last = null; }
    else if (snap.state === 'requesting' || snap.state === 'loading') { if (stage !== 'set') stage = 'starting'; }
    else if (stage === 'starting' || stage === 'error') stage = 'checking';
    notify();
  });

  deps.session.subscribe(() => {
    const p = deps.session.view().phase;
    if (p === phase) return;
    phase = p;
    if (p === 'playing') asked = false;
    // (a stretch with no frames at all counts too: the check stops reading the moment it has passed and play begins)
    if (stage === 'set' && !feeding()) unfed = true;
    notify();
  });

  deps.onPageHidden(() => {
    if (stage !== 'off' || cameraOn(deps.source.snapshot.state)) api.end();
  });

  view = build();

  const api: BodyPlay = {
    view: () => view,
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    remembered: (k) => readBodyPlay(k, deps.storage),

    async begin(k) {
      deps.unlockAudio();
      writeBodyPlay(k, true, deps.storage);
      if (!voiceLoaded) { voiceLoaded = true; deps.voice.load(); }
      key = k;
      collapsed = false;
      asked = true;
      if (cameraOn(deps.source.snapshot.state) && (stage === 'checking' || stage === 'set')) {
        // already on for this page: a new check of the same camera
        api.again();
        return true;
      }
      startCheck(true);
      why = null;
      stage = 'starting';
      notify();
      const ok = await deps.source.start();
      // (the listeners may have moved the stage while the start was pending: TS cannot see that)
      const now = stage as BodyPlayStage;
      if (now === 'off') return false;                // switched off while it was starting
      if (!ok) {
        stage = 'error';
        why = deps.source.snapshot.detail || 'The camera could not be started.';
      } else if (now === 'starting') stage = 'checking';
      notify();
      return ok;
    },

    again() {
      if (stage !== 'checking' && stage !== 'set') return;
      if (phase === 'playing') deps.pauseGame();
      asked = true;
      restand();
      notify();
    },

    handOver() {
      if (stage !== 'checking' && stage !== 'set') return;
      asked = true;
      startCheck(true);
      stage = 'checking';
      deps.source.recalibrate();
      notify();
    },

    end(k) {
      if (k) writeBodyPlay(k, false, deps.storage);
      stage = 'off'; handed = false; asked = false; last = null; lastImage = null;
      deps.source.stop();
      notify();
    },

    collapse(on) {
      if (collapsed === on) return;
      collapsed = on;
      notify();
    },

    async button() {
      const v = deps.session.view();
      const action = bodyButtonAction(v, cameraOn(deps.source.snapshot.state));
      if (action === 'end') api.end(v.key ?? key);
      else if (action === 'begin' || action === 'begin-paused') {
        if (action === 'begin-paused') deps.pauseGame();
        await api.begin(v.key!);
      }
      return action;
    },
  };
  return api;
}

// ── the page's ──────────────────────────────────────────────────────────────────────────────────────────────────

let page: BodyPlay | null = null;
let bank: ReadonlySet<string> = new Set();
let lumaCanvas: HTMLCanvasElement | null = null;

/** The brightness sample: the <video> drawn into a 64×48 canvas, counted into two histograms, the pixels dropped. */
function sampleVideo(image: readonly Lm[] | null): LumaSample | null {
  const video = poseService().video;
  if (!video || !video.videoWidth || typeof document === 'undefined') return null;
  try {
    lumaCanvas ??= document.createElement('canvas');
    lumaCanvas.width = LUMA_W; lumaCanvas.height = LUMA_H;
    const ctx = lumaCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, LUMA_W, LUMA_H);
    const px = ctx.getImageData(0, 0, LUMA_W, LUMA_H).data;
    const box = image ? bodyBox(image) : null;
    return { frame: lumaHistogram(px, LUMA_W, LUMA_H), body: box ? lumaHistogram(px, LUMA_W, LUMA_H, box) : null };
  } catch {
    return null;   // a tainted or not-yet-decoded picture: no sample, the check reads light from the landmarks alone
  }
}

function pageBodyPlay(): BodyPlay {
  return (page ??= createBodyPlay({
    source: sharedPoseSource(),
    service: poseService(),
    session: sessionStore,
    storage: (() => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } })(),
    unlockAudio: () => SoundKit.unlock(),
    voice: {
      load() {
        void VoiceKit.load([{ cast: COACH_CAST, group: COACH_CAST }])
          .then((idx) => { bank = new Set(idx.flatMap((b) => b.lines.map((l) => `${b.cast}/${l.id}`))); })
          .catch(() => { /* no bank: the lines stay on screen, unspoken */ });
      },
      play(clip, caption) {
        void VoiceKit.play({
          cast: COACH_CAST, role: 'coach', channel: 'player', clips: [clip], caption, speaker: 'Coach',
          sec: VoiceKit.line(clip)?.sec ?? 2, priority: 1, interrupt: false, pan: 0, gain: 1,
        }, 'venice').catch(() => false);
      },
      bank: () => bank,
    },
    sampleLuma: sampleVideo,
    pauseGame() {
      emitToLive({ t: 'button', btn: 'START', pressed: true });
      emitToLive({ t: 'button', btn: 'START', pressed: false });
    },
    onPageHidden(fn) {
      if (typeof document === 'undefined') return;
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') fn(); });
    },
    now: () => performance.now(),
  }));
}

/** The page's body play (built on first use, in the browser). */
export const bodyPlay: BodyPlay = {
  view: () => pageBodyPlay().view(),
  subscribe: (fn) => pageBodyPlay().subscribe(fn),
  remembered: (k) => pageBodyPlay().remembered(k),
  begin: (k) => pageBodyPlay().begin(k),
  again: () => pageBodyPlay().again(),
  handOver: () => pageBodyPlay().handOver(),
  end: (k) => pageBodyPlay().end(k),
  collapse: (on) => pageBodyPlay().collapse(on),
  button: () => pageBodyPlay().button(),
};

/** What body play looks like before the page is live (server render, hydration): off. */
export const BODY_PLAY_OFF: BodyPlayView = Object.freeze({
  key: null, stage: 'off', collapsed: false, checking: false,
  camera: { state: 'idle', why: null, aspect: DEFAULT_ASPECT, portrait: false, source: null },
  space: null, poseHz: null, jumpHeight: null,
}) as BodyPlayView;

// ── the probe's hook ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * window.__FEL_SPACE__: the space check without a click, for scripts/probes/_space-check-live.mts. The same gate as the
 * feed and __FEL_BODY__ (lib/pose/feed.ts): development, or a production build on this machine with ?agent=1.
 * `shortcut` is the header Body button's own action; `session` is the running game's card and phase (the harness's
 * 'paused' is published nowhere else).
 */
export interface SpaceHook {
  view(): BodyPlayView;
  session(): ReturnType<typeof sessionStore.view>;
  begin(key: string): Promise<boolean>;
  again(): void;
  handOver(): void;
  end(key?: string | null): void;
  shortcut(): Promise<BodyButtonAction>;
}
declare global {
  interface Window { __FEL_SPACE__?: SpaceHook }
}
if (typeof window !== 'undefined' && feedHookAllowed(process.env.NODE_ENV, agentEnabled(), window.location.hostname)) {
  window.__FEL_SPACE__ = {
    view: () => bodyPlay.view(),
    session: () => sessionStore.view(),
    begin: (k) => bodyPlay.begin(k),
    again: () => bodyPlay.again(),
    handOver: () => bodyPlay.handOver(),
    end: (k) => bodyPlay.end(k),
    shortcut: () => bodyPlay.button(),
  };
}
