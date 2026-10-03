import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, 'story-map.tsx'), 'utf8');

describe('StoryMap load failure recovery', () => {
  it('offers an in-place retry and a path back to Play', () => {
    expect(src).toContain('setLoadAttempt((n) => n + 1)');
    expect(src).toContain('Retry story');
    expect(src).toContain("router.push('/play')");
    expect(src).toContain('Back to Play');
  });
});
