// firstWin — ONB-02: one guided first win per path, each done inside a minute (owner QUALITY 2026-10-20: "pick-your-path
// onboarding -> one start + 60 s guided first win").
//
// A first win is ONE thing a new person finishes and is told they finished. Not a tour, not a checklist of five: one
// action, the moment it is done, and the door to the rest. What each path's win is, and why it is that:
//
//   play    the first dunk. The game is the win; nothing is put in front of it (destinationFor opens the game itself,
//           and a creator's card still decides which game). Its "you did it" is the dunk's own judged card.
//   train   the first move of today's drill. For a new account today's drill is the Pre-Game Wake-Up (the daily drill's
//           starter, lib/daily-drill/plan.ts), ten minutes — too long for a first minute. Its Phase 2, "Pressurize the
//           System", is the book's own three breaths (4 in, 2 hold, 6 out) and is in the drill's quick prep: done here,
//           paced, with no camera and nothing saved, it IS the drill's first move. The rest of the drill is the door.
//   learn   one Playbook card: the topic's first card, the one guests see too. It counts the way the feed counts a card
//           (seen for COUNT_DWELL_MS), and is recorded on this device the same way, so /learn knows it was read.
//   teach   a first client invited: one invite link made and sent (copied or handed to the share sheet). Adults only
//           (lib/onboarding/firstRun.ts pathFor). The rest of the coach's first run is lib/onboarding/coachFirstRun.ts.
//   create  the first look saved in the Closet. The Closet is a 3D page, so the win happens there; this page says
//           what to do in three short steps and opens it. The Closet's own "Look saved" is the moment.
//
// Pure: the copy, the numbers and the order. components/onboarding/first-win.tsx runs it.

import { WAKE_UP } from '@/lib/drills/drills';
import type { DrillPhase } from '@/lib/drills/chart';
import { COUNT_DWELL_MS } from '@/lib/knowledge/state';
import { DAILY_DRILL_PATH } from '@/lib/daily-drill/copy';
import { PATH_HOME, type OnboardingPath } from './firstRun';

/** (new) The owner's bar: path choice to "you did it" inside a minute. Every win below is checked against it. */
export const FIRST_WIN_CAP_SEC = 60;

/** How the win is played out on the page. */
export type FirstWinKind = 'game' | 'breath' | 'card' | 'invite' | 'closet';

export interface FirstWinStep { text: string }

export interface FirstWin {
  path: OnboardingPath;
  kind: FirstWinKind;
  /** The picker's label and the welcome page's eyebrow. */
  label: string;
  /** One line under the label in the picker. */
  line: string;
  /** The win, as a title: "One Playbook card". */
  title: string;
  /** What to do, said once. */
  steps: FirstWinStep[];
  /** About how long the win takes from this page, in seconds (the rig measures it; this is what the page promises). */
  aboutSec: number;
  /** The moment. */
  doneTitle: string;
  doneLine: string;
  /** The door the win hands on to. */
  next: { href: string; label: string };
  accent: string;
}

/** The Wake-Up's breathing phase — the book's own numbers, read from the drill, never retyped. */
export function breathPhase(): DrillPhase & { pacer: NonNullable<DrillPhase['pacer']> } {
  const p = WAKE_UP.phases.find((ph) => ph.id === 'pressurize');
  if (!p?.pacer) throw new Error('firstWin: the Wake-Up has no paced breathing phase');
  return p as DrillPhase & { pacer: NonNullable<DrillPhase['pacer']> };
}

/** (new) A short "get ready" before the first breath, so nobody starts mid-inhale. */
export const BREATH_LEAD_SEC = 3;

/** Seconds of the paced breathing: rounds × (in + hold + out). */
export function breathSeconds(): number {
  const { inSec, holdSec, outSec, rounds } = breathPhase().pacer;
  return rounds * (inSec + holdSec + outSec);
}

export type BreathBeat = 'ready' | 'in' | 'hold' | 'out' | 'done';

/** Where the breathing is at `t` seconds after the start: the beat, the round (1-based) and seconds left in the beat. */
export function breathAt(t: number): { beat: BreathBeat; round: number; left: number } {
  const { inSec, holdSec, outSec, rounds } = breathPhase().pacer;
  if (t < BREATH_LEAD_SEC) return { beat: 'ready', round: 0, left: BREATH_LEAD_SEC - t };
  const cycle = inSec + holdSec + outSec;
  const s = t - BREATH_LEAD_SEC;
  if (s >= rounds * cycle) return { beat: 'done', round: rounds, left: 0 };
  const round = Math.floor(s / cycle) + 1;
  const into = s - (round - 1) * cycle;
  if (into < inSec) return { beat: 'in', round, left: inSec - into };
  if (into < inSec + holdSec) return { beat: 'hold', round, left: inSec + holdSec - into };
  return { beat: 'out', round, left: cycle - into };
}

/** Seconds a Playbook card must be on screen before it counts: the feed's own rule (lib/knowledge/state.ts). */
export const CARD_COUNT_SEC = COUNT_DWELL_MS / 1000;

export const FIRST_WINS: Record<OnboardingPath, FirstWin> = {
  play: {
    path: 'play', kind: 'game', label: 'Play', line: 'Drop into a game now.', accent: '#00E5FF',
    title: 'Your first dunk',
    steps: [{ text: 'Run up, jump, and slam it. The judges score it the moment you land.' }],
    aboutSec: 45,
    doneTitle: 'You did it', doneLine: 'Your first dunk is on the board.',
    next: { href: PATH_HOME.play, label: 'Every game' },
  },
  train: {
    path: 'train', kind: 'breath', label: 'Train', line: "Start today's drill.", accent: '#00FF9D',
    title: "The first move of today's drill",
    steps: [
      { text: 'Stand tall, hands on your lower ribs.' },
      { text: 'Breathe with the ring: in for 4, hold for 2, out for 6. Three times.' },
    ],
    aboutSec: BREATH_LEAD_SEC + breathSeconds(),
    doneTitle: 'You did it',
    doneLine: "That's the Wake-Up's breathing phase — the first move of today's drill.",
    next: { href: DAILY_DRILL_PATH, label: "Finish today's drill" },
  },
  learn: {
    path: 'learn', kind: 'card', label: 'Learn', line: 'One idea from the Playbook.', accent: '#A855F7',
    title: 'One Playbook card',
    steps: [{ text: 'Read it. That is the whole job.' }],
    aboutSec: Math.ceil(CARD_COUNT_SEC) + 5,
    doneTitle: 'You did it', doneLine: 'One card read. The feed picks up from here.',
    next: { href: PATH_HOME.learn, label: 'Open the feed' },
  },
  teach: {
    path: 'teach', kind: 'invite', label: 'Teach', line: 'Invite your first client.', accent: '#F5C518',
    title: 'Invite your first client',
    steps: [
      { text: 'Make a link for one athlete.' },
      { text: 'Send it: copy it into a message, or share it.' },
    ],
    aboutSec: 15,
    doneTitle: 'You did it',
    doneLine: 'Your invite is out. When they sign up, they land on your roster.',
    next: { href: PATH_HOME.teach, label: 'Open your coach page' },
  },
  create: {
    path: 'create', kind: 'closet', label: 'Create', line: 'Make your athlete in the Closet.', accent: '#FF3D9A',
    title: 'Your first look',
    steps: [
      { text: 'Open the Closet.' },
      { text: 'Tap any item to try it on.' },
      { text: 'Press Save. That look is yours.' },
    ],
    aboutSec: 45,
    doneTitle: 'You did it', doneLine: 'The Closet says "Look saved" when it is yours.',
    next: { href: PATH_HOME.create, label: 'Open the Closet' },
  },
};

/** The picker's options, in PATHS order. `held` marks teach for anyone who is not a verified adult. */
export function pickerOptions(opts: { adult: boolean | null }): Array<Pick<FirstWin, 'path' | 'label' | 'line' | 'accent'> & { held: boolean }> {
  return (['play', 'train', 'learn', 'teach', 'create'] as const).map((p) => {
    const w = FIRST_WINS[p];
    return { path: p, label: w.label, line: w.line, accent: w.accent, held: p === 'teach' && opts.adult !== true };
  });
}

/** The line a held teach option shows. Says what, not why in detail: the account is set up for play and training. */
export const TEACH_HELD_LINE = 'For adults (18+).';

// ── the funnel's count (/admin/funnel) ─────────────────────────────────────────────────────────────────────────────

export interface FirstWinLine { path: OnboardingPath; wins: number; medianSec: number | null; underCap: number }

/** first_win events (their props) by path: how many, the median seconds, and how many came in under the minute. */
export function firstWinSummary(props: readonly unknown[]): FirstWinLine[] {
  const by = new Map<OnboardingPath, number[]>();
  for (const raw of props) {
    const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const path = typeof p.path === 'string' && p.path in FIRST_WINS ? (p.path as OnboardingPath) : null;
    const sec = typeof p.sec === 'number' && Number.isFinite(p.sec) && p.sec >= 0 ? p.sec : null;
    if (!path || sec === null) continue;
    by.set(path, [...(by.get(path) ?? []), sec]);
  }
  return (Object.keys(FIRST_WINS) as OnboardingPath[]).map((path) => {
    const xs = [...(by.get(path) ?? [])].sort((a, b) => a - b);
    const mid = xs.length ? (xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2) : null;
    return { path, wins: xs.length, medianSec: mid, underCap: xs.filter((s) => s <= FIRST_WIN_CAP_SEC).length };
  });
}
