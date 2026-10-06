// lib/create/cardBlocks.ts — CREATE HUB phase 4: what the public pages show from approved creative cards. Pure: the
// server components read the rows (always through lane/soundtrack's publicCardWhere, so a minor's work never shows) and
// hand them here.
//   - "Signature moves" on /card/[slug]: the creator's approved public sport cards, each naming the run it came from.
//   - "Community reads" on /story: approved public writing cards, credited, with an excerpt and the full text.
// (The card page's "Tracks" block is lane/soundtrack's components/soundtrack/creator-tracks.tsx.)

export const MOVES_MAX = 6;
export const READS_MAX = 12;
export const EXCERPT_MAX = 280;

export interface SportRow { id: string; title: string; art: unknown; createdAt: Date | string }
export interface RunRow { id: string; mode: string; score: number; won?: boolean | null }
export interface MoveItem { id: string; name: string; detail: string | null }

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const modeLabel = (m: string) => m.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Newest first, at most six. A card names its move, or falls back to its title; the run adds mode and score. */
export function signatureMovesBlock(rows: readonly SportRow[], runs: readonly RunRow[]): MoveItem[] {
  const byId = new Map(runs.map((r) => [r.id, r]));
  return [...rows]
    .filter((r) => (r.art as { kind?: unknown } | null)?.kind === 'sport')
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, MOVES_MAX)
    .map((r) => {
      const a = r.art as { signatureMoveId?: unknown; routineId?: unknown };
      const run = typeof a.routineId === 'string' ? byId.get(a.routineId) : undefined;
      return {
        id: r.id,
        name: str(a.signatureMoveId, 40) ?? r.title.slice(0, 60),
        detail: run ? `${modeLabel(run.mode)} · ${run.score.toLocaleString('en-US')} pts${run.won ? ' · won' : ''}` : null,
      };
    });
}

/** The run ids a block needs looked up. */
export const runIdsOf = (rows: readonly SportRow[]): string[] =>
  [...new Set(rows.map((r) => (r.art as { routineId?: unknown } | null)?.routineId).filter((x): x is string => typeof x === 'string' && x.length <= 64))];

export interface WritingRow {
  id: string; title: string; art: unknown; createdAt: Date | string;
  owner?: { name?: string | null; creatorCards?: { slug: string; published: boolean }[] } | null;
}
export interface ReadItem { id: string; title: string; excerpt: string; text: string; more: boolean; by: string; href: string | null }

/** Excerpt at a word boundary near EXCERPT_MAX. */
export function excerptOf(text: string, max = EXCERPT_MAX): { excerpt: string; more: boolean } {
  const t = text.trim();
  if (t.length <= max) return { excerpt: t, more: false };
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return { excerpt: `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`, more: true };
}

export function communityReads(rows: readonly WritingRow[], hrefFor: (slug: string) => string): ReadItem[] {
  const out: ReadItem[] = [];
  for (const r of [...rows].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))) {
    const text = (r.art as { kind?: unknown; text?: unknown } | null);
    if (text?.kind !== 'writing' || typeof text.text !== 'string' || !text.text.trim()) continue;
    const card = r.owner?.creatorCards?.find((c) => c.published);
    out.push({
      id: r.id, title: r.title.slice(0, 60), text: text.text, ...excerptOf(text.text),
      by: (r.owner?.name ?? '').trim() || 'A FEL creator',
      href: card ? hrefFor(card.slug) : null,
    });
    if (out.length >= READS_MAX) break;
  }
  return out;
}
