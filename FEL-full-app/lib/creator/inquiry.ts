/**
 * "Work with us" inquiries.
 *
 * Order: per-IP rate limit (429) → honeypot (a filled `website` field gets a 201 and is dropped, so a bot
 * learns nothing) → zod validation (400) → save to Postgres (201). No auto-reply.
 *
 * Storage is the CreatorInquiry table, which is pending SQL (prisma/pending/2026-10-13-creator-inquiry.sql, see
 * ./inquiryStore.ts). Until the owner applies it, a valid inquiry is NOT stored and the answer is 503
 * `inquiries_unavailable` with an honest message. The IP is never stored (owner, 2026-10-13: the salted IP hash is
 * gone; the rate limit only keeps the IP in memory).
 */

import { z } from 'zod';
import { rateLimit, type RateLimitResult } from '@/lib/rate-limit';
import { getApprovedProfile } from './creatorCatalog';
import type { InquiryRecord, SaveInquiryResult } from './inquiryStore';

export const INQUIRIES_UNAVAILABLE_MESSAGE = 'Inquiries are unavailable right now. Please try again later.';

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

export interface InquiryResponse {
  status: 201 | 400 | 429 | 500 | 503;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface SubmitInquiryDeps {
  /** Saves one validated inquiry. The route passes the Postgres store (./inquiryStore.ts saveInquiry). */
  save: (record: InquiryRecord) => Promise<SaveInquiryResult>;
  limit?: (key: string) => RateLimitResult;
}

export async function submitInquiry(body: unknown, ip: string, deps: SubmitInquiryDeps): Promise<InquiryResponse> {
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

  const data = parsed.data;
  const record: InquiryRecord = {
    brand: data.brand,
    contactName: data.contactName,
    email: data.email,
    budgetRange: data.budgetRange,
    dates: data.dates,
    deliverables: data.deliverables,
    message: data.message,
    profileSlug: data.profile && getApprovedProfile(data.profile) ? data.profile : null,
    source: data.source,
  };
  try {
    const saved = await deps.save(record);
    if (saved.ok) return { status: 201, body: { ok: true, id: saved.id } };
    if (saved.reason === 'unavailable') {
      return { status: 503, body: { error: 'inquiries_unavailable', message: INQUIRIES_UNAVAILABLE_MESSAGE } };
    }
    return { status: 500, body: { error: 'Could not save the inquiry. Try again.' } };
  } catch (err) {
    console.error('[creator-inquiry]', err instanceof Error ? err.message : err);
    return { status: 500, body: { error: 'Could not save the inquiry. Try again.' } };
  }
}
