// BrainBrawlMode — A+ mission #11 (2026-09-06): the DOM trivia deck becomes a Babylon party mode. Owner benchmark: Trivia
// Crack category wheel × Big Brain Academy graded cognitive minigames; readable from a couch (Mario Party).
//
// A spinnable wheel of five categories on the Neuro Arena stage; landing on one launches THAT category's challenge — a timed
// interactive minigame (sequence, memory grid, arithmetic, rotation, odd-one-out…) graded on speed AND accuracy, never
// multiple-choice trivia. Winning claims the category; all five wins the duel. Solo runs the five categories once for a
// composite score with a localStorage personal best. Content is generic and seeded (BrainBrawlCore) — nothing from the
// Blueprint, no spaced repetition, no feed mechanics, no backend. Per-scene state (the Carnival lesson).

import { Vector3, MeshBuilder, StandardMaterial, Color3, TransformNode, type Mesh, type Scene } from '@babylonjs/core';
import type { HudValue, ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { refuse } from '../core/Refusal';   // MECHANICS PASS: a press that cannot act is answered
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { SoundKit } from '../audio/SoundKit';
import { Contestants, podiums } from '../party/Contestants';
import { EffectsKit } from '../visual/EffectsKit';
import {
  CATEGORIES, CATEGORY_COLOR, mulberry32, makeChallenge, challengeScore, freshClaims, spinWheel, resolveClaim, claimedBy,
  matchWinner, boardRows, SOLO_BEST_KEY, type Category, type Challenge, type Tier,
} from '../core/BrainBrawlCore';

type Phase = 'pick' | 'spin' | 'expose' | 'answer' | 'result' | 'done';
const PICK_TIMEOUT_S = 6, SPIN_S = 2.4, RESULT_S = 2.8, MAX_ROUNDS = 15;
const FACE: Array<'A' | 'B' | 'X' | 'Y'> = ['A', 'B', 'X', 'Y'];
const DPAD: Array<'up' | 'right' | 'down' | 'left'> = ['up', 'right', 'down', 'left'];

interface St {
  scene: Scene; phase: Phase; pickSec: number; autoBegin: boolean; players: number;
  rnd: () => number; seen: Set<string>; claims: Record<Category, number | null>; played: Set<Category>;
  scores: number[]; round: number; tier: Tier;
  venue: VenueHandle | null; anchor: TransformNode | null; wheel: TransformNode | null;
  spinT: number; spinTurns: number; spinFrom: number; category: Category | null;
  challenge: Challenge | null; clock: number; exposeT: number; answers: (number | null)[]; answerTimes: number[]; resultT: number;
  best: number;
  // BODIES AT THE PODIUMS (2026-09-13). Phase 0 measured this mode at ZERO skeletons: a wheel, a card and
  // nobody. Its benchmark is Mario Party readability — a spectator understands it in three seconds — and
  // with no bodies there is no way to see WHO answered, which in a two-player buzz game is the mechanic.
  cast: Contestants | null;
}
const states = new WeakMap<Scene, St>();
const live = new Set<St>();

export const BrainBrawlMode: ModeDefinition = (() => {
  const st = (ctx: ModeContext): St | undefined => states.get(ctx.scene);
  const names = (S: St): string[] => (S.players > 1 ? ['P1', 'P2'] : ['YOU']);

  function buildWheel(ctx: ModeContext, S: St): void {
    const root = new TransformNode('bb_wheel', ctx.scene);
    root.position.set(0, 2.6, -4.5);
    root.rotation.x = Math.PI / 2 * 0.15;
    const disc = MeshBuilder.CreateCylinder('bb_wheel_disc', { diameter: 3.2, height: 0.12, tessellation: 40 }, ctx.scene);
    const dm = new StandardMaterial('bb_wheel_mat', ctx.scene); dm.diffuseColor = Color3.FromHexString('#1B1330'); dm.emissiveColor = Color3.FromHexString('#2A1E4A'); disc.material = dm;
    disc.parent = root; disc.rotation.x = Math.PI / 2;
    CATEGORIES.forEach((cat, i) => {
      const a = (i + 0.5) / CATEGORIES.length * Math.PI * 2;
      const wedge: Mesh = MeshBuilder.CreateBox(`bb_wedge_${cat}`, { width: 0.7, height: 0.7, depth: 0.1 }, ctx.scene);
      wedge.parent = root; wedge.position.set(Math.sin(a) * 1.05, Math.cos(a) * 1.05, -0.1); wedge.rotation.z = -a;
      const m = new StandardMaterial(`bb_wedge_mat_${cat}`, ctx.scene);
      m.diffuseColor = Color3.FromHexString(CATEGORY_COLOR[cat]); m.emissiveColor = Color3.FromHexString(CATEGORY_COLOR[cat]).scale(0.45); wedge.material = m;
    });
    const pin = MeshBuilder.CreateBox('bb_wheel_pin', { width: 0.16, height: 0.5, depth: 0.16 }, ctx.scene);
    pin.position.set(0, 2.6 + 1.85, -4.5); const pm = new StandardMaterial('bb_pin_mat', ctx.scene); pm.emissiveColor = Color3.White(); pin.material = pm;
    S.wheel = root;
  }

  function hud(ctx: ModeContext, S: St, extra: Record<string, HudValue> = {}): void {
    const c = S.challenge;
    ctx.setHud({
      players: S.players, round: S.round, tier: S.tier, phase: S.phase,
      category: S.category ?? '', categoryColor: S.category ? CATEGORY_COLOR[S.category] : '',
      claims: CATEGORIES.map((cat) => `${cat}:${S.claims[cat] ?? '-'}`).join(','),
      prompt: c && (S.phase === 'expose' || S.phase === 'answer') ? c.prompt : '',
      display: c && (S.phase === 'expose' || (S.phase === 'answer' && c.exposureSec === 0)) ? c.display.join('\n') : '',
      optA: c && S.phase === 'answer' ? c.options[0] : '', optB: c && S.phase === 'answer' ? c.options[1] : '',
      optX: c && S.phase === 'answer' ? c.options[2] : '', optY: c && S.phase === 'answer' ? c.options[3] : '',
      clock: S.phase === 'answer' ? Math.max(0, Math.ceil(S.clock)) : null,
      score: S.scores[0], p2score: S.scores[1] ?? 0,
      answeredP1: S.answers[0] !== null, answeredP2: S.answers[1] !== null && S.players > 1,
      best: S.best,
      ...extra,
    });
  }

  function loadBest(): number { try { return Number(localStorage.getItem(SOLO_BEST_KEY) ?? 0) || 0; } catch { return 0; } }
  function saveBest(v: number): void { try { localStorage.setItem(SOLO_BEST_KEY, String(v)); } catch { /* private mode */ } }

  function showPick(ctx: ModeContext, S: St): void {
    ctx.setHud({ banner: `PLAYERS   ◀  ${S.players}  ▶`, hint: S.players > 1 ? 'duel · same challenge, higher score claims · P1 faces, P2 arrows · any face button spins' : `solo · five categories, one composite · best ${S.best} · ◀ ▶ adds a player · any face button spins`, players: S.players, prompt: '', display: '', board: null, boardTitle: '' });
  }

  function begin(ctx: ModeContext, S: St): void {
    if (S.phase !== 'pick') return;
    S.scores = names(S).map(() => 0);
    // spawned HERE, not at mount: the player count is chosen on the pick screen, and a solo run stands
    // centred rather than beside an empty second podium
    if (!S.cast) {
      void Contestants.spawn(S.scene, podiums(S.players, { z: 5.0, stageZ: -1.5 }), 'brainbrawl')
        .then((c) => { if (!S.scene.isDisposed) S.cast = c; else c.dispose(); });
    }
    spin(ctx, S);
  }

  function spin(ctx: ModeContext, S: St): void {
    S.round++;
    S.tier = (S.round <= 2 ? 1 : S.round <= 4 ? 2 : 3) as Tier;
    // solo: the wheel walks the five categories once (played = claimed for the spin's purposes)
    const pseudo = { ...S.claims } as Record<Category, number | null>;
    if (S.players === 1) for (const c of S.played) pseudo[c] = 0;
    const spinner = S.players > 1 ? (S.round - 1) % 2 : 0;
    const { category, turns } = spinWheel(S.rnd, pseudo, spinner);
    S.category = category; S.spinTurns = turns; S.spinT = 0; S.spinFrom = S.wheel ? S.wheel.rotation.z : 0;
    S.phase = 'spin'; S.challenge = null;
    SoundKit.play('whoosh', { pitch: 0.9 });
    hud(ctx, S, { banner: S.players > 1 ? `${names(S)[spinner]} SPINS` : 'SPIN', hint: '', board: null, boardTitle: '' });
  }

  function launch(ctx: ModeContext, S: St): void {
    const cat = S.category!;
    S.challenge = makeChallenge(cat, S.tier, S.rnd, S.seen);
    S.answers = names(S).map(() => null); S.answerTimes = names(S).map(() => 0);
    S.clock = S.challenge.timeLimitSec;
    S.exposeT = S.challenge.exposureSec;
    S.phase = S.exposeT > 0 ? 'expose' : 'answer';
    SoundKit.play('uiTick', { pitch: 1.2 });
    hud(ctx, S, { banner: `${cat} · TIER ${S.tier}`, hint: S.exposeT > 0 ? 'memorise…' : (S.players > 1 ? 'P1: A B X Y · P2: ▲ ▶ ▼ ◀' : 'A B X Y answer') });
    setTimeout(() => { if (S.phase === 'expose' || S.phase === 'answer') ctx.setHud({ banner: '' }); }, 900);
  }

  function answer(ctx: ModeContext, S: St, player: number, choice: number): void {
    if (S.phase !== 'answer' || !S.challenge || player >= S.players || S.answers[player] !== null) return;
    S.answers[player] = choice; S.answerTimes[player] = S.clock;
    const correct = choice === S.challenge.answer;
    // the buzz is visible, then the verdict — so a watcher sees who went for it and how it went
    S.cast?.buzz(player);
    setTimeout(() => S.cast?.verdict(player, correct), 260);
    SoundKit.play(correct ? 'score' : 'miss', { volume: 0.5, pitch: correct ? 1.1 : 0.9 });
    hud(ctx, S);
    if (S.answers.every((a) => a !== null)) resolve(ctx, S);
  }

  function resolve(ctx: ModeContext, S: St): void {
    const c = S.challenge!;
    const roundScores = names(S).map((_, i) => challengeScore(S.answers[i] === c.answer, S.answerTimes[i], c.timeLimitSec, c.tier));
    roundScores.forEach((v, i) => { S.scores[i] += v; });
    const claimant = resolveClaim(S.claims, c.category, roundScores);
    S.played.add(c.category);
    const right = c.options[c.answer];
    const who = claimant >= 0 ? (S.players > 1 ? `${names(S)[claimant]} CLAIMS ${c.category}` : `${c.category} CLAIMED`) : `${c.category} UNCLAIMED`;
    if (claimant >= 0) { EffectsKit.burst(ctx.scene, new Vector3(0, 3, -4.5), 'confetti'); ctx.juice.flash(CATEGORY_COLOR[c.category], 120); }
    S.phase = 'result'; S.resultT = RESULT_S;
    hud(ctx, S, {
      banner: who,
      hint: `answer: ${right}${roundScores.map((v, i) => ` · ${names(S)[i]} +${v}`).join('')}`,
      board: boardRows(S.claims, S.scores, names(S)), boardTitle: S.players > 1 ? 'FIRST TO FIVE' : `${S.played.size} / 5 PLAYED`,
      prompt: '', display: '', optA: '', optB: '', optX: '', optY: '',
    });
  }

  function afterResult(ctx: ModeContext, S: St): void {
    const winner = matchWinner(S.claims, S.players);
    const soloDone = S.players === 1 && S.played.size >= CATEGORIES.length;
    if (winner >= 0 || soloDone || S.round >= MAX_ROUNDS) { finish(ctx, S, winner); return; }
    spin(ctx, S);
  }

  function finish(ctx: ModeContext, S: St, winner: number): void {
    if (S.phase === 'done') return;
    S.phase = 'done';
    const p1 = S.scores[0], p2 = S.scores[1] ?? 0;
    let outcome = 'complete';
    if (S.players > 1) { const w = winner >= 0 ? winner : p1 > p2 ? 0 : p2 > p1 ? 1 : -1; outcome = w === 0 ? 'win' : 'complete'; hud(ctx, S, { banner: w >= 0 ? `${names(S)[w]} TAKES THE BRAWL` : 'DRAW', board: boardRows(S.claims, S.scores, names(S)), boardTitle: 'FINAL' }); }
    else {
      const newBest = p1 > S.best;
      if (newBest) { S.best = p1; saveBest(p1); }
      outcome = claimedBy(S.claims, 0).length >= 4 ? 'win' : 'complete';
      hud(ctx, S, { banner: newBest ? `NEW BEST · ${p1}` : `COMPOSITE · ${p1}`, board: boardRows(S.claims, S.scores, names(S)), boardTitle: `best ${S.best}` });
    }
    SoundKit.play('whistle'); if (outcome === 'win') SoundKit.play('crowdCheer');
    setTimeout(() => ctx.end(outcome, p1, { players: S.players, p2score: p2, claims: claimedBy(S.claims, 0).length, p2claims: claimedBy(S.claims, 1).length, rounds: S.round, best: S.best }), 1500);
  }

  return {
    modeId: 'brainbrawl', mood: 'nightGame', camPreset: 'court',

    async load(ctx: ModeContext) {
      const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('players') : null;
      const S: St = {
        scene: ctx.scene, phase: 'pick', pickSec: 0, autoBegin: !!q, players: Math.max(1, Math.min(2, Number(q ?? 1) || 1)),
        rnd: mulberry32(Date.now() % 1000003), seen: new Set(), claims: freshClaims(), played: new Set(), scores: [0], round: 0, tier: 1,
        venue: null, anchor: null, wheel: null, cast: null, spinT: 0, spinTurns: 0, spinFrom: 0, category: null,
        challenge: null, clock: 0, exposeT: 0, answers: [null], answerTimes: [0], resultT: 0, best: loadBest(),
      };
      states.set(ctx.scene, S); live.add(S);
      S.venue = mountVenue(ctx, 'brain_brawl', { keepGameplayCamera: true }); S.venue?.hidePlaceholders();
      buildWheel(ctx, S);
      S.anchor = new TransformNode('bb_anchor', ctx.scene); S.anchor.position.set(0, 1.4, -1.5);
      ctx.heroRef.current = S.anchor; ctx.objectiveRef.current = new Vector3(0, 2.6, -4.5);
      ctx.camDirector.setPreset('court');
      ctx.camDirector.snapTo(S.anchor.position, new Vector3(0, 2.6, -4.5));
      SoundKit.startAmbient('stadium');
      if (!S.autoBegin) showPick(ctx, S);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      const S = st(ctx); if (!S) return;
      if (S.phase === 'pick') {
        if (e.t === 'dpad' && e.pressed && (e.dir === 'left' || e.dir === 'right')) { S.players = e.dir === 'right' ? Math.min(2, S.players + 1) : Math.max(1, S.players - 1); SoundKit.play('uiTick', { volume: 0.3 }); showPick(ctx, S); }
        else if (e.t === 'button' && e.pressed && FACE.includes(e.btn as 'A')) begin(ctx, S);
        return;
      }
      if (S.phase !== 'answer') {
        // MECHANICS PASS: an answer button between questions was silently dropped (64 % of presses) — say what is happening
        if (e.t === 'button' && e.pressed && FACE.includes(e.btn as 'A')) refuse(ctx, S.phase === 'expose' ? 'MEMORISE…' : S.phase === 'spin' ? 'SPINNING…' : 'NEXT QUESTION…');
        return;
      }
      if (e.t === 'button' && e.pressed) {
        const i = FACE.indexOf(e.btn as 'A' | 'B' | 'X' | 'Y');
        if (i >= 0 && S.answers[0] !== null) refuse(ctx, 'LOCKED IN');
        else if (i >= 0) answer(ctx, S, 0, i);
      }
      else if (e.t === 'dpad' && e.pressed && S.players > 1) { const i = DPAD.indexOf(e.dir); if (i >= 0) answer(ctx, S, 1, i); }
    },

    update(ctx: ModeContext, dt: number) {
      const S = st(ctx); if (!S || S.phase === 'done') return;
      if (S.phase === 'pick') { S.pickSec += dt; if (S.autoBegin || S.pickSec >= PICK_TIMEOUT_S) begin(ctx, S); return; }
      if (S.phase === 'spin') {
        S.spinT += dt;
        const k = Math.min(1, S.spinT / SPIN_S), ease = 1 - Math.pow(1 - k, 3);
        if (S.wheel) S.wheel.rotation.z = S.spinFrom + ease * S.spinTurns * Math.PI * 2;
        if (S.spinT >= SPIN_S + 0.4) launch(ctx, S);
        return;
      }
      if (S.phase === 'expose') { S.exposeT -= dt; if (S.exposeT <= 0) { S.phase = 'answer'; hud(ctx, S, { hint: S.players > 1 ? 'P1: A B X Y · P2: ▲ ▶ ▼ ◀' : 'A B X Y answer' }); } return; }
      if (S.phase === 'answer') {
        S.clock -= dt;
        if (S.clock <= 0) { S.clock = 0; resolve(ctx, S); return; }
        if (Math.floor((S.clock + dt) * 4) !== Math.floor(S.clock * 4)) hud(ctx, S);
        return;
      }
      if (S.phase === 'result') { S.resultT -= dt; if (S.resultT <= 0) afterResult(ctx, S); }
    },

    dispose() {
      setTimeout(() => {
        for (const S of live) if (S.scene.isDisposed) { S.cast?.dispose(); S.cast = null; live.delete(S); }
        if (live.size === 0) SoundKit.stopAmbient();
      }, 0);
    },
  };
})();
