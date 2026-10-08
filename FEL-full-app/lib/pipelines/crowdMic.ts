// lib/pipelines/crowdMic.ts — PIPELINES (owner, 2026-10-06): approved acting lines as an occasional, credited "crowd
// mic" at the moment their creator recorded them for. Pure apart from the fetch it is handed.
//
// lib/modes/acting/voice-capture.ts names where a recorded line belongs (SLOT_TRIGGERS) and nothing read it. Here each
// slot maps to THE MIC's moment ids (lib/babylon/audio/mic/moments.ts); when a mode's mic hears one of them, now and
// then (CHANCE, never twice inside COOLDOWN_SEC, never the same line twice running) a fan gets the mic: the approved
// line plays on the court PA and the caption credits its creator ("CROWD MIC · <name>").
//
// ADULTS ONLY, as the owner set for voices: the lines come from /api/v1/pipelines/community?kind=mc-lines, which serves
// approved, public acting cards by verified adults only (lib/pipelines/community.ts), from their public copies. A teen
// cannot even upload a voice line (lib/soundtrack/privateUploads.ts).
// `player_intro` belongs to the boot splash, which has no mic: routed (see the lane report).

import type { McLineEntry } from './community';

export const SLOT_MOMENTS: Readonly<Record<string, readonly string[]>> = {
  commentary_dunk: ['dunk.make', 'dunk.fifty', 'game.dunk', 'game.poster', 'game.alleyoop'],
  commentary_clutch: ['three.buzzer', 'three.clinch', 'game.point', 'game.clock'],
  taunt_pregame: ['game.intro.ones', 'game.intro.threes', 'dunk.intro', 'three.intro'],
  celebration: ['dunk.win', 'game.win', 'outro.win', 'three.champion', 'carnival.champion'],
};

/** TUNED (new): a fan gets the mic on about one in four matching moments, at most once every two minutes. */
export const CHANCE = 0.25;
export const COOLDOWN_SEC = 120;

export interface CrowdMicPick { line: McLineEntry; caption: string; who: string }

export class CrowdMicPicker {
  private lines: McLineEntry[] = [];
  private lastAt = -Infinity;
  private lastId: string | null = null;

  constructor(private rng: () => number = Math.random) {}

  setLines(lines: readonly McLineEntry[]): void { this.lines = lines.filter((l) => l.slots.some((s) => s in SLOT_MOMENTS)); }
  get size(): number { return this.lines.length; }

  /** A moment happened at `nowSec`: maybe a community line for it. */
  hear(moment: string, nowSec: number): CrowdMicPick | null {
    if (!this.lines.length || nowSec - this.lastAt < COOLDOWN_SEC) return null;
    const fits = this.lines.filter((l) => l.slots.some((s) => SLOT_MOMENTS[s]?.includes(moment)));
    if (!fits.length || this.rng() >= CHANCE) return null;
    const pool = fits.length > 1 ? fits.filter((l) => l.cardId !== this.lastId) : fits;
    const line = pool[Math.floor(this.rng() * pool.length) % pool.length];
    this.lastAt = nowSec;
    this.lastId = line.cardId;
    return { line, caption: `“${line.title}”`, who: `CROWD MIC · ${line.creator.name}` };
  }
}
