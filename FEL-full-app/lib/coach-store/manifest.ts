import { z } from 'zod';
import { MAX_PRICE_CENTS, MIN_PRICE_CENTS } from '@/lib/store/coachListing';
import { MAX_CLIP_SECONDS, MAX_CLIPS, RESERVED_SLUGS, SESSION_LENGTHS } from './constants';

const lane = z.enum(['correctives', 'posture', 'dunking']);

export const coachManifest = z.discriminatedUnion('kind', [
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
]);

export type CoachManifest = z.infer<typeof coachManifest>;

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
  return `coach-store:${slug}:membership:${manifest.audience}:month`;
}

export function sessionLengthOk(n: number): n is (typeof SESSION_LENGTHS)[number] {
  return n === 30 || n === 60;
}

/** Correctives and posture have no checkout in v1. Dunking is the one program that sells. */
export function programComingSoon(manifest: CoachManifest): boolean {
  return manifest.kind === 'program' && manifest.lane !== 'dunking';
}
