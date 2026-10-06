// lib/soundtrack/reviewQueue.ts — CREATOR SOUNDTRACK phase 0: the review queue's filters and its list item. Pure.
//
// The queue route (app/api/v1/creative-card/review-queue) and the page (app/admin/review) read these, so what a view
// means is decided once and tested without a database.

import type { Discipline } from '@/lib/creator/creative-card-types';
import { isPublicCreator, readPlays, readRotation, slimCard, wantsPublic, type FlagRecord, type ReviewRecord, type Rotation } from '@/lib/creator/creative-card-review';
import { mediaUrlsOf } from './storage';

export const QUEUE_VIEWS = ['pending', 'flagged', 'rotation', 'approved', 'rejected'] as const;
export type QueueView = typeof QUEUE_VIEWS[number];

/** The Prisma `where` for one view. `flagged` and `rotation` narrow on the stats JSON (Postgres JSON path filters). */
export function queueWhere(view: QueueView, discipline?: Discipline): Record<string, unknown> {
  const d = discipline ? { primary: discipline } : {};
  switch (view) {
    case 'pending': return { reviewState: 'pending_review', ...d };
    case 'approved': return { reviewState: 'approved', ...d };
    case 'rejected': return { reviewState: 'rejected', ...d };
    case 'flagged': return { reviewState: { in: ['pending_review', 'approved'] }, stats: { path: ['flags'], array_contains: [] }, ...d };
    case 'rotation': return {
      reviewState: 'approved', primary: 'music',
      OR: [{ stats: { path: ['soundtrack', 'rotation'], equals: 'on' } }, { stats: { path: ['soundtrack', 'rotation'], equals: 'featured' } }],
    };
  }
}

export interface QueueRow {
  id: string; ownerId: string; title: string; primary: string; secondary?: string[];
  art: unknown; stats: unknown; isPublic: boolean; reviewState: string; createdAt: Date | string;
  owner?: { name?: string | null; dobYear?: number | null } | null;
}

export interface QueueItem {
  id: string; title: string; primary: string; reviewState: string; isPublic: boolean; createdAt: string;
  owner: { id: string; name: string; publicCreator: boolean };
  /** What the creator asked for. A card that asked to be public, by a public creator, goes public on approval. */
  wantsPublic: boolean;
  /** Approval will keep it private whatever is asked: the creator is under 18 or of unknown age. */
  staysPrivate: boolean;
  flags: number; lastFlag?: FlagRecord; review?: ReviewRecord; rotation: Rotation | null; plays: number;
  /** The slim payload (no inline images): enough to show bpm, steps, questions, a text excerpt. */
  art: unknown;
  /** How many media files the card carries (the page asks for signed preview links on demand). */
  mediaCount: number;
}

export function toQueueItem(r: QueueRow, now: Date = new Date()): QueueItem {
  const stats = (r.stats ?? {}) as Record<string, unknown>;
  const flags = Array.isArray(stats.flags) ? (stats.flags as FlagRecord[]) : [];
  const publicCreator = isPublicCreator(r.owner?.dobYear, now);
  const want = wantsPublic(stats);
  return {
    id: r.id, title: r.title, primary: r.primary, reviewState: r.reviewState, isPublic: r.isPublic,
    createdAt: (r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)).toISOString(),
    owner: { id: r.ownerId, name: r.owner?.name?.trim() || 'Creator', publicCreator },
    wantsPublic: want, staysPrivate: !publicCreator,
    flags: flags.length, ...(flags.length ? { lastFlag: flags[flags.length - 1] } : {}),
    ...(stats.review ? { review: stats.review as ReviewRecord } : {}),
    rotation: readRotation(stats), plays: readPlays(stats),
    art: slimCard({ art: r.art as never, stats: {} as never }).art,
    mediaCount: mediaUrlsOf(r.art).length,
  };
}
