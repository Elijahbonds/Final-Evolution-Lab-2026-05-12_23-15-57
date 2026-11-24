// lane/physics-arena: the sweep that chose the shot knobs. Headless Havok (./harness.ts), no browser.
//   npx tsx scripts/probes/physics-arena/tune.ts '{"arena.bodyCarry":0.6}' [seeds=3] [perSpot=3]
// Prints, per seed, the make rate of a GOOD release (within 25 ms of the top of the jump) and a BAD one (100-160 ms early or
// late), over the 20 spots of harness.spots(), and the sensor's agreement with the independent label.
import { makeWorld, runShot, spots } from './harness';
import { setFeelUser, setFeelSession, setFeelOverride } from '../../../lib/feel-panel/feel';
import { seeded } from '../../../lib/babylon/arena/shotModel';

async function main() {
  const over = JSON.parse(process.argv[2] ?? '{}') as Record<string, number>;
  setFeelUser(true); setFeelSession(null);
  for (const [k, v] of Object.entries(over)) setFeelOverride(k, v);
  const seeds = Number(process.argv[3] ?? 3), per = Number(process.argv[4] ?? 3);
  const { world, dispose } = await makeWorld();
  const byDist = new Map<number, { g: number; gn: number; b: number; bn: number }>();
  for (let s = 1; s <= seeds; s++) {
    const rng = seeded(1000 + s);
    let g = 0, gn = 0, b = 0, bn = 0, agree = 0, n = 0;
    for (const feet of spots()) {
      const d = Math.round(Math.hypot(feet.x, feet.z + 0.6) * 10) / 10;
      const row = byDist.get(d) ?? { g: 0, gn: 0, b: 0, bn: 0 }; byDist.set(d, row);
      for (let i = 0; i < per; i++) {
        const good = (rng.next() * 2 - 1) * 0.025;
        const bad = (rng.next() < 0.5 ? -1 : 1) * (0.1 + rng.next() * 0.06);
        const rg = runShot(world, { feet, offsetSec: good }, rng.normal);
        const rb = runShot(world, { feet, offsetSec: bad }, rng.normal);
        g += +rg.made; gn++; b += +rb.made; bn++; row.g += +rg.made; row.gn++; row.b += +rb.made; row.bn++;
        for (const r of [rg, rb]) { n++; if (r.frameSensorMade === r.label) agree++; }
      }
    }
    console.log(`seed ${s}: good ${(100 * g / gn).toFixed(0)}% (${g}/${gn})  bad ${(100 * b / bn).toFixed(0)}% (${b}/${bn})  sensor agrees ${agree}/${n}`);
  }
  for (const [d, r] of [...byDist.entries()].sort((a, b2) => a[0] - b2[0])) console.log(`  ${d} m: good ${(100 * r.g / r.gn).toFixed(0)}%  bad ${(100 * r.b / r.bn).toFixed(0)}%`);
  dispose();
}
main().catch((e) => { console.error(e); process.exit(1); });
