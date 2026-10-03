import { describe, expect, it } from 'vitest';
import { REC_IDLE, recStep } from './recorderMachine';

describe('recorder state machine', () => {
  it('starts idle, with nothing saved', () => {
    expect(REC_IDLE).toEqual({ phase: 'idle', take: false, replay: false, note: null });
  });

  it('arms a buffer, then saves the last 30 seconds', () => {
    const buffering = recStep(REC_IDLE, { type: 'arm-buffer' });
    expect(buffering.phase).toBe('buffering');
    expect(buffering.note).toMatch(/this device/i);
    const saved = recStep(buffering, { type: 'save-replay' });
    expect(saved.phase).toBe('ready');
    expect(saved.replay).toBe(true);
    expect(saved.take).toBe(false);
  });

  it('records a full take and stops into a clip that has not been uploaded', () => {
    const recording = recStep(REC_IDLE, { type: 'record' });
    expect(recording.phase).toBe('recording');
    const stopped = recStep(recording, { type: 'stop' });
    expect(stopped.phase).toBe('ready');
    expect(stopped.take).toBe(true);
    expect(stopped.note).toMatch(/this device/i);
  });

  it('saves a replay during a take without ending the take', () => {
    const recording = recStep(REC_IDLE, { type: 'record' });
    const marked = recStep(recording, { type: 'save-replay' });
    expect(marked.phase).toBe('recording');
    expect(marked.replay).toBe(true);
    expect(marked.take).toBe(false);
    const stopped = recStep(marked, { type: 'stop' });
    expect(stopped.phase).toBe('ready');
    expect(stopped.take).toBe(true);
    expect(stopped.replay).toBe(true);
  });

  it('stopping a buffer saves the replay', () => {
    const saved = recStep(recStep(REC_IDLE, { type: 'arm-buffer' }), { type: 'stop' });
    expect(saved.replay).toBe(true);
    expect(saved.phase).toBe('ready');
  });

  it('discard drops the clips and returns to idle', () => {
    const ready = recStep(recStep(REC_IDLE, { type: 'record' }), { type: 'stop' });
    expect(recStep(ready, { type: 'discard' })).toEqual(REC_IDLE);
  });

  it('a failure keeps nothing, and reset clears it', () => {
    const recording = recStep(REC_IDLE, { type: 'record' });
    const failed = recStep(recording, { type: 'fail', message: 'Recording isn’t supported in this browser.' });
    expect(failed.phase).toBe('error');
    expect(failed.take).toBe(false);
    expect(failed.replay).toBe(false);
    expect(recStep(failed, { type: 'record' }).phase).toBe('error');
    expect(recStep(failed, { type: 'reset' })).toEqual(REC_IDLE);
  });

  it('ignores a second record while one is already running', () => {
    const recording = recStep(REC_IDLE, { type: 'record' });
    expect(recStep(recording, { type: 'record' })).toBe(recording);
  });
});
