/**
 * lib/coach-service.ts — AI coach: athlete-state assembly + LLM call.
 *
 * Design:
 *  - `buildAthleteState()` pulls the athlete's REAL state from Prisma
 *    (PRQ attributes, recent game sessions, lesson progress, LC balance)
 *    and derives a readiness score. Nothing here is client-supplied.
 *  - `buildSystemPrompt()` turns that state + a persona preset into the
 *    system prompt. Three personas ship: Trainer / Analyst / Motivator.
 *  - `callCoachLLM()` POSTs to the Abacus platform completions endpoint
 *    (OpenAI-compatible chat shape) using ABACUSAI_API_KEY. v1 is
 *    non-streaming; the request shape is streaming-ready (`stream: false`).
 *
 * Readiness derivation (harvested + adapted from copilot PRQSystem's
 * rolling-window idea and WearableSystem's intended role): with no wearable
 * data in the web app, readiness is inferred from training load + rust +
 * performance trend over the last 7 days. Deterministic and explainable —
 * the coach can cite it.
 */

import { prisma } from '@/lib/db';

// ---------------------------------------------------------------------------
// LLM endpoint
// ---------------------------------------------------------------------------

// TODO-VERIFY: confirm the exact completions URL against the live app's
// existing coach/* handlers or Abacus platform docs. The platform exposes an
// OpenAI-compatible chat completions API for deployed apps; this is the
// documented route ChatLLM-deployed apps use.
const ABACUS_COMPLETIONS_URL = 'https://apps.abacus.ai/v1/chat/completions';

// TODO-VERIFY: model id available to the app's ABACUSAI_API_KEY.
const COACH_MODEL = 'gpt-4o-mini';

const MAX_COMPLETION_TOKENS = 600;
const LLM_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CoachPersona = 'trainer' | 'analyst' | 'motivator';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SessionSummary {
  mode: string;
  score: number;
  playedAt: string; // ISO
}

export interface LessonSummary {
  lessonId: string;
  status: string;
  bestScore: number | null;
}

export interface AthleteState {
  displayName: string;
  /** attribute name -> 0..100 */
  prqAttributes: Record<string, number>;
  prqOverall: number;
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Elite';
  recentSessions: SessionSummary[];
  lessonsCompleted: number;
  lessonsInProgress: LessonSummary[];
  lcBalance: number;
  readiness: number; // 0..100
  readinessNotes: string[];
}

// ---------------------------------------------------------------------------
// PRQ helpers (tier bands harvested from copilot PRQSystem.resolveTier)
// ---------------------------------------------------------------------------

export function resolveTier(prq: number): AthleteState['tier'] {
  if (prq >= 85) return 'Elite';
  if (prq >= 70) return 'Gold';
  if (prq >= 45) return 'Silver';
  return 'Bronze';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

/**
 * Extract numeric PRQ attributes from the PlayerProfile row without assuming
 * the exact column layout. Handles both shapes seen in FEL builds:
 *  - discrete numeric columns (power, speed, control, ...)
 *  - a JSON `attributes` column mapping name -> number
 * VERIFY against live schema.prisma and tighten to the real shape.
 */
export function extractPrqAttributes(profile: Record<string, unknown>): Record<string, number> {
  const NON_ATTRIBUTE_KEYS = new Set([
    'id',
    'userId',
    'createdAt',
    'updatedAt',
    'level',
    'xp',
    'lcBalance',
    'lifetimeEarned',
    'streakDays',
  ]);

  const json = profile['attributes'];
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = clamp(value, 0, 100);
    }
    if (Object.keys(out).length > 0) return out;
  }

  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(profile)) {
    if (NON_ATTRIBUTE_KEYS.has(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100) {
      out[key] = value;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export interface ReadinessResult {
  score: number;
  notes: string[];
}

export function computeReadiness(sessions: SessionSummary[], now: Date = new Date()): ReadinessResult {
  const notes: string[] = [];
  let score = 75; // healthy baseline

  const dayMs = 24 * 60 * 60 * 1000;
  const within = (s: SessionSummary, days: number) =>
    now.getTime() - new Date(s.playedAt).getTime() <= days * dayMs;

  const last24h = sessions.filter((s) => within(s, 1)).length;
  const last7d = sessions.filter((s) => within(s, 7));

  // Acute load: heavy same-day volume costs readiness.
  if (last24h >= 4) {
    score -= 20;
    notes.push('High session volume in the last 24h — recovery is the priority.');
  } else if (last24h >= 2) {
    score -= 8;
    notes.push('Moderate load today; keep the next session technical, not maximal.');
  }

  // Rust: long layoffs also cost readiness (movement quality decays).
  if (sessions.length === 0) {
    score -= 15;
    notes.push('No recorded sessions yet — start with fundamentals at low intensity.');
  } else {
    const newest = sessions.reduce((a, b) =>
      new Date(a.playedAt) > new Date(b.playedAt) ? a : b,
    );
    const daysSince = (now.getTime() - new Date(newest.playedAt).getTime()) / dayMs;
    if (daysSince > 5) {
      score -= 12;
      notes.push(`~${Math.floor(daysSince)} days since the last session — ramp back up gradually.`);
    } else if (daysSince <= 1 && last24h < 2) {
      score += 5;
      notes.push('Fresh and in rhythm.');
    }
  }

  // Trend: improving scores over the week suggest good adaptation.
  if (last7d.length >= 4) {
    const sorted = [...last7d].sort(
      (a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime(),
    );
    const mid = Math.floor(sorted.length / 2);
    const avg = (arr: SessionSummary[]) =>
      arr.reduce((sum, s) => sum + s.score, 0) / Math.max(arr.length, 1);
    const older = avg(sorted.slice(0, mid));
    const newer = avg(sorted.slice(mid));
    if (newer > older * 1.1) {
      score += 10;
      notes.push('Scores are trending up this week — adaptation is landing.');
    } else if (newer < older * 0.9) {
      score -= 10;
      notes.push('Scores dipped this week — possible fatigue; bias toward technique work.');
    }
  }

  return { score: Math.round(clamp(score, 0, 100)), notes };
}

// ---------------------------------------------------------------------------
// Athlete state assembly (server-side only; nothing client-supplied)
// ---------------------------------------------------------------------------

export async function buildAthleteState(userId: string): Promise<AthleteState> {
  // VERIFY field/relation names against live schema.prisma (see REFINEMENT.md):
  // PlayerProfile.userId, GameSession.userId/mode/score/createdAt,
  // LessonProgress.userId/lessonId/status/bestScore, CreditLedger.userId/delta.
  const [user, profile, sessions, lessons, ledgerAgg] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    prisma.playerProfile.findUnique({ where: { userId } }),
    prisma.gameSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 15,
    }),
    prisma.lessonProgress.findMany({
      where: { userId },
      orderBy: { completedAt: 'desc' },
      take: 25,
    }),
    prisma.creditLedger.aggregate({ where: { userId }, _sum: { amount: true } }),
  ]);

  const recentSessions: SessionSummary[] = sessions.map((s: Record<string, unknown>) => ({
    mode: String(s['mode'] ?? 'unknown'),
    score: typeof s['score'] === 'number' ? (s['score'] as number) : 0,
    playedAt: s['createdAt'] instanceof Date ? (s['createdAt'] as Date).toISOString() : String(s['createdAt'] ?? ''),
  }));

  const prqAttributes = profile
    ? extractPrqAttributes(profile as unknown as Record<string, unknown>)
    : {};
  const attributeValues = Object.values(prqAttributes);
  const prqOverall =
    attributeValues.length > 0
      ? Math.round(attributeValues.reduce((a, b) => a + b, 0) / attributeValues.length)
      : 50;

  const completed = lessons; // all LessonProgress rows represent completed lessons
  const inProgress = lessons
    .slice(0, 5)
    .map((l: Record<string, unknown>) => ({
      lessonId: `${String(l['trackKey'] ?? '')}/${String(l['lessonKey'] ?? '')}`,
      status: 'completed',
      bestScore: null as number | null,
    }));

  const readiness = computeReadiness(recentSessions);

  return {
    displayName: user?.name ?? 'Athlete',
    prqAttributes,
    prqOverall,
    tier: resolveTier(prqOverall),
    recentSessions: recentSessions.slice(0, 8),
    lessonsCompleted: completed.length,
    lessonsInProgress: inProgress,
    lcBalance: ledgerAgg._sum?.amount ?? 0,
    readiness: readiness.score,
    readinessNotes: readiness.notes,
  };
}

// ---------------------------------------------------------------------------
// Personas + system prompt
// ---------------------------------------------------------------------------

const PERSONA_PRESETS: Record<CoachPersona, { name: string; style: string }> = {
  trainer: {
    name: 'Coach Vale (Trainer)',
    style: [
      'You are a hands-on athletic trainer. Prescriptive and concrete.',
      'Every answer ends with ONE specific next action inside FEL: a lesson to open, a Skill Lab drill to run, or a hero-mode session to play.',
      'Reference the athlete lightly by their weakest PRQ attribute when relevant. Keep answers under 150 words.',
    ].join(' '),
  },
  analyst: {
    name: 'Coach Iris (Analyst)',
    style: [
      'You are a performance analyst. Precise, numeric, calm.',
      'Ground every claim in the athlete state you were given: cite PRQ numbers, session scores, trends, and readiness explicitly.',
      'Prefer short structured answers (2-4 bullet points, then one recommendation). Never invent data that is not in the state.',
    ].join(' '),
  },
  motivator: {
    name: 'Coach Rex (Motivator)',
    style: [
      'You are a high-energy motivator. Warm, direct, zero fluff.',
      'Celebrate real progress from the athlete state (streaks, completed lessons, score trends), then channel the energy into one challenge.',
      'Keep it punchy: under 100 words. Never fabricate accomplishments.',
    ].join(' '),
  },
};

export function buildSystemPrompt(persona: CoachPersona, state: AthleteState): string {
  const preset = PERSONA_PRESETS[persona];

  const attrLines =
    Object.entries(state.prqAttributes)
      .sort(([, a], [, b]) => a - b)
      .map(([k, v]) => `  - ${k}: ${v}/100`)
      .join('\n') || '  - (no attribute data yet)';

  const sessionLines =
    state.recentSessions
      .map((s) => `  - ${s.mode}: score ${s.score} (${s.playedAt.slice(0, 10)})`)
      .join('\n') || '  - (no sessions yet)';

  const lessonLines =
    state.lessonsInProgress
      .map((l) => `  - ${l.lessonId}: ${l.status}${l.bestScore !== null ? `, best ${l.bestScore}` : ''}`)
      .join('\n') || '  - (none in progress)';

  return [
    `You are ${preset.name}, an AI coach inside Final Evolution Lab (FEL), a sports-training game with two hero modes (Dunking, Karate), a Skill Lab with drills, a first-party lesson curriculum, and a Lab Credits (LC) soft-currency economy.`,
    preset.style,
    '',
    'ATHLETE STATE (server-verified, current):',
    `- Name: ${state.displayName}`,
    `- PRQ overall: ${state.prqOverall}/100 (tier: ${state.tier})`,
    '- PRQ attributes (weakest first):',
    attrLines,
    `- Readiness: ${state.readiness}/100`,
    ...state.readinessNotes.map((n) => `  - ${n}`),
    '- Recent sessions:',
    sessionLines,
    `- Lessons completed: ${state.lessonsCompleted}`,
    '- Lessons in progress:',
    lessonLines,
    `- Lab Credits balance: ${state.lcBalance} LC`,
    '',
    'RULES:',
    '- Only discuss training, FEL features, and this athlete’s data. Redirect anything else briefly.',
    '- Never state or imply LC balances or PRQ values other than the ones above; the server owns those numbers.',
    '- Never promise real-money rewards, payouts, or content that does not exist in FEL v1.',
    '- If readiness is below 40, recommend recovery or light technique work instead of intense drills.',
  ].join('\n');
}

export function isCoachPersona(value: string): value is CoachPersona {
  return value === 'trainer' || value === 'analyst' || value === 'motivator';
}

// ---------------------------------------------------------------------------
// LLM call (non-streaming v1)
// ---------------------------------------------------------------------------

export class CoachServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'CoachServiceError';
  }
}

export async function callCoachLLM(
  systemPrompt: string,
  history: ChatMessage[],
): Promise<string> {
  const apiKey = process.env.ABACUSAI_API_KEY;
  if (!apiKey) {
    throw new CoachServiceError('Coach is not configured (missing ABACUSAI_API_KEY).', 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const response = await fetch(ABACUS_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: COACH_MODEL,
        stream: false,
        max_tokens: MAX_COMPLETION_TOKENS,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('[coach] LLM error', response.status, text.slice(0, 500));
      throw new CoachServiceError('Coach is unavailable right now.', 502);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      throw new CoachServiceError('Coach returned an empty reply.', 502);
    }
    return reply;
  } catch (err) {
    if (err instanceof CoachServiceError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new CoachServiceError('Coach timed out. Try again.', 504);
    }
    console.error('[coach] fetch failed', err);
    throw new CoachServiceError('Coach is unavailable right now.', 502);
  } finally {
    clearTimeout(timeout);
  }
}
