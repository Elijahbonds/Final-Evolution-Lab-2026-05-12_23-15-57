/**
 * The chapter runner (ADVENTURE PLAN, "Story"; Phase B). Plays a chapter's beats in order — cutscene, dialogue,
 * objective, fight, boss, travel, choice — against a `StoryPort` (the world as the story needs it: where the player
 * is, warps, encounters, the first fusion, XP), and writes the story's progress into the save document:
 * `story.chapterId`, `story.beatId`, `story.flags`, `story.checkpoint` (`{worldId, spawnId}`), `worldsVisited`,
 * `clearedBosses`, and the spells a beat teaches.
 *
 * THE SIM PAUSES while a cutscene, a dialogue or a choice plays (`blocking`): the mode skips the host's frame and the
 * camera follows the cutscene's track. Objectives, fights, bosses and travel run with the sim and are checked each
 * update after it.
 *
 * INPUT while blocking: the confirm button (A / Space / a tap on the box) — a TAP finishes the line, a HOLD of
 * SKIP_HOLD_SEC skips the whole scene (a cutscene's effects still happen: a skipped first fusion still fuses); up / down
 * move a choice's highlight.
 *
 * THE FIRST FUSION. Chapter 1's finale cutscene carries `fuse: true` and sets `fusionUnlocked` and `flightUnlocked`:
 * when its `fuse` beat fires, the beat's flags are written FIRST (so the fusion it asks for grants flight), then the port
 * fuses the party (A3's partner system, on its next step). A `travel` beat `via: 'flight'` makes sure the party is fused
 * when it starts and after any respawn, so the flight home cannot strand the player over the void.
 *
 * Pure: no Babylon, no DOM, no wall clock (update takes real seconds).
 */

import type { AdventureSave, Element, Vec3 } from '../contracts';
import { CutsceneRunner, type CutsceneEffect } from './cutscene';
import { DialoguePlayer, SKIP_HOLD_SEC, type DialogueEnd, type DialogueLine, type DialogueView } from './dialogue';
import { displayName, type CutsceneFocus, type FlagValue, type StoryBeat, type StoryChapter, type StoryLine } from './format';
import { chapterDoneFlag } from './flags';
import type { StoryVoice } from './voice';

/** What the story needs from the world (the story runtime implements it; tests fake it). */
export interface StoryPort {
  playerPos(): Readonly<Vec3>;
  playerGrounded(): boolean;
  /** Where a cutscene looks: a body's chest or a spawn, and the way it faces. */
  focusOf(f: CutsceneFocus, spawnId?: string): { pos: Vec3; yaw: number };
  spawnPos(worldId: string, spawnId: string): Readonly<Vec3> | null;
  /** Put the party at a spawn (a gate's warp, a respawn). */
  warpParty(worldId: string, spawnId: string): void;
  /** The gate the player stands in and whether it lets them through. */
  gateAt(): { id: string; open: boolean } | null;
  startEncounter(id: string): void;
  /** Every body of the encounter is down (and a boss's is). */
  encounterCleared(id: string): boolean;
  /** The boss id of a boss encounter (for clearedBosses). */
  bossOf(encounterId: string): string | null;
  /** Fuse the party (the story's fusion: A3's partner system, next step). */
  storyFuse(): void;
  fused(): boolean;
  partnerName(): string;
  partnerElement(): Element;
  grantXp(amount: number): void;
  /** The progress is worth keeping now (a checkpoint, a beat, the chapter's end). */
  save(reason: 'beat' | 'checkpoint' | 'chapter'): void;
}

export type RunnerEvent =
  | { kind: 'beat'; beatId: string; beatKind: StoryBeat['kind'] }
  | { kind: 'complete'; beatId: string }
  | { kind: 'skip'; beatId: string }
  | { kind: 'chapter'; chapterId: string };

export interface ChapterRunnerOptions {
  save: AdventureSave;
  port: StoryPort;
  /** Cast display names (index.json's `cast`). */
  cast: Readonly<Record<string, { name: string }>>;
  voice?: StoryVoice | null;
  onEvent?: (e: RunnerEvent) => void;
}

/** A virtual spell a beat may teach: the partner's element bolt (A2's `bolt.<element>`). */
export const PARTNER_BOLT = 'partner.bolt';

/** The planar reach and the height slack of a `reach` goal or a flight's arrival. [TUNE] */
export const ARRIVE_DY_M = 4;

export class ChapterRunner {
  readonly dialogue: DialoguePlayer;
  readonly cutscene: CutsceneRunner;
  private chapter: StoryChapter | null = null;
  private i = -1;
  private beatDone = false;
  private flagsApplied = false;
  private pressSec = -1;
  private clock = 0;
  private finished = false;
  /** Every runner event, in order (tests, probes). */
  readonly log: RunnerEvent[] = [];

  constructor(private readonly o: ChapterRunnerOptions) {
    this.dialogue = new DialoguePlayer({
      onLine: (l) => o.voice?.line(l, this.clock),
      onEnd: (e) => this.dialogueEnded(e),
    });
    this.cutscene = new CutsceneRunner(this.dialogue, {
      onEffect: (e) => this.effect(e),
      onEnd: (skipped) => { if (skipped) this.emit({ kind: 'skip', beatId: this.beat?.id ?? '' }); o.voice?.stop(this.clock); this.complete(); },
    });
  }

  get beat(): StoryBeat | null { return this.chapter && this.i >= 0 ? this.chapter.beats[this.i] ?? null : null; }
  get chapterId(): string | null { return this.chapter?.id ?? null; }
  /** The chapter has played out. */
  get done(): boolean { return this.finished; }
  get running(): boolean { return !!this.chapter && !this.finished; }
  /** The sim is paused: a cutscene, a dialogue or a choice is on. */
  get blocking(): boolean {
    const b = this.beat;
    return !!b && !this.finished && (b.kind === 'cutscene' || b.kind === 'dialogue' || b.kind === 'choice');
  }

  /** What the HUD's objective line says now (null while blocking or between chapters). */
  objective(): string | null {
    const b = this.beat;
    if (!b || this.finished || this.blocking) return null;
    return 'text' in b ? b.text : null;
  }

  view(): Readonly<DialogueView> { return this.dialogue.view(); }

  /** Start (or resume at `fromBeatId`) a chapter. */
  start(chapter: StoryChapter, fromBeatId?: string | null): void {
    this.chapter = chapter;
    this.finished = false;
    const story = this.o.save.story;
    story.chapterId = chapter.id;
    const k = fromBeatId ? chapter.beats.findIndex((b) => b.id === fromBeatId) : 0;
    this.enter(Math.max(0, k));
  }

  /** Real seconds pass (call after the host's frame, or instead of it while blocking). */
  update(dt: number): void {
    const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
    this.clock += d;
    this.o.voice?.update(this.clock);
    if (!this.chapter || this.finished) return;
    if (this.pressSec >= 0) {
      this.pressSec += d;
      if (this.pressSec >= SKIP_HOLD_SEC) { this.pressSec = -1; this.skipScene(); }
    }
    const b = this.beat;
    if (!b) return;
    if (b.kind === 'cutscene') { this.dialogue.update(d); this.cutscene.update(d); }
    else if (b.kind === 'dialogue' || b.kind === 'choice') this.dialogue.update(d);
    else this.check(b);
    if (this.beatDone) this.advance();
  }

  // ── input while a scene plays ──

  press(): void { if (this.blocking && this.pressSec < 0) this.pressSec = 0; }
  release(): void {
    if (this.pressSec < 0) return;
    const held = this.pressSec;
    this.pressSec = -1;
    if (held < SKIP_HOLD_SEC && this.blocking) this.dialogue.tap();
  }
  move(dir: -1 | 1): void { if (this.blocking) this.dialogue.move(dir); }
  choose(i: number): void { if (this.blocking) this.dialogue.choose(i); }
  /** Skip the scene now (the hold, or a SKIP button). */
  skipScene(): void {
    const b = this.beat;
    if (!b || !this.blocking) return;
    if (b.kind === 'cutscene') this.cutscene.skip();
    else this.dialogue.skip();
  }

  /** The runtime put the party back at the checkpoint (a fall, a bleed-out): a flight home re-fuses. */
  respawned(): void {
    const b = this.beat;
    if (b?.kind === 'travel' && b.via === 'flight' && !this.o.port.fused()) this.o.port.storyFuse();
  }

  // ── internals ──

  private enter(k: number): void {
    const c = this.chapter!;
    this.i = k;
    this.beatDone = false;
    this.flagsApplied = false;
    const b = c.beats[k];
    if (!b) { this.finish(); return; }
    const story = this.o.save.story;
    story.beatId = b.id;
    if (b.checkpoint) story.checkpoint = { worldId: b.checkpoint.worldId, spawnId: b.checkpoint.spawnId };
    this.emit({ kind: 'beat', beatId: b.id, beatKind: b.kind });
    const port = this.o.port;
    switch (b.kind) {
      case 'cutscene': {
        const f = port.focusOf(b.focus ?? 'player', b.focusSpawn);
        this.cutscene.start({
          id: `${c.id}:${b.id}`, lines: this.resolve(b.lines), shot: b.shot, focus: { x: f.pos.x, y: f.pos.y + 1.2, z: f.pos.z }, facingYaw: f.yaw,
          effects: b.fuse ? ['fuse'] : [],
        });
        break;
      }
      case 'dialogue': this.dialogue.play(`${c.id}:${b.id}`, this.resolve(b.lines)); break;
      case 'choice': {
        const lines = this.resolve(b.lines);
        const last = lines[lines.length - 1];
        if (last) { last.choices = b.choices.slice(); last.defaultChoice = b.defaultChoice; }
        this.dialogue.play(`${c.id}:${b.id}`, lines);
        break;
      }
      case 'fight': case 'boss': port.startEncounter(b.encounterId); break;
      case 'travel':
        if (b.via === 'gate') { port.warpParty(b.to.worldId, b.to.spawnId); this.visited(b.to.worldId); this.beatDone = true; }
        else if (!port.fused()) port.storyFuse();
        break;
      case 'objective': break;
    }
    port.save(b.checkpoint ? 'checkpoint' : 'beat');
  }

  private check(b: StoryBeat): void {
    const port = this.o.port;
    switch (b.kind) {
      case 'objective':
        if (b.goal.type === 'gate') { const g = port.gateAt(); if (g && g.id === b.goal.gateId && g.open) this.beatDone = true; }
        else if (this.arrived(b.goal.spawnId, b.goal.radiusM) && port.playerGrounded()) this.beatDone = true;   // standing there, not flying over
        break;
      case 'fight': case 'boss':
        if (port.encounterCleared(b.encounterId)) {
          if (b.kind === 'boss') { const id = port.bossOf(b.encounterId); if (id) this.pushOnce(this.o.save.story.clearedBosses, id); }
          this.beatDone = true;
        }
        break;
      case 'travel':
        if (b.via === 'flight' && this.arrived(b.to.spawnId, b.radiusM ?? 12, b.to.worldId) && port.playerGrounded()) {
          this.visited(b.to.worldId);
          this.beatDone = true;
        }
        break;
      default: break;
    }
  }

  private arrived(spawnId: string, radiusM: number, worldId?: string): boolean {
    const port = this.o.port;
    const target = worldId ? port.spawnPos(worldId, spawnId) : this.anySpawn(spawnId);
    if (!target) return false;
    const p = port.playerPos();
    return Math.hypot(p.x - target.x, p.z - target.z) <= radiusM && Math.abs(p.y - target.y) <= ARRIVE_DY_M;
  }

  private anySpawn(spawnId: string): Readonly<Vec3> | null {
    const c = this.chapter;
    if (!c) return null;
    // a reach goal names a spawn of the chapter's world, else the hub's (spawn ids are unique across the map)
    return this.o.port.spawnPos(c.worldId, spawnId) ?? this.o.port.spawnPos('hub', spawnId);
  }

  private dialogueEnded(e: DialogueEnd): void {
    const b = this.beat;
    if (!b || this.finished) return;
    if (b.kind === 'cutscene') return;   // the cutscene plays its lines one scene each; its own end completes it
    if (b.kind !== 'dialogue' && b.kind !== 'choice') return;
    if (e.skipped) this.emit({ kind: 'skip', beatId: b.id });
    if (b.kind === 'choice') {
      const ch = e.choice ?? b.choices.find((x) => x.id === b.defaultChoice) ?? b.choices[0];
      if (ch) this.setFlag(ch.flag ?? b.id, ch.value ?? ch.id);
    }
    this.o.voice?.stop(this.clock);
    this.complete();
  }

  private effect(e: CutsceneEffect): void {
    if (e !== 'fuse') return;
    // the flags first: the fusion this asks for must grant flight (story/flags.ts)
    this.applyFlags();
    this.o.port.storyFuse();
  }

  private complete(): void { this.beatDone = true; }

  private advance(): void {
    const b = this.beat;
    if (!b) return;
    this.applyFlags();
    if (b.learnSpell) this.learn(b.learnSpell);
    if (b.xp && b.xp > 0) this.o.port.grantXp(b.xp);
    this.emit({ kind: 'complete', beatId: b.id });
    this.enter(this.i + 1);
  }

  private applyFlags(): void {
    const b = this.beat;
    if (!b || this.flagsApplied) return;
    this.flagsApplied = true;
    for (const [k, v] of Object.entries(b.setFlags ?? {})) this.setFlag(k, v);
  }

  private setFlag(k: string, v: FlagValue): void { this.o.save.story.flags[k] = v; }

  private learn(id: string): void {
    const spell = id === PARTNER_BOLT ? `bolt.${this.o.port.partnerElement()}` : id;
    const sp = this.o.save.player.spells;
    this.pushOnce(sp.known, spell);
    // equip it in the first free slot (the save's sanitiser keeps only known spells, each once)
    if (!sp.equipped.includes(spell)) { const free = sp.equipped.indexOf(null); if (free >= 0) sp.equipped[free] = spell; }
  }

  private visited(worldId: string): void { this.pushOnce(this.o.save.story.worldsVisited, worldId); }

  private pushOnce(list: string[], id: string): void { if (!list.includes(id)) list.push(id); }

  private finish(): void {
    const c = this.chapter!;
    this.finished = true;
    this.i = c.beats.length;
    const story = this.o.save.story;
    story.flags[chapterDoneFlag(c.id)] = true;
    story.beatId = null;
    this.emit({ kind: 'chapter', chapterId: c.id });
    this.o.port.save('chapter');
  }

  private resolve(lines: readonly StoryLine[]): DialogueLine[] {
    const ph = !!this.chapter?.placeholder;
    return lines.map((l) => ({
      ...l,
      speakerName: l.speaker === 'partner' ? this.o.port.partnerName() : l.speaker === 'player' ? 'YOU' : displayName(this.o.cast[l.speaker]?.name ?? l.speaker),
      placeholder: ph,
    }));
  }

  private emit(e: RunnerEvent): void { this.log.push(e); this.o.onEvent?.(e); }
}
