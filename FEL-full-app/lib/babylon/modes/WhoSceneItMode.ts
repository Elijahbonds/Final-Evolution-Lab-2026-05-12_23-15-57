// WhoSceneItMode — Who Scene It as a LIVE mode (SPEC-PASSION-PIPELINES lane 3 W1). The 2D deck asked trivia; this asks you
// to recognise the place: each question mounts its venue live behind the card and the camera sweeps it while the clock
// runs. Four options ride the four face buttons (A B X Y). QuizCore owns the round — seeded draw, speed-scaled points,
// streak multiplier. Content is FEL's own world (quizPacks) or an approved community Scene Pack (?pack=<cardId>, lane 3 W2).
// Built as a factory so every harness instance owns its state (see SprintMode for why).
import { TransformNode, Vector3 } from '@babylonjs/core';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { drawRound, scoreAnswer, WHO_SCENE_IT, type QuizPack, type QuizQuestion } from '../core/QuizCore';
import { WHO_SCENE_IT_PACK } from '../content/quizPacks';
import { SoundKit } from '../audio/SoundKit';

const REVEAL_S = 1.5;            // how long the answer card stays up before the next venue mounts
const FACE: Array<'A' | 'B' | 'X' | 'Y'> = ['A', 'B', 'X', 'Y'];
const SWEEP = { radius: 13, height: 5.5, speed: 0.12 };   // a slow orbit, ~50 s per lap; a question sees a quarter turn

export function makeWhoSceneItMode(): ModeDefinition {
  let venue: VenueHandle | null = null;
  let anchor: TransformNode | null = null;   // a quiz has no hero; the frame guard still wants a subject — an anchor at the floor's centre
  let round: QuizQuestion[] = [];
  let index = 0;
  let clock = WHO_SCENE_IT.timeLimit;
  let score = 0, streak = 0, bestStreak = 0, correctCount = 0;
  let revealT = 0;                 // > 0 while the answer card is up
  let sweepT = 0;
  let packTitle = WHO_SCENE_IT_PACK.title;
  let done = false;

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

  function current(): QuizQuestion | null { return round[index] ?? null; }

  function hud(ctx: ModeContext, extra: Record<string, string | number | boolean | null> = {}): void {
    const q = current();
    ctx.setHud({
      pack: packTitle, question: q ? `${index + 1} / ${round.length}` : '',
      prompt: q?.prompt ?? '', optA: q?.options[0]?.label ?? '', optB: q?.options[1]?.label ?? '', optX: q?.options[2]?.label ?? '', optY: q?.options[3]?.label ?? '',
      clock: Math.max(0, Math.ceil(clock)), score, streak, hint: 'A · B · X · Y pick the answer — faster is worth more',
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

  function next(ctx: ModeContext): void {
    index++;
    if (index >= round.length) { finish(ctx); return; }
    clock = WHO_SCENE_IT.timeLimit; revealT = 0;
    mountFor(ctx, current());
    hud(ctx, { banner: '', reveal: null });
  }

  function answer(ctx: ModeContext, choice: number | null): void {
    const q = current(); if (!q || revealT > 0 || done) return;
    const picked = choice === null ? null : q.options[choice];
    const correct = !!picked && picked.id === q.answer;
    const r = scoreAnswer(WHO_SCENE_IT, correct, clock, streak);
    score += r.points; streak = r.streak; bestStreak = Math.max(bestStreak, streak); if (correct) correctCount++;
    const right = q.options.find((o) => o.id === q.answer)?.label ?? '';
    if (correct) { SoundKit.play('score', { pitch: 1 + Math.min(0.5, streak * 0.08) }); ctx.juice.flash('#fff6dd', 90); }
    else { SoundKit.play(choice === null ? 'whistle' : 'miss'); ctx.feel.impact(0.25); }
    revealT = REVEAL_S;
    hud(ctx, { banner: correct ? `CORRECT +${r.points}${streak > 1 ? ` · streak x${r.multiplier.toFixed(2)}` : ''}` : choice === null ? `TIME — it was ${right}` : `WRONG — it was ${right}`, reveal: q.explain ?? right });
  }

  function finish(ctx: ModeContext): void {
    if (done) return; done = true;
    venue?.dispose?.(); venue = null;
    const total = round.length;
    ctx.end(correctCount >= Math.ceil(total * 0.6) ? 'win' : 'complete', score, { correct: correctCount, total, bestStreak });
  }

  return {
    modeId: 'who_scene_it',
    mood: 'goldenHour',       // the Scene Vault's amber; each question's venue brings its own environment on top
    camPreset: 'fight',        // unused — update() drives the sweep camera directly

    async load(ctx: ModeContext): Promise<void> {
      score = 0; streak = 0; bestStreak = 0; correctCount = 0; index = 0; revealT = 0; done = false;
      const pack = await pickPack(); packTitle = pack.title;
      round = drawRound(pack, WHO_SCENE_IT, Date.now() % 100000);
      clock = WHO_SCENE_IT.timeLimit;
      mountFor(ctx, current());
      hud(ctx, { banner: `${packTitle.toUpperCase()} — name the place` });
      setTimeout(() => hud(ctx, { banner: '' }), 1600);
    },

    onInput(ctx: ModeContext, e: FelInput): void {
      if (e.t !== 'button' || !e.pressed) return;
      const i = FACE.indexOf(e.btn as 'A' | 'B' | 'X' | 'Y');
      if (i >= 0) answer(ctx, i);
    },

    update(ctx: ModeContext, dt: number): void {
      if (done) return;
      // the camera sweeps the mounted venue — a slow orbit at eye-plus height, always looking at the floor's centre
      sweepT += dt * SWEEP.speed;
      ctx.camera.position.set(Math.sin(sweepT) * SWEEP.radius, SWEEP.height, Math.cos(sweepT) * SWEEP.radius);
      ctx.camera.setTarget(new Vector3(0, 1.2, 0));
      if (revealT > 0) { revealT -= dt; if (revealT <= 0) next(ctx); return; }
      clock -= dt;
      if (clock <= 0) { clock = 0; answer(ctx, null); return; }
      if (Math.floor((clock + dt) * 2) !== Math.floor(clock * 2)) hud(ctx);   // twice a second is plenty for a clock
    },

    dispose(): void { venue?.dispose?.(); venue = null; anchor?.dispose(); anchor = null; round = []; },
  };
}

export const WhoSceneItMode: ModeDefinition = makeWhoSceneItMode();
