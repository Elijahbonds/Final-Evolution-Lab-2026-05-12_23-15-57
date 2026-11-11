// Cyber C1C4 review: C1 can never reload-loop; C5 the curl gate's teen row is required for the local-file flag.
import { describe, expect, it } from 'vitest';
import { firstLoadPath, reloadOnShelfMount } from '@/lib/binjgb/nav';
import { read } from './helpers';

describe('C1 loop-proof: odd spellings of the shelf count as the shelf, so they never reload-loop', () => {
  const perf = (name: string) => ({ getEntriesByType: (t: string) => (t === 'navigation' ? [{ name } as PerformanceEntry] : []) });
  it('a document first loaded at an odd shelf spelling does not reload; a real soft entry still does', () => {
    for (const p of ['/play/%67b-shelf', '//play/gb-shelf', '/play//gb-shelf/', '/play/gb-shelf%2Fsome-slug', '/play/%67b-shelf/local%2Dframe']) {
      expect(reloadOnShelfMount(firstLoadPath(perf(`https://fel.example${p}`))), p).toBe(false);
    }
    for (const p of ['/play', '/play/gb-shelfx', '/play/%E0%A4%A', '/screen', '/']) {
      expect(reloadOnShelfMount(firstLoadPath(perf(`https://fel.example${p}`))), p).toBe(true);
    }
    expect(reloadOnShelfMount(null)).toBe(false);
  });
});

describe('C5: the curl gate fails closed on a missing teen row for the local-file flag', () => {
  const s = read('scripts/binjgb-curl-gate.sh');
  it('defaults to the strict local gate; shelf-only needs FEL_GATE_FOR=shelf and a local-off server', () => {
    expect(s).toContain('GATE="${FEL_GATE_FOR:-local}"');
    expect(s).toContain('if [ "$GATE" != "shelf" ] && [ "$GATE" != "local" ]; then echo "FEL_GATE_FOR must be shelf or local" >&2; exit 2; fi');
    expect(s).toContain('fail "on: teen account row NOT RUN (FEL_GATE_TEEN_COOKIE not set) - REQUIRED for BINJGB_LOCAL_FILE_ENABLED (G-FILE)"');
    expect(s).toContain('pass "on (shelf only): adult: /play/gb-shelf/local-frame -> 404"');
    expect(s).toContain('WITH $SKIPS SKIP - NOT VALID FOR BINJGB_LOCAL_FILE_ENABLED');
  });
});
