/**
 * A story session (Phase B): the hub and Chapter 1's world (world/story/storyMap), one AdventureHost on them with the
 * real party from the real save and the story's fusion and flight gates (story/flags), the story runtime
 * (world/story/runtime: encounters, falls, the partner's catch-up, free-roam gates) and the chapter runner
 * (story/chapter). Pure: the page (AdventureMode's story face) and the headless playthrough build it the same way.
 *
 *   frame(realDt)   one rendered frame: while a scene plays the sim is paused (the host does not step) and only the
 *                   runner moves (real time); otherwise the host's fixed steps run, then the runner checks its beat.
 *   tick()          one fixed step, for the headless playthrough (the same thing at exactly 1/60 s).
 * The session picks what to play from the save: the chapter in progress (resumed at its saved beat, at the
 * checkpoint), else the first unfinished one, else free roam in the hub.
 */

import { SIM_HZ, type ActorId, type AdventureActor, type AdventureSave, type PrqBand } from '../contracts';
import type { PrqAttr } from '@/lib/prq';
import { AdventureHost } from '../host/AdventureHost';
import { buildStoryMap, spawnOf, storyWorldSource, type StoryMap } from '../world/story/storyMap';
import { StoryRuntime } from '../world/story/runtime';
import { HubGates } from './gates';
import { ChapterRunner, type RunnerEvent } from './chapter';
import { STORY_INDEX, chapterById, storyChapters } from './data';
import { chapterDoneFlag, storyGates } from './flags';
import type { StoryVoice } from './voice';
import type { StoryIndex } from './format';

export interface StorySessionOptions {
  /** The player's real save (A3's loader, sanitised), WITH a partner (the first-run picker made sure). */
  save: AdventureSave;
  seed?: number;
  band?: PrqBand | null;
  prqAttrs?: Partial<Record<PrqAttr, number>> | null;
  instrument?: (a: AdventureActor) => AdventureActor;
  onError?: (e: unknown) => void;
  voice?: StoryVoice | null;
  /** The progress is worth keeping: the session's save as it stands (host.progressSave). */
  onSave?: (save: AdventureSave, reason: 'beat' | 'checkpoint' | 'chapter') => void;
  onEvent?: (e: RunnerEvent) => void;
  /** The party warped or respawned (the camera snaps). */
  onWarp?: () => void;
  index?: StoryIndex;
  map?: StoryMap;
}

export type StoryMode = 'chapter' | 'free';

export class StorySession {
  readonly map: StoryMap;
  readonly host: AdventureHost;
  readonly runtime: StoryRuntime;
  readonly runner: ChapterRunner;
  readonly gates: HubGates;
  readonly index: StoryIndex;
  private mode: StoryMode = 'free';
  private readonly onSave?: StorySessionOptions['onSave'];

  constructor(o: StorySessionOptions) {
    if (!o.save.partner) throw new Error('a story session needs the save\'s partner (the first-run picker)');
    this.index = o.index ?? STORY_INDEX;
    this.map = o.map ?? buildStoryMap();
    this.gates = new HubGates(this.map);
    this.onSave = o.onSave;
    const save = o.save;
    const cp = save.story.checkpoint;
    const at = (cp && spawnOf(this.map, cp.worldId, cp.spawnId)) || spawnOf(this.map, this.map.hubId, 'hub.home')!;
    let runtime: StoryRuntime | null = null;
    this.host = new AdventureHost({
      world: storyWorldSource(this.map),
      save,
      playerSpawn: { pos: { ...at.pos }, yaw: at.yaw },
      partnerSpawn: { pos: { x: at.pos.x + Math.cos(at.yaw) * 1.6 - Math.sin(at.yaw) * 1.2, y: at.pos.y, z: at.pos.z - Math.sin(at.yaw) * 1.6 - Math.cos(at.yaw) * 1.2 }, yaw: at.yaw },
      seed: o.seed,
      band: o.band ?? null,
      prqAttrs: o.prqAttrs ?? null,
      instrument: o.instrument,
      onError: o.onError,
      onBleedOut: (id: ActorId) => runtime?.bledOut(id),
      ...storyGates(save),
    });
    this.runner = new ChapterRunner({
      save: this.host.save,
      port: {
        playerPos: () => this.runtime.playerPos(), playerGrounded: () => this.runtime.playerGrounded(),
        focusOf: (f, s) => this.runtime.focusOf(f, s), spawnPos: (w, s) => this.runtime.spawnPos(w, s),
        warpParty: (w, s) => this.runtime.warpParty(w, s), gateAt: () => this.runtime.gateAt(),
        startEncounter: (id) => this.runtime.startEncounter(id), encounterCleared: (id) => this.runtime.encounterCleared(id),
        bossOf: (id) => this.runtime.bossOf(id), storyFuse: () => this.runtime.storyFuse(), fused: () => this.runtime.fused(),
        partnerName: () => this.runtime.partnerName(), partnerElement: () => this.runtime.partnerElement(),
        grantXp: (n) => this.runtime.grantXp(n), save: (r) => this.persist(r),
      },
      cast: this.index.cast,
      voice: o.voice ?? null,
      onEvent: (e) => { if (e.kind === 'chapter') this.mode = 'free'; o.onEvent?.(e); },
    });
    runtime = new StoryRuntime(this.host, this.map, this.gates, {
      onRespawn: () => { this.runner.respawned(); o.onWarp?.(); },
      onWarp: () => o.onWarp?.(),
      storyActive: () => this.runner.running,
      reached: (id) => this.reached(id),
    });
    this.runtime = runtime;
    runtime.start();
  }

  get save(): AdventureSave { return this.host.save; }
  get storyMode(): StoryMode { return this.mode; }
  /** The sim is paused (a scene plays). */
  get paused(): boolean { return this.runner.blocking; }

  /** Pick up where the save left off: the chapter in progress, else the next unfinished one, else free roam. */
  start(): StoryMode {
    const s = this.host.save.story;
    const done = (id: string) => s.flags[chapterDoneFlag(id)] === true;
    const current = s.chapterId && !done(s.chapterId) ? chapterById(s.chapterId, this.index) : null;
    const next = current ?? storyChapters(this.index).find((c) => !done(c.id)) ?? null;
    if (!next) { this.mode = 'free'; return this.mode; }
    this.mode = 'chapter';
    this.runner.start(next, current ? s.beatId : null);
    return this.mode;
  }

  /** One rendered frame (real seconds). */
  frame(realDt: number): void {
    if (this.runner.blocking) { this.holdCutsceneHint(); this.runner.update(realDt); return; }
    this.host.frame(realDt);
    this.runner.update(realDt);
  }

  /** One fixed step (the headless playthrough). */
  tick(): void {
    const dt = 1 / SIM_HZ;
    if (this.runner.blocking) { this.holdCutsceneHint(); this.runner.update(dt); return; }
    this.host.tick();
    this.runner.update(dt);
  }

  /** The save with the session's progress folded in (XP, training, the partner, the story). */
  progressSave(): AdventureSave { return this.host.progressSave(); }

  /** Has the story reached this chapter (a gate's `opensWith`)? */
  reached(chapterId: string): boolean {
    const s = this.host.save.story;
    if (s.flags[chapterDoneFlag(chapterId)] === true || s.chapterId === chapterId) return true;
    const order = this.index.chapters.map((c) => c.id);
    const k = order.indexOf(chapterId);
    return k === 0;
  }

  dispose(): void { this.runtime.dispose(); this.host.dispose(); }

  private persist(reason: 'beat' | 'checkpoint' | 'chapter'): void { this.onSave?.(this.host.progressSave(), reason); }

  /** While the sim is paused the camera holds the plan's `cutscene` hint (the host's camera, offered outside a step). */
  private holdCutsceneHint(): void {
    this.host.camera.offer(StoryRuntime.CUTSCENE_HINT);
    this.host.camera.endStep(this.host.tSec);
  }
}
