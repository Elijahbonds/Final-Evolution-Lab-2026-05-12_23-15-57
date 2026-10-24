import { describe, expect, it } from 'vitest';
import { publishFileBlocker } from './publish-as-card';

describe('PublishFileAsCard blockers', () => {
  it('tells the player why the file handoff cannot open Create yet', () => {
    const blob = new Blob(['song'], { type: 'audio/wav' });
    expect(publishFileBlocker(null, { from: 'song-render' })).toBe('Render or choose a file before opening Create.');
    expect(publishFileBlocker(blob, { from: null })).toBe('Open this from a creator tool first.');
    expect(publishFileBlocker(blob, { from: 'song-render' })).toBeNull();
  });
});
