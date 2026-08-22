// CourtCarnivalMode v2 — REPLACES the M49 file. One change: the event pool
// grew to six (carnivalEvents v2 ships alongside), and each session now
// draws a RANDOM FOUR from it — two players (or two sessions) no longer see
// the identical night, which is the actual replay hook of the party-game
// format. Everything else (reveal cards, rival tally, watchdogs, champion
// finale) is byte-identical to M49.

import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { allCarnivalEvents, type CarnivalEvent } from './carnivalEvents';

type Phase = 'reveal' | 'playing' | 'eventOver' | 'finale';
const EVENTS_PER_NIGHT = 4;

function drawEvents(): CarnivalEvent[] {
  const pool = allCarnivalEvents();
  for (let i = pool.length - 1; i > 0; i--) {           // Fisher-Yates
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, EVENTS_PER_NIGHT);
}

export const CourtCarnivalMode: ModeDefinition = (() => {
  let events: CarnivalEvent[] = [];
  let idx = 0;
  let phase: Phase = 'reveal';
  let phaseSec = 0;
  let current: CarnivalEvent | null = null;
  let myPoints = 0, rivalPoints = 0;
  let ended = false;

  function setPhase(p: Phase): void { phase = p; phaseSec = 0; }

  async function startEvent(ctx: ModeContext): Promise<void> {
    current = events[idx];
    setPhase('reveal');
    ctx.setHud({ banner: `NEXT UP: ${current.title}`, eventNum: `${idx + 1}/${events.length}`, score: myPoints, rivalScore: rivalPoints });
    SoundKit.play('powerUp');
    await new Promise((r) => setTimeout(r, 1800));
    if (ended) return;
    ctx.setHud({ banner: '' });
    await current.build(ctx);
    setPhase('playing');
    SoundKit.play('whistle');
    ctx.setHud({ time: current.durationSec });
  }

  function endEvent(ctx: ModeContext): void {
    if (!current) return;
    const raw = current.tick(ctx, 0);
    const points = Math.round(raw * current.pointsPerUnit);
    const rivalRaw = current.rivalRange[0] + Math.random() * (current.rivalRange[1] - current.rivalRange[0]);
    const rivalPts = Math.round(rivalRaw * current.pointsPerUnit);
    myPoints += points; rivalPoints += rivalPts;
    current.teardown();
    SoundKit.play('score');
    if (points > rivalPts) EffectsKit.burst(ctx.scene, ctx.camera.position, 'confetti');
    ctx.setHud({
      banner: `${current.title}: YOU ${points} · RIVAL ${rivalPts}`,
      score: myPoints, rivalScore: rivalPoints,
    });
    current = null;
    setPhase('eventOver');
    setTimeout(() => void advance(ctx), 2200);
  }

  async function advance(ctx: ModeContext): Promise<void> {
    if (ended) return;
    ctx.setHud({ banner: '' });
    idx++;
    if (idx >= events.length) {
      setPhase('finale');
      ended = true;
      SoundKit.play('whistle');
      const won = myPoints >= rivalPoints;
      if (won) { SoundKit.play('crowdCheer'); EffectsKit.burst(ctx.scene, ctx.camera.position, 'confetti'); }
      ctx.setHud({ banner: won ? 'CARNIVAL CHAMPION!' : 'RIVAL TAKES THE CARNIVAL' });
      ctx.end(won ? 'CHAMPION' : 'RUNNER_UP', myPoints, { rivalPoints, events: events.length });
      return;
    }
    await startEvent(ctx);
  }

  return {
    modeId: 'carnival', mood: 'goldenHour', camPreset: 'court',

    async load(ctx: ModeContext) {
      events = drawEvents();                    // fresh random four every session
      idx = 0; myPoints = 0; rivalPoints = 0; ended = false; current = null;
      SoundKit.startAmbient('stadium');
      ctx.setHud({ score: 0, rivalScore: 0, eventNum: `1/${events.length}` });
      await startEvent(ctx);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (phase === 'playing' && current) current.onInput(ctx, e);
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
      phaseSec += dt;

      if (phase === 'playing' && current) {
        current.tick(ctx, dt);
        const left = Math.max(0, current.durationSec - phaseSec);
        ctx.setHud({ time: Math.ceil(left) });
        if (left <= 0) endEvent(ctx);
      }

      // stall-proofing: any phase that hangs past a generous budget forces
      // the same transition its normal path would have taken
      const budget = phase === 'reveal' ? 4 : phase === 'eventOver' ? 4 : 999;
      if (phaseSec > budget) {
        console.warn(`[FEL-CARNIVAL] watchdog tripped in phase "${phase}" — forcing advance`);
        if (phase === 'reveal' && current) { setPhase('playing'); }
        else if (phase === 'eventOver') void advance(ctx);
      }
    },

    dispose() { current?.teardown(); SoundKit.stopAmbient(); },
  };
})();

// HUD fields: eventNum ('2/4'), score/rivalScore (running Carnival Points),
// time (seconds left in the current event), banner (reveal/result text).
// modeVerbs: reuse the 'default' entry (stick + ACTION=A) — each event maps
// its own extra buttons (B/Y/X) internally via onInput, matching the verbs
// those actions already have in dunk/karate/skateboard/soccer.
