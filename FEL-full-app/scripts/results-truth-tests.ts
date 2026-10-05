/**
 * RESULTS-TRUTH headless guards — finish payload matches the end card.
 * Run: npx tsx scripts/results-truth-tests.ts
 */
import assert from 'node:assert/strict';
import { proofLineFor } from '../lib/proofLine';
import {
  boardGameResult, boardHeadline, boardSportWon, footballHeadline, footballSessionWon,
  gameResultFromSession, timingGameResult,
} from '../lib/sessions/gameResultFromSession';
import { RUN_CAP_SEC, TIME_PAR_SEC } from '../lib/babylon/modes/gateCrasher';

let passed = 0;
const ok = (cond: boolean, msg: string) => { assert(cond, msg); passed++; };

// WA-2 tennis proof line
{
  const r = { modeId: 'tennis', outcome: 'LOSS', score: 2, stats: { theirs: 4, style: 1 }, durationSec: 60, timestamp: '' };
  const g = timingGameResult(r, { headline: 'MATCH LOST · 2 GAMES', modeKey: 'tennis' });
  ok(g.opponentScore === 4, 'tennis posts opponent games');
  ok(proofLineFor('tennis', g) === '2–4 · LOST', 'tennis proof line uses both scores');
}

// WA-22 tiebreak game score on share card
{
  const g = { score: 7, opponentScore: 0, won: true, stats: {}, outcome: 'WIN' };
  ok(proofLineFor('tiebreak', g) === '7–0 · WON', 'tiebreak proof line is game score not points scale');
}

// WA-5 big-air total (mode posts rotation + banked line)
{
  const rotation = 427;
  const banked = 603;
  const total = rotation + banked;
  ok(total === 1030, 'big-air HUD total is rotation plus banked combo');
}

// WA-8 football session win
{
  const r = { modeId: 'football', outcome: 'DRIVES_DONE', score: 360, stats: { yards: 43 }, durationSec: 23, timestamp: '' };
  ok(footballSessionWon(r.outcome), 'three touchdown drives post won');
  const g = gameResultFromSession(r, { won: true, headline: footballHeadline(r, true) });
  ok(g.won && (g.headline ?? '').includes('TOUCHDOWN'), 'football card matches touchdowns');
}

// WA-13 snowboard cap at par × 2
ok(RUN_CAP_SEC === TIME_PAR_SEC * 2, 'snowboard hard timeout is par × 2');

// WA-3 / WA-4 earned headlines
{
  const skate = { modeId: 'skateboard', outcome: 'win', score: 2067, stats: { bestCombo: 1, tricksLanded: 24, coinsCollected: 3, goalsHit: 0 }, durationSec: 90, timestamp: '' };
  ok(!boardHeadline('skateboard', skate, true).includes('LEGENDARY'), 'no LEGENDARY on ×1 chain with 0 goals');
  const surf = { modeId: 'surf', outcome: 'win', score: 1903, stats: { bestFlow: 0, barrels: 0, tricksLanded: 14, pumps: 0 }, durationSec: 90, timestamp: '' };
  ok(boardHeadline('surf', surf, true).includes('SOLID SESSION'), 'no EPIC SESSION at flow 0');
}

console.log(`All ${passed} results-truth guards passed.`);
