// CourtCarnivalMode v3 — A+ mission #3 (2026-09-06; benchmark Wii Sports Resort floor + Mario Party readability).
//
// v2 drew a random four of six events and raced a rolled number. v3 keeps every event byte-identical and fixes the party:
//   * a player-count screen — solo against the rival, or two on one screen taking turns on the same event (pass-and-play,
//     the DunkDuel format: P1 plays, the event rebuilds, P2 plays, the result compares);
//   * the solo rival PLAYS ON THE BOARD: its score for an event ticks up through the event on a smoothstep, so the race
//     is watched, not revealed (CarnivalNight.rivalProgress);
//   * one body per role — the party-goers on the Carnival Court hub are hidden while an event runs (each event spawns
//     its own player), and come back for the result card and the finale, where they react;
//   * the Carnival Court is mounted as the HUB under the reveal, result and finale cards; events paint their own floor,
//     so the hub hides while they run;
//   * a SCOREBOARD between events (HudScoreCard rows: who took which event) and a readable reveal card (title + verb).
// The rules (seeded draw, rival ticker, banking, the champion) are pure in core/CarnivalNight.ts and tested.

import type { HudValue, ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import * as BABYLON from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { DEFAULT_HERO_URL } from '../core/athleteRoster';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { BeatOwner } from '../anim/beatOwner';
// BIOMECH-WAVE2 (2026-09-09) — the game-wide bar on the carnival hub (SPEC-FEL-BIOMECH-GAMEWIDE asks carnival for "G2 +
// G5 minimum; facing where loco exists"). Measured on 2942860: the host and the guest stand at FIXED yaws in
// `SPORT_CLIP.idle` for the whole night — they never look at each other, at the player, or at the event that is being
// played, and the result beats (the winner's celebrate, the loser's flinch) play on a body whose chest is still in the
// idle's shape. There is no loco here, so G1 is the OTHER BODY: the Posture Poses layer squares each of them onto the
// other, and the result windows finally read as a body (chest open and chin up / shoulders in and chin down).
import { mountPostureLayer, type PostureLayer } from '../anim/PostureLayer';
import { stagePose, STAGE_INPUT_IDLE, type StagePostureInput } from '../core/StagePosture';
import { refuse } from '../core/Refusal';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { allCarnivalEvents, type CarnivalEvent } from './carnivalEvents';
import {
  pickNight, rollRival, rivalProgress, freshTally, bankEvent, nightChampion, nightBoard, type NightTally,
} from '../core/CarnivalNight';

type Phase = 'pick' | 'reveal' | 'playing' | 'handoff' | 'eventOver' | 'finale';
const PICK_TIMEOUT_S = 6;
const REVEAL_S = 2.0;
const HANDOFF_S = 2.2;
const BOARD_S = 3.2;
/** The hub under the cards: the Carnival Court, framed by ITS OWN spec camera (every venue spec carries a designed
 *  establishing shot) with the party-goers on the spec's two actor spots. A hand-placed camera sat inside the map's
 *  geometry on two venues in a row; the spec's camera is the one that was authored to see the floor. */
const HUB_VENUE = 'court_carnival';
const HUB_SPOTS: [BABYLON.Vector3, BABYLON.Vector3] = [new BABYLON.Vector3(-1.5, 0, 5), new BABYLON.Vector3(1.5, 0, 2)];   // = VENUE_SPECS.court_carnival.actors

/** One line per event for the reveal card — the verb, not the rules. */
const BLURB: Record<string, string> = {
  slam_rush: 'Hold CHARGE, let go at the top — every make counts',
  strike_storm: 'Mash GO · TRICK · POWER on the bag',
  trick_gauntlet: 'Pop, flip, spin (stick + TRICK) — chain tricks for score',
  hot_shot: 'Aim, GO to power, GO to shoot — beat the keeper',
  coin_storm: 'Sprint the pattern — clear it and a fresh one drops',
  counter_strike: 'Read the wind-up, tap GO at the last instant',
};

/** Everything an instance owns. Keyed by the harness scene: a host that mounts twice (React strict mode: effect →
 *  cleanup → effect) runs two load()s that INTERLEAVE, and module-level state let the phantom's hub win over the live
 *  scene's (measured on /play/carnival: the live scene sat on the mood sky). */
interface St {
  scene: BABYLON.Scene;
  events: CarnivalEvent[];
  idx: number;
  phase: Phase;
  phaseSec: number;
  pickSec: number;
  autoBegin: boolean;
  starting: boolean;
  current: CarnivalEvent | null;
  players: number;
  turn: number;
  turnPoints: [number, number];
  tally: NightTally;
  rivalTarget: number;
  ended: boolean;
  hub: VenueHandle | null;
  host: SpawnedCharacter | null;
  guest: SpawnedCharacter | null;
  /** ANIM-READABILITY (creative, 2026-09-07): the one owner of each party-goer's clips (idle + the result / finale beats). */
  hostBody: BeatOwner | null;
  guestBody: BeatOwner | null;
  /** BIOMECH-WAVE2: the Posture Poses layer on each party-goer, and the body each is fed. */
  hostPP: { layer: PostureLayer; dispose(): void } | null;
  guestPP: { layer: PostureLayer; dispose(): void } | null;
  hostBio: StagePostureInput;
  guestBio: StagePostureInput;
  anchor: BABYLON.TransformNode | null;
  /** A+ P0 juice latches: one event-win punch per event (reset when the next event starts), one champion punch per night. */
  eventLatch: boolean;
  champLatch: boolean;
}

const states = new WeakMap<BABYLON.Scene, St>();
const live = new Set<St>();

export const CourtCarnivalMode: ModeDefinition = (() => {
  const st = (ctx: ModeContext): St | undefined => states.get(ctx.scene);
  const names = (S: St): [string, string] => (S.players > 1 ? ['P1', 'P2'] : ['YOU', 'RIVAL']);
  function setPhase(S: St, p: Phase): void {
    S.phase = p; S.phaseSec = 0;
    // G1: between results the two of them WATCH each other (and whatever is being played) instead of staring past it
    if (p !== 'eventOver' && p !== 'finale') { S.hostBio.celebrating = S.hostBio.dejected = false; S.guestBio.celebrating = S.guestBio.dejected = false; }
    S.hostBio.watching = S.guestBio.watching = true;
  }
  /** `winner` 0 = host, 1 = guest, null = a tie (both keep watching). */
  function setResult(S: St, winner: 0 | 1 | null): void {
    S.hostBio.celebrating = winner === 0; S.hostBio.dejected = winner === 1;
    S.guestBio.celebrating = winner === 1; S.guestBio.dejected = winner === 0;
  }

  // ── A+ P0 juice (PM brief CARNIVAL-A-PLUS-P0, 2026-09-07): Mario Party readability with Wii Sports weight. No slowMo, no
  // juice.impact({ slow }), no HoopJuice. The event's own chime, cheer and confetti stay; ONE thud (no feel + SoundKit stack).
  /** You took the event: latched hit-stop + shake + short flash + one low thud. Once per event. */
  function eventWinPunch(ctx: ModeContext, S: St): void {
    if (S.eventLatch) return; S.eventLatch = true;
    ctx.juice.hitStop(45); ctx.juice.shake(0.10, 140); ctx.juice.flash('#fff6dd', 90);
    SoundKit.play('impact', { pitch: 0.7, volume: 0.5 });
    console.info('[CARN-JUICE] event win punch');
  }
  /** The rival (or P2) took it: a soft flash only. */
  function rivalSoftFlash(ctx: ModeContext, tag: string): void { ctx.juice.flash('#ffd9d9', 70); console.info(`[CARN-JUICE] soft flash (${tag})`); }
  /** CARNIVAL CHAMPION: latched hit-stop + shake + gold flash; the cheer, confetti and celebrate stay. Once per night. */
  function championPunch(ctx: ModeContext, S: St): void {
    if (S.champLatch) return; S.champLatch = true;
    ctx.juice.hitStop(60); ctx.juice.shake(0.14, 160); ctx.juice.flash('#FFD700', 140);
    console.info('[CARN-JUICE] champion punch');
  }

  /** The hub is MOUNTED for hub phases and DISPOSED while an event runs — not hidden. A mounted venue finishes loading
   *  its map asynchronously and snaps the camera to itself when it lands; with the hub merely hidden, that late snap
   *  arrived after the first event had set its own camera and left the frame on the sky (measured on /play/carnival).
   *  Who Scene It mounts and disposes a venue per question the same way. */
  function showHub(ctx: ModeContext, S: St, on: boolean): void {
    if (on) {
      if (!S.hub) { S.hub = mountVenue(ctx, HUB_VENUE, { keepGameplayCamera: true }); S.hub?.hidePlaceholders(); }
      // A FOLLOW camera around a still anchor, not a fixed shot: fixed mode places the camera but the frame guard
      // measured it aimed away ("hero BEHIND camera") and the frame sat on the sky. Follow aims every frame. The anchor
      // is the court's centre; the objective is the midpoint of the two actor spots, so the two-shot looks past the
      // centre at the party-goers with the court under them.
      if (!S.anchor || S.anchor.isDisposed()) S.anchor = new BABYLON.TransformNode('carnival_hub_anchor', ctx.scene);
      S.anchor.position.set(0, 1.2, 0);
      const mid = HUB_SPOTS[0].add(HUB_SPOTS[1]).scale(0.5); mid.y = 1.2;
      ctx.heroRef.current = S.anchor; ctx.objectiveRef.current = mid;
      ctx.camDirector.setPreset('court');
      ctx.camDirector.snapTo(S.anchor.position, mid);
    } else {
      S.hub?.dispose(); S.hub = null;
    }
    S.host?.root.setEnabled(on);
    S.guest?.root.setEnabled(on);
  }

  function hud(ctx: ModeContext, S: St, extra: Record<string, HudValue> = {}): void {
    ctx.setHud({
      score: S.tally.points[0],
      rivalScore: S.tally.points[1],
      players: S.players, eventNum: S.current || S.idx < S.events.length ? `${Math.min(S.idx + 1, S.events.length)}/${S.events.length}` : '',
      p1name: names(S)[0], p2name: names(S)[1],
      ...extra,
    });
  }

  // ── pick ────────────────────────────────────────────────────────────
  function showPick(ctx: ModeContext, S: St): void {
    ctx.setHud({
      banner: `PLAYERS   ◀  ${S.players}  ▶`,
      hint: S.players > 1 ? 'two on one screen · you take turns on every event · any face button starts' : 'solo vs the rival · ◀ ▶ adds a player · any face button starts',
      board: null, boardTitle: '', blurb: '', players: S.players, score: 0, rivalScore: 0, eventNum: '',
    });
  }

  function begin(ctx: ModeContext, S: St): void {
    if (S.phase !== 'pick' || S.starting) return;
    S.starting = true;
    void startEvent(ctx, S);
  }

  // ── an event ────────────────────────────────────────────────────────
  async function startEvent(ctx: ModeContext, S: St): Promise<void> {
    S.current = S.events[S.idx];
    S.turn = 0; S.turnPoints = [0, 0]; S.eventLatch = false;   // a fresh event gets one win punch at most
    setPhase(S, 'reveal');
    showHub(ctx, S, true);
    hud(ctx, S, { banner: `NEXT UP: ${S.current.title}`, blurb: BLURB[S.current.id] ?? '', board: null, boardTitle: '', hint: '' });
    SoundKit.play('powerUp');
    // SCORECARD FEEL: the night is four events, and the turn of one is the biggest beat the hub has (3 juice beats a minute)
    ctx.juice.flash('#ffd75e', 110);
    ctx.juice.callout(S.current.title, '#ffd75e', 900);
    await new Promise((r) => setTimeout(r, REVEAL_S * 1000));
    if (S.ended || S.scene.isDisposed) return;
    await runAttempt(ctx, S);
  }

  async function runAttempt(ctx: ModeContext, S: St): Promise<void> {
    if (!S.current) return;
    showHub(ctx, S, false);                          // the event paints its own floor and spawns its own player
    ctx.setHud({ banner: '', blurb: '' });
    await S.current.build(ctx);
    if (S.ended || S.scene.isDisposed) return;
    if (S.players === 1) S.rivalTarget = Math.round(rollRival(S.current.rivalRange) * S.current.pointsPerUnit);
    setPhase(S, 'playing');
    SoundKit.play('whistle');
    hud(ctx, S, { time: S.current.durationSec, turnLabel: S.players > 1 ? `${names(S)[S.turn]} — GO` : '' });
  }

  function endAttempt(ctx: ModeContext, S: St): void {
    if (!S.current) return;
    const raw = S.current.tick(ctx, 0);
    const points = Math.round(raw * S.current.pointsPerUnit);
    S.current.teardown();
    S.turnPoints[S.turn] = points;
    if (S.players > 1 && S.turn === 0) {
      // pass the pad: same event, fresh build, P2's turn
      S.turn = 1;
      setPhase(S, 'handoff');
      showHub(ctx, S, true);
      SoundKit.play('uiTick', { pitch: 1.1 });
      hud(ctx, S, { banner: `${S.current.title}: ${names(S)[0]} ${points}`, blurb: `${names(S)[1]} — YOUR TURN`, time: null, turnLabel: '' });
      return;
    }
    if (S.players === 1) S.turnPoints[1] = S.rivalTarget;
    settleEvent(ctx, S);
  }

  function settleEvent(ctx: ModeContext, S: St): void {
    if (!S.current) return;
    const [a, b] = S.turnPoints;
    const w = bankEvent(S.tally, S.current.title, a, b);
    SoundKit.play('score');
    showHub(ctx, S, true);
    // the party-goers REACT to WHO took the event: the winner celebrates, the loser takes it on the chin; a tie shrugs
    const rivalTookIt = w === 1;
    const winnerBody = w === -1 ? null : rivalTookIt ? S.guestBody : S.hostBody;
    const loserBody = w === -1 ? null : rivalTookIt ? S.hostBody : S.guestBody;
    winnerBody?.beat(SPORT_CLIP.scoreCelebrate, { fadeSec: 0.12 });   // both settle back into SPORT_CLIP.idle on their own
    loserBody?.beat(SPORT_CLIP.karateHitReact, { fadeSec: 0.08 });
    // G5: the body under those beats — the winner's chest opens, the loser's closes (they used to play on the idle's shape)
    setResult(S, w === -1 ? null : rivalTookIt ? 1 : 0);
    if (w === 0) { EffectsKit.burst(ctx.scene, ctx.camera.position, 'confetti'); SoundKit.play('crowdCheer', { volume: 0.4 }); eventWinPunch(ctx, S); }
    else if (w === 1) { SoundKit.play('crowdGroan', { volume: 0.4 }); rivalSoftFlash(ctx, 'event'); }
    const [n1, n2] = names(S);
    hud(ctx, S, {
      banner: `${S.current.title}: ${n1} ${a} · ${n2} ${b}`,
      blurb: w === -1 ? 'TIE — nobody takes it' : `${names(S)[w]} TAKES IT`,
      board: nightBoard(S.tally, names(S)),
      boardTitle: S.idx + 1 < S.events.length ? `NEXT — EVENT ${S.idx + 2} / ${S.events.length}` : 'FINAL EVENT DONE',
      time: null, turnLabel: '',
    });
    S.current = null;
    setPhase(S, 'eventOver');
  }

  function advance(ctx: ModeContext, S: St): void {
    if (S.ended) return;
    S.idx++;
    if (S.idx >= S.events.length) { finale(ctx, S); return; }
    void startEvent(ctx, S);
  }

  function finale(ctx: ModeContext, S: St): void {
    setPhase(S, 'finale');
    S.ended = true;
    SoundKit.play('whistle');
    const champ = nightChampion(S.tally);
    const won = champ === 0;
    if (won) { SoundKit.play('crowdCheer'); EffectsKit.burst(ctx.scene, ctx.camera.position, 'confetti'); championPunch(ctx, S); }
    else rivalSoftFlash(ctx, 'runner-up');
    const champBody = champ === 0 ? S.hostBody : S.guestBody;
    const runnerUpBody = champ === 0 ? S.guestBody : S.hostBody;
    champBody?.beat(SPORT_CLIP.scoreCelebrate, { fadeSec: 0.12 });
    runnerUpBody?.beat(SPORT_CLIP.karateHitReact, { fadeSec: 0.08 });
    setResult(S, champ === 0 ? 0 : 1);
    const [n1, n2] = names(S);
    hud(ctx, S, {
      banner: S.players > 1 ? `${names(S)[champ]} TAKES THE CARNIVAL` : (won ? 'CARNIVAL CHAMPION!' : 'RIVAL TAKES THE CARNIVAL'),
      blurb: `${n1} ${S.tally.points[0]} · ${n2} ${S.tally.points[1]}`,
      board: nightBoard(S.tally, names(S)), boardTitle: 'FINAL',
    });
    ctx.end(won ? 'CHAMPION' : 'RUNNER_UP', S.tally.points[0], {
      rivalPoints: S.tally.points[1], events: S.events.length, players: S.players,
      eventsWon: S.tally.won[0].length, rivalEventsWon: S.tally.won[1].length, champion: champ,
    });
  }

  return {
    modeId: 'carnival', mood: 'goldenHour', camPreset: 'court',

    async load(ctx: ModeContext) {
      const qs = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const q = qs?.get('players') ?? null;
      // `?events=slam_rush,counter_strike` names the night's draw in order (probes / dev); the seeded draw otherwise.
      const pool = allCarnivalEvents();
      const named = (qs?.get('events') ?? '').split(',').map((id) => pool.find((e) => e.id === id.trim())).filter((e): e is CarnivalEvent => !!e);
      const S: St = {
        scene: ctx.scene, events: named.length ? named : pickNight(pool, Date.now() % 100000), idx: 0, phase: 'pick', phaseSec: 0, pickSec: 0,
        // Nothing is built before the harness is PLAYING: an event built inside load() had its camera reset by the
        // harness's own start-of-play step and the first event rendered sky (measured on /play/carnival?players=1).
        autoBegin: !!q, starting: false, current: null,
        players: Math.max(1, Math.min(2, Number(q ?? 1) || 1)), turn: 0, turnPoints: [0, 0], tally: freshTally(), rivalTarget: 0,
        ended: false, hub: null, host: null, guest: null, hostBody: null, guestBody: null, anchor: null, eventLatch: false, champLatch: false,
        hostPP: null, guestPP: null, hostBio: { ...STAGE_INPUT_IDLE, watching: true }, guestBio: { ...STAGE_INPUT_IDLE, watching: true },
      };
      states.set(ctx.scene, S); live.add(S);
      SoundKit.startAmbient('stadium');

      // THE HUB: the Carnival Court under the cards, party-goers on its actor spots — you (and P2 / the rival)
      S.host = await CharacterLibrary.spawn(ctx.scene, DEFAULT_HERO_URL, { position: HUB_SPOTS[0].clone(), yawRad: Math.PI });
      installSafePlay(S.host.animator, 'carnival-host');
      S.hostBody = new BeatOwner(S.host.animator); S.hostBody.loop(SPORT_CLIP.idle);
      S.guest = await CharacterLibrary.spawn(ctx.scene, DEFAULT_HERO_URL, { position: HUB_SPOTS[1].clone(), yawRad: 0, tint: '#ff2d78' });
      installSafePlay(S.guest.animator, 'carnival-guest');
      S.guestBody = new BeatOwner(S.guest.animator); S.guestBody.loop(SPORT_CLIP.idle);
      // G1/G5: each one squares onto the other's chest and holds a readable result silhouette
      const chestOf = (c: SpawnedCharacter): BABYLON.Vector3 => c.root.position.add(new BABYLON.Vector3(0, 1.32, 0));
      S.hostPP?.dispose(); S.guestPP?.dispose();
      S.hostPP = mountPostureLayer(ctx.scene, S.host.skeleton, S.host.root, () => {
        const g = S.guest; if (!g) return null;
        const { window, pose, legs } = stagePose(S.hostBio);
        const at = chestOf(g); return { pose, legs, aim: at, eyes: at, window };
      }, 'CARN-PP');
      S.guestPP = mountPostureLayer(ctx.scene, S.guest.skeleton, S.guest.root, () => {
        const h = S.host; if (!h) return null;
        const { window, pose, legs } = stagePose(S.guestBio);
        const at = chestOf(h); return { pose, legs, aim: at, eyes: at, window };
      }, 'CARN-PP-GUEST');
      if (process.env.NODE_ENV === 'development') {
        const dev = (window as unknown as { __FEL_DEV__?: { stagePosture?: unknown } }).__FEL_DEV__;
        if (dev) dev.stagePosture = {   // BIOMECH-WAVE2 probes — the HUB pair (each event spawns its own body, which dev.hero() points at)
          host: () => S.hostPP?.layer.get() ?? null, guest: () => S.guestPP?.layer.get() ?? null,
          bio: () => ({ host: { ...S.hostBio }, guest: { ...S.guestBio } }),
          aim: () => { const g = S.guest; return g ? { x: g.root.position.x, y: g.root.position.y + 1.32, z: g.root.position.z } : null; },
        };
      }
      if (S.scene.isDisposed) return;
      showHub(ctx, S, true);
      if (!S.autoBegin) showPick(ctx, S);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      const S = st(ctx); if (!S) return;
      SoundKit.unlock();
      if (S.phase === 'pick') {
        if (e.t === 'dpad' && e.pressed && (e.dir === 'left' || e.dir === 'right')) {
          S.players = e.dir === 'right' ? Math.min(2, S.players + 1) : Math.max(1, S.players - 1);
          SoundKit.play('uiTick', { pitch: e.dir === 'right' ? 1.2 : 0.9, volume: 0.3 });
          showPick(ctx, S);
        } else if (e.t === 'button' && e.pressed && (e.btn === 'A' || e.btn === 'B' || e.btn === 'X' || e.btn === 'Y')) begin(ctx, S);
        return;
      }
      // SCORECARD CONTROLS (2026-09-15): between events — the reveal, the hand-off, the board — every press fell through to
      // nothing (21 % of the session's presses once the carnival could be measured at all). Each waiting phase says what
      // it is waiting for.
      if (S.phase !== 'playing' || !S.current) {
        if ((e.t === 'button' || e.t === 'dpad') && e.pressed) {
          refuse(ctx, S.phase === 'eventOver' ? 'NEXT EVENT COMING UP'
            : S.phase === 'handoff' ? 'PASS THE PAD'
            : S.phase === 'reveal' ? 'HERE COMES THE EVENT'
            : 'THE NIGHT IS OVER');
        }
        return;
      }
      S.current.onInput(ctx, e);
    },

    update(ctx: ModeContext, dt: number) {
      const S = st(ctx); if (!S || S.ended) return;
      S.phaseSec += dt;

      if (S.phase === 'pick') { S.pickSec += dt; if (S.autoBegin || S.pickSec >= PICK_TIMEOUT_S) begin(ctx, S); return; }

      if (S.phase === 'playing' && S.current) {
        S.current.tick(ctx, dt);
        const left = Math.max(0, S.current.durationSec - S.phaseSec);
        const extra: Record<string, HudValue> = { time: Math.ceil(left) };
        if (S.players === 1) {
          // the rival plays on the board: their points for THIS event tick in through the event
          const liveRival = Math.round(S.rivalTarget * rivalProgress(S.phaseSec / S.current.durationSec));
          extra.rivalScore = S.tally.points[1] + liveRival;
          extra.rivalLive = liveRival;
        } else {
          extra.turnLabel = `${names(S)[S.turn]} — ${Math.ceil(left)}s`;
        }
        ctx.setHud(extra);
        if (left <= 0) endAttempt(ctx, S);
        return;
      }

      if (S.phase === 'handoff' && S.phaseSec >= HANDOFF_S) { void runAttempt(ctx, S); return; }
      if (S.phase === 'eventOver' && S.phaseSec >= BOARD_S) { advance(ctx, S); return; }

      // stall-proofing: a reveal or build that hangs past a generous budget forces the transition it was heading for
      if (S.phase === 'reveal' && S.phaseSec > REVEAL_S + 6 && S.current) {
        console.warn('[FEL-CARNIVAL] watchdog tripped in phase "reveal" — forcing the attempt');
        setPhase(S, 'playing');
      }
    },

    dispose() {
      // No ctx here. The harness disposes the scene right after this call, which takes every mesh with it; the only
      // things to do by hand are the instance whose scene is GOING away — found on the next tick by `isDisposed` —
      // and the ambient bed, which stays up while another instance is still live (strict-mode phantom stop).
      setTimeout(() => {
        for (const S of live) if (S.scene.isDisposed) { S.ended = true; S.current = null; S.hostPP?.dispose(); S.hostPP = null; S.guestPP?.dispose(); S.guestPP = null; live.delete(S); }
        if (live.size === 0) SoundKit.stopAmbient();
      }, 0);
    },
  };
})();

// HUD fields: eventNum ('2/4'), score/rivalScore (running points; rivalScore ticks live in solo), rivalLive, players,
// p1name/p2name, turnLabel (2P: whose attempt and the clock), time (seconds left), banner (reveal / result / finale
// title), blurb (the reveal's verb line, the result's "P1 TAKES IT", the handoff's "P2 — YOUR TURN"), board +
// boardTitle (HudScoreCard rows between events and at the finale).
// modeVerbs: the 'carnival' entry (GO / TRICK / POWER / CHARGE) — each event maps its own buttons via onInput.
