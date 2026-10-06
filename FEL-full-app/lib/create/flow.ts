// lib/create/flow.ts — CREATE HUB (owner, 2026-10-06): the guided three-step flow every discipline goes through, and
// the links every "publish as card" button in the game opens. Pure: the page holds the state, this decides what it means.
//
//   1. MAKE      make it here, or bring it in (an Academy song, a file, a run you played)
//   2. DETAILS   title, the extras, who can see it, and the rights statement
//   3. PREVIEW   see it where it will appear, then submit for review
//
// The owner's rules this enforces (2026-10-06):
//   - "everything public needs approval": the flow only ever SUBMITS; going public is the approver's call. The card asks
//     to be public (isPublic) only when the creator chose it AND may be public.
//   - "teens create but keep private (nothing public, no profile link)": a creator who is not a verified 18+ (the server
//     decides; unknown age counts as a minor) cannot ask for public. The server enforces it too (lane/soundtrack's
//     reviewCard and publicCardWhere); this keeps the UI from offering what the server would refuse.
//   - rights: the statement is ticked in step 2 and travels as {text, version, at} (creative-card-types.ts). It is also
//     the card's licence tick, so there is one box to tick, not two.

import {
  defaultRarity, defaultStats, isDiscipline, rightsFamilyFor, rightsRecordFor, validateArtPayload,
  type ArtPayload, type ArtPayloadBody, type Discipline, type SportDesignation,
} from '@/lib/creator/creative-card-types';

export const STEPS = ['make', 'details', 'preview'] as const;
export type StepId = typeof STEPS[number];

export const STEP_LABEL: Record<StepId, string> = { make: 'Make or import', details: 'Details and rights', preview: 'Preview and submit' };

export const TITLE_MAX = 60;
export const SECONDARY_MAX = 2;
export const SPORTS: readonly SportDesignation[] = ['basketball', 'football', 'soccer', 'baseball', 'tennis', 'golf', 'skate', 'snowboard', 'karate'];

/** Everything the creator has decided so far. `art` is step 1's output, without the rights record. */
export interface FlowDraft {
  discipline: Discipline;
  art: ArtPayloadBody | null;
  title: string;
  secondary: Discipline[];
  sport?: SportDesignation;
  /** The creator's wish. Only honoured when the context allows it (effectivePublic). */
  wantsPublic: boolean;
  rightsTicked: boolean;
  remixOf?: string;
}

export interface FlowContext {
  /** Verified 18+ (the server's ownerIsPublicCreator). False for a teen and for an unknown age. */
  publicCreator: boolean;
}

export function newDraft(discipline: Discipline, seed: Partial<FlowDraft> = {}): FlowDraft {
  return { discipline, art: null, title: '', secondary: [], wantsPublic: true, rightsTicked: false, ...seed };
}

export const stepIndex = (s: StepId): number => STEPS.indexOf(s);
export const nextStep = (s: StepId): StepId | null => STEPS[stepIndex(s) + 1] ?? null;
export const prevStep = (s: StepId): StepId | null => STEPS[stepIndex(s) - 1] ?? null;

export const needsSport = (d: FlowDraft): boolean => d.discipline === 'sport' || d.secondary.includes('sport');

/** May this card ask to be public? Only a public creator who chose it. */
export const effectivePublic = (d: FlowDraft, ctx: FlowContext): boolean => ctx.publicCreator && d.wantsPublic;

/** The line under the visibility choice. */
export function visibilityNote(d: FlowDraft, ctx: FlowContext): string {
  if (!ctx.publicCreator) return 'Your creations stay private until your account is a confirmed 18+. You can still make them, keep them and use them yourself.';
  return effectivePublic(d, ctx)
    ? 'Public once approved: FEL reviews every public card first, then it appears in the game credited to you.'
    : 'Private: only you can see and use it. No review needed.';
}

/** The art with the rights record the creator ticked (the family's current wording). */
export function finalArt(d: FlowDraft, now: Date = new Date()): ArtPayload | null {
  if (!d.art) return null;
  return { ...d.art, rights: rightsRecordFor(d.discipline, now) } as ArtPayload;
}

/**
 * Why the creator cannot leave this step yet, in their words. Empty = they can. Each step also re-checks the steps
 * before it, so a stale draft can never be submitted by jumping ahead.
 */
export function blockers(step: StepId, d: FlowDraft, ctx: FlowContext): string[] {
  const out: string[] = [];
  // step 1: something made, of the right kind, well formed
  if (!d.art) out.push('Make something first, or bring it in.');
  else if (d.art.kind !== d.discipline) out.push(`That is a ${d.art.kind} piece; this is the ${d.discipline} flow.`);
  else {
    const shape = validateArtPayload(finalArt(d));
    if (!shape.ok) out.push(shape.error);
  }
  if (step === 'make') return out;
  // step 2: the details and the rights tick
  const title = d.title.trim();
  if (!title) out.push('Give it a title.');
  else if (title.length > TITLE_MAX) out.push(`Keep the title to ${TITLE_MAX} characters.`);
  if (d.secondary.length > SECONDARY_MAX) out.push(`Pick up to ${SECONDARY_MAX} extra disciplines.`);
  if (d.secondary.includes(d.discipline)) out.push('An extra discipline cannot be the main one.');
  if (!d.secondary.every(isDiscipline)) out.push('Unknown discipline.');
  if (needsSport(d) && !d.sport) out.push('Pick the sport.');
  if (!d.rightsTicked) out.push('Tick the rights statement.');
  return out;
}

export const canLeave = (step: StepId, d: FlowDraft, ctx: FlowContext): boolean => blockers(step, d, ctx).length === 0;

/** The furthest step this draft may be on: a jump past an unfinished step lands on that step instead. */
export function clampStep(want: StepId, d: FlowDraft, ctx: FlowContext): StepId {
  for (const s of STEPS) {
    if (s === want) return s;
    if (!canLeave(s, d, ctx)) return s;
  }
  return want;
}

// ── media that is uploaded at submit ─────────────────────────────────────────────────────────────────────────────────
/**
 * Step 1 makes the media on the device (a rendered mix, a recorded line); it is uploaded only when the creator submits.
 * Until then the payload carries a placeholder https address per field, so the contract's validators can check
 * everything else in the draft. Submit uploads each pending field and swaps in the real address.
 */
export const PENDING_MEDIA = 'https://upload.pending/';
export const pendingUrl = (field: string): string => `${PENDING_MEDIA}${field}`;

export function pendingFields(art: unknown): string[] {
  const a = (art ?? {}) as Record<string, unknown>;
  return Object.keys(a).filter((k) => typeof a[k] === 'string' && (a[k] as string).startsWith(PENDING_MEDIA));
}

/** The art with every pending field replaced by its uploaded address; null when one is missing. */
export function resolvePending<T extends object>(art: T, uploaded: Record<string, string>): T | null {
  const out = { ...art } as Record<string, unknown>;
  for (const k of pendingFields(art)) {
    if (!uploaded[k]) return null;
    out[k] = uploaded[k];
  }
  return out as T;
}

/** The POST /api/v1/creative-card body. Null while the draft cannot be submitted, or still has media to upload. */
export function buildCreateBody(d: FlowDraft, ctx: FlowContext, now: Date = new Date()) {
  if (!canLeave('details', d, ctx)) return null;
  const art = finalArt(d, now);
  if (!art || pendingFields(art).length) return null;
  return {
    title: d.title.trim(),
    primary: d.discipline,
    secondary: [...d.secondary],
    ...(needsSport(d) ? { sportDesignation: d.sport } : {}),
    art,
    stats: defaultStats(),
    rarity: defaultRarity(),
    isPublic: effectivePublic(d, ctx),
    // The rights statement is the licence: the server's gate needs licenseAccepted === true, and only the tick sets it.
    licenseAccepted: d.rightsTicked as true,
    ...(d.remixOf ? { remixOf: d.remixOf } : {}),
  };
}

/** Which rights statement step 2 shows. */
export const rightsFor = (d: Discipline) => rightsRecordFor(d);
export const rightsFamily = rightsFamilyFor;

// ── "Publish as card" entry points ───────────────────────────────────────────────────────────────────────────────────
/** Every tool that can open the flow, so the flow can say where you came from and pre-fill what it can. */
// PIPELINES (2026-10-06): + the Closet's "publish this look" and the end screen's "make a card".
export const PUBLISH_SOURCES = ['academy', 'library', 'song-render', 'dance-export', 'flipshelf', 'maker', 'kitchens', 'hub', 'closet', 'end-screen'] as const;
export type PublishSource = typeof PUBLISH_SOURCES[number];

export const SOURCE_LABEL: Record<PublishSource, string> = {
  academy: 'the Groove Academy', library: 'your Academy library', 'song-render': 'your song render',
  'dance-export': 'your Dance export', flipshelf: 'your uploaded file', maker: 'the beat maker', kitchens: 'FEL Kitchens', hub: 'Create',
  closet: 'your Closet', 'end-screen': 'the run you just played',
};

export interface PublishEntry {
  from: PublishSource | null;
  /** An Academy library song id (StudioLibrary). */
  song?: string;
  title?: string;
  /** Carry the Dance chart with the song (the Dance export's "…and publish the chart"). */
  chart?: boolean;
  /** The card this one remixes (its creator is credited; the first remix pays them once). */
  remix?: string;
}

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

/** `/create/<d>?from=…` — what every publish-as-card button links to. Unknown params are dropped, never echoed. */
export function publishHref(d: Discipline, entry: PublishEntry = { from: null }): string {
  const q = new URLSearchParams();
  if (entry.from) q.set('from', entry.from);
  if (entry.song && ID_RE.test(entry.song)) q.set('song', entry.song);
  if (entry.title) q.set('title', entry.title.trim().slice(0, TITLE_MAX));
  if (entry.chart) q.set('chart', '1');
  if (entry.remix && ID_RE.test(entry.remix)) q.set('remix', entry.remix);
  const qs = q.toString();
  return `/create/${d}${qs ? `?${qs}` : ''}`;
}

/** The inverse, defensive: anything malformed reads as absent. */
export function readEntry(params: URLSearchParams | Record<string, string | string[] | undefined>): PublishEntry {
  const get = (k: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(k) ?? undefined;
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const from = get('from');
  const song = get('song');
  const title = get('title');
  const remix = get('remix');
  return {
    from: (PUBLISH_SOURCES as readonly string[]).includes(from ?? '') ? from as PublishSource : null,
    ...(song && ID_RE.test(song) ? { song } : {}),
    ...(title && title.trim() ? { title: title.trim().slice(0, TITLE_MAX) } : {}),
    ...(get('chart') === '1' ? { chart: true } : {}),
    ...(remix && ID_RE.test(remix) ? { remix } : {}),
  };
}
