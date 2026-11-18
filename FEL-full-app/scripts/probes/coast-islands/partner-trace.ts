// COAST & ISLANDS phase B: the partner's gap to the player along the walk to Reef Rock, headless on the real host (a trace for tuning).
//   npx tsx scripts/probes/coast-islands/partner-trace.ts
import { AdventureHost } from '../../../lib/babylon/adventure/host/AdventureHost';
import { emptyAdventureSave } from '../../../lib/babylon/adventure/contracts';
import { buildCoastWorld, WaterEdge } from '../../../lib/adventure/coast/zoneWorld';
import { ISLANDS, SANDBAR, mainlandShoreX, walkable } from '../../../lib/adventure/coast/zoneLayout';
import { besidePlayer, zonePartner, PartnerKeeper, COAST_PARTNER_CATCHUP_M, COAST_PARTNER_STUCK_SEC } from '../../../lib/adventure/coast/zonePartner';
const world = buildCoastWorld();
const partner = zonePartner(emptyAdventureSave(0)).partner;
const host = new AdventureHost({ world: world.source, save: { ...emptyAdventureSave(0), partner }, playerSpawn: world.spawn, partnerSpawn: { pos: besidePlayer(world.spawn.pos, world.spawn.yaw, { x: 0, y: 0, z: 0 }), yaw: world.spawn.yaw }, band: null });
const route: [number, number][] = [[mainlandShoreX(24) + 16, 24], [mainlandShoreX(-36) + 9, -36], [-20, -36], [SANDBAR.from[0], SANDBAR.from[1]], [SANDBAR.to[0], SANDBAR.to[1]], [ISLANDS[1].at[0], ISLANDS[1].at[1] + 6]];
let target = route[0];
host.setInputSource(host.playerId, (out) => { const p = host.player.pos; out.camYaw = Math.atan2(target[0] - p.x, target[1] - p.z); out.move.x = 0; out.move.y = 1; });
const e = new WaterEdge(world.spawn.pos);
const keeper = new PartnerKeeper();
const noKeep = process.argv.includes('--raw');
let t = 0;
for (const wp of route) {
  target = wp;
  for (let f = 0; f < 1200; f++) {
    host.frame(1 / 30); const back = e.hold(host.player); t += 1 / 30;
    const why = noKeep ? null : keeper.step(host.player, host.partnerActor!, 1 / 30, { catchupM: COAST_PARTNER_CATCHUP_M, stuckSec: COAST_PARTNER_STUCK_SEC, playerTurnedBack: back, reset: (id) => host.movement.reset(id) });
    if (why) console.log('CATCHUP', why, t.toFixed(1));
    const p = host.player, q = host.partnerActor!;
    if (f % 15 === 0) console.log(t.toFixed(1), 'p', p.pos.x.toFixed(1), p.pos.z.toFixed(1), p.pos.y.toFixed(2), 'spd', Math.hypot(p.vel.x, p.vel.z).toFixed(1), '| q', q.pos.x.toFixed(1), q.pos.z.toFixed(1), q.pos.y.toFixed(2), q.state, 'spd', Math.hypot(q.vel.x, q.vel.z).toFixed(1), 'gap', Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z).toFixed(1), walkable(q.pos.x, q.pos.z) ? '' : 'DEEP');
    if (Math.hypot(p.pos.x - wp[0], p.pos.z - wp[1]) < 2) break;
  }
}

console.log('counts', JSON.stringify(keeper.counts));
