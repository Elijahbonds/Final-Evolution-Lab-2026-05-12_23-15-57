// lib/coach/live/flag.ts — COACH-LIVE (2026-10-25): the live sessions' switch. Ships OFF.
//
// One public variable, NEXT_PUBLIC_COACH_LIVE_ENABLED ("1" / "true" / "on" / "yes"), so the server (routes, the page)
// and the browser (the "Live session" links) read the same thing. Read as a literal process.env.NEXT_PUBLIC_… so Next
// inlines it into the browser bundle. Unset: every live route and the page are 404s, and the links draw nothing.
// It stays off until the owner turns it on (docs/COACH-LIVE.md "Owner calls": TURN, minors, the privacy sentence).

export function liveFlagOn(raw: string | undefined): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

export function coachLiveEnabled(): boolean {
  return liveFlagOn(process.env.NEXT_PUBLIC_COACH_LIVE_ENABLED);
}
