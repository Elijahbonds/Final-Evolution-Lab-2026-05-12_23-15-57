// lib/pipelines/scenePicker.ts — PIPELINES (owner, 2026-10-06): the Spot the Scene pack picker. Pure apart from the
// fetch it is handed.
//
// A community pack played only from a hand-typed `?pack=<cardId>` link, and its creator was never named. Now the pick
// screen lists FEL's own pack first, then every approved community pack (/api/v1/scene-packs: approved, public, adult
// creators, no private upload), each "by <creator>" with its play count; ▲ ▼ chooses. Starting a community pack counts
// one play (POST /api/v1/pipelines/play: once per player per day).

import type { QuizPack } from '@/lib/babylon/core/QuizCore';
import type { Credit } from './community';
import { reportCommunityPlay } from './plays';

export interface CommunityScenePack extends QuizPack { cardId: string; creator?: Credit; plays?: number }
export interface SceneChoice { pack: QuizPack; cardId: string | null; by: string | null; plays: number }

const TITLE_MAX = 40;

/** FEL's pack (or the ?pack= pack the mode already loaded) first, then each community pack once, with questions. */
export function sceneChoices(first: QuizPack, community: readonly CommunityScenePack[]): SceneChoice[] {
  const firstCard = community.find((p) => p.id === first.id);
  const out: SceneChoice[] = [firstCard ? choiceOf(firstCard) : { pack: first, cardId: null, by: null, plays: 0 }];
  for (const p of community) {
    if (!p.questions?.length || p.id === first.id || out.some((c) => c.pack.id === p.id)) continue;
    out.push(choiceOf(p));
  }
  return out;
}

function choiceOf(p: CommunityScenePack): SceneChoice {
  const plays = typeof p.plays === 'number' && Number.isFinite(p.plays) && p.plays > 0 ? Math.floor(p.plays) : 0;
  return { pack: { id: p.id, title: p.title, questions: p.questions }, cardId: p.cardId, by: p.creator?.name?.trim() || 'a FEL creator', plays };
}

/** ▲ ▼ on the pick screen; wraps. */
export const cycleChoice = (i: number, dir: 1 | -1, n: number): number => (n <= 0 ? 0 : (i + dir + n) % n);

/** The title the HUD carries all game: the pack, and its creator when it is a community pack. */
export function packLabel(c: SceneChoice): string {
  const t = c.pack.title.slice(0, TITLE_MAX);
  return c.by ? `${t} · by ${c.by}` : t;
}

/** The pick screen's pack line. */
export function packPickLine(c: SceneChoice, index: number, count: number): string {
  if (count <= 1) return packLabel(c);
  const plays = c.cardId ? ` · ${c.plays} play${c.plays === 1 ? '' : 's'}` : '';
  return `PACK ▲▼ ${index + 1}/${count}: ${packLabel(c)}${plays}`;
}

type FetchLike = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/** The approved community packs, or [] on any failure (the FEL pack still plays). */
export async function fetchScenePacks(fetchImpl: FetchLike | null = typeof fetch === 'function' ? (u) => fetch(u) : null): Promise<CommunityScenePack[]> {
  if (!fetchImpl) return [];
  try {
    const r = await fetchImpl('/api/v1/scene-packs');
    if (!r.ok) return [];
    const j = (await r.json()) as { packs?: CommunityScenePack[] };
    return Array.isArray(j?.packs) ? j.packs.filter((p) => p && typeof p.cardId === 'string' && Array.isArray(p.questions)) : [];
  } catch { return []; }
}

/** A community pack was started: count one play. FEL's own pack counts nothing. */
export function noteScenePackStart(c: SceneChoice | undefined, report: (cardId: string) => void = reportCommunityPlay): void {
  if (c?.cardId) report(c.cardId);
}
