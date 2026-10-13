import { describe, expect, it } from 'vitest';
import { readResume, writeResume, type ResumeStore } from './bookResume';

function memory(): ResumeStore & { dump: Map<string, string> } {
  const dump = new Map<string, string>();
  return {
    dump,
    get: (key) => dump.get(key) ?? null,
    set: (key, value) => { dump.set(key, value); },
  };
}

describe('audiobook resume', () => {
  it('round-trips a chapter and a position', () => {
    const store = memory();
    writeResume(store, 'blueprint', { fileId: 'audio-01', positionSec: 42.5 });
    expect(readResume(store, 'blueprint')).toEqual({ fileId: 'audio-01', positionSec: 42.5 });
    expect(readResume(store, 'other')).toBeNull();
  });

  it('ignores garbage and a negative position', () => {
    const store = memory();
    store.set('fel-press:blueprint', '{not json');
    expect(readResume(store, 'blueprint')).toBeNull();
    store.set('fel-press:blueprint', JSON.stringify({ fileId: 'audio-01', positionSec: -1 }));
    expect(readResume(store, 'blueprint')).toBeNull();
  });
});
