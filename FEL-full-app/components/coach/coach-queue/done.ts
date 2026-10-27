// components/coach/coach-queue/done.ts — PLATFORM PHASE 5: "done" on a card that no route resolves (a pain flag a coach has
// answered, a join they have seen) is remembered for TODAY on THIS device only. assumption: per-device is enough until the
// owner wants a done-state table (it would be pending SQL: owner call). A card's key carries its source's stamp, so a new
// event is a new key and comes back. Browser storage can be missing or throw: then nothing is remembered, nothing breaks.
const KEY = 'fel-coach-queue-done';
const today = () => new Date().toISOString().slice(0, 10);

export function readDone(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { day?: string; keys?: string[] } | null;
    return new Set(raw?.day === today() && Array.isArray(raw.keys) ? raw.keys : []);
  } catch { return new Set(); }
}

export function markDone(key: string): void {
  try {
    const keys = readDone(); keys.add(key);
    localStorage.setItem(KEY, JSON.stringify({ day: today(), keys: [...keys].slice(-200) }));
  } catch { /* storage off: the card still leaves for this visit */ }
}
