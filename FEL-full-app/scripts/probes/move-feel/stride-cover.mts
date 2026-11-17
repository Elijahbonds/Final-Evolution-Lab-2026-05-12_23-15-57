// move-feel / stride-cover — do the feet cover the ground the body covers? (lane/move-feel, 2026-11-12). Pure, from the code: for each
// stick the handler can hold, the speed it settles at (the real DribbleController), the locomotion state the hoops tree picks at that speed
// (basketballTree's ball-carrier thresholds: speed01 0.15 / 0.42 / 0.74 of 6.4 m/s), the playback rate StrideMatch gives that state's clip
// (HOOPS_STRIDE_CAPTURE, the captured hero's table) and the ground those feet cover (rate × the clip's own speed). cover / speed under 1 =
// the body outruns its feet (the planted foot slides forward); a state with no stride (the idle dribble) covers nothing.
//   npx tsx scripts/probes/move-feel/stride-cover.mts
import BC from '../../../lib/babylon/core/BasketballCore';
import SM from '../../../lib/babylon/core/StrideMatch';
const { DribbleController } = BC as unknown as typeof import('../../../lib/babylon/core/BasketballCore');
const { rateFor, HOOPS_STRIDE_CAPTURE, strideKindFor } = SM as unknown as typeof import('../../../lib/babylon/core/StrideMatch');

const DT = 1 / 60, TOP = 6.4;
const settle = (mag: number, sprint = false) => { const d = new DribbleController(); for (let t = 0; t < 1.5; t += DT) d.update(DT, 0, -mag, sprint); return d.vel.length(); };
/** basketballTree's pick for a ball carrier moving forward (no move, no drive, travel on the facing). */
const stateAt = (v: number) => { const s01 = v / TOP; return s01 > 0.15 ? (s01 < 0.42 ? 'walk_dribble' : s01 > 0.74 ? 'sprint_dribble' : 'speed_dribble') : 'idle_dribble'; };
const ref = (state: string) => { const R = HOOPS_STRIDE_CAPTURE; const k = strideKindFor(state); return R.byState?.[state] ?? (k === 'run' ? R.run : k === 'sprint' ? R.sprint ?? R.run : k === 'slide' ? R.slide : k === 'walk' ? R.walk! : k === 'jog' ? R.jog! : 0); };
console.log('stick  speed  state            rate   feet cover  cover/speed');
for (const [mag, sprint] of [[0.1, false], [0.15, false], [0.2, false], [0.3, false], [0.4, false], [0.44, false], [0.46, false], [0.6, false], [0.8, false], [1, false], [1, true]] as const) {
  const v = settle(mag, sprint); const st = stateAt(v); const r = rateFor(st, v, HOOPS_STRIDE_CAPTURE); const cover = r === null ? 0 : r * ref(st);
  console.log(`${String(mag).padEnd(5)}${sprint ? 'T' : ' '} ${v.toFixed(2).padStart(5)}  ${st.padEnd(15)}  ${r === null ? '  -  ' : r.toFixed(2).padStart(5)}  ${cover.toFixed(2).padStart(9)}  ${(v > 0 ? cover / v : 0).toFixed(2).padStart(10)}`);
}
// the speeds each locomotion state spans while the body passes through it, and where its feet stop keeping up
for (const st of ['walk_dribble', 'speed_dribble', 'sprint_dribble', 'defend_slide', 'defend_slide_right', 'carry_slide', 'carry_back']) {
  const r = (v: number) => rateFor(st, v, HOOPS_STRIDE_CAPTURE)!; const top = ref(st) * (HOOPS_STRIDE_CAPTURE.rateMaxByState?.[st] ?? 1.85), floor = ref(st) * 0.55;
  console.log(`${st.padEnd(19)} clip ${ref(st).toFixed(2)} m/s; feet keep up from ${floor.toFixed(2)} to ${top.toFixed(2)} m/s (rate ${r(floor).toFixed(2)}–${r(top).toFixed(2)})`);
}
