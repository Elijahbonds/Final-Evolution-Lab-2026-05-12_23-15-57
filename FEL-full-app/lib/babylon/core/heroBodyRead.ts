// heroBodyRead — the `/api/v1/hero-body` read, startable before Babylon loads (DEMO-SPEED, 2026-10-27).
//
// The library stage's early start (lib/library/demoWarm.ts) needs to know WHICH body this player wears to fetch its file
// while Babylon downloads; the spawn's own identity read (playerIdentity.resolveIdentity) needs the same answer a moment
// later. An early read is handed to that next identity read instead of asking the server twice — once, and only while it
// is fresh (30 s), so it can never stand in for a read made after the player changed their body.
//
// No Babylon here: nothing the drill surfaces load up front may reach @babylonjs/* (lib/assess/replay.test.ts walks it).
import type { HeroBodyAnswer } from './playerIdentity';

const FRESH_MS = 30_000;
let early: { at: number; read: Promise<HeroBodyAnswer | null> } | null = null;

/** The read itself: the answer, or null for a guest (401), a failure or no network. */
export function fetchHeroBody(): Promise<HeroBodyAnswer | null> {
  try {
    return fetch('/api/v1/hero-body').then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<HeroBodyAnswer | null>;
  } catch { return Promise.resolve(null); }
}

/** Start the read now (or join the one already started), for whoever needs the body first. */
export function readHeroBodyEarly(now = Date.now()): Promise<HeroBodyAnswer | null> {
  if (!early || now - early.at > FRESH_MS) early = { at: now, read: fetchHeroBody() };
  return early.read;
}

/** The identity read's door: the early read if one is fresh (handed over once), otherwise a read of its own. */
export function takeHeroBodyRead(now = Date.now()): Promise<HeroBodyAnswer | null> {
  const e = early;
  early = null;
  return e && now - e.at <= FRESH_MS ? e.read : fetchHeroBody();
}
