import { describe, expect, it, vi } from 'vitest';
import type { FelInput, InputBus } from '../babylon/core/InputBus';
import { toInputBus } from './modeBridge';

function collectBridge() {
  const events: FelInput[] = [];
  const bridge = toInputBus({ emit: (e: FelInput) => events.push(e) } as InputBus);
  return { bridge, events };
}

describe('Controller Link mode bridge', () => {
  it('passes extended FEL buttons through instead of collapsing them to A', () => {
    const { bridge, events } = collectBridge();

    bridge({ a: 'R1', t: 1 });
    bridge({ a: 'SELECT', t: 2 });

    expect(events).toEqual([
      { t: 'button', btn: 'R1', pressed: true },
      { t: 'button', btn: 'R1', pressed: false },
      { t: 'button', btn: 'SELECT', pressed: true },
      { t: 'button', btn: 'SELECT', pressed: false },
    ]);
  });

  it('maps brake to the left trigger for racing schemas', () => {
    const { bridge, events } = collectBridge();

    bridge({ a: 'brake', p: 0.75, t: 1 });
    bridge({ a: 'brake', p: 0, t: 2 });

    expect(events).toEqual([
      { t: 'trigger', side: 'L', value: 0.75 },
      { t: 'trigger', side: 'L', value: 0 },
    ]);
  });

  it('ramps a held brake button like the held charge fallback, but on LT', () => {
    vi.useFakeTimers();
    try {
      const { bridge, events } = collectBridge();

      bridge({ a: 'brake:down', t: 1 });
      vi.advanceTimersByTime(550);
      bridge({ a: 'brake:up', t: 2 });

      expect(events[0]).toEqual({ t: 'trigger', side: 'L', value: 0.01 });
      expect(events.some((e) => e.t === 'trigger' && e.side === 'L' && e.value > 0.4)).toBe(true);
      expect(events.at(-1)).toEqual({ t: 'trigger', side: 'L', value: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps gas and brake hold ramps independent', () => {
    vi.useFakeTimers();
    try {
      const { bridge, events } = collectBridge();

      bridge({ a: 'charge:down', t: 1 });
      vi.advanceTimersByTime(250);
      const rightBeforeBrake = events
        .filter((e): e is Extract<FelInput, { t: 'trigger' }> => e.t === 'trigger' && e.side === 'R')
        .at(-1)?.value ?? 0;

      bridge({ a: 'brake:down', t: 2 });
      vi.advanceTimersByTime(250);
      bridge({ a: 'brake:up', t: 3 });

      const rightAfterBrake = events
        .filter((e): e is Extract<FelInput, { t: 'trigger' }> => e.t === 'trigger' && e.side === 'R')
        .at(-1)?.value ?? 0;
      expect(rightAfterBrake).toBeGreaterThan(rightBeforeBrake);

      bridge({ a: 'charge:up', t: 4 });
      expect(events.at(-1)).toEqual({ t: 'trigger', side: 'R', value: 0 });
    } finally {
      vi.useRealTimers();
    }
  });
});
