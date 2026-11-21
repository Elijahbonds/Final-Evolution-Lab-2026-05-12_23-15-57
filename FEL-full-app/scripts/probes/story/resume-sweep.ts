// lane/story: Chapter 1 resumed from EVERY step a full run saved, across seeds — does each play on to the end? Prints the misses.
// Each miss names where the scripted player stood and the live foes (a foe out of the world, a fight out of reach…).
//   npx tsx scripts/probes/story/resume-sweep.ts [seeds=1,2,3,4,5,6]   (FOE_FALL_BACK=0: the story.foeFallBack control)
import { runPlaythrough } from '@/lib/babylon/adventure/story/playthrough';
import { setFeelOverride, setFeelSession, setFeelUser } from '@/lib/feel-panel/feel';
if (process.env.FOE_FALL_BACK === '0') { setFeelUser(true); setFeelSession(null); setFeelOverride('story.foeFallBack', 0); }
const seeds = (process.argv[2] ?? '1,2,3,4,5,6').split(',').map(Number);
const full = runPlaythrough({ seed: 7 });
const seen = new Set<string>();
const stops = full.saves.filter((x) => x.save.story.beatId && !seen.has(x.save.story.beatId) && seen.add(x.save.story.beatId));
let n = 0, miss = 0;
for (const seed of seeds) for (const stop of stops) {
  n++;
  const r = runPlaythrough({ seed, save: JSON.parse(JSON.stringify(stop.save)), maxSec: 400 });
  if (r.session.runner.done) continue;
  miss++;
  const h = r.session.host, p = h.player;
  const foes = [...h.world.actors.values()].filter((a) => (a.kind === 'monster' || a.kind === 'boss') && a.stats.hp.cur > 0 && !a.id.startsWith('wisp')).map((a) => `${a.id}@${a.pos.x.toFixed(0)},${a.pos.y.toFixed(0)},${a.pos.z.toFixed(0)}`);
  console.log(`MISS seed ${seed} from ${stop.save.story.beatId}: stuck at ${r.session.runner.beat?.id} player ${p.state} ${p.pos.x.toFixed(0)},${p.pos.y.toFixed(0)},${p.pos.z.toFixed(0)} foes ${foes.join(' ')} fallbacks ${r.session.runtime.foeFallBacks}`);
}
console.log(JSON.stringify({ runs: n, finished: n - miss, missed: miss, stops: stops.length }));
