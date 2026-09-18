// WhoSceneItMode — Who Scene It as a LIVE mode (SPEC-PASSION-PIPELINES lane 3 W1). The 2D deck asked trivia; this asks you
// to recognise the place: each question mounts its venue live behind the card and the camera sweeps it while the clock
// runs. Four options ride the four face buttons (A B X Y). QuizCore owns the points — speed-scaled, streak multiplier.
// Content is FEL's own world (quizPacks) or an approved community Scene Pack (?pack=<cardId>, lane 3 W2).
//
// A+ MISSION #2 (2026-09-06, benchmark Wii Sports Resort floor + Mario Party readability): the questions come in ROUNDS,
// one per scene category (COURTS / COMBAT / OUTDOORS / STAGES), with a scoreboard between rounds; up to two players buzz
// in on one screen (P1 = the face buttons, P2 = the d-pad / arrows: ▲ ▶ ▼ ◀ = A B C D). First correct buzz locks the
// question, a wrong buzz locks that player out and the other may steal. SceneBuzz.ts owns the rules (pure, tested); this
// file wires input, venues, the sweep camera and the HUD. Built as a factory so every harness instance owns its state.
import { TransformNode, Vector3 } from '@babylonjs/core';
import type { HudValue, ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { WHO_SCENE_IT, type QuizPack, type QuizQuestion } from '../core/QuizCore';
import { BuzzMatch, buildRounds, MAX_PLAYERS, type Resolution } from '../core/SceneBuzz';
import { WHO_SCENE_IT_PACK } from '../content/quizPacks';
import { SoundKit } from '../audio/SoundKit';
import { Contestants, podiums } from '../party/Contestants';
import { refuse } from '../core/Refusal';

const REVEAL_S = 1.5;            // how long the answer card stays up before the next venue mounts
const BOARD_S = 3.2;             // the between-rounds scoreboard
const PICK_TIMEOUT_S = 6;        // the player-count screen starts solo by itself (capture harnesses, no pad)
const QUESTIONS_PER_CATEGORY = 2;
const FACE: Array<'A' | 'B' | 'X' | 'Y'> = ['A', 'B', 'X', 'Y'];
/** P2's answers on the d-pad, in card order A B C D. */
const DPAD: Array<'up' | 'right' | 'down' | 'left'> = ['up', 'right', 'down', 'left'];
const SWEEP = { radius: 13, height: 5.5, speed: 0.12 };   // a slow orbit, ~50 s per lap; a question sees a quarter turn

type Phase = 'pick' | 'play' | 'board' | 'done';

export function makeWhoSceneItMode(): ModeDefinition {
  let venue: VenueHandle | null = null;
  let anchor: TransformNode | null = null;   // a quiz has no hero; the frame guard still wants a subject — an anchor at the floor's centre
  let pack: QuizPack = WHO_SCENE_IT_PACK;
  let match: BuzzMatch | null = null;
  let players = 1;
  // BODIES AT THE PODIUMS (2026-09-13). Phase 0 booted this mode and measured ZERO skeletons: a card, a
  // venue sweep and nobody. That breaks the benchmark this mode was given — Mario Party readability, where a
  // spectator understands what is happening in three seconds — because the BUZZ is the whole mechanic of a
  // buzz-in game and there was no way to see who buzzed. The card just locked.
  let cast: Contestants | null = null;
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
      ? 'P1: A · B · X · Y   ·   P2: ▲ ▶ ▼ ◀ (arrows)   ·   first right answer takes it, a wrong one hands the steal over'
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
      players, p2score: m?.players[1]?.score ?? 0,
      lockedP1: !!m?.isLockedOut(0), lockedP2: !!m?.isLockedOut(1),
      hint: controlsHint(),
      ...extra,
    });
  }

  function mountFor(ctx: ModeContext, q: QuizQuestion | null): void {
    venue?.dispose?.(); venue = null;
    const key = q?.sceneVenueId ?? 'who_scene_it';
    venue = mountVenue(ctx, key, { keepGameplayCamera: true }) ?? mountVenue(ctx, 'who_scene_it', { keepGameplayCamera: true });
    sweepT = Math.random() * Math.PI * 2;
    if (!anchor || anchor.isDisposed()) { anchor = new TransformNode('wsi_anchor', ctx.scene); anchor.position.set(0, 1.2, 0); }
    ctx.heroRef.current = anchor; ctx.objectiveRef.current = null;
  }

  // ── the player-count screen ─────────────────────────────────────────
  function showPick(ctx: ModeContext): void {
    ctx.setHud({
      pack: packTitle, prompt: '', board: null, boardTitle: '', clock: null,
      banner: `PLAYERS   ◀  ${players}  ▶`,
      hint: players > 1 ? 'two on one screen · P1 faces, P2 arrows · any face button starts' : 'solo · ◀ ▶ adds a player · any face button starts',
      players,
    });
  }

  /**
   * Put bodies at the podiums, once.
   *
   * Spawned on the first question rather than at mount, because the player COUNT is chosen on the pick
   * screen — a solo run stands centred instead of beside an empty second podium. Guarded so both entry
   * paths (begin and startQuestion) can call it, and the result is dropped if the mode left play while the
   * GLB was still loading.
   */
  function ensureCast(ctx: ModeContext): void {
    if (cast) return;
    void Contestants.spawn(ctx.scene, podiums(players, { z: 4.4, stageZ: -2.4 }), 'who-scene-it')
      .then((c) => { if (phase === 'play' || phase === 'board') cast = c; else c.dispose(); });
  }

  function begin(ctx: ModeContext): void {
    if (phase !== 'pick') return;
    match = new BuzzMatch(buildRounds(pack, Date.now() % 100000, QUESTIONS_PER_CATEGORY), WHO_SCENE_IT, players);
    bestStreak = [0, 0];
    if (match.finished) { finish(ctx); return; }
    phase = 'play';
    clock = WHO_SCENE_IT.timeLimit; revealT = 0;
    ensureCast(ctx);
    mountFor(ctx, current());
    const cat = match.round?.category;
    hud(ctx, { banner: `${packTitle.toUpperCase()} — ${cat ? `ROUND 1: ${cat.name}` : 'name the place'}`, reveal: null, board: null, boardTitle: '' });
    setTimeout(() => { if (phase === 'play' && revealT <= 0) hud(ctx, { banner: '' }); }, 1600);
  }

  // ── a question resolves ─────────────────────────────────────────────
  function resolve(ctx: ModeContext, r: Resolution, by: number | null, choice: number | null): void {
    const q = current(); if (!q || !match) return;
    const right = q.options.find((o) => o.id === q.answer)?.label ?? '';
    const name = (i: number) => (players > 1 ? `${match!.players[i].name} ` : '');
    if (r.kind === 'correct') {
      cast?.verdict(r.player, true);
      const p = match.players[r.player];
      bestStreak[r.player] = Math.max(bestStreak[r.player], p.streak);
      SoundKit.play('score', { pitch: 1 + Math.min(0.5, p.streak * 0.08) }); ctx.juice.flash('#fff6dd', 90);
      hud(ctx, { banner: `${name(r.player)}CORRECT +${r.points}${p.streak > 1 ? ` · streak x${r.multiplier.toFixed(2)}` : ''}`, reveal: q.explain ?? `It's ${right}.` });
    } else {
      if (by !== null) cast?.verdict(by, false);
      SoundKit.play(r.timeout ? 'whistle' : 'miss'); ctx.feel.impact(0.25);
      const who = by !== null && choice !== null ? `${name(by)}WRONG` : 'TIME';
      hud(ctx, { banner: `${who} — it was ${right}`, reveal: q.explain ?? '' });
    }
    revealT = REVEAL_S;
  }

  function answer(ctx: ModeContext, player: number, choice: number): void {
    if (phase !== 'play' || !match || revealT > 0) return;
    cast?.buzz(player);          // the buzz is visible now, whatever the answer turns out to be
    const r = match.answer(player, choice, clock);
    if (r === null) return;
    if (r === 'wrong') {
      // out for this question; the other player can steal with the clock that is left
      SoundKit.play('miss', { volume: 0.7 }); ctx.feel.impact(0.15);
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
    ensureCast(ctx);
    mountFor(ctx, current());
    hud(ctx, { banner: '', reveal: null, board: null, boardTitle: '' });
  }

  function finish(ctx: ModeContext): void {
    if (phase === 'done') return; phase = 'done';
    venue?.dispose?.(); venue = null;
    const m = match;
    const total = m?.totalQuestions ?? 0;
    const p1 = m?.players[0]; const p2 = m?.players[1];
    const correct = p1?.correct ?? 0;
    const winner = m ? m.leader : -1;
    const outcome = players > 1
      ? (winner === 0 ? 'win' : 'complete')
      : (correct >= Math.ceil(total * 0.6) ? 'win' : 'complete');
    ctx.setHud({ board: null, boardTitle: '', prompt: '' });
    ctx.end(outcome, p1?.score ?? 0, {
      correct, total, bestStreak: bestStreak[0],
      players, p2score: p2?.score ?? 0, p2correct: p2?.correct ?? 0, winner,
      categories: p1?.won.length ?? 0, p2categories: p2?.won.length ?? 0,
    });
  }

  return {
    modeId: 'who_scene_it',
    mood: 'goldenHour',       // the Scene Vault's amber; each question's venue brings its own environment on top
    camPreset: 'fight',        // unused — update() drives the sweep camera directly

    async load(ctx: ModeContext): Promise<void> {
      phase = 'pick'; pickT = 0; match = null; revealT = 0; boardT = 0;
      pack = await pickPack(); packTitle = pack.title;
      const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('players') : null;
      players = Math.max(1, Math.min(MAX_PLAYERS, Number(q ?? 1) || 1));
      clock = WHO_SCENE_IT.timeLimit;
      mountFor(ctx, null);                       // the Scene Vault behind the player-count screen
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
      if (phase !== 'play') {
        if (e.t === 'button' && e.pressed && FACE.includes(e.btn as 'A')) refuse(ctx, phase === 'board' ? 'NEXT SCENE…' : 'WAIT…');   // MECHANICS PASS
        return;
      }
      if (e.t === 'button' && e.pressed) {
        const i = FACE.indexOf(e.btn as 'A' | 'B' | 'X' | 'Y');
        if (i >= 0 && revealT > 0) refuse(ctx, 'NEXT SCENE…');
        else if (i >= 0) answer(ctx, 0, i);
      } else if (e.t === 'dpad' && e.pressed && players > 1) {
        const i = DPAD.indexOf(e.dir);
        if (i >= 0) answer(ctx, 1, i);
      }
    },

    update(ctx: ModeContext, dt: number): void {
      if (phase === 'done') return;
      // the camera sweeps the mounted venue — a slow orbit at eye-plus height, always looking at the floor's centre
      sweepT += dt * SWEEP.speed;
      ctx.camera.position.set(Math.sin(sweepT) * SWEEP.radius, SWEEP.height, Math.cos(sweepT) * SWEEP.radius);
      ctx.camera.setTarget(new Vector3(0, 1.2, 0));
      if (phase === 'pick') { pickT += dt; if (pickT >= PICK_TIMEOUT_S) begin(ctx); return; }
      if (phase === 'board') { boardT -= dt; if (boardT <= 0) startQuestion(ctx); return; }
      if (revealT > 0) { revealT -= dt; if (revealT <= 0) advance(ctx); return; }
      clock -= dt;
      if (clock <= 0) { clock = 0; timeout(ctx); return; }
      if (Math.floor((clock + dt) * 2) !== Math.floor(clock * 2)) hud(ctx);   // twice a second is plenty for a clock
    },

    dispose(): void { venue?.dispose?.(); venue = null; anchor?.dispose(); anchor = null; match = null; cast?.dispose(); cast = null; },
  };
}

export const WhoSceneItMode: ModeDefinition = makeWhoSceneItMode();
