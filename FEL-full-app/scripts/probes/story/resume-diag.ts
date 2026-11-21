// lane/story: resume Chapter 1 at a saved beat (a real save from a full run, round-tripped) and print where the scripted player goes.
//   npx tsx scripts/probes/story/resume-diag.ts <beatId> [seed]
import { runPlaythrough } from '@/lib/babylon/adventure/story/playthrough';
const beat = process.argv[2] ?? 'b06-wall';
const seed = Number(process.argv[3] ?? 11);
const full = runPlaythrough({ seed: 7 });
const stop = full.saves.find((x) => x.save.story.beatId === beat);
if (!stop) { console.log('no save at', beat); process.exit(1); }
const save = JSON.parse(JSON.stringify(stop.save));
console.log('saved', JSON.stringify(save.story));
let last = '';
const r = runPlaythrough({ seed, save, maxSec: 300, afterTick: (s, t) => {
  const p = s.host.player; const k = `${s.runner.beat?.id} ${p.state}`;
  if (t % 300 === 0 || k !== last) { last = k; console.log(t, s.runner.beat?.id, p.state, p.pos.x.toFixed(1), p.pos.y.toFixed(1), p.pos.z.toFixed(1), 'hp', p.stats.hp.cur.toFixed(0)); }
} });
console.log('done', r.session.runner.done, 'ticks', r.ticks);
const h = r.session.host;
for (const a of h.world.actors.values()) if (a.kind === 'monster' || a.kind === 'boss') console.log('foe', a.id, a.state, a.pos.x.toFixed(1), a.pos.y.toFixed(1), a.pos.z.toFixed(1), 'hp', a.stats.hp.cur.toFixed(0));
console.log('doing', (r as unknown as { session: { runner: { objective(): string | null } } }).session.runner.objective());
