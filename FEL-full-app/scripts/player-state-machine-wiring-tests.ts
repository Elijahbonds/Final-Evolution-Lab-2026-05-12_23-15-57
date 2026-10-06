#!/usr/bin/env -S npx tsx
// HOOPS-10PHASE-2 phase 4 — the explicit player state machine, wired into 1v1 and 3v3.
//
// PlayerStateMachine.ts (and its own vitest suite, PlayerStateMachine.test.ts) proves the FSM itself: every state
// reachable, edge-triggered entry, illegal transitions rejected, no double-fires. What that suite CANNOT prove —
// because the mode files are closures with nothing exported to call directly — is that the two live modes
// actually FEED it every frame rather than leaving it declared and unused. This mirrors the established pattern
// for mode-internal wiring (threevthree-depth-tests.ts section C, call-for-ball-tests.ts section A): read the
// mode's own source and assert the call is there.
//
// Run: npx tsx scripts/player-state-machine-wiring-tests.ts

import { readFileSync } from 'node:fs';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

for (const [name, path] of [['1v1', '../lib/babylon/modes/OneVOneMode.ts'], ['3v3', '../lib/babylon/modes/ThreeVThreeMode.ts']] as const) {
  const src = readFileSync(new URL(path, import.meta.url), 'utf8');
  ok(src.includes("import { PlayerStateMachine } from '../core/PlayerStateMachine';"), `${name} imports PlayerStateMachine`);
  ok(/const myStateMachine = new PlayerStateMachine\(\);/.test(src), `${name} instantiates one machine for the hero`);
  // IMPROVE (2026-10-06, 1v1 #11): 1v1 publishes through putHud (the machine is still updated every frame; the host hears only a change)
  ok(/(ctx\.setHud\(|putHud\(ctx, )\{ playerState: myStateMachine\.update\(\{/.test(src), `${name} publishes playerState from a fresh update() call every frame, not a stale read`);
  ok(/shooting, dunking,/.test(src) && /myStateMachine\.update/.test(src), `${name}'s update() call reads the SAME shooting/dunking booleans the mode's own control flow already uses (no second source of truth)`);
}

// 1v1 has no teammate to pass to — the call site must say so explicitly, not quietly omit the field
{
  const onevone = readFileSync(new URL('../lib/babylon/modes/OneVOneMode.ts', import.meta.url), 'utf8');
  ok(/passing: false \/\* 1v1 has no teammate to pass to \*\//.test(onevone), "1v1's call documents why passing is always false, rather than silently never reaching 'pass'");
}
// 3v3's pass state reads the SAME lastPasserWasMe + passFlight.active pair the assist-credit logic already trusts
{
  const threevthree = readFileSync(new URL('../lib/babylon/modes/ThreeVThreeMode.ts', import.meta.url), 'utf8');
  ok(/passing: lastPasserWasMe && passFlight\.active/.test(threevthree), "3v3's call reads lastPasserWasMe && passFlight.active for 'pass' — the same pair the assist credit (line ~1945) already trusts, not a new flag");
}

if (fail.length) {
  console.error(`player-state-machine-wiring-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`player-state-machine-wiring-tests: ${checks} checks green`);
