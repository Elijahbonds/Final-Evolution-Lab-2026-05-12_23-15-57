// improve-hoops-2 phase 4a: the ghost shot — after each of my 1v1 makes ("[1V1-JUICE] jumper make"), was a gather, a dunk or a finish
// started inside the make beat (40 game frames: the beat is 0.7 s, the check-up resets at 42)? HOOPS-PLAY-AUDIT §3.6's read: 10 of 31 makes. And 4b's stalls:
// boards the mode gave up on ("nobody came down with it") and the chase's detours.
//   node scripts/probes/improve-hoops/makebeat.mjs <run.json> [...]
import fs from 'node:fs';
const tot = { makes: 0, ghosts: 0, stalls: 0, detours: 0, boards: 0 };
for (const f of process.argv.slice(2)) {
  const r = JSON.parse(fs.readFileSync(f, 'utf8')); const L = r.log || [];
  const makes = L.filter((l) => /\[1V1-JUICE\] jumper make/.test(l.m));
  let ghosts = 0;
  for (const mk of makes) if (L.some((l) => l.f > mk.f && l.f <= mk.f + 40 && /\[1V1-SHOT\] gather|\[1V1-MOVE\] (finish|dunk|hop step|euro|step)|\[1V1-DUNK\]/.test(l.m))) ghosts++;
  const stalls = L.filter((l) => /nobody came down with it/i.test(l.m)).length;
  const boards = L.filter((l) => /\[1V1-BOARD\]|board (to|by|won)|rebound by/i.test(l.m) && !/chase steps round/.test(l.m)).length;
  const detours = L.filter((l) => /chase steps round a body/.test(l.m)).length;
  tot.makes += makes.length; tot.ghosts += ghosts; tot.stalls += stalls; tot.detours += detours; tot.boards += boards;
  console.log(`${f.split('/').pop()}\tmakes ${makes.length}\tghost ${ghosts}\tstalls ${stalls}\tdetours ${detours}\tboard lines ${boards}`);
}
console.log(`total\tmakes ${tot.makes}\tghost ${tot.ghosts}\tstalls ${tot.stalls}\tdetours ${tot.detours}`);
