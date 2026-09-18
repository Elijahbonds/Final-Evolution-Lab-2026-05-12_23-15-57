import { describe, it, expect, vi } from 'vitest';
vi.mock('../audio/SoundKit', () => ({ SoundKit: { play: vi.fn() } }));
import { refuse, REFUSAL_THROTTLE_MS } from './Refusal';

describe('refuse — a press that cannot act is answered once, not every frame', () => {
  it('says the line, then holds it for the throttle; a different line is said at once', () => {
    const said: string[] = [];
    const ctx = { juice: { callout: (t: string) => said.push(t) } } as never;
    expect(refuse(ctx, 'NO BALL', 0)).toBe(true);
    expect(refuse(ctx, 'NO BALL', REFUSAL_THROTTLE_MS - 1)).toBe(false);
    expect(refuse(ctx, 'TOO EARLY', 10)).toBe(true);
    expect(refuse(ctx, 'NO BALL', REFUSAL_THROTTLE_MS + 1)).toBe(true);
    expect(said).toEqual(['NO BALL', 'TOO EARLY', 'NO BALL']);
  });
});
