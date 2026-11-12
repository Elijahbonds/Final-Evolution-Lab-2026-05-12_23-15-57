// hoops-p05: THE CARRY'S LET-GO in the step-back jumper. Reads an input run recorded with TESTS=stepback POP_LIST=1
//   (drive.mjs onevone input <out>; before: FEEL='{"hoops.carryLetGoToClipOn":0}', after: no FEEL)
//   node letgo.mjs <input-run.json> [<input-run.json> ...]
// Per step-back: the log lines, the hero's ARM pops from the flick to a second after the release (bone, frame, deg/s; severe >= 3000),
// and the layer events the stage tracer filed on the arm bones in that window (which layer turned the arm, the most it turned).
import fs from 'node:fs';
const ARM = /Arm|Hand|Shoulder/;
for (const file of process.argv.slice(2)) {
  const R = JSON.parse(fs.readFileSync(file, 'utf8'));
  const tests = (R.tests && R.tests.stepback) || []; const H = R.heroMotion || {}; const pops = H.popList || []; const ev = (R.stageEv || []).filter((e) => e[1] === 'me');
  console.log(`\n${file.split('/').slice(-1)[0]} — feel ${JSON.stringify(R.feel)}; hero over the whole run: pops ${H.pops}, severe ${H.severe}; ${tests.length} step-backs`);
  let worstAll = 0, severeAll = 0;
  tests.forEach((t, k) => {
    const a = t.f0, b = t.f0 + (t.endF ?? (t.releaseF ?? 0) + 60);
    const lines = (R.log || []).filter((l) => l.f >= a && l.f <= b && /stepback|gather|release|STEP/i.test(l.m)).map((l) => `${l.f - a}: ${l.m.slice(0, 70)}`);
    const arm = pops.filter((p) => p[0] >= a && p[0] <= b && ARM.test(p[1]));
    const worst = arm.reduce((m, p) => Math.max(m, p[2]), 0); const sev = arm.filter((p) => p[2] >= 3000).length; worstAll = Math.max(worstAll, worst); severeAll += sev;
    console.log(`  step-back ${k + 1} (frames ${a}..${b}; flick logged +${t.logF}, gather +${t.gatherF}, release +${t.releaseF}): arm pops ${arm.length}, severe ${sev}, worst ${worst} deg/s`);
    for (const l of lines.slice(0, 6)) console.log(`      ${l}`);
    for (const p of arm.sort((x, y) => y[2] - x[2]).slice(0, 6)) console.log(`      pop +${p[0] - a} ${p[1]} ${p[2]} deg/s`);
    const by = new Map(); for (const e of ev) { if (e[0] < a || e[0] > b || !ARM.test(e[2])) continue; const key = String(e[3]).slice(0, 70); const m = by.get(key) || { n: 0, max: 0, at: 0, bone: '' }; m.n++; if (e[4] > m.max) { m.max = e[4]; m.at = e[0] - a; m.bone = e[2]; } by.set(key, m); }
    for (const [key, m] of [...by.entries()].sort((x, y) => y[1].max - x[1].max).slice(0, 5)) console.log(`      layer ${key}: ${m.n} events over 600 deg/s, most ${m.max} (${m.bone}, +${m.at})`);
  });
  console.log(`  => the worst arm turn in a step-back ${worstAll} deg/s; severe arm pops ${severeAll}`);
}
