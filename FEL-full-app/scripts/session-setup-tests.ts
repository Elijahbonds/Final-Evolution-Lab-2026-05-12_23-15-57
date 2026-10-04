#!/usr/bin/env -S npx tsx
// SESSION-SETUP-V1 acceptance checks. The same rules as lib/session-setup/session-setup.test.ts,
// run from the headless suite so a green ci-suite includes them.
//
// Run: npx tsx scripts/session-setup-tests.ts

import { readFileSync } from 'node:fs';
import {
  DEFAULT_DUNKS, rosterReady, sealRoster, writeAdults,
} from '../lib/session-setup/roster';
import { runRotationUntapped } from '../lib/session-setup/rotation';
import { resultLine, speakCues, type Speaker } from '../lib/session-setup/voice';
import { mayRecord, recordingOnHandoff } from '../lib/session-setup/record';
import { endSession, readSession, rememberSession } from '../lib/session-setup/memory';
import { adultCsv } from '../lib/session-setup/summary';
import { postOptInSession, serverJumpForm } from '../lib/session-setup/saveNumbers';
import { ADULT_NUMBER_SYNC_ENABLED } from '../lib/session-setup/sync';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const kid = 'nix-kid-77';
const store = {
  box: new Map<string, string>(),
  getItem(k: string) { return this.box.get(k) ?? null; },
  setItem(k: string, v: string) { this.box.set(k, v); },
};

ok(DEFAULT_DUNKS === 3, 'default dunks is 3');
ok(rosterReady([{ name: 'Solo', claimed: 'unknown' }], 1), 'solo with 1 dunk is a valid roster');
ok(rosterReady(Array.from({ length: 8 }, (_, i) => ({ name: `N${i}`, claimed: 'unknown' as const })), 5), '8 players, 5 dunks is valid');
ok(sealRoster([{ name: 'Tiny', claimed: 'under-13' }], true).blocked, 'under 13 is blocked');

const ran = runRotationUntapped([{ id: 'p0', name: 'Solo', band: 'unknown' }], 1);
ok(ran.final && ran.attempts === 1 && ran.autoArms === 0, 'solo with 1 dunk ends after that dunk');
const eight = runRotationUntapped(Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `N${i}`, band: 'unknown' as const })), 5);
ok(eight.final && eight.attempts === 40 && eight.autoArms === 39, '8 players × 5 dunks re-arms without taps');

writeAdults(store, [
  { id: 'p0', name: 'Avery', band: '18+' },
  { id: 'p1', name: kid, band: '13-17' },
], true);
ok(!store.box.get('fel.session-setup.adults')!.includes(kid), 'a kid nickname is not stored');

const spoken: string[] = [];
let cancelled = 0;
const speaker: Speaker = { cancel() { cancelled++; }, speak(line) { spoken.push(line); } };
speakCues(speaker, ['hello'], true);
ok(spoken.length === 0 && cancelled === 1, 'mute stops speech');

const now = new Date('2026-10-04T12:00:00Z');
ok(!mayRecord('13-17', 2007, now) && !mayRecord('unknown', 2007, now) && !mayRecord('18+', 2008, now) && mayRecord('18+', 2007, now), 'record is only for a verified 18+');
ok(recordingOnHandoff(true, '13-17', 2007, now).recording === false && recordingOnHandoff(true, '13-17', 2007, now).discard, 'recording stops and discards on a kid handoff');

const body = serverJumpForm([
  { playerIndex: 0, band: '18+', name: 'Avery', family: 'ONE-HAND JAM', takeoff: 'two-foot', verticalCm: 40, flightTimeMs: 500, landingStability: 0.9 },
  { playerIndex: 1, band: '13-17', name: kid, family: 'ONE-HAND JAM', takeoff: 'two-foot', verticalCm: 30, flightTimeMs: 400, landingStability: 0.8 },
], { serverVerified: true, optedIn: true });
ok(body !== null && !JSON.stringify(body).includes(kid), 'the server body has no kid nickname');
ok(serverJumpForm([
  { playerIndex: 0, band: '18+', name: 'Avery', family: 'ONE-HAND JAM', takeoff: 'two-foot', verticalCm: 40, flightTimeMs: 500, landingStability: 0.9 },
], { serverVerified: true, optedIn: false }) === null, 'no opt-in means no server body');

ok(ADULT_NUMBER_SYNC_ENABLED === false, 'adult number sync stays off');

rememberSession([{ id: 'p1', name: kid, band: '13-17' }], true, 3, store);
ok(readSession()?.athletes[0].name === kid, 'a kid nickname is in page memory');
endSession();
ok(readSession() === null, 'ending the session drops the nickname');
ok(!adultCsv([{ name: kid, band: '13-17', verticalCm: 40, judges: 7 }]).includes(kid), 'the CSV has no kid nickname');
ok(resultLine('Jalen', 86.36, 8.5) === 'Jalen, 34 inches, judges 8.5', 'the result line is inches and judges');

const prove = readFileSync(new URL('../app/play/dunkduel/_components/prove-it.tsx', import.meta.url), 'utf8');
ok(!/text-\[(9|10|11)px\]/.test(prove), 'Prove It has no 9, 10, or 11 px text');
const recordSrc = readFileSync(new URL('../lib/session-setup/record.ts', import.meta.url), 'utf8');
ok(prove.includes('SET UP THE CAMERA') && prove.includes('Mute') && prove.includes('mayRecord') && prove.includes('verifiedAdult(dobYear)'), 'setup, mute, and the record gate are on the screen');
ok(recordSrc.includes("from '@/lib/privacy/verifiedAdult'") && recordSrc.includes('verifiedAdult(dobYear, now)'), 'record uses verifiedAdult, not a local adult rule');
ok(!prove.includes("fetch('/api/sessions"), 'Prove It does not call the session API itself');

async function networkGate(): Promise<void> {
  const calls: string[] = [];
  const fetchImpl = (async (url: RequestInfo | URL) => {
    calls.push(String(url));
    return { ok: true, json: async () => ({ ok: true, runId: 'run-1' }) };
  }) as typeof fetch;
  const skipped = await postOptInSession([
    { playerIndex: 0, band: '13-17', name: kid, family: 'ONE-HAND JAM', takeoff: 'two-foot', verticalCm: 30, flightTimeMs: 400, landingStability: 0.8 },
  ], { serverVerified: true, optedIn: true }, fetchImpl);
  ok(skipped === 'skipped' && calls.length === 0, 'a kid session makes no network request');
}

networkGate().then(() => {
  if (fail.length) {
    console.error(`session-setup-tests: ${fail.length} FAILED of ${checks}`);
    for (const f of fail) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`session-setup-tests: ${checks} checks green`);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
