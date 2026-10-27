// PROFILE V2: the four "this week" tiles (jump, form, reaction, streak). Pure and client-safe (no server import), so the
// page's server header and its phone-only island (form kept on the device) build the same tile the same way.
// The honesty rules live here: a number nobody measured is null, and the tile says how to get one.

import { MODE_INFO } from '@/lib/game-data';
import { CLEAN_SHARE_SAME_BAND } from '@/lib/mirror/progressReading';
import { compareWeeks, type Point, type WeekCompare } from './week';
import { jumpRealChangeCm } from '@/lib/jump/session';
import { MEASURE_VERTICAL } from '@/lib/vertical/copy';   // VERTICAL-EASY: one name for the one front door
import type { ProfileGates } from './gate';

// ── where to go to get a number (the empty states point here) ─────────────────────────────────────────────────────
export const JUMP_CHECK_HREF = '/play/mirror/assess?run=jump';
export const FORM_CHECK_HREF = '/play/mirror?pattern=squat';
export const ACCOUNT_HREF = '/account';
export const PLAY_HREF = '/play';
export const SPRINT_HREF = MODE_INFO.sprint?.href ?? '/play/sprint';

/**
 * A jump within this of last week's reads "same". JUMP-PRO (2026-10-24): MEASURED, no longer the 0.5 in guess
 * ("camera jump reads wobble about that much"): two week-bests each carry the camera jump's typical error (bench, live
 * 30–60 fps: ~1.5 cm a jump, lib/jump/session.ts defaultTypicalErrorCm), so a change is real at 90 % past
 * 1.645·√2·1.5 cm ≈ 1.4 in (lib/jump/session.ts realChange). Under it, "better" would be the camera's noise.
 */
export const JUMP_SAME_BAND_IN = Math.round((jumpRealChangeCm(40, 30) / 2.54) * 10) / 10;
/** A saved jump above this is a misread, not a jump (the Mirror's own cap is 80 in for a re-screen). */
export const MAX_JUMP_CM = 203;

export type TileKey = 'jump' | 'form' | 'reaction' | 'streak';

export interface ProgressTile {
  key: TileKey;
  label: string;
  /** The headline, formatted ("24.5"), or null when there is nothing honest to print. */
  value: string | null;
  unit: string;
  compare: WeekCompare | null;
  /** The arrow's caption: "+1.5 in vs last week", "Same as last week", "First week on record". */
  vsLine: string | null;
  /** Where the number comes from, said on the tile. */
  source: 'account' | 'device' | 'profile' | null;
  /** When there is no number: what to do to get one. */
  empty: { text: string; href: string | null; cta: string | null } | null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const cmToIn = (cm: number) => cm / 2.54;

/** "+1.5 in vs last week" / "Same as last week" / "First week on record" / null (nothing this week). */
export function vsLine(c: WeekCompare, fmt: (n: number) => string, unit: string): string | null {
  if (c.thisWeek === null) return null;
  if (c.lastWeek === null) return 'Nothing last week to compare';
  if (c.direction === null) return null;
  if (c.direction === 'same') return 'Same as last week';
  const sign = (c.delta ?? 0) > 0 ? '+' : '−';
  return `${sign}${fmt(Math.abs(c.delta ?? 0))}${unit ? ` ${unit}` : ''} vs last week`;
}

export function jumpTile(points: Point[], now: number, gates: ProfileGates): ProgressTile {
  const base = { key: 'jump' as const, label: 'Jump', unit: 'in' };
  if (!gates.canSaveScan) {
    return {
      ...base, value: null, compare: null, vsLine: null, source: null,
      empty: gates.adult
        ? { text: 'Turn on saving your jump numbers to track them here.', href: ACCOUNT_HREF, cta: 'Account settings' }
        : { text: 'Jump numbers are saved for adults who opt in. Yours show after each jump check.', href: JUMP_CHECK_HREF, cta: MEASURE_VERTICAL },
    };
  }
  const c = compareWeeks(points.map((p) => ({ at: p.at, value: cmToIn(p.value) })), now, { reduce: 'max', sameBand: JUMP_SAME_BAND_IN });
  if (c.thisWeek === null) {
    const last = points.length ? r1(cmToIn(Math.max(...points.map((p) => p.value)))) : null;
    return {
      ...base, value: null, compare: c, vsLine: null, source: 'account',
      empty: { text: last !== null ? `No jump this week (best lately ${last} in).` : 'No jump on record yet.', href: JUMP_CHECK_HREF, cta: MEASURE_VERTICAL },
    };
  }
  return { ...base, value: r1(c.thisWeek).toFixed(1), compare: c, vsLine: vsLine(c, (n) => r1(n).toFixed(1), 'in'), source: 'account', empty: null };
}

export function formTile(points: Point[], now: number, gates: ProfileGates): ProgressTile {
  const base = { key: 'form' as const, label: 'Form', unit: '% clean reps' };
  // Everyone the server does not save for keeps their Mirror history on the phone: the client island fills this tile.
  if (!gates.canSaveScan) return { ...base, value: null, compare: null, vsLine: null, source: 'device', empty: { text: 'Do a Mirror squat set: your clean-rep % is kept on this phone.', href: FORM_CHECK_HREF, cta: 'Open the Mirror' } };
  return formFrom(points, now, 'account');
}

/** The form tile from clean-rep shares (0..1) kept on the account or on this phone. */
export function formFrom(points: Point[], now: number, source: 'account' | 'device'): ProgressTile {
  const base = { key: 'form' as const, label: 'Form', unit: '% clean reps' };
  const c = compareWeeks(points, now, { reduce: 'mean', sameBand: CLEAN_SHARE_SAME_BAND });
  if (c.thisWeek === null) {
    const text = points.length ? 'No Mirror set this week.' : source === 'device' ? 'Do a Mirror squat set: your clean-rep % is kept on this phone.' : 'No Mirror set on record yet.';
    return { ...base, value: null, compare: c, vsLine: null, source, empty: { text, href: FORM_CHECK_HREF, cta: 'Do a Mirror squat set' } };
  }
  const pct = (n: number) => String(Math.round(n * 100));
  return { ...base, value: pct(c.thisWeek), compare: c, vsLine: vsLine(c, pct, 'pts'), source, empty: null };
}

/** Reaction is not saved anywhere today: an honest empty tile (owner call in docs/PROFILE-V2.md). */
export function reactionTile(): ProgressTile {
  return {
    key: 'reaction', label: 'Reaction', unit: 's', value: null, compare: null, vsLine: null, source: null,
    empty: { text: 'Not tracked yet. Beach Sprint times your start on its finish card.', href: SPRINT_HREF, cta: 'Run Beach Sprint' },
  };
}

export function streakTile(streakDays: number, played: Point[], now: number): ProgressTile {
  const c = compareWeeks(played, now, { reduce: 'count' });
  const days = c.thisWeek ?? 0;
  const line = c.direction === null ? (days ? `${days} day${days === 1 ? '' : 's'} played this week` : null)
    : `${days} day${days === 1 ? '' : 's'} played this week · ${c.direction === 'same' ? 'same as' : c.direction === 'up' ? 'up on' : 'down on'} last week`;
  if (streakDays <= 0 && days === 0) {
    return { key: 'streak', label: 'Streak', unit: 'days', value: null, compare: c, vsLine: null, source: 'profile', empty: { text: 'Play or train today to start a streak.', href: PLAY_HREF, cta: 'Play now' } };
  }
  return { key: 'streak', label: 'Streak', unit: streakDays === 1 ? 'day' : 'days', value: String(Math.max(0, streakDays)), compare: c, vsLine: line, source: 'profile', empty: null };
}

