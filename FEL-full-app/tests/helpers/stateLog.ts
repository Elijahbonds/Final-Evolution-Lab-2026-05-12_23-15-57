// Read what a component tried to show after an async handler, in a test that has no DOM.
//
// driveRender.ts can walk a component's UI and press its buttons, but a handler that awaits (a checkout, a BUY) sets its
// state after the render has finished, and the server renderer drops that update. So the note a hub says after the
// await ("Subscribed — eat well", "Yours! Seller nets 135◈") never reaches the markup, and a test reading the markup
// cannot tell an honest note from a fake success. HOTFIX (2026-09-24): this records every value handed to a useState
// setter, so the test reads the note the handler actually set.
//
// Use it by mocking React in the test file (vi.mock is hoisted, so the helper is imported inside the factory):
//
//   vi.mock('react', async (importOriginal) =>
//     (await import('@/tests/helpers/stateLog')).recordingReact(await importOriginal()));
//
// and clear `stateLog` in a beforeEach. The component's hooks are React's own; only the setter is wrapped.
// This module imports React for its types only, so the mock can load it without a cycle.

import type * as ReactModule from 'react';

/** Every value passed to a useState setter since the log was last cleared, in call order. */
export const stateLog: unknown[] = [];

/** The strings in the log: the notes, labels and field values a component set. */
export function loggedStrings(): string[] {
  return stateLog.filter((v): v is string => typeof v === 'string');
}

export function recordingReact(actual: typeof ReactModule): typeof ReactModule {
  const useState = ((initial: unknown) => {
    const [value, set] = actual.useState(initial);
    const record = (next: unknown) => {
      stateLog.push(next);
      set(next as never);
    };
    return [value, record];
  }) as typeof actual.useState;
  const base = ((actual as unknown as { default?: typeof ReactModule }).default ?? actual) as typeof ReactModule;
  return { ...actual, useState, default: { ...base, useState } } as typeof ReactModule;
}
