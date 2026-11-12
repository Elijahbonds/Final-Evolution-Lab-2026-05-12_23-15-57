// lib/coach/formReview/reply.ts — COACH-VIDEO-REVIEW (2026-10-24): the coach's answer to a reviewed set.
//
// A coach answers with a PRESET CUE from the catalogue, a short note, or both, and the answer is posted to the program's
// existing thread (ProgramMessage, the same POST /api/coach/messages writes) — one place for the conversation, as
// CoachNow's "space" is. The presets are the app's own reviewed copy, never typed by the client side of the request:
//   · the flagged faults' cue cards (the Mirror's cue / escalate / regress lines for each fault, ./movements.ts cueFor);
//   · the set-up cues that fit the movement's pattern (lib/coach/taxonomy.ts SETUP_CUES — the builder's own pick-list).
// The request names a preset by id; the server looks the words up. A voice note is not offered: the thread holds text
// only (ProgramMessage.body), and adding audio to it is a schema and storage change of its own (docs/COACH-VIDEO-REVIEW.md).
//
// Pure.

import { SETUP_CUES } from '../taxonomy';
import { cueFor, MOVEMENT_SPECS, type ReviewMovement } from './movements';
import type { RepFlag } from './score';

/** The longest note a coach may add (the thread itself takes 2,000 characters; a note is meant to be short). */
export const REPLY_NOTE_MAX = 500;

export interface ReplyPreset {
  id: string;
  /** The words posted. */
  text: string;
  /** Where it comes from, for the picker's group label. */
  group: string;
}

const PATTERN_OF: Record<ReviewMovement, string> = { squat: 'squat', lunge: 'lunge', hinge: 'hinge', pushup: 'push' };

/** The presets for one reviewed set: its flagged faults' cue cards first (worst flag first), then the set-up cues. */
export function replyPresets(movement: ReviewMovement, flags: readonly Pick<RepFlag, 'fault'>[]): ReplyPreset[] {
  const out: ReplyPreset[] = [];
  const faults = [...new Set(flags.map((f) => f.fault))];
  for (const fault of faults) {
    const card = cueFor(movement, fault);
    if (!card) continue;
    const name = MOVEMENT_SPECS[movement].label_of[fault] ?? fault;
    out.push({ id: `fault:${fault}:cue`, text: card.cue, group: name });
    out.push({ id: `fault:${fault}:escalate`, text: card.escalate, group: name });
    out.push({ id: `fault:${fault}:regress`, text: card.regress, group: name });
  }
  const pattern = PATTERN_OF[movement];
  for (const c of SETUP_CUES) {
    if ((c.patterns as readonly string[]).includes(pattern)) out.push({ id: `setup:${c.id}`, text: c.text, group: 'Set-up cues' });
  }
  return out;
}

/** A preset's words, looked up by id for this set — null when the id is not one of its presets. */
export function presetText(movement: ReviewMovement, flags: readonly Pick<RepFlag, 'fault'>[], id: unknown): string | null {
  if (typeof id !== 'string') return null;
  return replyPresets(movement, flags).find((p) => p.id === id)?.text ?? null;
}

/**
 * The thread message: which set and rep it answers, then the cue, then the note.
 *   Form review · Squat, rep 4 (Left knee caves)
 *   Cue: Push the floor apart …
 *   <note>
 */
export function replyMessage(input: { movement: ReviewMovement; exerciseName: string; flag: RepFlag | null; cue: string | null; note: string | null }): string {
  const what = input.exerciseName.trim() || MOVEMENT_SPECS[input.movement].label;
  const head = input.flag ? `Form review · ${what}, rep ${input.flag.rep} (${input.flag.reason.replace(/ on rep \d+$/, '')})` : `Form review · ${what}`;
  const lines = [head];
  if (input.cue) lines.push(`Cue: ${input.cue}`);
  if (input.note) lines.push(input.note);
  return lines.join('\n');
}

/** The note as sent: trimmed, at most REPLY_NOTE_MAX, null when empty. */
export function cleanNote(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\r\n?/g, '\n').trim();
  return s ? s.slice(0, REPLY_NOTE_MAX) : null;
}

