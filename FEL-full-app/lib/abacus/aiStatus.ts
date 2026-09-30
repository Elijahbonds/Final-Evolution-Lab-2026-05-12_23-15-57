/**
 * lib/abacus/aiStatus.ts — the part of the AI kill switch the browser may see: the words, the answer's shape and
 * where to ask for it.
 *
 * No env reads here, ever. The switch itself is read only by lib/abacus/killSwitch.ts, which is server-only. This
 * file is shared with the Coach and Studio client components, so reading process.env here would put the flag in a
 * client bundle (lib/abacus/killSwitch.scan.test.ts fails if this file even names it).
 */

export type AiFeature = 'coach' | 'studio';
export type AiAvailability = 'available' | 'coming_soon';
export type AiStatus = Record<AiFeature, AiAvailability>;

/** GET → AiStatus. No user data, no Abacus call. */
export const AI_STATUS_PATH = '/api/ai/status';

/** Neutral copy: it names no vendor and gives no reason (no mention of age). */
export const AI_COMING_SOON = { status: 'coming_soon', message: 'This AI feature is coming soon.' } as const;

export const AI_COMING_SOON_MESSAGE: Record<AiFeature, string> = {
  coach: 'The AI Coach is coming soon.',
  studio: 'The Studio’s AI builder is coming soon.',
};

export interface AiComingSoonBody {
  status: typeof AI_COMING_SOON.status;
  feature: AiFeature;
  message: string;
}

export function comingSoonBody(feature: AiFeature): AiComingSoonBody {
  return { status: AI_COMING_SOON.status, feature, message: AI_COMING_SOON_MESSAGE[feature] };
}

/** True for the 503 {status:'coming_soon'} an AI route answers while the switch is off. Reads a clone of the body. */
export async function isComingSoonResponse(res: Response): Promise<boolean> {
  if (res.status !== 503) return false;
  const body = await res.clone().json().catch(() => null);
  return body?.status === AI_COMING_SOON.status;
}

/** One feature out of /api/ai/status's answer. Anything but an explicit 'available' reads as 'coming_soon'. */
export function availabilityFrom(body: unknown, feature: AiFeature): AiAvailability {
  return (body as Partial<AiStatus> | null)?.[feature] === 'available' ? 'available' : 'coming_soon';
}

/**
 * Ask the server once. A network failure, a non-2xx (signed out: 401) or a malformed answer all read as
 * 'coming_soon': the UI fails closed, and the routes refuse on their own anyway.
 */
export async function fetchAiAvailability(feature: AiFeature): Promise<AiAvailability> {
  try {
    const res = await fetch(AI_STATUS_PATH, { cache: 'no-store' });
    if (!res.ok) return 'coming_soon';
    return availabilityFrom(await res.json().catch(() => null), feature);
  } catch {
    return 'coming_soon';
  }
}
