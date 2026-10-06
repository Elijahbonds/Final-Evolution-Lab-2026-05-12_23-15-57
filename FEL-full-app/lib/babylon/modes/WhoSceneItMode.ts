// WhoSceneItMode — Who Scene It as a LIVE mode (SPEC-PASSION-PIPELINES lane 3 W1). The 2D deck asked trivia; this asks you
// to recognise the place: each question mounts its venue live behind the card and the camera sweeps it while the clock
// runs. Four options ride the four face buttons (A B X Y). QuizCore owns the points — speed-scaled, streak multiplier.
// Content is FEL's own world (quizPacks) or an approved community Scene Pack (?pack=<cardId>, lane 3 W2).
//
// A+ MISSION #2 (2026-09-06, benchmark Wii Sports Resort floor + Mario Party readability): the questions come in ROUNDS,
// one per scene category (COURTS / COMBAT / OUTDOORS / STAGES), with a scoreboard between rounds; up to two players buzz
// in on one screen (P1 = the face buttons, P2 = the d-pad / arrows: ▲ ▶ ◀ ▼ = A B C D). First correct buzz locks the
// question, a wrong buzz locks that player out and the other may steal. SceneBuzz.ts owns the rules (pure, tested); this
// file wires input, venues, the sweep camera and the HUD. Built as a factory so every harness instance owns its state.
//
// IMPROVE (2026-10-06, the owner's 20 picks): each venue brings back its own sky and fog when shown; the reveal marks the
// right card and each pick; buzz → verdict poses no longer drop to idle; a wrong 2P buzz flinches; the reveal is skippable
// after a beat; no auto-start with a pad; a CPU rival on P2's podium in solo; each question opens tight and widens with the
// clock; easy → hard; wrong answers drawn per play; thicker categories; a tick under 3 s; a rumble on a right answer; P2's
// d-pad matches the 2×2 grid; a venue recap at the end; REPLAY in place; only the drawn venues on the shelf; the bodies
// spawn once, on the pick screen; no per-frame Vector3 and no stray banner timer. The pure rules are in whoScenePlay.ts.
import { TransformNode, Vector3 } from '@babylonjs/core';
import type { HudValue, ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { answerOwner, type LocalPress } from '../core/localPads';
import { mountVenue as mountNexusVenue, type VenueHandle } from '../core/NexusVenue';
import { applySceneEnv, captureSceneEnv, makeVenueShelf, type SceneEnv } from './whoSceneItVenues';
import {
  armRival, canSkipReveal, comparedRun, pickAutoStarts, recapRows, rivalChoice, roundVenues, SCENE_ZOOM, tickSecond,
  venueNeededFrom, zoomShare, type RecapEntry, type RivalPlan,
} from './whoScenePlay';
import { SPORT_CLIP } from '../anim/clipRegistry';
import { COMBAT_ARENAS } from '../combat/arenas';
import { HAPTIC, padRumble } from '../premium/Haptics';
import { WHO_SCENE_IT, type QuizPack, type QuizQuestion } from '../core/QuizCore';
import { BuzzMatch, buildRounds as drawSceneRounds, MAX_PLAYERS, splitSceneVenue, type Resolution, type SceneRound } from '../core/SceneBuzz';
import { WHO_SCENE_IT_PACK } from '../content/quizPacks';
import { SoundKit } from '../audio/SoundKit';
import { Contestants, podiums } from '../party/Contestants';
import { refuse } from '../core/Refusal';

const REVEAL_S = 1.5;            // how long the answer card stays up before the next venue mounts
const BOARD_S = 3.2;             // the between-rounds scoreboard
const PICK_TIMEOUT_S = 6;        // the player-count screen starts solo by itself (capture harnesses, no pad)
const QUESTIONS_PER_CATEGORY = 2;
const FACE: Array<'A' | 'B' | 'X' | 'Y'> = ['A', 'B', 'X', 'Y'];
/** P2's answers on the d-pad, in card order A B C D. IMPROVE (2026-10-06, #14): the cards are a 2×2 grid (A B over C D) and
 *  ▲ ▶ ▼ ◀ used to map A B C D, so ◀ — a LEFT press — picked the bottom-RIGHT card. Now each arrow is its card's corner
 *  turned 45° clockwise: ▲ top-left, ▶ top-right, ▼ bottom-right, ◀ bottom-left. */
export const DPAD: Array<'up' | 'right' | 'down' | 'left'> = ['up', 'right', 'left', 'down'];
// The orbit used to run at radius 13, which crosses the venue walls (who_scene_it at z −10, gymnastics at z −12).
// 8.5 keeps the camera on the play side of both. Feel number: camera distance, 13 → 8.5.
export const WHO_SCENE_SWEEP = { radius: 8.5, height: 5.5, speed: 0.12 };
/** IMPROVE (#20): the sweep's look-at, one Vector3 for the life of the module (it was a new one every frame). */
const SWEEP_TARGET = new Vector3(0, 1.2, 0);
/** The Scene Vault: behind the pick screen, and the fallback when a question's venue will not build. */
const VAULT = 'who_scene_it';
const PODIUM_AT = { z: 4.4, stageZ: -2.4 };
/** IMPROVE (#20): how long the opening banner holds (it was a setTimeout nobody cleared). */
const OPEN_BANNER_S = 1.6;
/** IMPROVE (#3): NEW TUNED NUMBER — the buzz slap reads for this long before the verdict pose replaces it. */
const VERDICT_BEAT_S = 0.3;
/** IMPROVE (#15): NEW TUNED NUMBERS — the venue recap holds this long before the result card, a press moves on after the second. */
const RECAP_S = 6, RECAP_SKIP_S = 0.6;

/** IMPROVE (2026-10-06, #16): every live instance's in-place restart, for the host's REPLAY (replayWhoSceneIt). */
const liveRestarts = new Set<() => boolean>();
/**
 * GO AGAIN in place (Brain Brawl's pattern): the host runs this mode `continuous`, so a finished match reports its card and
 * the stage stays up; REPLAY lands here and starts a new set of rounds with the same players, its venues already built
 * during the recap. False when no finished match was waiting.
 */
export function replayWhoSceneIt(): boolean {
  let n = 0;
  for (const restart of liveRestarts) if (restart()) n++;
  return n > 0;
}

type Phase = 'pick' | 'play' | 'board' | 'done';

export function makeWhoSceneItMode(): ModeDefinition {
  function pressFrom(e: FelInput): LocalPress | null {
    if (e.t === 'button' && e.pressed) return 'face';
    if (e.t === 'dpad' && e.pressed) return e.src === 'key' ? 'key-dpad' : 'dpad';
    return null;
  }
  function seatAnswer(ctx: ModeContext, e: FelInput, slot: number): void {
    const from = pressFrom(e);
    if (!from) return;
    const who = answerOwner({ pads: ctx.input.pads().length, slot, playerCount: players, from });
    if (phase === 'done') {
      // #15: the recap is up — a press after its beat goes on to the result card
      if (who !== null && pendingEnd && endAge >= RECAP_SKIP_S) flushEnd();
      return;
    }
    if (phase !== 'play') {
      if (who === 0 && from === 'face') refuse(ctx, phase === 'board' ? 'NEXT SCENE…' : 'WAIT…');
      return;
    }
    if (who === null) return;
    if (revealT > 0) {
      // IMPROVE (#5): the answer card had a fixed 1.5 s; once it has had its beat, any seated press moves on
      if (canSkipReveal(revealT, REVEAL_S)) { SoundKit.play('uiTick', { volume: 0.3, pitch: 0.9 }); revealT = 0; advance(ctx); }
      else if (who === 0 && from === 'face') refuse(ctx, 'NEXT SCENE…');
      return;
    }
    if (who === 0 && from === 'face' && e.t === 'button') {
      const i = FACE.indexOf(e.btn as 'A' | 'B' | 'X' | 'Y');
      if (i >= 0) answer(ctx, 0, i);
    } else if (who === 1 && (from === 'dpad' || from === 'key-dpad') && e.t === 'dpad') {
      const i = DPAD.indexOf(e.dir);
      if (i >= 0) answer(ctx, 1, i);
    }
  }
  let venue: VenueHandle | null = null;
  let shelf = makeVenueShelf<{ root: { setEnabled(on: boolean): void }; dispose(): void; handle: VenueHandle }>(() => null);
  /**
   * The shelf's builder (load() hands it `mountVenue`). IMPROVE (2026-10-06): #11 — a `venue@arena` key mounts the venue in
   * that combat arena's look; #1 — what the build just wrote to the scene's sky and fog is kept for this key, and put back
   * whenever it is shown (buildNexusScene writes them scene-wide, so the last venue built used to win every question).
   */
  function mountVenue(ctx: ModeContext, key: string, opts: { keepGameplayCamera: boolean }): VenueHandle | null {
    const { venueId, arenaId } = splitSceneVenue(key);
    const arena = arenaId ? COMBAT_ARENAS.find((a) => a.id === arenaId) : undefined;
    const handle = mountNexusVenue(ctx, venueId, { ...opts, ...(arena ? { arena } : {}) });
    if (handle) envs.set(key, captureSceneEnv(ctx.scene));
    return handle;
  }
  let anchor: TransformNode | null = null;   // a quiz has no hero; the frame guard still wants a subject — an anchor at the floor's centre
  let pack: QuizPack = WHO_SCENE_IT_PACK;
  let match: BuzzMatch | null = null;
  let players = 1;
  let unseat: (() => void) | null = null;
  // BODIES AT THE PODIUMS (2026-09-13). Phase 0 booted this mode and measured ZERO skeletons: a card, a
  // venue sweep and nobody. That breaks the benchmark this mode was given — Mario Party readability, where a
  // spectator understands what is happening in three seconds — because the BUZZ is the whole mechanic of a
  // buzz-in game and there was no way to see who buzzed. The card just locked.
  let cast: Contestants | null = null;
  // IMPROVE (2026-10-06) state — see the header
  let castGen = 0;                                   // #18: a spawn that resolves for an older mount is disposed, not kept
  let castPending = false;                           // #18: one spawn in flight at a time
  let rival = false;                                 // #7: the CPU stands at P2's podium (solo, not a compared run)
  let rivalPlan: RivalPlan | null = null;
  let picks: number[] = [-1, -1];                    // #2: what each seat pressed this question
  let answerIdx = -1;                                // #2: the right card, once the question resolves
  let verdicts: { i: number; ok: boolean; t: number }[] = [];   // #3: verdict poses waiting out the buzz beat
  let bannerLeft = 0;                                // #20: the opening banner's clear time, polled in update()
  let recap: RecapEntry[] = [];                      // #15
  let endAge = 0;                                    // #15: how long the recap has been up
  let pendingEnd: (() => void) | null = null;        // #15: the card / end, sent after the recap
  let drawn: { pack: QuizPack; rounds: SceneRound[] } | null = null;   // #17: the next match, drawn before it starts
  const envs = new Map<string, SceneEnv>();          // #1: each venue's own sky and fog
  let shownKey = '';
  let baseFov = 0;                                   // #8: the camera's own lens; the zoom is a share of it
  let liveCtx: ModeContext | null = null;            // #16
  let phase: Phase = 'pick';
  let pickT = 0;
  let clock = WHO_SCENE_IT.timeLimit;
  let revealT = 0;                 // > 0 while the answer card is up
  let boardT = 0;                  // > 0 while the scoreboard is up
  let sweepT = 0;
  let bestStreak: number[] = [0, 0];
  let packTitle = WHO_SCENE_IT_PACK.title;

  async function pickPack(): Promise<QuizPack> {
    try {
      const id = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('pack') : null;
      if (!id) return WHO_SCENE_IT_PACK;
      const r = await fetch('/api/v1/scene-packs'); if (!r.ok) return WHO_SCENE_IT_PACK;
      const j = await r.json() as { packs: (QuizPack & { cardId: string })[] };
      const hit = j.packs.find((p) => p.cardId === id || p.id === id);
      return hit && hit.questions.length ? hit : WHO_SCENE_IT_PACK;
    } catch { return WHO_SCENE_IT_PACK; }
  }

  function current(): QuizQuestion | null { return match?.question ?? null; }

  function controlsHint(): string {
    return players > 1
      ? 'P1: A · B · X · Y   ·   P2: ▲ ▶ ◀ ▼ (arrows)   ·   first right answer takes it, a wrong one hands the steal over'
      : 'A · B · X · Y pick the answer — faster is worth more';
  }

  function hud(ctx: ModeContext, extra: Record<string, HudValue> = {}): void {
    const q = current();
    const m = match;
    const cat = m?.round?.category ?? null;
    ctx.setHud({
      pack: packTitle,
      question: q && m ? `${m.questionNumber} / ${m.totalQuestions}` : '',
      category: cat?.name ?? '', categoryColor: cat?.color ?? '',
      roundLabel: m && m.round ? `ROUND ${m.roundIndex + 1} / ${m.rounds.length}` : '',
      prompt: q?.prompt ?? '', optA: q?.options[0]?.label ?? '', optB: q?.options[1]?.label ?? '', optX: q?.options[2]?.label ?? '', optY: q?.options[3]?.label ?? '',
      clock: Math.max(0, Math.ceil(clock)),
      score: m?.players[0].score ?? 0, streak: m?.players[0].streak ?? 0,
      players: seatCount(), p2score: m?.players[1]?.score ?? 0,
      lockedP1: !!m?.isLockedOut(0), lockedP2: !!m?.isLockedOut(1),
      hint: controlsHint(),
      // IMPROVE (#7): `players` is the seats on the board (the CPU is one), `humans` who holds a pad; #2: the reveal's marks
      humans: players, p2name: m?.players[1]?.name ?? 'P2',
      answerIdx, pickP1: picks[0], pickP2: picks[1],
      ...extra,
    });
  }

  function mountFor(ctx: ModeContext, q: QuizQuestion | null): void {
    const key = q?.sceneVenueId ?? VAULT;
    const prev = shownKey;
    let shown = shelf.show(key);
    shownKey = key;
    if (!shown) { shown = shelf.show(VAULT); shownKey = VAULT; }
    venue = shown?.handle ?? null;
    venue?.hidePlaceholders();
    const env = envs.get(shownKey);
    if (env) applySceneEnv(ctx.scene, env);          // #1: this venue's sky and fog, not the last one built
    // #17: the venue just left behind goes off the shelf when nothing later in the match asks about it
    if (prev && prev !== shownKey && prev !== VAULT && !(match && venueNeededFrom(match.rounds, match.roundIndex, match.questionIndex, prev, VAULT))) {
      shelf.drop(prev); envs.delete(prev);
    }
    sweepT = Math.random() * Math.PI * 2;
    if (!anchor || anchor.isDisposed()) { anchor = new TransformNode('wsi_anchor', ctx.scene); anchor.position.set(0, 1.2, 0); }
    ctx.heroRef.current = anchor; ctx.objectiveRef.current = null;
  }

  // ── the player-count screen ─────────────────────────────────────────
  function showPick(ctx: ModeContext): void {
    layoutCast();
    ctx.setHud({
      pack: packTitle, prompt: '', board: null, boardTitle: '', clock: null,
      banner: `PLAYERS   ◀  ${players}  ▶`,
      hint: players > 1 ? 'two on one screen · P1 faces, P2 arrows · any face button starts' : 'solo · ◀ ▶ adds a player · any face button starts',
      players,
    });
  }

  /** IMPROVE (#7): the board has a CPU seat — one human and a two-seat match. */
  function cpuSeated(): boolean { return !!match && players === 1 && match.players.length === 2; }

  /** Seats on the board: the humans, plus the CPU rival when one is standing in (IMPROVE #7). */
  function seatCount(): number {
    return match ? match.players.length : (rival && players === 1 ? 2 : players);
  }

  /**
   * Put bodies at the podiums, once.
   *
   * IMPROVE (2026-10-06, #18/#19): the bodies used to spawn on the FIRST QUESTION, so the GLB load and the shader compile
   * landed while the clock ran — and `cast` was only set when the spawn resolved, so a slow GLB let begin() and then
   * startQuestion() each start a spawn, the second overwrote the first and those bodies were never disposed. Now both seats
   * spawn once, at load, behind the pick screen (one spawn in flight, tracked; a spawn that resolves for an older mount is
   * disposed), and layoutCast() stands them for the seat count — a lone player centred, the second body hidden.
   */
  function ensureCast(ctx: ModeContext): void {
    if (cast || castPending) return;
    castPending = true;
    const gen = castGen;
    void Contestants.spawn(ctx.scene, podiums(MAX_PLAYERS, PODIUM_AT), 'who-scene-it').then((c) => {
      if (gen !== castGen || ctx.scene.isDisposed) { c.dispose(); return; }
      castPending = false;
      cast = c;
      layoutCast();
    });
  }

  function layoutCast(): void {
    if (!cast) return;
    const spots = podiums(seatCount(), PODIUM_AT);
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const body = cast.at(i);
      if (!body) continue;
      const spot = spots[i];
      body.root.setEnabled(!!spot);
      if (spot) { body.root.position.copyFrom(spot.at); body.root.rotation.y = spot.yaw; }
    }
  }

  /** IMPROVE (#3): through the GUARDED perform — the unguarded one-shot's end callback dropped a verdict to idle 0.08 s in. */
  function buzzPose(i: number): void { cast?.perform(i, SPORT_CLIP.buzzerSlap, { then: SPORT_CLIP.idle }); }
  function queueVerdict(i: number, ok: boolean): void { verdicts.push({ i, ok, t: VERDICT_BEAT_S }); }

  /**
   * IMPROVE (#17): the match is drawn BEFORE it starts — at load, and for the next match during the recap — and only its
   * venues are built (8 and the vault, not the pack's 25). `keep` stays on the shelf too (the venue still behind the recap).
   * #9 / #10: easy → hard, and the wrong answers drawn per play for FEL's own pack.
   */
  function drawMatch(p: QuizPack, keep: string[] = []): void {
    const rounds = drawSceneRounds(p, Date.now() % 100000, QUESTIONS_PER_CATEGORY, { ramp: true, vary: p.id === WHO_SCENE_IT_PACK.id });
    drawn = { pack: p, rounds };
    const ids = [VAULT, ...keep, ...roundVenues(rounds, VAULT)];
    shelf.retain(ids);
    for (const id of envs.keys()) if (!shelf.has(id)) envs.delete(id);
    shelf.preload(ids);
  }

  /** begin()'s draw: the match drawn ahead of time when it is for this pack, else a fresh draw (its venues built now). */
  function buildRounds(p: QuizPack, _seed: number, _perCategory: number): SceneRound[] {
    if (!drawn || drawn.pack !== p) drawMatch(p, shownKey ? [shownKey] : []);
    const rounds = drawn!.rounds;
    drawn = null;
    return rounds;
  }

  /** A question opens: no picks, no answer shown, the rival's plan, and the lens tight on the floor (#8). */
  function openQuestion(ctx: ModeContext): void {
    picks = [-1, -1]; answerIdx = -1;
    rivalPlan = cpuSeated() ? armRival(WHO_SCENE_IT, Math.random) : null;
    if (baseFov > 0) ctx.camera.fov = baseFov * SCENE_ZOOM.start;
  }

  function begin(ctx: ModeContext): void {
    if (phase !== 'pick') return;
    match = new BuzzMatch(buildRounds(pack, Date.now() % 100000, QUESTIONS_PER_CATEGORY), WHO_SCENE_IT, players);
    bestStreak = [0, 0];
    // IMPROVE (#7): solo is no longer "60 % right = win" — the CPU takes P2's podium and buzzes in under the same rules
    if (rival && players === 1) { match = new BuzzMatch(match.rounds, WHO_SCENE_IT, 2); match.players[1].name = 'CPU'; }
    recap = []; verdicts = [];
    if (match.finished) { finish(ctx); return; }
    phase = 'play';
    clock = WHO_SCENE_IT.timeLimit; revealT = 0;
    ensureCast(ctx); layoutCast(); cast?.reset();
    openQuestion(ctx);
    mountFor(ctx, current());
    const cat = match.round?.category;
    hud(ctx, { banner: `${packTitle.toUpperCase()} — ${cat ? `ROUND 1: ${cat.name}` : 'name the place'}`, reveal: null, board: null, boardTitle: '', recap: null });
    bannerLeft = OPEN_BANNER_S;   // #20: cleared in update(), not by an untracked setTimeout
  }

  // ── a question resolves ─────────────────────────────────────────────
  function resolve(ctx: ModeContext, r: Resolution, by: number | null, choice: number | null): void {
    const q = current(); if (!q || !match) return;
    const right = q.options.find((o) => o.id === q.answer)?.label ?? '';
    const name = (i: number) => (match!.players.length > 1 ? `${match!.players[i].name} ` : '');
    answerIdx = q.options.findIndex((o) => o.id === q.answer);   // #2: the host marks the right card and each pick
    rivalPlan = null;
    if (r.kind === 'correct') {
      queueVerdict(r.player, true);
      const p = match.players[r.player];
      bestStreak[r.player] = Math.max(bestStreak[r.player], p.streak);
      SoundKit.play('score', { pitch: 1 + Math.min(0.5, p.streak * 0.08) }); ctx.juice.flash('#fff6dd', 90);
      // #13: a right answer is felt too — a light double pulse, not the wrong answer's thud (a CPU's right answer is not yours)
      if (r.player < players) { HAPTIC.perfect(); padRumble(0.3, 90); }
      recap.push({ venue: right, by: match.players[r.player].name, sec: WHO_SCENE_IT.timeLimit - clock, points: r.points });
      hud(ctx, { banner: `${name(r.player)}CORRECT +${r.points}${p.streak > 1 ? ` · streak x${r.multiplier.toFixed(2)}` : ''}`, reveal: q.explain ?? `It's ${right}.` });
    } else {
      if (by !== null) queueVerdict(by, false);
      SoundKit.play(r.timeout ? 'whistle' : 'miss'); ctx.feel.impact(0.25);
      recap.push({ venue: right, by: null, sec: null, points: 0 });
      const who = by !== null && choice !== null ? `${name(by)}WRONG` : 'TIME';
      hud(ctx, { banner: `${who} — it was ${right}`, reveal: q.explain ?? '' });
    }
    revealT = REVEAL_S;
    bannerLeft = 0;
  }

  function answer(ctx: ModeContext, player: number, choice: number): void {
    if (phase !== 'play' || !match || revealT > 0) return;
    const r = match.answer(player, choice, clock);
    if (r === null) return;      // a locked-out seat's press does nothing — and no longer slaps the buzzer either
    picks[player] = choice;
    buzzPose(player);            // the buzz is visible now; the verdict follows it after VERDICT_BEAT_S
    if (r === 'wrong') {
      // out for this question; the other player can steal with the clock that is left
      queueVerdict(player, false);   // IMPROVE (#4): the locked-out player flinches, so the room sees who is out
      SoundKit.play('miss', { volume: 0.7 }); ctx.feel.impact(0.15);
      bannerLeft = 0;                 // the opening banner's clear must not wipe the steal call
      const other = match.players[1 - player]?.name ?? '';
      hud(ctx, { banner: `${match.players[player].name} OUT — ${other} can steal` });
      return;
    }
    resolve(ctx, r, player, choice);
  }

  function timeout(ctx: ModeContext): void {
    if (!match) return;
    const r = match.timeout();
    if (r) resolve(ctx, r, null, null);
  }

  function advance(ctx: ModeContext): void {
    if (!match) return;
    const step = match.advance();
    if (step === 'match') { finish(ctx); return; }
    if (step === 'round') {
      // the scoreboard between rounds: who took the category, where the scores stand, what comes next
      phase = 'board'; boardT = BOARD_S;
      const next = match.round?.category;
      hud(ctx, {
        prompt: '', banner: '', reveal: null, clock: null,          // no clock while the board is up
        board: match.scoreboard(),                      // HudScoreCard rows: name · score · categories taken
        boardTitle: next ? `NEXT — ROUND ${match.roundIndex + 1}: ${next.name}` : 'SCOREBOARD',
      });
      SoundKit.play('uiTick', { pitch: 0.9 });
      return;
    }
    startQuestion(ctx);
  }

  function startQuestion(ctx: ModeContext): void {
    phase = 'play';
    clock = WHO_SCENE_IT.timeLimit; revealT = 0;
    openQuestion(ctx);
    mountFor(ctx, current());
    hud(ctx, { banner: '', reveal: null, board: null, boardTitle: '' });
  }

  function finish(ctx: ModeContext): void {
    if (phase === 'done') return; phase = 'done';
    venue = null;
    rivalPlan = null; bannerLeft = 0;
    const m = match;
    const total = m?.totalQuestions ?? 0;
    const p1 = m?.players[0]; const p2 = m?.players[1];
    const correct = p1?.correct ?? 0;
    const winner = m ? m.leader : -1;
    const seats = m?.players.length ?? players;
    // IMPROVE (#7): with the CPU at P2's podium, solo is won by beating it; a compared run (no CPU) keeps the 60 % rule
    const outcome = seats > 1
      ? (winner === 0 ? 'win' : 'complete')
      : (correct >= Math.ceil(total * 0.6) ? 'win' : 'complete');
    const stats = {
      correct, total, bestStreak: bestStreak[0],
      players, p2score: p2?.score ?? 0, p2correct: p2?.correct ?? 0, winner,
      categories: p1?.won.length ?? 0, p2categories: p2?.won.length ?? 0,
      cpu: cpuSeated() ? 1 : 0,
    };
    // IMPROVE (#15): the match ends on the places it asked — each venue, who took it and how fast — before the result card
    const title = seats > 1 ? (winner >= 0 ? `${m!.players[winner].name} WINS` : 'A DEAD HEAT') : `${correct} / ${total} RIGHT`;
    ctx.setHud({ board: null, boardTitle: '', prompt: '', banner: '', recap: recapRows(recap), recapTitle: title });
    endAge = 0;
    // #16: a continuous host gets the card and keeps the stage (REPLAY → replayWhoSceneIt); anything else ends the session
    pendingEnd = () => (ctx.continuous ? ctx.card(outcome, p1?.score ?? 0, stats) : ctx.end(outcome, p1?.score ?? 0, stats));
    // #17: the next match is drawn now and its venues built under the recap; the one on screen stays until it is replaced
    drawMatch(pack, shownKey ? [shownKey] : []);
  }

  /** The recap is done (its time, or a press): send the card / end. Once. */
  function flushEnd(): void {
    const send = pendingEnd;
    pendingEnd = null;
    send?.();
  }

  /** #16: REPLAY — a new set of rounds on this stage with the same players, straight into round one. */
  function restart(): boolean {
    const ctx = liveCtx;
    if (!ctx || ctx.scene.isDisposed || phase !== 'done') return false;
    flushEnd();
    verdicts = []; recap = [];
    ctx.setHud({ recap: null, recapTitle: '', board: null, boardTitle: '', banner: '' });
    phase = 'pick';   // begin() starts from the pick; the pick itself is not shown again
    begin(ctx);
    return true;
  }

  return {
    modeId: 'who_scene_it',
    mood: 'goldenHour',       // the Scene Vault's amber; each question's venue brings its own environment on top
    camPreset: 'fight',        // unused — update() drives the sweep camera directly

    async load(ctx: ModeContext): Promise<void> {
      phase = 'pick'; pickT = 0; match = null; revealT = 0; boardT = 0;
      pack = await pickPack(); packTitle = pack.title;
      shelf = makeVenueShelf((id) => {
        const handle = mountVenue(ctx, id, { keepGameplayCamera: true });
        if (!handle) return null;
        return { root: handle.built.root, dispose: () => handle.dispose(), handle };
      });
      // IMPROVE (#17): the vault and the venues of the match drawn now — not every venue in the pack (25 and their props)
      envs.clear(); shownKey = ''; drawn = null;
      drawMatch(pack);
      const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('players') : null;
      players = Math.max(1, Math.min(MAX_PLAYERS, Number(q ?? 1) || 1));
      // IMPROVE (2026-10-06): the run's fresh state — the CPU unless the score is compared (#7), the lens (#8), REPLAY (#16),
      // and the bodies spawned now, behind the pick screen, not on question one (#19)
      rival = !comparedRun(typeof window !== 'undefined' ? window.location.search : null);
      baseFov = ctx.camera.fov;
      picks = [-1, -1]; answerIdx = -1; verdicts = []; recap = []; pendingEnd = null; endAge = 0; bannerLeft = 0; rivalPlan = null;
      liveCtx = ctx; liveRestarts.add(restart);
      castGen++; castPending = false;
      ensureCast(ctx);
      clock = WHO_SCENE_IT.timeLimit;
      mountFor(ctx, null);                       // the Scene Vault behind the player-count screen
      unseat?.();
      unseat = ctx.input.onSlot((ev, slot) => {
        if (ctx.input.pads().length < 2) return;
        seatAnswer(ctx, ev, slot);
      });
      if (q) begin(ctx); else showPick(ctx);      // ?players= skips the screen
    },

    onInput(ctx: ModeContext, e: FelInput): void {
      if (phase === 'pick') {
        if (e.t === 'dpad' && e.pressed && (e.dir === 'left' || e.dir === 'right')) {
          players = e.dir === 'right' ? Math.min(MAX_PLAYERS, players + 1) : Math.max(1, players - 1);
          SoundKit.play('uiTick', { pitch: e.dir === 'right' ? 1.2 : 0.9, volume: 0.3 });
          showPick(ctx);
        } else if (e.t === 'button' && e.pressed && FACE.includes(e.btn as 'A')) begin(ctx);
        return;
      }
      if (ctx.input.pads().length >= 2) return;
      seatAnswer(ctx, e, 0);
    },

    update(ctx: ModeContext, dt: number): void {
      // #3: verdict poses land once the buzz has had its beat
      if (verdicts.length) {
        for (const v of verdicts) v.t -= dt;
        for (const v of verdicts.filter((x) => x.t <= 0)) cast?.perform(v.i, v.ok ? SPORT_CLIP.dunkCelebrateBig : SPORT_CLIP.karateHitReact, { then: SPORT_CLIP.idle });
        verdicts = verdicts.filter((x) => x.t > 0);
      }
      if (phase === 'done') {
        // #15: the recap holds RECAP_S, then the card (a press moves on sooner — seatAnswer)
        if (pendingEnd) { endAge += dt; if (endAge >= RECAP_S) flushEnd(); }
        return;
      }
      // the camera sweeps the mounted venue — a slow orbit at eye-plus height, always looking at the floor's centre
      sweepT += dt * WHO_SCENE_SWEEP.speed;
      ctx.camera.position.set(Math.sin(sweepT) * WHO_SCENE_SWEEP.radius, WHO_SCENE_SWEEP.height, Math.cos(sweepT) * WHO_SCENE_SWEEP.radius);
      ctx.camera.setTarget(SWEEP_TARGET);
      // #8: a question opens tight on the floor and widens as the clock drains; everything else eases back to the full lens
      if (baseFov > 0) {
        const share = phase === 'play' && revealT <= 0 ? zoomShare(WHO_SCENE_IT.timeLimit - clock, WHO_SCENE_IT.timeLimit) : 1;
        ctx.camera.fov += (baseFov * share - ctx.camera.fov) * Math.min(1, dt * 8);
      }
      // #6: the pick screen only starts itself for a viewer with no pad
      if (phase === 'pick') { pickT += dt; if (pickAutoStarts(pickT >= PICK_TIMEOUT_S, ctx.input.pads().length)) begin(ctx); return; }
      if (phase === 'board') { boardT -= dt; if (boardT <= 0) startQuestion(ctx); return; }
      if (revealT > 0) { revealT -= dt; if (revealT <= 0) advance(ctx); return; }
      if (bannerLeft > 0) { bannerLeft -= dt; if (bannerLeft <= 0) hud(ctx, { banner: '' }); }   // #20
      const before = clock;
      clock -= dt;
      // #12: the last three whole seconds tick, rising
      const sec = tickSecond(before, clock);
      if (sec !== null) SoundKit.play('uiTick', { pitch: 1.5 - sec * 0.1, volume: 0.45 });
      if (clock <= 0) { clock = 0; timeout(ctx); return; }
      // #7: the CPU answers at the moment it committed to when the question opened
      if (rivalPlan && WHO_SCENE_IT.timeLimit - clock >= rivalPlan.at) {
        const plan = rivalPlan; rivalPlan = null;
        const q = current();
        if (q && match && !match.isLockedOut(1)) answer(ctx, 1, rivalChoice(q, plan.right, Math.random));
        if (revealT > 0) return;
      }
      if (Math.floor((clock + dt) * 2) !== Math.floor(clock * 2)) hud(ctx);   // twice a second is plenty for a clock
    },

    dispose(): void {
      unseat?.(); unseat = null; shelf.dispose(); venue = null; anchor?.dispose(); anchor = null; match = null;
      // IMPROVE (#18/#16/#20): a spawn still in flight is disposed when it lands; REPLAY forgets this stage; no timer outlives it
      castGen++; castPending = false; cast?.dispose(); cast = null;
      liveRestarts.delete(restart); liveCtx = null;
      verdicts = []; pendingEnd = null; bannerLeft = 0; rivalPlan = null; envs.clear(); shownKey = ''; drawn = null;
    },
  };
}

export const WhoSceneItMode: ModeDefinition = makeWhoSceneItMode();
