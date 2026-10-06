import { describe, expect, it } from 'vitest';
import { clipWasSaved, deliverClip, extForMime, planShare, shareFileName } from './shareClip';

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

  it('falls back to download when the sheet throws NotAllowedError (not a fresh user gesture)', async () => {
    const blob = new Blob(['x'], { type: 'video/webm' });
    const downloaded: string[] = [];
    const plan = await deliverClip(blob, 'fel-dunk-9x16.webm', 'FEL', {
      share: async () => { throw new DOMException('not a gesture', 'NotAllowedError'); },
      canShare: () => true,
      download: (_b, name) => { downloaded.push(name); },
    });
    expect(plan).toMatchObject({ kind: 'download', reason: 'share-refused' });
    expect(downloaded).toEqual(['fel-dunk-9x16.webm']);
  });

  it('falls back to download when the sheet throws a TypeError', async () => {
    const blob = new Blob(['x'], { type: 'video/webm' });
    const downloaded: string[] = [];
    const plan = await deliverClip(blob, 'fel-dunk-9x16.webm', 'FEL', {
      share: async () => { throw new TypeError('bad share call'); },
      canShare: () => true,
      download: (_b, name) => { downloaded.push(name); },
    });
    expect(plan).toMatchObject({ kind: 'download', reason: 'share-refused' });
    expect(downloaded).toEqual(['fel-dunk-9x16.webm']);
  });

  it('does not download when the user cancels the sheet (AbortError)', async () => {
    const blob = new Blob(['x'], { type: 'video/webm' });
    let downloadCalls = 0;
    const plan = await deliverClip(blob, 'fel-dunk-9x16.webm', 'FEL', {
      share: async () => { throw new DOMException('cancelled', 'AbortError'); },
      canShare: () => true,
      download: () => { downloadCalls++; },
    });
    expect(plan).toEqual({ kind: 'cancelled', fileName: 'fel-dunk-9x16.webm' });
    expect(downloadCalls).toBe(0);
  });

  it('deliverClip never throws out of these cases', async () => {
    const blob = new Blob(['x'], { type: 'video/webm' });
    await expect(deliverClip(blob, 'a.webm', 'FEL', {
      share: async () => { throw new Error('anything else'); },
      canShare: () => true,
      download: () => {},
    })).resolves.toMatchObject({ kind: 'download', reason: 'share-refused' });
  });

  it('clipWasSaved is true for a sheet or a download, false for a cancel', () => {
    expect(clipWasSaved({ kind: 'sheet', fileName: 'a.webm' })).toBe(true);
    expect(clipWasSaved({ kind: 'download', fileName: 'a.webm', reason: 'no-share' })).toBe(true);
    expect(clipWasSaved({ kind: 'cancelled', fileName: 'a.webm' })).toBe(false);
  });

  it('names the file for the shape and the container', () => {
    expect(shareFileName('game', '16:9', 'webm')).toBe('fel-game-16x9.webm');
    expect(shareFileName('dunk', '9:16', 'mp4')).toBe('fel-dunk-9x16.mp4');
    expect(extForMime('video/mp4')).toBe('mp4');
    expect(extForMime('video/webm;codecs=vp9')).toBe('webm');
    expect(extForMime(null)).toBe('webm');
  });
});
