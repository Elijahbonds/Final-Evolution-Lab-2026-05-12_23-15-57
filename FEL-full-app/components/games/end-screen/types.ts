// END SCREEN (owner, 2026-10-06): "Let's make the reward screen and ending screen more rewarding. It felt anticlimactic
// upon a game's finish. We should be excited to play the next game or the next mode. We should be excited we earned
// rewards from the game we played."
//
// The shapes the end card reads. They are the shapes GameShell already builds from the server's answers
// (app/api/sessions, /api/story/complete, /api/arena/submit-score, /api/v1/mp/join, /api/challenge/<code>/attempt) —
// nothing here asks the server for anything new, and nothing here decides a payout. The card SHOWS what was paid.

import type { ProofVerdict } from '@/lib/proofLine';
import type { Refusal } from '../end-card-refusal';
import type { CarnivalRunState } from '@/lib/carnival-run';

/** The finished run, as the mode handed it to GameShell (GameResult, the fields the card reads). */
export interface EndRun {
  score: number;
  opponentScore?: number;
  won: boolean;
  duration: number;
  headline?: string;
  maxCombo?: number;
  stats?: Record<string, number | string | boolean>;
  outcome?: string;
}

export interface SeasonTierUp {
  tier: number;
  /** The tier's booked rewards, when the server sent them (app/api/sessions maps season.events → { tier, rewards }). */
  rewards?: { free?: { kind: string; amt?: number; rarity?: string; name?: string }[]; pro?: { kind: string; amt?: number; rarity?: string; name?: string }[] };
}

export interface SeasonRecap {
  name: string;
  gained: number;
  /** Tiers cleared AFTER this run (0-indexed tier being worked on — the card reads "T{tier} → T{tier+1}"). */
  tier: number;
  /** Season XP into the current tier, after this run. */
  into: number;
  /** Season XP the current tier needs. */
  need: number;
  hasPro: boolean;
  tierUps: SeasonTierUp[];
}

export interface MasteryRecap {
  mode: string;
  tier: string;
  tierIndex: number;
  ups: { tier: string }[];
}

/** GameShell's RecapData — the session answer as the card holds it. */
export interface EndRecap {
  noPlay?: boolean;
  unpaid?: string;
  xp: number;
  shards: number;
  credits: number;
  prqDelta: number;
  prqAfter: number;
  grade?: { label: string; color: string };
  season?: SeasonRecap | null;
  mastery?: MasteryRecap | null;
  capMessage?: string;
  /** The server's streak after this run (app/api/sessions `streakDays`). */
  streakDays?: number;
  /** The streak Lab Credits inside `credits` (app/api/sessions `streakBonus`): > 0 only when this run counted the day. */
  streakBonus?: number;
  /** IMPROVE (2026-10-06): the account XP AFTER this run (app/api/sessions `profileXp`) — the player level reads off it. */
  profileXp?: number;
  /** IMPROVE (2026-10-06): today's daily goals after this run (app/api/sessions `goals`). */
  goals?: EndGoals | null;
  /** The run's GameSession id (app/api/sessions `sessionId`): the account-best read leaves it out. */
  sessionId?: string | null;
}

/** IMPROVE (2026-10-06): today's daily goals, as app/api/sessions sends them (lib/goals/daily-goals.ts GoalState). */
export interface EndGoals {
  day: string;
  resetsAt?: string;
  items: import('@/lib/goals/daily-goals').GoalState[];
  /** Goal ids THIS run completed (their season XP is inside season.gained). */
  completedNow: string[];
}

export interface EndCoins { coins: number; capped: boolean }
export interface EndStoryReward { rewardLC: number; badge?: { name: string } | null }
export interface EndMpResult { status: string; hostScore: number; guestScore: number; hostName?: string; iWon: boolean; tie: boolean }
export interface EndChallengeResult { beat: boolean; targetScore: number; margin: number; vs?: string; rematchPath?: string }
export interface EndArenaResult {
  settled: boolean; status: string; result?: string; iWon?: boolean; payout?: number; feeLc?: number;
  myScore?: number; oppScore?: number; refused?: Refusal;
}

/**
 * An extra action on the card — the slot other lanes mount into (multiplayer's "Challenge a friend" / rematch). It joins
 * the card's focus grid, so a pad, the keyboard and touch all reach it like the card's own buttons.
 */
export interface EndScreenAction {
  id: string;
  label: string;
  /** Either a link… */
  href?: string;
  /** …or a handler. */
  onSelect?: () => void;
  /** 'primary' draws it as a filled button; anything else is the outlined secondary style. */
  tone?: 'primary' | 'secondary' | 'violet';
  disabled?: boolean;
}

export interface EndScreenShare {
  state: 'idle' | 'minting' | 'copied';
  url: string | null;
  /** Mint the challenge link (GameShell.shareChallenge). */
  onChallenge: () => void;
  /** Mint it with the proof line (GameShell.shareProof). */
  onProof: () => void;
}

export interface EndScreenProps {
  /** The session key the shell posts under (MODE_INFO's key). */
  mode: string;
  title: string;
  run: EndRun;
  /** GameShell's cardHeadline — the ONE place a win is decided stays in the shell (Arena verdict, refusals). */
  headline: string;
  /** GameShell's cardWon. */
  won: boolean;
  proofLine: string | null;
  arenaRefused: boolean;
  arenaVerdict: ProofVerdict | null;
  recap: EndRecap | null;
  coins: EndCoins | null;
  storyNodeId: string | null;
  storyReward: EndStoryReward | null;
  storyRefused: Refusal | null;
  mpResult: EndMpResult | null;
  challengeResult: EndChallengeResult | null;
  arenaResult: EndArenaResult | null;
  /** The Court Carnival run, when this stop is part of one (?carnival=). */
  carnivalRun: CarnivalRunState | null;
  /** This run was launched from the weekly Signature page (?signature=). */
  signatureRun?: boolean;
  share: EndScreenShare;
  onReplay: () => void;
  /** router.push — the card navigates through the shell's router. */
  onNavigate: (href: string) => void;
  /** SLOT (lane/multiplayer): extra buttons in the card's action row, in the focus grid. */
  extraActions?: EndScreenAction[];
  /** SLOT (lane/knowledge-feed and others): cards under the rewards. Any element inside marked `data-end-focus` joins the
   *  focus grid. */
  sideCards?: React.ReactNode;
  /** Tests and the dev fixture: the clock the card reads "today" from. */
  now?: () => number;
  /** Tests and the dev fixture: force reduced motion (instant reveal) regardless of the device. */
  reducedMotion?: boolean;
  /** The run was staked in a Triumph Arena duel (?arena=): its record waits for the Arena's answer, and a refused score
   *  never becomes a best. */
  staked?: boolean;
  /** Tests and the dev fixture: the sound / buzz adapter (default: SoundKit + haptics). */
  fx?: import('./fx').EndFx;
  /** Tests and the dev fixture: where the device records live (default: this browser's localStorage). */
  store?: import('./records').RecordStore;
  /** IMPROVE (2026-10-06): the account's best before this run (verified adults; GET /api/bests). Default: the browser
   *  fetch. Tests and the fixture pass their own. */
  fetchAccountBest?: import('./records').AccountBestFetch;
}
