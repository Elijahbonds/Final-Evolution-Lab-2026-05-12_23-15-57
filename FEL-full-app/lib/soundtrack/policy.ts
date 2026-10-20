// lib/soundtrack/policy.ts — CREATOR SOUNDTRACK: when the soundtrack may make a sound at all, and at which stage. Pure.
//
// Owner, 2026-10-06: "menu music = on after the first tap, medium, off on data saver", and never on the Quick Screen
// paths (the screen sends nothing before its age question and is a health screening, not a menu). It also stays silent
// for an age-locked visitor, while the tab is hidden, while a room that owns the music holds focus, and on the pages that
// are their own music rooms or play their own audio (OWN_MUSIC_PATHS) until those rooms claim focus themselves.

import { isQuickScreenPath } from '@/lib/screen/routes';
import type { SoundtrackStage } from './types';

/** Pages that make their own music or voice-led audio: the soundtrack yields to them entirely. */
export const OWN_MUSIC_PATHS: readonly RegExp[] = [
  /^\/play\/music(\/|$)/,       // the Groove Academy
  /^\/play\/dance(\/|$)/,       // the Cypher's band
  /^\/play\/acting(\/|$)/,      // a voice room
  /^\/play\/calibrate(\/|$)/,   // the latency click must be heard alone
  /^\/play\/mirror(\/|$)/,      // the coach's voice cues during a screen
  /^\/create(\/|$)/,            // the music maker and the publish previews
  /^\/admin\/review(\/|$)/,     // the reviewer listens to submissions
];

export const ownsMusic = (path: string): boolean => OWN_MUSIC_PATHS.some((r) => r.test(path));
export const isGamePath = (path: string): boolean => /^\/play\/[^/]+/.test(path);

/**
 * THE FIRST DUNK FIRST (FDB-2, PM 2026-10-17). /try is the flyer's guest dunk, and its download budget before dunk 1 is the
 * court, the hoop, the ball and you: the soundtrack's first song (a 0.43–0.51 MB preview) was the biggest thing left in it.
 * On /try the soundtrack waits until the guest's first dunk is in (DunkMode's contest set → soundtrackFirstDunkIn), then plays
 * exactly as before — same songs, same files, same playback. Nothing changes on any other page, /play/dunk included.
 */
export const FIRST_DUNK_PATH = '/try';

/** /try's hold: until the first dunk is in, on /try or on the way there (the tap that unlocked us was a link to it). */
export function holdsForFirstDunk(c: Pick<PlayConditions, 'pathname' | 'firstDunkIn' | 'headingTo'>): boolean {
  return !c.firstDunkIn && (c.pathname === FIRST_DUNK_PATH || c.headingTo === FIRST_DUNK_PATH);
}

/** The path a tapped link leads to when it is on this site (`base` is the page's URL); null otherwise. */
export function linkPath(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  try {
    const to = new URL(href, base);
    return to.origin === new URL(base).origin ? to.pathname : null;
  } catch { return null; }
}

export interface PlayConditions {
  pathname: string;
  /** A user gesture has happened on this page load (autoplay policy and the owner's "after the first tap"). */
  unlocked: boolean;
  /** The player's own soundtrack on/off (default on). */
  enabled: boolean;
  /** navigator.connection.saveData */
  saveData: boolean;
  hidden: boolean;
  ageLocked: boolean;
  /** A room that owns the music holds focus (focus.ts). */
  focusHeld: boolean;
  /** The stage a host asked for (setSoundtrackStage), or null to infer it from the path. */
  requested: SoundtrackStage | null;
  /** There is at least one track. */
  hasTracks: boolean;
  /** FDB-2: the guest's first dunk is in, on this page load (absent = not yet). */
  firstDunkIn?: boolean;
  /** FDB-2: where the gesture that unlocked us is navigating (a tapped link on this site), until the page lands. */
  headingTo?: string | null;
}

export type Silence = 'quick-screen' | 'age-locked' | 'data-saver' | 'off' | 'own-music' | 'focus' | 'hidden' | 'waiting-for-tap' | 'no-tracks' | 'stage-off' | 'first-dunk';

/** The stage to play at, or why it is silent. Order matters: the hard privacy rules come first. */
export function decideStage(c: PlayConditions): { stage: SoundtrackStage } | { silent: Silence } {
  if (isQuickScreenPath(c.pathname)) return { silent: 'quick-screen' };
  if (c.ageLocked) return { silent: 'age-locked' };
  if (c.saveData) return { silent: 'data-saver' };
  if (!c.enabled) return { silent: 'off' };
  if (ownsMusic(c.pathname)) return { silent: 'own-music' };
  if (c.focusHeld) return { silent: 'focus' };
  if (c.hidden) return { silent: 'hidden' };
  if (holdsForFirstDunk(c)) return { silent: 'first-dunk' };   // FDB-2: before the tap rule, so the tap into /try starts nothing
  if (!c.unlocked) return { silent: 'waiting-for-tap' };
  if (!c.hasTracks) return { silent: 'no-tracks' };
  // A game page whose host has not said its phase yet plays at the bed level: quiet is the safe guess under a game.
  const stage = c.requested ?? (isGamePath(c.pathname) ? 'bed' : 'menu');
  return stage === 'off' ? { silent: 'stage-off' } : { stage };
}

/** ModeHarness phases (boot-splash's `props.phase`) → the soundtrack stage. */
export function stageForPhase(phase: string): SoundtrackStage {
  switch (phase) {
    case 'loading': case 'ready': return 'loading';
    case 'countdown': case 'playing': case 'paused': return 'bed';
    case 'ended': return 'end';
    default: return 'loading';
  }
}
