// REPORTING A STUDIO SHARE LINK — AN ADAPTER (NEX-06, round 8).
//
// The safety lane (SAF-05) is building THE report flow (POST /api/report → lib/safety/reports.ts fileReport, an admin queue with
// warn / mute / ban and appeals). It had not merged into lane/finish-release when this lane finished, so the share landing does
// not build a second report store: its Report button posts to that route, in that route's own body shape, and says plainly
// when reporting is not open yet. A founder or admin can take a link down today (POST /api/studio/share/[id]/takedown).
//
// TODO(safety, SAF-05): once lib/safety/reportPresets.ts is on lane/finish-release, add 'studio_share' to REPORT_TARGETS and, in
// lib/safety/reports.ts resolveTarget, `case 'studio_share'` → `SELECT "creatorId" FROM "StudioShareLink" WHERE "id" = $1`
// (two lines in the safety lane's files, routed in the round-8 report). Until then the route refuses the unknown target (400)
// or is not there (404), and this adapter answers 'not_open'.
//
// Pure apart from the one fetch.

export const SHARE_REPORT_TARGET = 'studio_share' as const;
/** The safety lane's reasons (lib/safety/reportPresets.ts REPORT_REASONS), the ones that fit a venue. */
export const SHARE_REPORT_REASONS = [
  { id: 'hate', label: 'Hate or slurs' }, { id: 'sexual', label: 'Sexual content' }, { id: 'harassment', label: 'Bullying or harassment' },
  { id: 'impersonation', label: 'Pretending to be someone' }, { id: 'spam', label: 'Spam or scams' }, { id: 'other', label: 'Something else' },
] as const;

export type ReportOutcome = 'received' | 'not_open' | 'failed';

/** The body POST /api/report takes (lib/safety/reports.ts fileReport: target, reason, ref). */
export function reportBody(linkId: string, reason: string): { target: string; reason: string; ref: string } {
  return { target: SHARE_REPORT_TARGET, reason, ref: linkId };
}

export async function reportShareLink(linkId: string, reason: string, f: typeof fetch = fetch): Promise<ReportOutcome> {
  try {
    const r = await f('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reportBody(linkId, reason)) });
    if (r.ok) return 'received';
    return r.status === 404 || r.status === 400 ? 'not_open' : 'failed';
  } catch {
    return 'failed';
  }
}
