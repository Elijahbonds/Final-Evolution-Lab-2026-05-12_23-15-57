// lib/dunk/verifiedJumpClient — the dunk's one read of GET /api/dunk/verified-jump (dunk-flagship Phase 5). Cached for the page:
// the number changes only when a new Quick Screen is saved. Any failure (a guest, offline, an unverified account) is null.
let cached: Promise<number | null> | null = null;

export function fetchVerifiedJumpCm(fetchImpl: typeof fetch | undefined = typeof fetch === 'function' ? fetch : undefined): Promise<number | null> {
  if (!fetchImpl) return Promise.resolve(null);
  cached ??= fetchImpl('/api/dunk/verified-jump', { credentials: 'same-origin', cache: 'no-store' })
    .then(async (r) => (r.ok ? ((await r.json()) as { verified?: unknown; heightCm?: unknown }) : null))
    .then((j) => (j && j.verified === true && typeof j.heightCm === 'number' && Number.isFinite(j.heightCm) ? j.heightCm : null))
    .catch(() => null);
  return cached;
}

/** Tests only. */
export function resetVerifiedJumpCache(): void { cached = null; }
