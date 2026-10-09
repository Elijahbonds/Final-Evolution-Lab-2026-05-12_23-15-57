/**
 * "Work with us" inquiries.
 *
 * Order: per-IP rate limit (429) → honeypot (a filled `website` field gets a 201 and is dropped, so a bot
 * learns nothing) → zod validation (400) → write `inquiries/{id}` with status NEW (201). No auto-reply.
 *
 * The IP is never stored. `ipHash` is an HMAC with CREATOR_IP_SALT; without a salt it is null rather than
 * an unsalted hash anyone could reverse over the IPv4 space.
 */

import { createHmac } from 'crypto';
import { z } from 'zod';
import { rateLimit, type RateLimitResult } from '@/lib/rate-limit';
import { getApprovedProfile } from './creatorCatalog';
import type { CreatorInquiryStore, InquiryRecord } from './creatorStore';

export const BUDGET_RANGES = [
  { value: 'under-1k', label: 'Under $1,000' },
  { value: '1k-5k', label: '$1,000–$5,000' },
  { value: '5k-15k', label: '$5,000–$15,000' },
  { value: '15k-50k', label: '$15,000–$50,000' },
  { value: '50k-plus', label: '$50,000+' },
  { value: 'not-sure', label: 'Not sure yet' },
] as const;

export const INQUIRY_SOURCES = ['work-with-us', 'media-kit', 'team-profile'] as const;

export const INQUIRY_LIMIT = 5;
export const INQUIRY_WINDOW_MS = 10 * 60_000;

const text = (max: number) => z.string().trim().max(max);

export const inquirySchema = z.object({
  brand: text(120).min(1, 'Brand is required.'),
  contactName: text(120).min(1, 'Contact name is required.'),
  email: text(200).toLowerCase().email('Enter a valid email.'),
  budgetRange: z.enum(BUDGET_RANGES.map((b) => b.value) as [string, ...string[]]),
  dates: text(200).default(''),
  deliverables: text(1000).min(1, 'Tell us what you need.'),
  message: text(4000).default(''),
  consent: z.literal(true, { errorMap: () => ({ message: 'Consent is required.' }) }),
  source: z.enum(INQUIRY_SOURCES).default('work-with-us'),
  profile: text(80).optional(),
  website: z.string().optional(),
});

export type InquiryInput = z.input<typeof inquirySchema>;

export function hashIp(ip: string, salt: string | undefined): string | null {
  if (!salt || !ip) return null;
  return createHmac('sha256', salt).update(ip).digest('hex');
}

export interface InquiryResponse {
  status: 201 | 400 | 429 | 500 | 503;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface SubmitInquiryDeps {
  store: CreatorInquiryStore | null;
  env?: NodeJS.ProcessEnv;
  now?: Date;
  limit?: (key: string) => RateLimitResult;
}

export async function submitInquiry(body: unknown, ip: string, deps: SubmitInquiryDeps): Promise<InquiryResponse> {
  const env = deps.env ?? process.env;
  const limit = deps.limit ?? ((key: string) => rateLimit(key, INQUIRY_LIMIT, INQUIRY_WINDOW_MS));
  const limited = limit(`creator-inquiry:${ip}`);
  if (!limited.ok) {
    return {
      status: 429,
      body: { error: 'Too many requests. Try again later.' },
      headers: { 'Retry-After': String(limited.retryAfterSec) },
    };
  }

  const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (typeof raw.website === 'string' && raw.website.trim() !== '') {
    return { status: 201, body: { ok: true } };
  }

  const parsed = inquirySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: 400,
      body: {
        error: 'Check the highlighted fields.',
        issues: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      },
    };
  }

  if (!deps.store) return { status: 503, body: { error: 'Inquiries are not open on this server yet.' } };

  const data = parsed.data;
  const record: InquiryRecord = {
    brand: data.brand,
    contactName: data.contactName,
    email: data.email,
    budgetRange: data.budgetRange,
    dates: data.dates,
    deliverables: data.deliverables,
    message: data.message,
    consent: true,
    profileSlug: data.profile && getApprovedProfile(data.profile) ? data.profile : null,
    status: 'NEW',
    source: data.source,
    ipHash: hashIp(ip, env.CREATOR_IP_SALT),
    createdAt: (deps.now ?? new Date()).toISOString(),
  };
  try {
    const { id } = await deps.store.createInquiry(record);
    return { status: 201, body: { ok: true, id } };
  } catch (err) {
    console.error('[creator-inquiry]', err instanceof Error ? err.message : err);
    return { status: 500, body: { error: 'Could not save the inquiry. Try again.' } };
  }
}
