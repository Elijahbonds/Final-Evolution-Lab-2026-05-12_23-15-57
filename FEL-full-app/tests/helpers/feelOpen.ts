// Test helper (lane/h3-aware): open the feel panel on a playtest run with these overrides, as the owner's phone would (a stored
// override, the panel opened for this user, an unpaid playtest run) — the same three conditions lib/feel-panel/feel.ts checks.
// `closeFeel()` puts everything back (call it in afterEach).
import { FEEL_STORAGE_KEY, resetFeelForTests, setFeelSession, setFeelUser } from '@/lib/feel-panel/feel';
import { feelSessionBlock } from '@/lib/feel-panel/sessionGate';

const g = globalThis as { window?: unknown };

export function openFeel(overrides: Record<string, number>, path = '/play/threevthree'): void {
  resetFeelForTests();
  const m = new Map<string, string>([[FEEL_STORAGE_KEY, JSON.stringify(overrides)]]);
  g.window = { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } } };
  setFeelUser(true); setFeelSession(feelSessionBlock(path, '?playtest=1'));
}

export function closeFeel(): void { resetFeelForTests(); delete g.window; }
