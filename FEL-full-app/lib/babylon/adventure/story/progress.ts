/**
 * Where the player is in the story, and what a chapter's end says (lane/story, 2026-11-21; docs/STORY-FINISH-PLAN.md).
 *
 *   storyProgress(save)      for the start screen: a fresh story (START), a chapter in progress (CONTINUE, with the chapter, the
 *                            beat it resumes at and how far through it is) or every chapter played (EXPLORE: the hub is free
 *                            roam until the owner's next chapter lands). The same rule StorySession.start() plays by: the
 *                            chapter in progress, else the first unfinished one, else free roam.
 *   chapterEnding(id, save)  for the chapter's end card: the chapter's recap line, what it paid (the Adventure XP its beats pay,
 *                            the level now, the spells and the gates it opened) and what comes next — the next chapter, or the
 *                            story's "to be continued" while the index has no chapter after it.
 *
 * The words come from the data (lib/adventure/story/index.json `ending`, a chapter's `ending`), never from code, so the owner
 * replaces them in one place. Until the owner writes them they say `[DRAFT]` (format.ts DRAFT_PREFIX) and the card shows a
 * DRAFT tag, the dialogue box's PLACEHOLDER rule. Pure: no Babylon, no DOM.
 */

import type { AdventureSave } from '../contracts';
import { CHAPTER_FILES, STORY_INDEX, chapterById, nextChapterId, storyChapters } from './data';
import { chapterDoneFlag, flightUnlockedIn, fusionUnlockedIn, FLAG_FLIGHT_UNLOCKED, FLAG_FUSION_UNLOCKED } from './flags';
import { DRAFT_PREFIX, PLACEHOLDER_PREFIX, type StoryBeat, type StoryChapter, type StoryIndex } from './format';
import { PARTNER_BOLT } from './chapter';
import { feel } from '@/lib/feel-panel/feel';

/** story.endCard: 1 = a chapter's end shows its end card (new); 0 = the chapter ends straight into the hub, as before. */
export const STORY_END_CARD = 1;
/** story.shutGateLine: 1 = in free roam, standing in a hub gate that leads nowhere yet, the HUD's objective line says so (new); 0 = it
 *  says nothing, as before. */
export const STORY_SHUT_GATE_LINE = 1;
/** The line itself (HUD text, not story text: it says what the game does). */
export const SHUT_GATE_LINE = 'This gate is still asleep';
/** story.startProgress: 1 = the start screen says where you are and CONTINUE resumes it (new); 0 = START and Chapter 1's title. */
export const STORY_START_PROGRESS = 1;

/** The start screen's switch, read through the feel panel (story.startProgress). */
export function startProgressOn(): boolean { return feel('story.startProgress', STORY_START_PROGRESS) >= 0.5; }

export type StoryStartKind = 'start' | 'continue' | 'explore';

export interface StoryProgress {
  kind: StoryStartKind;
  /** The chapter START / CONTINUE plays (null for EXPLORE). */
  chapterId: string | null;
  chapterNumber: number | null;
  /** The title as the screen shows it (the `[PLACEHOLDER]` prefix dropped: a tag says it instead). */
  chapterTitle: string | null;
  placeholder: boolean;
  /** CONTINUE: the beat it resumes at (1-based) of the chapter's beats, and that beat's own line when it has one. */
  beatNumber: number | null;
  beatCount: number | null;
  beatLine: string | null;
  /** Chapters finished, of those the index lists. */
  chaptersDone: number;
  chaptersTotal: number;
  /** The button's word. */
  button: 'START' | 'CONTINUE' | 'EXPLORE THE HUB';
}

/** A title or line without its `[PLACEHOLDER]` / `[DRAFT]` prefix (the screen shows a tag instead). */
export function bare(text: string): string {
  for (const p of [PLACEHOLDER_PREFIX, DRAFT_PREFIX]) if (text.startsWith(p)) return text.slice(p.length).trim();
  return text;
}

const beatLineOf = (b: StoryBeat | undefined): string | null => (b && 'text' in b && typeof b.text === 'string' ? b.text : null);

export function storyProgress(save: Pick<AdventureSave, 'story'>, ix: StoryIndex = STORY_INDEX, files: Readonly<Record<string, StoryChapter>> = CHAPTER_FILES): StoryProgress {
  const s = save.story;
  const all = storyChapters(ix, files);
  const done = (id: string) => s.flags[chapterDoneFlag(id)] === true;
  const chaptersDone = all.filter((c) => done(c.id)).length;
  const current = s.chapterId && !done(s.chapterId) ? chapterById(s.chapterId, ix, files) : null;
  const next: StoryChapter | null = current ?? all.find((c) => !done(c.id)) ?? null;
  const base = { chaptersDone, chaptersTotal: all.length };
  if (!next) {
    return { kind: 'explore', chapterId: null, chapterNumber: null, chapterTitle: null, placeholder: false, beatNumber: null, beatCount: null, beatLine: null, ...base, button: 'EXPLORE THE HUB' };
  }
  const title = bare(next.title);
  if (current) {
    const k = s.beatId ? current.beats.findIndex((b) => b.id === s.beatId) : 0;
    const at = k >= 0 ? k : 0;
    return {
      kind: 'continue', chapterId: current.id, chapterNumber: current.number, chapterTitle: title, placeholder: !!current.placeholder,
      beatNumber: at + 1, beatCount: current.beats.length, beatLine: beatLineOf(current.beats[at]), ...base, button: 'CONTINUE',
    };
  }
  return {
    kind: 'start', chapterId: next.id, chapterNumber: next.number, chapterTitle: title, placeholder: !!next.placeholder,
    beatNumber: null, beatCount: next.beats.length, beatLine: null, ...base, button: 'START',
  };
}

/** One line for the start screen under its title ("CHAPTER 1 · 6 OF 16 · CLEAR THE CAMP"). */
export function progressLine(p: StoryProgress): string {
  if (p.kind === 'explore') return `ALL ${p.chaptersTotal} ${p.chaptersTotal === 1 ? 'CHAPTER' : 'CHAPTERS'} PLAYED · THE HUB IS YOURS TO EXPLORE`;
  const ch = `CHAPTER ${p.chapterNumber}`;
  if (p.kind === 'start') return p.chaptersDone > 0 ? `${ch} · NEW` : ch;
  return [ch, `${p.beatNumber} OF ${p.beatCount}`, p.beatLine].filter(Boolean).join(' · ');
}

export interface ChapterEnding {
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  placeholder: boolean;
  /** The chapter's recap (data: chapter.ending.recap), bare. */
  recap: string | null;
  /** What the chapter's beats pay in Adventure XP, all told. */
  xp: number;
  level: number;
  /** Spells the chapter teaches, as the save names them (`bolt.fire`…). */
  spells: string[];
  /** The gates the chapter opened (`fusion`, `flight`), when the save has them. */
  unlocked: string[];
  /** The next chapter, or null: the story stops here for now ("to be continued"). */
  next: { chapterId: string; chapterTitle: string } | null;
  /** The "to be continued" title and line (data: index.ending), bare; null when a next chapter exists. */
  continued: { title: string; text: string } | null;
  /** Any of the card's words is still the owner's to write (a `[DRAFT]` or `[PLACEHOLDER]` mark in the data). */
  draft: boolean;
}

const isDraft = (t: string | undefined | null) => !!t && (t.startsWith(DRAFT_PREFIX) || t.startsWith(PLACEHOLDER_PREFIX));

export function chapterEnding(chapterId: string, save: Pick<AdventureSave, 'story' | 'player' | 'partner'>, ix: StoryIndex = STORY_INDEX, files: Readonly<Record<string, StoryChapter>> = CHAPTER_FILES): ChapterEnding | null {
  const c = chapterById(chapterId, ix, files);
  if (!c) return null;
  const xp = c.beats.reduce((n, b) => n + (b.xp ?? 0), 0);
  const el = save.partner?.element ?? null;
  const spells = c.beats.filter((b) => b.learnSpell).map((b) => (b.learnSpell === PARTNER_BOLT ? (el ? `bolt.${el}` : 'bolt') : b.learnSpell!));
  const set = new Set(c.beats.flatMap((b) => Object.keys(b.setFlags ?? {})));
  const unlocked: string[] = [];
  if (set.has(FLAG_FUSION_UNLOCKED) && fusionUnlockedIn(save.story.flags)) unlocked.push('fusion');
  if (set.has(FLAG_FLIGHT_UNLOCKED) && flightUnlockedIn(save.story.flags)) unlocked.push('flight');
  const nid = nextChapterId(c.id, ix);
  const nc = nid ? chapterById(nid, ix, files) : null;
  const end = ix.ending ?? null;
  const recap = c.ending?.recap ?? null;
  return {
    chapterId: c.id, chapterNumber: c.number, chapterTitle: bare(c.title), placeholder: !!c.placeholder,
    recap: recap ? bare(recap) : null, xp, level: save.player.level, spells, unlocked,
    next: nc ? { chapterId: nc.id, chapterTitle: bare(nc.title) } : null,
    continued: nc ? null : { title: bare(end?.title ?? `${DRAFT_PREFIX} To be continued`), text: bare(end?.text ?? '') },
    draft: !!c.placeholder || isDraft(recap) || (!nc && (isDraft(end?.title) || isDraft(end?.text))),
  };
}
