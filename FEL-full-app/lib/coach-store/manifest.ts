import { z } from 'zod';
import { MAX_PRICE_CENTS, MIN_PRICE_CENTS } from '@/lib/store/coachListing';
import { MAX_CLIP_SECONDS, MAX_CLIPS, RESERVED_SLUGS, SESSION_LENGTHS } from './constants';

const lane = z.enum(['correctives', 'posture', 'dunking']);

/** A store-price product key, e.g. 'signature-dunk-course'. Kept generic — storePrices.ts supplies the values. */
const productSlug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const coachManifestUnion = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('program'),
    lane,
    billing: z.literal('one_time'),
    weeks: z.literal(8).optional(),
  }),
  z.object({
    kind: z.literal('live_1on1'),
    durationMin: z.union([z.literal(30), z.literal(60)]),
  }),
  z.object({
    kind: z.literal('video_review'),
    maxClips: z.number().int().min(1).max(MAX_CLIPS).default(MAX_CLIPS),
    maxClipSeconds: z.number().int().min(1).max(MAX_CLIP_SECONDS).default(MAX_CLIP_SECONDS),
  }),
  z.object({
    kind: z.literal('membership'),
    audience: z.enum(['adult', 'teen']),
    interval: z.literal('month'),
  }),
  z.object({
    kind: z.literal('course'),
    product: productSlug,
    billing: z.literal('one_time'),
  }),
  z.object({
    kind: z.literal('series'),
    product: productSlug,
    billing: z.literal('one_time'),
  }),
  z.object({
    kind: z.literal('bundle'),
    product: productSlug,
    billing: z.literal('one_time'),
    members: z.array(productSlug).min(1),
  }),
]);

/** Adds the bundle-only rules discriminatedUnion can't express on its own: no duplicate and no self-referencing member. */
export const coachManifest = coachManifestUnion.superRefine((val, ctx) => {
  if (val.kind !== 'bundle') return;
  if (new Set(val.members).size !== val.members.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'duplicate bundle member', path: ['members'] });
  }
  if (val.members.includes(val.product)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bundle cannot include itself', path: ['members'] });
  }
});

export type CoachManifest = z.infer<typeof coachManifestUnion>;

export function parseManifest(raw: string): CoachManifest | null {
  try {
    const json = JSON.parse(raw);
    const parsed = coachManifest.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function priceOk(cents: number): boolean {
  return Number.isInteger(cents) && cents >= MIN_PRICE_CENTS && cents <= MAX_PRICE_CENTS;
}

export function slugOk(slug: string): boolean {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return false;
  return !(RESERVED_SLUGS as readonly string[]).includes(slug);
}

export function itemKeyFor(manifest: CoachManifest, slug: string): string {
  if (manifest.kind === 'program') return `coach-store:${slug}:program:${manifest.lane}:one_time`;
  if (manifest.kind === 'live_1on1') return `coach-store:${slug}:live_1on1:${manifest.durationMin}:one_time`;
  if (manifest.kind === 'video_review') return `coach-store:${slug}:video_review:clip:one_time`;
  if (manifest.kind === 'course') return `coach-store:${slug}:course:${manifest.product}:one_time`;
  if (manifest.kind === 'series') return `coach-store:${slug}:series:${manifest.product}:one_time`;
  if (manifest.kind === 'bundle') return `coach-store:${slug}:bundle:${manifest.product}:one_time`;
  return `coach-store:${slug}:membership:${manifest.audience}:month`;
}

export function sessionLengthOk(n: number): n is (typeof SESSION_LENGTHS)[number] {
  return n === 30 || n === 60;
}

/** Correctives and posture have no checkout in v1. Dunking is the one program that sells. */
export function programComingSoon(manifest: CoachManifest): boolean {
  return manifest.kind === 'program' && manifest.lane !== 'dunking';
}
