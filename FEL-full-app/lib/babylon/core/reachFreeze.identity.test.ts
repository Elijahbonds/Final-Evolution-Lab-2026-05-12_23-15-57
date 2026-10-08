// REACH-FREEZE (2026-09-29), spec B7: a higher jump or a faster cadence never changes the avatar's size. Two halves: the retired
// builder hands back the standard frame for any scan, and the identity pipe no longer reads a stored workout scan at all (old rows
// keep the jump-made heights they were saved with; nothing reads them).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAvatarSpec } from '../../workout/avatar-builder';
import { invalidateIdentity, resolveIdentity } from './playerIdentity';

describe('B7 a higher jump or a faster cadence does not change the avatar\'s size', () => {
  it('B7 buildAvatarSpec is the standard frame for every scan a body can produce', () => {
    for (let jump = 10; jump <= 110; jump += 5) {
      for (let depth = 40; depth <= 140; depth += 10) {
        for (let cad = 120; cad <= 220; cad += 10) {
          const spec = buildAvatarSpec({ jumpHeightCm: jump, depthDeg: depth, asymmetryPct: 0, valgusL: 0, valgusR: 0, cadenceSpm: cad, trunkLeanDeg: 0 });
          expect([spec.heightScale, spec.buildScale, spec.reachScale, spec.stance], `jump ${jump} depth ${depth} cadence ${cad}`).toEqual([1, 1, 1, 'athletic']);
        }
      }
    }
    // the palette overrides still apply — they are colours, not size
    expect(buildAvatarSpec({ jumpHeightCm: 80, depthDeg: 90, asymmetryPct: 0, valgusL: 0, valgusR: 0, cadenceSpm: 200, trunkLeanDeg: 0 }, { skin: '#123456' }).palette.skin).toBe('#123456');
  });

  describe('resolveIdentity', () => {
    afterEach(() => { vi.unstubAllGlobals(); invalidateIdentity(); });
    /** The three routes the pipe could ask, answering like a signed-in player with an old jump-made scan row on file. */
    function serve(frame: Record<string, unknown> | null): string[] {
      const asked: string[] = [];
      const json = (body: unknown) => ({ ok: true, json: async () => body });
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        asked.push(url);
        if (url.includes('/api/v1/workout/scan')) return json({ scans: [{ avatarSpec: { heightScale: 1.1, buildScale: 1.12, reachScale: 1.08, palette: { skin: '#C68642', primary: '#00E5FF', accent: '#A855F7' }, stance: 'tall' } }] });
        if (url.includes('/api/v1/hero-body')) return json({ body: 'kit-male', frame });
        if (url.includes('/api/v1/closet')) return json({ look: { face: {}, equipped: {} } });
        return { ok: false, json: async () => null };
      }));
      return asked;
    }

    it('B7 ignores a stored workout-scan avatarSpec: no frame, no scales', async () => {
      const asked = serve(null);
      const id = await resolveIdentity(true);
      expect(id.proportions).toBeNull();
      expect(asked.some((u) => u.includes('/api/v1/workout/scan'))).toBe(false);
    });

    it('B7 the creator frame decides, clamped, and its saved reach is ignored', async () => {
      serve({ heightScale: 112, buildScale: 97, reachScale: 110, stance: 'tall' });
      const id = await resolveIdentity(true);
      expect(id.proportions).toMatchObject({ heightScale: 1.04, buildScale: 0.97, reachScale: 1, stance: 'tall' });
    });
  });
});
