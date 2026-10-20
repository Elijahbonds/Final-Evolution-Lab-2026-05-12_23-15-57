// FIRST-DUNK-BUDGET (2026-10-17): the dunk's booth reads its words with the court and gets its voices after dunk 1.
//
// AM's /try log: ~6 MB of voice banks (the MC, the sidekick, six crowd banks, five rivals' chatter) on the first download. A
// `deferAudio` mic fetches only the banks' indexes — the words, so the director runs and every line still shows its caption —
// and the audio when the mode calls loadAudio() (the dunk: once dunk 1 is in).
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// a fresh VoiceKit per test: it caches every index and bank it has fetched for the page
let ModeMic: typeof import('./ModeMic').ModeMic;
let VoiceKit: typeof import('./VoiceKit').VoiceKit;
let calls: string[] = [];
beforeEach(async () => {
  vi.resetModules();
  ({ ModeMic } = await import('./ModeMic'));
  ({ VoiceKit } = await import('./VoiceKit'));
  calls = [];
  vi.stubGlobal('window', {});   // a page with no Web Audio: dispose() asks SoundKit for its graph, which reads window
  vi.stubGlobal('fetch', vi.fn(async (u: string) => {
    const url = String(u); calls.push(url);
    if (url.endsWith('.bin')) return new Response(new Uint8Array(16), { status: 200 });
    const f = path.resolve('public', url.replace(/^\//, ''));
    return url.endsWith('.json') && existsSync(f) ? new Response(readFileSync(f), { status: 200 }) : new Response('', { status: 404 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); VoiceKit.holdAudio(false); });

const ctx = { location: 'venice', setHud: () => {} } as never;
const bins = () => calls.filter((u) => u.endsWith('.bin'));
const indexes = () => calls.filter((u) => u.startsWith('/audio/voice/') && u.endsWith('.json'));

describe('a deferAudio mic', () => {
  it('reads the words now (the director runs) and fetches no voice audio until loadAudio()', async () => {
    const mic = new ModeMic(ctx, { groups: ['dunk', 'names'], court: 'venice', players: { cass: 'cass' }, deferAudio: true });
    await vi.waitFor(() => expect(mic.ready).toBe(true));
    expect(indexes().some((u) => u.endsWith('/boardwalk/dunk.json'))).toBe(true);
    expect(bins()).toEqual([]);
    mic.loadAudio();
    mic.loadAudio();   // once
    await vi.waitFor(() => expect(bins().some((u) => u.includes('/boardwalk/dunk.'))).toBe(true));
    expect(new Set(bins()).size).toBe(bins().length);   // each bank's audio once
    mic.dispose();
  });
  it('control: a mic that does not defer fetches the audio with the words, as every other mode does', async () => {
    const mic = new ModeMic(ctx, { groups: ['dunk'], court: 'venice', deferAudio: false });
    await vi.waitFor(() => expect(mic.ready).toBe(true));
    expect(bins().some((u) => u.includes('/boardwalk/dunk.'))).toBe(true);
    mic.dispose();
  });
  it('the hold is the mic\'s: disposed before dunk 1, the next mode\'s voices are not held back', async () => {
    const mic = new ModeMic(ctx, { groups: ['dunk'], court: 'venice', deferAudio: true });
    mic.dispose();
    await VoiceKit.load([{ cast: 'scoop', group: 'shared' }]);
    expect(bins().some((u) => u.includes('/scoop/shared.'))).toBe(true);
  });
});
