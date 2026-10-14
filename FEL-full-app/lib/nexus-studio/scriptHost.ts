// THE SCRIPT HOST (track 4): the Babylon side of a project's scripts in a mode. It LISTENS to what the mode already does and
// feeds the interpreter (interpreter.ts); it turns the interpreter's actions into PRESENTATION calls. Mounted by the Studio
// runtime (runtime.ts mountStudioExtras) — so only with a dev-only `?venue=` play-test, never in a production build.
//
// LISTENS (read only): the momentum meter's onReport / onTierChange (the read-only listeners the crowd and the highlight pacer
// use; never `report`), the HUD the mode posts (a tap on ctx.setHud that passes every update through unchanged, then reads
// the target's score keys), the phase (start / end), the play clock and the hero's ground position (zones).
// DOES (presentation only): a crowd reaction (crowd.react), an EffectsKit burst, a HUD banner (the `studioBanner` key, drawn
// by tv-hud HudBanner in the dev runner), a broadcast shot (camDirector.establish) or the mode's own replay (ctx.highlight),
// a pulse of the venue's Studio fixture heads, a SoundKit cue on the SFX bus. Bursts, light pulses and camera shots respect
// reduced motion (motionPolicy), as the rest of the game does.
// interpreter.wiring.test.ts holds this file to that: no score, timer, session, wallet or momentum WRITER is reachable.

import { Color3, Vector3, type Mesh, type Scene, type StandardMaterial, type TransformNode } from '@babylonjs/core';
import { EffectsKit, type BurstKind } from '../babylon/visual/EffectsKit';
import { SoundKit } from '../babylon/audio/SoundKit';
import { motionPolicy } from '../a11y/reducedMotion';
import { createInterpreter, type ScriptAction, type ScriptState } from './interpreter';
import type { ExportScript } from './exportVenue';
import type { IntroKind } from '../babylon/scene/broadcastShots';
import type { HudValue } from '../babylon/core/ModeHarness';

/** The HUD keys the host writes — and the only ones (the wiring test holds every setHud here to this prefix). */
export const STUDIO_HUD = { banner: 'studioBanner', tone: 'studioBannerTone' } as const;

type SfxName = Parameters<typeof SoundKit.play>[0];

export interface ScriptHostCtx {
  scene: Scene;
  /** read-only listeners (core/MomentumBus); `score01` is read for the `momentum` compare */
  momentum?: { onReport?(fn: (e: { kind: string }) => void): () => void; onTierChange?(fn: (tier: string, prev: string) => void): () => void; readonly score01?: number } | unknown;
  phase?: () => string;
  heroRef?: { current: TransformNode | null };
  setHud?: (u: Record<string, HudValue>) => void;
  camDirector?: { establish(kind: IntroKind): boolean } | unknown;
  highlight?: () => Promise<void>;
}

export interface ScriptHostDeps {
  /** the Studio crowd layer's crowd; else the mode's own (scene.metadata.felCrowd, dev builds) */
  crowd?: { react(kind: string, strength?: number): void } | null;
  /** the Studio fixture heads (runtime mountFixtureLayer) a light pulse flares */
  fixtureHeads?: readonly Mesh[];
  /** the HUD keys the target mode posts its score under (targets.ts) */
  scoreKeys?: { me: string; them: string };
  subject?: readonly number[];
}

export interface ScriptHost {
  /** every action fired so far (probes, the capture rig, tests) */
  readonly fired: readonly ScriptAction[];
  dispose(): void;
}

type MomentumListen = { onReport?(fn: (e: { kind: string }) => void): () => void; onTierChange?(fn: (tier: string, prev: string) => void): () => void; readonly score01?: number };

export function mountScriptHost(ctx: ScriptHostCtx, scripts: readonly ExportScript[], deps: ScriptHostDeps = {}): ScriptHost {
  const { scene } = ctx;
  const fired: ScriptAction[] = [];
  if (!scripts.length) return { fired, dispose() {} };
  const momentum = (ctx.momentum ?? null) as MomentumListen | null;
  const director = (ctx.camDirector ?? null) as { establish(kind: IntroKind): boolean } | null;
  const state: { myScore: number; theirScore: number; elapsed: number } = { myScore: 0, theirScore: 0, elapsed: 0 };
  const snapshot = (): ScriptState => {
    const h = ctx.heroRef?.current;
    const p = h ? h.getAbsolutePosition() : null;
    return { myScore: state.myScore, theirScore: state.theirScore, elapsed: state.elapsed, momentum: Math.round((momentum?.score01 ?? 0) * 100), hero: p ? [p.x, p.z] : null };
  };

  // ── presentation ──
  const origSetHud = ctx.setHud;
  let bannerLeft = 0;
  const pulses: Array<{ mat: StandardMaterial; base: Color3; to: Color3; t: number; dur: number }> = [];
  const crowdOf = () => deps.crowd ?? ((scene.metadata as { felCrowd?: { react(kind: string, strength?: number): void } } | null)?.felCrowd ?? null);
  const where = (a: ScriptAction): Vector3 => {
    if (a.params.at === 'zone' && a.zone) return new Vector3(a.zone[0], 1, a.zone[1]);
    if (a.params.at === 'subject' && deps.subject) return new Vector3(deps.subject[0], (deps.subject[1] ?? 0) + 1, deps.subject[2]);
    const h = ctx.heroRef?.current;
    return h ? h.getAbsolutePosition().add(new Vector3(0, 1.2, 0)) : new Vector3(0, 1, 0);
  };
  const perform = (a: ScriptAction): void => {
    fired.push(a);
    const motion = motionPolicy();
    try {
      switch (a.kind) {
        case 'crowd': crowdOf()?.react(String(a.params.reaction), Number(a.params.strength)); return;
        case 'burst': if (!motion.reduced) EffectsKit.burst(scene, where(a), String(a.params.kind) as BurstKind, Number(a.params.size), String(a.params.color)); return;
        case 'banner':
          origSetHud?.call(ctx, { [STUDIO_HUD.banner]: String(a.params.text), [STUDIO_HUD.tone]: String(a.params.tone) });
          bannerLeft = Number(a.params.seconds) || 1.8;
          return;
        case 'camera':
          if (motion.reduced) return;
          if (a.params.shot === 'replay') void ctx.highlight?.().catch(() => {});
          else director?.establish(a.params.shot as IntroKind);
          return;
        case 'lights': {
          if (!motion.flash) return;
          const to = Color3.FromHexString(String(a.params.color)).scale(2.2);
          for (const m of deps.fixtureHeads ?? []) {
            const mat = m.material as StandardMaterial | null;
            if (!mat?.emissiveColor) continue;
            const existing = pulses.find((p) => p.mat === mat);
            if (existing) { existing.t = 0; existing.to = to; continue; }
            pulses.push({ mat, base: mat.emissiveColor.clone(), to, t: 0, dur: Number(a.params.seconds) || 0.6 });
          }
          return;
        }
        case 'sound': SoundKit.play(String(a.params.cue) as SfxName, { volume: Number(a.params.volume) }); return;
      }
    } catch (e) { console.warn('[NEXUS-STUDIO] script action failed:', a.kind, e instanceof Error ? e.message : e); }
  };
  const interp = createInterpreter(scripts.map((s) => ({ id: s.id, graph: s })), perform);

  // ── listening ──
  const stopPlays = momentum?.onReport?.((e) => { interp.emit({ type: 'momentum', kind: e.kind }, snapshot()); }) ?? (() => {});
  const offTier = momentum?.onTierChange?.((tier, prev) => { interp.emit({ type: 'tier', tier, prev }, snapshot()); }) ?? (() => {});
  // the HUD tap: every update goes through to the harness first, unchanged; then the score keys are read
  const keys = deps.scoreKeys;
  const seen: { me?: number; them?: number } = {};
  if (origSetHud && keys) {
    ctx.setHud = (u: Record<string, HudValue>) => {
      origSetHud.call(ctx, u);
      for (const side of ['me', 'them'] as const) {
        const v = u[keys[side]];
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        const before = seen[side];
        seen[side] = v;
        if (side === 'me') state.myScore = v; else state.theirScore = v;
        if (before !== undefined && v > before) interp.emit({ type: 'score', side }, snapshot());
      }
    };
  }
  let started = false, ended = false;
  const obs = scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);
    const phase = ctx.phase?.() ?? 'playing';
    if (phase === 'playing') {
      if (!started) { started = true; interp.emit({ type: 'modeStart' }, snapshot()); }
      state.elapsed += dt;
      interp.tick(dt, snapshot());
    } else if (phase === 'ended' && !ended) { ended = true; interp.emit({ type: 'modeEnd' }, snapshot()); }
    if (bannerLeft > 0) { bannerLeft -= dt; if (bannerLeft <= 0) origSetHud?.call(ctx, { [STUDIO_HUD.banner]: '' }); }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.t += dt;
      const k = Math.max(0, 1 - p.t / p.dur);   // flare, then fall back to the head's own colour
      Color3.LerpToRef(p.base, p.to, k, p.mat.emissiveColor);
      if (k <= 0) { p.mat.emissiveColor.copyFrom(p.base); pulses.splice(i, 1); }
    }
  });
  if (process.env.NODE_ENV === 'development') (scene.metadata ??= {}).felStudioScripts = { fired };   // the capture rig reads it
  return {
    fired,
    dispose() {
      scene.onBeforeRenderObservable.remove(obs);
      stopPlays(); offTier();
      if (origSetHud && keys) ctx.setHud = origSetHud;
      for (const p of pulses) p.mat.emissiveColor.copyFrom(p.base);
      if (bannerLeft > 0) origSetHud?.call(ctx, { [STUDIO_HUD.banner]: '' });
    },
  };
}
