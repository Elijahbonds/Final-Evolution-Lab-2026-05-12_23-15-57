// A playtest run with feel-panel overrides on this "device", for tests (lane/h3-handler): the panel open for the user, the session a
// `?playtest=1` run, and `overrides` in the device's storage — so feel(id, DEFAULT) returns them. closeFeel() puts the closed start back.
// The same three conditions lib/feel-panel/feel.ts checks in the game (BallSideShade.test opens it this way too).
import { FEEL_STORAGE_KEY, resetFeelForTests, setFeelSession, setFeelUser } from '@/lib/feel-panel/feel';
import { feelSessionBlock } from '@/lib/feel-panel/sessionGate';

const g = globalThis as { window?: unknown };

export function openFeel(overrides: Record<string, number>): void {
  resetFeelForTests();
  const m = new Map<string, string>([[FEEL_STORAGE_KEY, JSON.stringify(overrides)]]);
  g.window = { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } } };
  setFeelUser(true); setFeelSession(feelSessionBlock('/play/onevone', '?playtest=1'));
}

export function closeFeel(): void { resetFeelForTests(); delete g.window; }
