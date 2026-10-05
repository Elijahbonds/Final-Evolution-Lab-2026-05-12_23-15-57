// ITEM-WEIGHTING rollout (racing 10-phase, gap 12): the kart and the plane draw their balloon item by place,
// not off the balloon's fixed grid colour. Pinned structurally so a future edit cannot quietly hand the
// leader the same table as the backmarker again — that was the decode's gap, and it shipped because nothing
// scanned for it.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';

const ROOT = path.resolve(__dirname, '../../..');
const src = (f: string) => stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));

describe('item-weighting rollout', () => {
  it('the weighting function lives in AeroItems and is place-driven', () => {
    const m = src('lib/babylon/racing/AeroItems.ts');
    expect(m).toContain('export function weightedItemKind(place: number, fieldSize: number');
    expect(m).toContain('ITEM_WEIGHT_LEADER');
    expect(m).toContain('ITEM_WEIGHT_TRAILER');
  });

  it('kart and aero draw at collection by place, not off the balloon grid colour', () => {
    const kart = src('lib/babylon/modes/VelocityKartMode.ts');
    const aero = src('lib/babylon/modes/AeroAcesMode.ts');
    expect(kart).toMatch(/weightedItemKind\(playerPosition\(playerDist, rivals\), rivals\.length \+ 1/);
    expect(aero).toMatch(/weightedItemKind\(playerPosition\(playerDist\(\), rivals\), rivals\.length \+ 1/);
    // and the fixed-grid draw is gone from the collect path
    expect(kart).not.toMatch(/collectBalloon\(S\.held, b\.kind\)/);
    expect(aero).not.toMatch(/collectBalloon\(S\.held, b\.kind\)/);
  });
});
