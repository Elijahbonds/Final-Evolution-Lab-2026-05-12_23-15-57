// lib/coach/branding.ts — COACH-DELIVERY COA-04 (2026-10-26): a coach's brand — a name, an accent colour and a logo — on
// their public page (app/coach/[slug]), their athletes' Today, and under their invite emails. The pure half.
//
//   · ACCENT: '#RRGGBB', readable on FEL's dark background (#050505): a contrast ratio of at least 4.5:1, WCAG AA for text,
//     because the accent colours the coach's name and links. A darker one is refused with the reason.
//   · LOGO: PNG, JPEG or WebP, at most LOGO_MAX_BYTES, uploaded to the EXISTING public creator bucket
//     (CREATOR_MEDIA_PUBLIC_BUCKET) under coach-logos/<coachId>/<id>.<ext>. No bucket set = no logo upload (the page simply
//     shows none). assumption (the backlog's): no new storage for logos.
//   · EMAILS stay plain text (lib/mail/message.ts: "No HTML: nothing to sanitise, nothing to track"), so a logo and a colour
//     cannot go in them; the brand NAME signs the coach's invite email instead. An HTML email is the owner's call.
//
// Pure, client-safe.
export const LOGO_MAX_BYTES = 512 * 1024;
export const LOGO_TYPES: Readonly<Record<string, string>> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
export const LOGO_PREFIX = 'coach-logos/';
export const NAME_MAX = 60;
const DARK_BG = '#050505';

const HEX = /^#[0-9a-fA-F]{6}$/;

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** WCAG contrast ratio between two '#RRGGBB' colours. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export function cleanAccent(v: unknown): { ok: true; accent: string | null } | { ok: false; error: 'accent_format' | 'accent_too_dark' } {
  if (v === null || v === '') return { ok: true, accent: null };
  if (typeof v !== 'string' || !HEX.test(v)) return { ok: false, error: 'accent_format' };
  if (contrast(v, DARK_BG) < 4.5) return { ok: false, error: 'accent_too_dark' };
  return { ok: true, accent: v.toUpperCase() };
}

export function cleanBrandName(v: unknown): string | null {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) || null : null;
}

export function checkLogo(contentType: unknown, bytes: unknown): { ok: true; ext: string } | { ok: false; error: 'logo_type' | 'logo_size' } {
  const ext = typeof contentType === 'string' ? LOGO_TYPES[contentType] : undefined;
  if (!ext) return { ok: false, error: 'logo_type' };
  if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes < 1 || bytes > LOGO_MAX_BYTES) return { ok: false, error: 'logo_size' };
  return { ok: true, ext };
}

const SEG = /^[A-Za-z0-9_-]{1,80}$/;
/** The logo object a coach may set: their own prefix only, nothing that climbs out of it. */
export function logoObjectOk(coachId: string, objectName: unknown): objectName is string {
  return typeof objectName === 'string' && SEG.test(coachId) && new RegExp(`^${LOGO_PREFIX}${coachId}/[A-Za-z0-9_-]{8,80}\\.(png|jpg|webp)$`).test(objectName);
}

export interface Branding { name: string | null; accent: string | null; logoUrl: string | null }

/** The line that signs a coach's invite email (plain text). */
export const brandSignOff = (b: Pick<Branding, 'name'> | null, coachName: string): string | null => (b?.name && b.name !== coachName ? `${coachName} · ${b.name}` : null);

export const BRANDING_ERROR_COPY: Record<string, string> = {
  accent_format: 'Use a colour like #00E5FF.', accent_too_dark: 'That colour is too dark to read on FEL. Pick a brighter one.',
  logo_type: 'A PNG, JPEG or WebP, please.', logo_size: 'Logos can be up to 512 KB.', uploads_off: 'Logo uploads are not on yet.', bad_logo: 'That upload did not finish. Try again.',
};
