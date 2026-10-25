// lib/safety/problemContext.ts — SAFETY lane (SAF-04, 2026-10-25): the automatic context a "Report a problem" carries.
//
// WHAT IT IS, AND ALL IT IS (owner, QUALITY 2026-10-20; brief SAF-04): the ROUTE the person was on (every id, token, slug
// or handle replaced by ":id"), a coarse DEVICE CLASS (ios/android/other × phone/tablet/desktop — no user agent, no
// screen size, nothing to fingerprint), the KIND of the last game diagnostic this page raised (lib/babylon/core/diag.ts,
// a fixed list such as "fps" or "context"), and the TIME on the device. The server adds the build id. NO account id, NO
// email, NO name, NO address, NO free text unless the person typed some (and the server keeps that only from a verified
// adult, screened and capped). lib/safety/problemContext.test.ts scans the payload and the files that build it.
//
// Pure (the browser reads are passed in), so the client and the route validate with the same rules.

export const DEVICE_CLASSES = [
  'ios-phone', 'ios-tablet', 'ios-desktop', 'android-phone', 'android-tablet', 'android-desktop', 'other-phone', 'other-tablet', 'other-desktop',
] as const;
export type DeviceClass = (typeof DEVICE_CLASSES)[number];

/** lib/babylon/core/diag.ts DiagKind, as plain strings (no Babylon import on the server's report route). */
export const DIAG_KINDS = ['frame', 'ident', 'clip', 'cam', 'fps', 'context', 'load', 'ttfp'] as const;

export const PROBLEM_TEXT_MAX = 500;

/** The segment after one of these is a person's or a thing's identifier: always replaced. */
const ID_PARENTS = new Set(['u', 'p', 'c', 'card', 'coach', 'party', 'join', 'squads', 'program', 'session', 'guardian', 'withdraw', 'report', 'r', 'invite', 'challenge', 'share', 'creator', 'book', 'press']);
const STATIC_SEGMENT = /^[a-z]+(?:-[a-z]+)*$/;

/** The path with every identifier replaced by ":id". Query and fragment dropped. At most 8 segments, 120 characters. */
export function sanitizeRoute(raw: unknown): string {
  if (typeof raw !== 'string') return '/';
  let path = raw.split(/[?#]/)[0] ?? '/';
  try { path = decodeURIComponent(path); } catch { /* keep as is */ }
  const parts = path.split('/').filter(Boolean).slice(0, 8);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i].toLowerCase();
    const prev = i > 0 ? parts[i - 1].toLowerCase() : null;
    const keep = STATIC_SEGMENT.test(seg) && seg.length <= 24 && !(prev && ID_PARENTS.has(prev) && !KNOWN_CHILDREN.has(seg));
    out.push(keep ? seg : ':id');
  }
  return (`/${out.join('/')}`).slice(0, 120);
}
/** Static pages that live under an ID parent (kept: they name no one). */
const KNOWN_CHILDREN = new Set(['dashboard', 'admin', 'session', 'business', 'thanks', 'review', 'join', 'withdraw', 'receipt', 'mine', 'new']);

export function deviceClassOf(o: { userAgent: string; maxTouchPoints: number; shortSide: number; coarse: boolean }): DeviceClass {
  const ua = o.userAgent || '';
  const os = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && o.maxTouchPoints > 1) ? 'ios' : /Android/.test(ua) ? 'android' : 'other';
  const form = !o.coarse ? 'desktop' : o.shortSide < 600 ? 'phone' : o.shortSide < 1100 ? 'tablet' : 'desktop';
  return `${os}-${form}` as DeviceClass;
}

export interface ProblemContext {
  route: string;
  deviceClass: DeviceClass;
  diagKind: (typeof DIAG_KINDS)[number] | null;
  at: string;
}

/** The ONLY keys a problem report body may carry. */
export const PROBLEM_BODY_KEYS = ['route', 'deviceClass', 'diagKind', 'at', 'text'] as const;

export interface ParsedProblem {
  route: string;
  deviceClass: DeviceClass;
  diagKind: string | null;
  clientAt: Date | null;
  text: string | null;
}

/** Validate a body: unknown keys are ignored, every field re-checked, the route re-sanitized. null = not a report. */
export function parseProblemBody(body: unknown, now: number = Date.now()): ParsedProblem | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const deviceClass = DEVICE_CLASSES.find((d) => d === b.deviceClass);
  if (!deviceClass) return null;
  const diagKind = DIAG_KINDS.find((d) => d === b.diagKind) ?? null;
  const t = typeof b.at === 'string' ? Date.parse(b.at) : NaN;
  const clientAt = Number.isFinite(t) && Math.abs(t - now) < 86_400_000 ? new Date(t) : null;
  return { route: sanitizeRoute(b.route), deviceClass, diagKind, clientAt, text: typeof b.text === 'string' ? b.text : null };
}
