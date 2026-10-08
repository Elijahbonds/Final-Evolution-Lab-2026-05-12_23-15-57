import { describe, expect, it } from 'vitest';
import { GameRecorder, type SegmentSource } from './gameRecorder';

/** A source whose open piece resolves only when the test says so. */
function gatedSource(): {
  source: SegmentSource;
  untilOpen: () => Promise<void>;
  finish: (blob: Blob | null) => void;
} {
  let open: ((blob: Blob | null) => void) | null = null;
  let notify: () => void = () => {};
  let opened = new Promise<void>((resolve) => { notify = resolve; });
  return {
    source: {
      next() {
        return new Promise((resolve) => {
          open = resolve;
          notify();
        });
      },
      stop() {
        const done = open;
        open = null;
        done?.(new Blob(['tail']));
      },
    },
    async untilOpen() {
      await opened;
      opened = new Promise<void>((resolve) => { notify = resolve; });
    },
    finish(blob) {
      const done = open;
      open = null;
      done?.(blob);
    },
  };
}

describe('the recorder keeps the piece that was open when Stop was pressed', () => {
  it('a take includes the tail, and a second Record does not wipe it while one is running', async () => {
    const gate = gatedSource();
    let t = 1_000;
    const rec = new GameRecorder(gate.source, () => t);
    const started = rec.record();
    await gate.untilOpen();
    await started;
    expect(rec.model.phase).toBe('recording');

    t = 6_000;
    gate.finish(new Blob(['a']));
    await gate.untilOpen();
    await rec.record();
    expect(rec.model.phase).toBe('recording');

    t = 9_000;
    const blobs = await rec.stop();
    expect(rec.model.phase).toBe('ready');
    expect(rec.model.take).toBe(true);
    expect(blobs).toHaveLength(2);
    expect(rec.take).toHaveLength(2);
  });

  it('saving 30 seconds during a take keeps that window and the recording continues', async () => {
    const gate = gatedSource();
    let t = 0;
    const rec = new GameRecorder(gate.source, () => t);
    const started = rec.record();
    await gate.untilOpen();
    await started;

    t = 5_000;
    gate.finish(new Blob(['head']));
    await gate.untilOpen();

    t = 8_000;
    const replay = await rec.saveReplay();
    expect(replay).toHaveLength(2);
    expect(rec.model.phase).toBe('recording');
    expect(rec.model.replay).toBe(true);

    t = 12_000;
    const take = await rec.stop();
    expect(take).toHaveLength(3);
    expect(rec.model.phase).toBe('ready');
  });

  it('moves to error when a live source cannot produce a segment', async () => {
    const changes: string[] = [];
    const rec = new GameRecorder({
      next: async () => null,
      stop: () => {},
    }, () => 1_000, (model) => { changes.push(model.phase); });

    await rec.record();
    await Promise.resolve();

    expect(rec.model.phase).toBe('error');
    expect(rec.model.note).toMatch(/not available/i);
    expect(changes).toEqual(['error']);
  });
});
