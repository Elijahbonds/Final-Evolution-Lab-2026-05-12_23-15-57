// lib/create/status.ts — CREATE HUB (owner, 2026-10-06): what My Creations says about each card, and the toast when a
// card's review status changes. There is no notification model (no Notification/Inbox in the schema), so the hub polls
// the caller's own cards and compares them with what this device last saw. Pure apart from the two storage helpers.
//
// The review record is lane/soundtrack's (stats.review {decision, note, by, at}; stats.soundtrack.rotation; stats.plays,
// read through creative-card-review.ts). The note is the approver's words to the creator: shown to the owner only.

import type { CreativeCard } from '@/lib/creator/creative-card-types';
import { readPlays, readRotation, wantsPublic, type ReviewRecord } from '@/lib/creator/creative-card-review';

export type CardStatus = 'pending' | 'public' | 'private' | 'rejected';

export interface StatusView {
  status: CardStatus;
  /** The chip. */
  label: string;
  /** The line under it, or null. */
  detail: string | null;
  /** The approver's note to the creator, when there is one. */
  note: string | null;
  /** An approved music card the soundtrack plays. */
  inRotation: boolean;
  plays: number;
}

type CardLike = Pick<CreativeCard, 'id' | 'title' | 'primary' | 'reviewState' | 'isPublic' | 'stats'>;

const reviewOf = (stats: unknown): ReviewRecord | null => {
  const r = (stats as Record<string, unknown> | null | undefined)?.review as ReviewRecord | undefined;
  return r && typeof r === 'object' ? r : null;
};

export function statusOf(card: CardLike, ctx: { publicCreator: boolean }): StatusView {
  const note = reviewOf(card.stats)?.note?.trim() || null;
  const rotation = readRotation(card.stats);
  const inRotation = card.primary === 'music' && card.reviewState === 'approved' && card.isPublic && (rotation === 'on' || rotation === 'featured');
  const plays = readPlays(card.stats);
  if (card.reviewState === 'pending_review') {
    return { status: 'pending', label: 'In review', detail: 'FEL checks every public card before anyone else sees it.', note: null, inRotation: false, plays };
  }
  if (card.reviewState === 'rejected') {
    return { status: 'rejected', label: 'Not approved', detail: note ? null : 'Not approved for public play.', note, inRotation: false, plays };
  }
  if (card.isPublic) {
    const detail = inRotation ? (rotation === 'featured' ? 'Featured in the FEL soundtrack' : 'In the FEL soundtrack rotation') : 'Public, credited to you';
    return { status: 'public', label: inRotation ? 'In rotation' : 'Public', detail, note, inRotation, plays };
  }
  // approved but private: the creator chose private, or may not be public (a teen, or an unknown age)
  const asked = wantsPublic(card.stats);
  const detail = asked && !ctx.publicCreator ? 'Approved. It stays private until your account is a confirmed 18+.'
    : asked && rotation === 'pulled' ? 'Taken out of the soundtrack rotation.'
    : 'Private: only you can see and use it.';
  return { status: 'private', label: asked && !ctx.publicCreator ? 'Approved, private' : 'Private', detail, note, inRotation: false, plays };
}

// ── change detection ─────────────────────────────────────────────────────────────────────────────────────────────────
/** What this device remembers per card: enough to notice every transition a creator cares about. */
export type StatusSnapshot = Record<string, string>;

export const snapshotKey = (c: CardLike): string => `${c.reviewState}|${c.isPublic ? 'pub' : 'priv'}|${readRotation(c.stats) ?? '-'}`;

export function snapshotOf(cards: readonly CardLike[]): StatusSnapshot {
  const out: StatusSnapshot = {};
  for (const c of cards) out[c.id] = snapshotKey(c);
  return out;
}

export interface StatusChange { card: CardLike; from: string; to: string }

/**
 * Cards whose status moved since the snapshot. A card the snapshot has never seen is NOT a change (it was just made,
 * here or on another device), so a first visit never fires a burst of toasts. `prev === null` means "nothing stored".
 */
export function diffStatus(prev: StatusSnapshot | null, cards: readonly CardLike[]): StatusChange[] {
  if (!prev) return [];
  const out: StatusChange[] = [];
  for (const c of cards) {
    const was = prev[c.id];
    const now = snapshotKey(c);
    if (was !== undefined && was !== now) out.push({ card: c, from: was, to: now });
  }
  return out;
}

export interface StatusToast { tone: 'success' | 'error' | 'info'; text: string }

/** The toast for one change, or null when the change is not news (e.g. a rotation note on a private card). */
export function toastFor(ch: StatusChange, ctx: { publicCreator: boolean }): StatusToast | null {
  const v = statusOf(ch.card, ctx);
  const t = `"${ch.card.title}"`;
  const wasRotation = /\|(on|featured)$/.test(ch.from);
  switch (v.status) {
    case 'public':
      if (v.inRotation) return { tone: 'success', text: ch.card.primary === 'music' ? `Your track ${t} is in rotation` : `${t} is in rotation` };
      if (wasRotation) return { tone: 'info', text: `${t} left the soundtrack rotation. It is still public.` };
      return { tone: 'success', text: `${t} was approved. It is public now, credited to you.` };
    case 'private':
      if (wasRotation) return { tone: 'info', text: `${t} was taken out of the soundtrack rotation.` };
      return { tone: 'success', text: `${t} was approved. ${v.detail}` };
    case 'rejected':
      return { tone: 'error', text: v.note ? `${t} was not approved: ${v.note}` : `${t} was not approved.` };
    case 'pending':
      return { tone: 'info', text: `${t} is back in review.` };
  }
}

// ── this device's memory (localStorage; a failure means "nothing stored", never a throw) ─────────────────────────────
export const STATUS_STORAGE_KEY = 'fel-create-status-v1';

export function loadSnapshot(storage: Pick<Storage, 'getItem'> | null): StatusSnapshot | null {
  try {
    const raw = storage?.getItem(STATUS_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const out: StatusSnapshot = {};
    for (const [k, s] of Object.entries(v as Record<string, unknown>)) if (typeof s === 'string') out[k] = s;
    return out;
  } catch { return null; }
}

export function saveSnapshot(storage: Pick<Storage, 'setItem'> | null, snap: StatusSnapshot): void {
  try { storage?.setItem(STATUS_STORAGE_KEY, JSON.stringify(snap)); } catch { /* this device only; the next poll tries again */ }
}

/** How often the hub asks. A minute is plenty for a human review queue and costs one small request. */
export const STATUS_POLL_MS = 60_000;
