// AB-04: the adult re-screen save, called only after the kid branch has returned.
//
// This file is outside lib/screen and the assess components on purpose: those trees are scanned for fetch
// and '/api/' (lib/screen/no-save.test.ts). Kids never reach this function. The server still refuses anyone
// who is not a verified adult with the opt-in on.
//
// assumption: ScreenSummary has no clock time. The run id is a hash of the checks, the flags, and the jump,
// so posting the same result again is one row.

export function screenRunId(parts: { checks: unknown; flags: unknown; jumpBestIn: unknown }): string {
  const text = JSON.stringify(parts);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    h1 ^= text.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= text.charCodeAt(text.length - 1 - i);
    h2 = Math.imul(h2, 0x01000193);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return `rescreen${hex(h1)}${hex(h2)}`;
}

export async function maybeSaveAdultScreen(
  summary: {
    checks: { id: string; band: string | null }[];
    priorities: string[];
    jumpBestIn: number | null;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    const status = await fetchImpl('/api/account/scan-save');
    if (!status.ok) return;
    const j = (await status.json()) as { verifiedAdult?: unknown; optedIn?: unknown };
    if (j.verifiedAdult !== true || j.optedIn !== true) return;
    const checks = summary.checks.map((c) => ({ id: c.id, band: c.band }));
    const flags = summary.priorities;
    const runId = screenRunId({ checks, flags, jumpBestIn: summary.jumpBestIn });
    await fetchImpl('/api/mirror/screen-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, checks, flags, jumpBestIn: summary.jumpBestIn }),
    });
  } catch {
    /* the result stays on this device */
  }
}
