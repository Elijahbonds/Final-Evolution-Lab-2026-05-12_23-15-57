import { describe, expect, it } from 'vitest';
import { deliverClip, extForMime, planShare, shareFileName } from './shareClip';

describe('share fallback', () => {
  it('uses the system sheet when the browser can share a file', () => {
    expect(planShare({ hasShare: true, canShareFile: true }, 'fel-game-16x9.webm')).toEqual({
      kind: 'sheet', fileName: 'fel-game-16x9.webm',
    });
  });

  it('downloads when there is no share sheet', () => {
    expect(planShare({ hasShare: false, canShareFile: false }, 'a.webm')).toEqual({
      kind: 'download', fileName: 'a.webm', reason: 'no-share',
    });
  });

  it('downloads when the sheet exists but will not take a file', () => {
    const plan = planShare({ hasShare: true, canShareFile: false }, 'a.webm');
    expect(plan).toEqual({ kind: 'download', fileName: 'a.webm', reason: 'cannot-share-file' });
  });

  it('deliverClip calls share for a sheet and download otherwise, and never a third path', async () => {
    const blob = new Blob(['x'], { type: 'video/webm' });
    const shared: unknown[] = [];
    const sheet = await deliverClip(blob, 'fel-game-16x9.webm', 'FEL', {
      share: async (data) => { shared.push(data); },
      canShare: () => true,
      download: () => { throw new Error('download should not run'); },
    });
    expect(sheet.kind).toBe('sheet');
    expect(shared).toHaveLength(1);

    const downloaded: string[] = [];
    const fallback = await deliverClip(blob, 'fel-game-16x9.webm', 'FEL', {
      download: (_b, name) => { downloaded.push(name); },
    });
    expect(fallback).toMatchObject({ kind: 'download', reason: 'no-share' });
    expect(downloaded).toEqual(['fel-game-16x9.webm']);
  });

  it('names the file for the shape and the container', () => {
    expect(shareFileName('game', '16:9', 'webm')).toBe('fel-game-16x9.webm');
    expect(shareFileName('dunk', '9:16', 'mp4')).toBe('fel-dunk-9x16.mp4');
    expect(extForMime('video/mp4')).toBe('mp4');
    expect(extForMime('video/webm;codecs=vp9')).toBe('webm');
    expect(extForMime(null)).toBe('webm');
  });
});
