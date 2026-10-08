'use client';

import { useEffect, useRef } from 'react';
import type { FelButton, FelInput, InputBus } from '@/lib/babylon/core/InputBus';
import { registerFelMode, unregisterFelMode } from '@/lib/playtest/harness';

type Snapshot = () => Record<string, unknown>;

const BUTTONS = new Set<FelButton>(['A', 'B', 'X', 'Y', 'L1', 'R1', 'SELECT', 'START', 'LS', 'RS']);
const DPAD = new Set(['up', 'down', 'left', 'right']);

export function useBabylonPlaytestBridge(modeId: string, snapshot: Snapshot, bus: InputBus | null): void {
  const latest = useRef({ snapshot, bus });
  latest.current = { snapshot, bus };

  useEffect(() => {
    registerFelMode(modeId, {
      getState: () => {
        const current = latest.current;
        const activeBus = current.bus;
        return {
          engine: 'babylon',
          modeId,
          ...current.snapshot(),
          pads: activeBus?.padState() ?? [],
          body: activeBus?.bodyStats() ?? {},
        };
      },
      sendInput: (action, payload) => {
        const activeBus = latest.current.bus;
        if (activeBus) emitPlaytestInput(activeBus, action, payload);
      },
    });
    return () => unregisterFelMode(modeId);
  }, [modeId]);
}

function emitPlaytestInput(bus: InputBus, action: string, payload?: unknown): void {
  if (isFelInput(payload)) {
    bus.emit(payload);
    return;
  }

  const key = action.trim();
  const lower = key.toLowerCase();
  const objectPayload = isRecord(payload) ? payload : {};

  if (lower === 'stick') {
    const side = objectPayload.side === 'R' ? 'R' : 'L';
    bus.emit({
      t: 'stick',
      side,
      x: finiteNumber(objectPayload.x),
      y: finiteNumber(objectPayload.y),
    });
    return;
  }

  if (lower === 'trigger') {
    const side = objectPayload.side === 'L' ? 'L' : 'R';
    bus.emit({ t: 'trigger', side, value: finiteNumber(objectPayload.value) });
    return;
  }

  const button = buttonFromAction(key);
  if (button) {
    emitButton(bus, button, objectPayload.pressed);
    return;
  }

  const dir = directionFromAction(lower);
  if (dir) {
    emitDpad(bus, dir, objectPayload.pressed);
  }
}

function buttonFromAction(action: string): FelButton | null {
  const normalized = action.replace(/^button[:.]/i, '').toUpperCase();
  if (normalized === 'GO' || normalized === 'START') return 'START';
  return BUTTONS.has(normalized as FelButton) ? (normalized as FelButton) : null;
}

function directionFromAction(action: string): 'up' | 'down' | 'left' | 'right' | null {
  const normalized = action.replace(/^dpad[:.]/, '');
  return DPAD.has(normalized) ? (normalized as 'up' | 'down' | 'left' | 'right') : null;
}

function emitButton(bus: InputBus, btn: FelButton, pressed: unknown): void {
  if (typeof pressed === 'boolean') {
    bus.emit({ t: 'button', btn, pressed });
    return;
  }
  bus.emit({ t: 'button', btn, pressed: true });
  bus.emit({ t: 'button', btn, pressed: false });
}

function emitDpad(bus: InputBus, dir: 'up' | 'down' | 'left' | 'right', pressed: unknown): void {
  if (typeof pressed === 'boolean') {
    bus.emit({ t: 'dpad', dir, pressed });
    return;
  }
  bus.emit({ t: 'dpad', dir, pressed: true });
  bus.emit({ t: 'dpad', dir, pressed: false });
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isFelInput(value: unknown): value is FelInput {
  if (!isRecord(value) || typeof value.t !== 'string') return false;
  if (value.t === 'stick') return (value.side === 'L' || value.side === 'R') && typeof value.x === 'number' && typeof value.y === 'number';
  if (value.t === 'trigger') return (value.side === 'L' || value.side === 'R') && typeof value.value === 'number';
  if (value.t === 'button') return typeof value.btn === 'string' && BUTTONS.has(value.btn as FelButton) && typeof value.pressed === 'boolean';
  if (value.t === 'dpad') return typeof value.dir === 'string' && DPAD.has(value.dir) && typeof value.pressed === 'boolean';
  return false;
}
