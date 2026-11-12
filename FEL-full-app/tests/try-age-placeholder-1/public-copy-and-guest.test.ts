// TRY-AGE-PLACEHOLDER-1: the guest lane's specials chip, and the media kit's fixture audience.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(f, 'utf8');

describe('TRY-AGE-PLACEHOLDER-1', () => {
  it('the guest season lane sets the specials HUD to null (no pass chip); free still sets LOCKED', () => {
    expect(read('lib/babylon/modes/DunkMode.ts')).toContain("specials: lane === 'guest' ? null : specialOpen(lane) ? 'PRO' : 'LOCKED'");
  });

  it('/media-kit renders no audience numbers while AUDIENCE_STATS.isExample', () => {
    const kit = read('app/media-kit/page.tsx');
    const at = kit.indexOf('{!audience.isExample && (');
    expect(at).toBeGreaterThan(0);
    expect(kit.indexOf('audience.stats.map')).toBeGreaterThan(at);
    expect(kit.indexOf('<SectionTitle>Audience</SectionTitle>')).toBeGreaterThan(at);
  });

});
