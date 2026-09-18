import { describe, it, expect } from 'vitest';
import { netExitKindOf, netExitVelocity, netExitMph, NET_EXIT_MPS, MPH_TO_MPS } from './NetExit';

describe('NetExit', () => {
  it('a poster leaves the net at 80 mph, a layup under gravity, a jumper with its own pace between', () => {
    expect(NET_EXIT_MPS.poster).toBeCloseTo(80 * MPH_TO_MPS, 3);
    expect(netExitMph('poster')).toBeGreaterThanOrEqual(80);
    expect(netExitVelocity('layup').y).toBeCloseTo(-0.5, 5);
    expect(-netExitVelocity('jumper').y).toBeGreaterThan(-netExitVelocity('layup').y);
    expect(-netExitVelocity('dunk').y).toBeGreaterThan(-netExitVelocity('jumper').y);
    expect(-netExitVelocity('showtime').y).toBeGreaterThan(-netExitVelocity('dunk').y);
    expect(-netExitVelocity('poster').y).toBeGreaterThan(-netExitVelocity('showtime').y);
  });
  it('the finishes at the rim drop; the shots swish', () => {
    for (const s of ['layup', 'reverse', 'mikan', 'upAndUnder', 'fingerRoll'] as const) expect(netExitKindOf(s)).toBe('layup');
    for (const s of ['jumper', 'fadeaway', 'hook', 'floater'] as const) expect(netExitKindOf(s)).toBe('jumper');
  });
  it('drifts toward the court along the given direction', () => {
    const v = netExitVelocity('dunk', { x: 3, z: 4 });
    expect(v.x).toBeCloseTo(0.9 * 0.6, 5); expect(v.z).toBeCloseTo(0.9 * 0.8, 5);
  });
});
