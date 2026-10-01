#!/usr/bin/env -S npx tsx
// W6 party-quiz: tiebreak, who-scene-it, carnival, brain-brawl.
// The behaviors the brief requires, plus the source scans that keep the 2D overlay
// and the shared-file edits from sliding back.
//
// Run: npx tsx scripts/party-quiz-w6-tests.ts

import { readFileSync } from 'node:fs';
import { flightOf, NORMAL_FEEL, postedScore, scriptedCueRun, windowOpenFrac } from '../lib/babylon/core/TiebreakBlitz';
import { scriptedSoloClaims } from '../lib/babylon/core/BrainBrawlCore';
import { whoSceneItStageBox } from '../lib/babylon/modes/whoSceneItFrame';
import { makeVenueShelf } from '../lib/babylon/modes/whoSceneItVenues';
import { carnivalStopLabel, CARNIVAL_NIGHT_NAME, CARNIVAL_NATIVE_STOP_NAME } from '../lib/carnival-run';
import { MODE_INFO } from '../lib/game-data';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };
const src = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

// ── tiebreak: the window decides the point, and the 2D overlay is gone ──
{
  ok(NORMAL_FEEL.gapSec >= 1.2 && NORMAL_FEEL.gapSec <= 1.6, 'tiebreak: the between-point hold is a short beat');
  const halfMs = (lead: number, rally: number) => {
    const flight = flightOf(rally, 0.95, NORMAL_FEEL);
    const open = windowOpenFrac(lead, rally, NORMAL_FEEL);
    return (flight * (1 - open) / 2) * 1000;
  };
  ok(halfMs(0, 0) >= 85 && halfMs(0, 0) <= 95, 'tiebreak: the opening window is about ±90ms');
  ok(halfMs(6, 8) >= 40 && halfMs(6, 8) <= 45, 'tiebreak: a stacked rally closes to about ±40-45ms');
  const band = (error: number) => {
    let wins = 0;
    let open = 0;
    let sweep = 0;
    let blank = 0;
    let unposted = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const run = scriptedCueRun(seed, error);
      if (!run.over || (run.myPts < 7 && run.aiPts < 7)) open++;
      if (run.myPts === 7 && run.myPts > run.aiPts) wins++;
      if (run.myPts === 7 && run.aiPts === 0) sweep++;
      if (run.myPts === 0 || run.aiPts === 0) blank++;
      if (!Number.isFinite(postedScore(run.myPts, run.bestRally))) unposted++;
    }
    return { wins, open, sweep, blank, unposted };
  };
  const h60 = band(0.06);
  const h90 = band(0.09);
  ok(h60.open === 0 && h60.unposted === 0, 'tiebreak: every ±60ms run ends and posts');
  ok(h90.open === 0 && h90.unposted === 0, 'tiebreak: every ±90ms run ends and posts');
  ok(h60.sweep === 0 && h90.sweep === 0 && h60.blank === 0 && h90.blank === 0, 'tiebreak: neither timing error goes 7-0');
  ok(h60.wins >= 20 && h60.wins <= 28, `tiebreak: ±60ms wins ${h60.wins}/40 (band 20–28)`);
  ok(h90.wins >= 6 && h90.wins <= 14, `tiebreak: ±90ms wins ${h90.wins}/40 (band 6–14)`);
  let perfectOpen = 0;
  let perfectLoss = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const run = scriptedCueRun(seed, 0);
    if (!run.over) perfectOpen++;
    if (!(run.myPts === 7 && run.myPts > run.aiPts)) perfectLoss++;
  }
  ok(perfectOpen === 0 && perfectLoss === 0, 'tiebreak: perfect timing still wins');
  const host = src('components/games/tiebreak-game.tsx');
  ok(!host.includes("getContext('2d')"), 'tiebreak host: no 2D canvas');
  ok(!host.includes('/backdrops/tennis.jpg'), 'tiebreak host: no photo backdrop');
  ok(!host.includes('felTiebreak'), 'tiebreak host: no 2D swing hook');
  ok(!host.includes('COMING LEFT'), 'tiebreak host: the side is not printed');
  ok(host.includes('const TARGET = 7;'), 'tiebreak host: TARGET stays 7');
  ok(host.includes('score: myPts,'), 'tiebreak host: posts the game score (WA-22)');
  ok(host.includes('Math.random() < 0.16 + rally * 0.05'), 'tiebreak host: AI net rate');
  ok(/useStartWake\(!started/.test(host), 'tiebreak host: start card');
  const mode = src('lib/babylon/modes/TiebreakMode.ts');
  ok(mode.includes("mountVenue(ctx, 'tennis'"), 'tiebreak: mounts the tennis venue');
  ok(mode.includes('MeshBuilder.CreateSphere'), 'tiebreak: the ball is a mesh');
}

// ── who-scene-it: the frame fits, and a swap does not rebuild ──
{
  const desk = whoSceneItStageBox(1920, 1080);
  const phone = whoSceneItStageBox(390, 844);
  ok(desk.fits && desk.width <= 1200 && desk.height <= 1080, 'who-scene-it: 1920×1080 fits');
  ok(phone.fits && phone.width <= 390 && phone.height < 844, 'who-scene-it: 390×844 fits');
  const live: { id: string; on: boolean }[] = [];
  const shelf = makeVenueShelf((id: string) => {
    const node = { id, on: false };
    live.push(node);
    return { root: { setEnabled(on: boolean) { node.on = on; } }, dispose() { node.on = false; } };
  });
  shelf.preload(['court', 'gym']);
  shelf.show('gym');
  shelf.show('court');
  shelf.show('gym');
  ok(shelf.built() === 2, 'who-scene-it: a swap does not mount a second copy');
  ok(live.filter((n) => n.on).length === 1, 'who-scene-it: one venue is showing');
  const host = src('components/games/who-scene-it-babylon.tsx');
  ok(!host.includes('h-[calc(100dvh-3.25rem)]'), 'who-scene-it host: canvas is not the old viewport height');
  ok(host.includes('whoSceneItStageBox'), 'who-scene-it host: uses the frame box');
  const mode = src('lib/babylon/modes/WhoSceneItMode.ts');
  ok(mode.includes('shelf.preload'), 'who-scene-it: preloads venues');
  ok(mode.includes('shelf.show'), 'who-scene-it: shows a cached venue');
  ok(!mode.includes('venue?.dispose'), 'who-scene-it: a question does not dispose its venue');
  ok(mode.includes('radius: 8.5'), 'who-scene-it: sweep stays in front of the walls');
  const spec = src('lib/babylon/nexus/venueSpecs.ts');
  const gym = spec.slice(spec.indexOf('gymnastics:'), spec.indexOf('brain_brawl:'));
  ok(gym.includes('alpha: Math.PI / 2'), 'gymnastics camera stands in front of its wall');
  ok(!gym.includes('-Math.PI / 2'), 'gymnastics camera is not behind the wall');
}

// ── carnival: the first stop is not the night's name ──
{
  ok(MODE_INFO.carnival.name === CARNIVAL_NIGHT_NAME, 'the night is still Game Night');
  ok(carnivalStopLabel('carnival') === CARNIVAL_NATIVE_STOP_NAME, 'stop 1 is Court Carnival');
  ok(carnivalStopLabel('carnival') !== MODE_INFO.carnival.name, 'stop 1 is not the night name');
  const mode = src('lib/babylon/modes/CourtCarnivalMode.ts');
  ok(!mode.includes('S.hub?.dispose()'), 'carnival: an event does not dispose the hub');
  ok(mode.includes('setEnabled(false)'), 'carnival: the hub hides between events');
  const events = src('lib/babylon/modes/carnivalEvents.ts');
  ok(events.includes("CreateGround('carn_apron'"), 'counter strike: apron under the floor edge');
  ok(events.includes("CreatePlane('carn_banner'"), 'counter strike: banner in front of the shoji');
  ok(events.includes("if (state === 'idle' && stateSec > 0.4 + Math.random() * 0.5) {"), 'counter strike: wind-up line stays');
}

// ── brain-brawl: a scripted run can claim every category ──
{
  const perfect = scriptedSoloClaims(7, (c) => c.answer);
  ok(perfect.done && perfect.claimed === 5 && perfect.rounds === 5, 'brain-brawl: five correct answers claim five categories');
  let missed = false;
  const retry = scriptedSoloClaims(11, (c) => {
    if (!missed) { missed = true; return (c.answer + 1) % 4; }
    return c.answer;
  });
  ok(retry.done && retry.claimed === 5 && retry.rounds === 6 && retry.rounds <= 15, 'brain-brawl: a miss can be claimed later');
  const mode = src('lib/babylon/modes/BrainBrawlMode.ts');
  ok(!mode.includes('for (const c of S.played) pseudo'), 'brain-brawl: a miss is not treated as claimed');
  ok(mode.includes('claimedBy(S.claims, 0).length >= CATEGORIES.length'), 'brain-brawl: solo ends when five are claimed');
  ok(mode.includes('const MAX_ROUNDS = 15'), 'brain-brawl: the round cap stays');
  const host = src('components/games/brainbrawl-babylon.tsx');
  ok(host.includes('/5 CLAIMED'), 'brain-brawl host: the claim count is on screen');
}

if (fail.length) {
  console.error(`party-quiz-w6-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`party-quiz-w6-tests: ${checks} checks green`);
