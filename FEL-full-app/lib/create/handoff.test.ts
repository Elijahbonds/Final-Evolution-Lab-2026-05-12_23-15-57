// CREATE HUB: a file handed from a tool to the Create flow on this device — kept once, taken once, never stale.
import { describe, expect, it } from 'vitest';
import { HANDOFF_AUDIO_KEY, HANDOFF_META_KEY, HANDOFF_TTL_MS, isFresh, putHandoff, readMeta, takeHandoff, type HandoffDeps } from './handoff';

function fakes(now = 1_000_000) {
  const audio = new Map<string, { data: ArrayBuffer; mime: string }>();
  const kv = new Map<string, string>();
  let t = now;
  const deps: HandoffDeps = {
    store: async () => ({
      putAudio: async (k, data, mime) => { audio.set(k, { data, mime }); },
      getAudio: async (k) => audio.get(k) ?? null,
      deleteAudio: async (k) => { audio.delete(k); },
    }),
    storage: () => ({ getItem: (k) => kv.get(k) ?? null, setItem: (k, v) => { kv.set(k, v); }, removeItem: (k) => { kv.delete(k); } }),
    now: () => t,
  };
  return { deps, audio, kv, tick: (ms: number) => { t += ms; } };
}
const wav = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' });

describe('create hand-off', () => {
  it('keeps the file and takes it exactly once, for the tool it came from', async () => {
    const f = fakes();
    expect(await putHandoff(wav(), { from: 'song-render', fileName: 'fel-song-mix.wav', mime: 'audio/wav', bpm: 96 }, f.deps)).toBe(true);
    expect(f.audio.has(HANDOFF_AUDIO_KEY)).toBe(true);
    expect(await takeHandoff('flipshelf', f.deps)).toBeNull();          // another tool's
    const got = await takeHandoff('song-render', f.deps);
    expect(got?.meta).toMatchObject({ from: 'song-render', fileName: 'fel-song-mix.wav', bpm: 96 });
    expect(new Uint8Array(await got!.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(got!.blob.type).toBe('audio/wav');
    expect(f.audio.size).toBe(0); expect(f.kv.has(HANDOFF_META_KEY)).toBe(false);
    expect(await takeHandoff('song-render', f.deps)).toBeNull();        // once
  });
  it('a stale hand-off is ignored', async () => {
    const f = fakes();
    await putHandoff(wav(), { from: 'flipshelf', fileName: 'a.mp3', mime: 'audio/mpeg' }, f.deps);
    f.tick(HANDOFF_TTL_MS + 1);
    expect(await takeHandoff('flipshelf', f.deps)).toBeNull();
  });
  it('no storage, a failing store, or junk metadata all mean "no hand-off", never a throw', async () => {
    const f = fakes();
    expect(await putHandoff(wav(), { from: 'flipshelf', fileName: 'a', mime: 'audio/wav' }, { ...f.deps, storage: () => null })).toBe(false);
    expect(await putHandoff(wav(), { from: 'flipshelf', fileName: 'a', mime: 'audio/wav' }, { ...f.deps, store: async () => { throw new Error('no idb'); } })).toBe(false);
    f.kv.set(HANDOFF_META_KEY, '{oops'); expect(await takeHandoff('flipshelf', f.deps)).toBeNull();
    expect(readMeta('{"from":"flipshelf"}')).toBeNull();
    expect(isFresh({ from: 'flipshelf', fileName: 'a', mime: 'x', at: 10 }, 'flipshelf', 5)).toBe(false);   // from the future
  });
});
