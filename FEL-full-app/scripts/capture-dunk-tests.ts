// Headless checks for game capture and dunk-film review. The vitest files cover the same rules;
// this suite is what ci-suite discovers.

import { G, heightFromFlight } from '../lib/babylon/core/IRLCore';
import { pickCodec } from '../lib/capture/codecs';
import { planShare } from '../lib/capture/shareClip';
import { REC_IDLE, recStep } from '../lib/capture/recorderMachine';
import { replayBounds, retainSegments } from '../lib/capture/replayBuffer';
import { cameraMayStart, selfVideoMayLeave, VIDEO_TRAINING_USE, videoDestination } from '../lib/capture/privacy';
import { LIVE_RELAY_BUILT } from '../lib/capture/streamLayout';
import { clipWindow } from '../lib/dunk-film/clips';
import { dunkHistoryBody } from '../lib/dunk-film/history';
import { readJumps } from '../lib/dunk-film/jumpDetect';
import { dunkPoseAssetUrls, poseAssetsStayLocal } from '../lib/dunk-film/poseGuard';
import { buildReel } from '../lib/dunk-film/reel';
import { cleanJump, smallHop, standStill, walk } from '../lib/dunk-film/synthBody';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name} ${extra}`); }
};

ok('flight time is g·t²/8', Math.abs(heightFromFlight(0.5) - (G * 0.25) / 8) < 1e-9);
ok('a longer flight is a higher jump', heightFromFlight(0.6) > heightFromFlight(0.4));

const clean = readJumps(cleanJump(), { heightCm: 180 });
ok('a clean jump is one jump', clean.length === 1, `n=${clean.length}`);
ok('the air-time centimetres match the formula', clean[0] != null && clean[0].airTimeCm === Math.round(heightFromFlight(clean[0].flightMs / 1000) * 100));
ok('a typed height adds a hip estimate', clean[0]?.hipCm != null);
ok('no height means no invented hip estimate', readJumps(cleanJump(), {})[0]?.hipCm == null);
ok('a small hop is not a jump', readJumps(smallHop()).length === 0);
ok('a walk is not a jump', readJumps(walk()).length === 0);
ok('standing still is not a jump', readJumps(standStill()).length === 0);

const duration = 20_000;
const bounds = clipWindow(10_000, 10_500, duration);
ok('clip starts 1.5s before takeoff', bounds.startMs === 8500);
ok('clip ends 1s after landing', bounds.endMs === 11_500);
ok('clip clamps to the start of the file', clipWindow(400, 900, 5000).startMs === 0);

const reel = buildReel(clean, cleanJump()[cleanJump().length - 1].t + 1000);
ok('the reel has the jump and a summary', reel.clips.length === 1 && reel.summary.bestCm === clean[0]?.airTimeCm);

const recording = recStep(REC_IDLE, { type: 'record' });
const stopped = recStep(recording, { type: 'stop' });
ok('record then stop is a take on the device', recording.phase === 'recording' && stopped.phase === 'ready' && stopped.take && !/upload|post/i.test(stopped.note ?? ''));
const marked = recStep(recording, { type: 'save-replay' });
ok('replay during a take keeps recording', marked.phase === 'recording' && marked.replay);
ok('the buffer keeps the last 30 seconds', retainSegments(
  [{ t0: 0, t1: 5000 }, { t0: 20000, t1: 25000 }, { t0: 30000, t1: 35000 }],
  35000,
).length === 2);
ok('a short file replays from the start', replayBounds(8000).startMs === 0 && replayBounds(45000).startMs === 15000);

ok('no share sheet means a download', planShare({ hasShare: false, canShareFile: false }, 'a.webm').kind === 'download');
ok('a sheet that cannot take a file means a download', planShare({ hasShare: true, canShareFile: false }, 'a.webm').kind === 'download');
ok('a sheet that can take a file is the share path', planShare({ hasShare: true, canShareFile: true }, 'a.webm').kind === 'sheet');

ok('iOS falls back off vp9 and says so', (() => {
  const pick = pickCodec((m) => m.includes('mp4'), 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari');
  return pick.mime?.includes('mp4') === true && /iOS Safari/.test(pick.fallbackNote ?? '');
})());

ok('video stays unless the player shares or exports', videoDestination('keep') === 'stay' && videoDestination('share') === 'leave' && videoDestination('export') === 'leave');
ok('training throws', (() => { try { videoDestination('train'); return false; } catch { return true; } })());
ok('training is off', VIDEO_TRAINING_USE === false);
ok('a kid needs a grown-up before the camera', cameraMayStart('13-17', false) === false && cameraMayStart('13-17', true) === true);
ok('an unknown age needs a grown-up before the camera', cameraMayStart('unknown', false) === false && cameraMayStart(null, true) === false);
ok('a minor cannot share a video of themselves without the grown-up step', selfVideoMayLeave('under-13', false) === false && selfVideoMayLeave('under-13', true) === true);
ok('pose assets are only /pose', poseAssetsStayLocal(dunkPoseAssetUrls()) && dunkPoseAssetUrls().every((u) => u.startsWith('/pose/')));
ok('history body is numbers the dunk route already stores', (() => {
  const body = clean[0] ? dunkHistoryBody(clean[0]) : null;
  return body != null && body.family === 'ATTEMPT' && !('video' in body);
})());
ok('no live RTMP relay', LIVE_RELAY_BUILT === false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
