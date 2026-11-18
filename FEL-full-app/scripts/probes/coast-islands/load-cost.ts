// COAST & ISLANDS: how long the zone's terrain sampling takes for the first stream (pure maths; no canvas in Node, so the
// textures and the GPU upload are not counted): every land piece coarse (9 × 9) and the full + LOD rings fine (33 × 33).
//   npx tsx scripts/probes/coast-islands/load-cost.ts
import { drawnY, terrainColor, COARSE_DIV, FINE_DIV } from '../../../lib/adventure/coast/zoneView';
import { ZoneStreamer, pieceAt, zonePieces, arrivalSpawn, PIECE_M, COAST_STREAM_FULL, COAST_STREAM_LOD, COAST_STREAM_KEEP } from '../../../lib/adventure/coast/zoneLayout';
const sample = (rect: { minX: number; maxX: number; minZ: number; maxZ: number }, div: number) => {
  let acc = 0; const step = PIECE_M / div;
  for (let r = 0; r <= div; r++) for (let c = 0; c <= div; c++) { const x = rect.minX + c * step, z = rect.minZ + r * step, y = drawnY(x, z, rect); acc += y + terrainColor(y, x, z).r; }
  return acc;
};
zonePieces();
for (let run = 0; run < 3; run++) {
  const s = new ZoneStreamer({ full: COAST_STREAM_FULL, lod: COAST_STREAM_LOD, keep: COAST_STREAM_KEEP });
  const sp = arrivalSpawn(); const [i, j] = pieceAt(sp.pos.x, sp.pos.z); s.step(i, j);
  const land = zonePieces().filter((p) => p.kind !== 'sea');
  const t0 = performance.now(); for (const p of land) sample(p.rect, COARSE_DIV);
  const t1 = performance.now(); const fineKeys = land.filter((p) => s.tiers.get(p.key) !== 'far'); for (const p of fineKeys) sample(p.rect, FINE_DIV);
  const t2 = performance.now();
  console.log(JSON.stringify({ coarsePieces: land.length, coarseMs: +(t1 - t0).toFixed(1), finePieces: fineKeys.length, fineMs: +(t2 - t1).toFixed(1), perFineMs: +((t2 - t1) / fineKeys.length).toFixed(2) }));
}
