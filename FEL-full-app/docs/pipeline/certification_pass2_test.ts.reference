// node --experimental-strip-types --import ./tools/ts_resolve.mjs \
//   --import ./tools/fel_batch_alias.mjs tests/certification_pass2_test.ts

import {
  MEASURED, movementOf, accuracy, demonstrated, broken, UNMEASURABLE,
} from '../core/CertificationPass2.ts';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x = '') => { c ? (pass++, console.log(`  ok   ${n}`)) : (fail++, console.log(`  FAIL ${n} ${x}`)); };

// ══ THE HEADLINE ═════════════════════════════════════════════════════════
{
  const a = accuracy();
  ok('BUILT WAS FALSE COMFORT FOUR TIMES — wait, more', a.falseComfort.length >= 4,
    a.falseComfort.join(','));
  ok('and every one of those read BUILT at the end of pass 1',
    a.falseComfort.every((id) => MEASURED.find((c) => c.id === id)!.pass1 === 'BUILT'));
  ok('and every one measures FAIL in the product now',
    a.falseComfort.every((id) => MEASURED.find((c) => c.id === id)!.pass2 === 'FAIL'));

  ok('TWO CRITERIA WERE BETTER THAN FEARED', a.better === 2, `${a.better}: ${a.falseAlarm.join(',')}`);
  ok('and they are boot and lifecycle', a.falseAlarm.sort().join() === 'boot,lifecycle');
  ok('so the register was noise, not a consistent bias', a.worse > 0 && a.better > 0);
  ok('the columns account for every criterion',
    a.confirmed + a.worse + a.better + a.stillUnknown === a.total);
}

// ══ WHAT IS ACTUALLY DEMONSTRATED ════════════════════════════════════════
{
  const d = demonstrated();
  ok('FOUR CRITERIA ARE NOW DEMONSTRATED, up from two', d.length === 4, `${d.length}`);
  ok('and the two new ones were measured in the product, not the repo',
    d.some((c) => c.id === 'boot') && d.some((c) => c.id === 'lifecycle'));
  ok('and procedural and tested are still the other two',
    d.some((c) => c.id === 'procedural') && d.some((c) => c.id === 'tested'));
  ok('every demonstrated criterion cites a batch that can be re-run',
    d.every((c) => c.source !== '—' && c.source.length > 1));
}

// ══ NOTHING CLAIMS ANYTHING WITHOUT EVIDENCE ═════════════════════════════
{
  ok('every criterion carries evidence', MEASURED.every((c) => c.evidence.length > 30));
  // `procedural` is exempt and stays exempt: it is a design property — no
  // external assets — and there is no number to cite. Padding it with one to
  // satisfy this check would be the opposite of what the check is for.
  ok('and the evidence contains a NUMBER wherever a number was measured',
    MEASURED.filter((c) => (c.pass2 === 'PASS' || c.pass2 === 'FAIL') && c.id !== 'procedural')
      .every((c) => /\d/.test(c.evidence)));
  ok('procedural is the ONLY criterion allowed to be qualitative',
    MEASURED.filter((c) => (c.pass2 === 'PASS' || c.pass2 === 'FAIL') && !/\d/.test(c.evidence))
      .map((c) => c.id).join() === 'procedural');
  ok('nothing is marked PASS on judgement — every PASS names its source',
    demonstrated().every((c) => c.source !== '—'));
  ok('and the one criterion with no source is the one nobody has measured',
    MEASURED.filter((c) => c.source === '—').every((c) => c.pass2 === 'UNKNOWN'));
}

// ══ THE BROKEN LIST IS THE WORK ══════════════════════════════════════════
{
  const b = broken();
  ok('six criteria measure FAIL', b.length === 6, `${b.length}: ${b.map((c) => c.id).join(',')}`);
  ok('and no_tpose is among them despite reading BUILT for six batches',
    b.some((c) => c.id === 'no_tpose'));
  ok('and its evidence names the actual cause, not the symptom',
    /Head bone/.test(b.find((c) => c.id === 'no_tpose')!.evidence));
  ok('canvas is FAIL even though a fix exists — because it is not deployed',
    b.some((c) => c.id === 'canvas')
    && /not deployed/.test(b.find((c) => c.id === 'canvas')!.evidence));
  ok('simulatable is FAIL even though dunk is clean — one clean mode is not the fleet',
    b.some((c) => c.id === 'simulatable'));
}

// ══ MOVEMENT IS COMPUTED, NOT ASSERTED ═══════════════════════════════════
{
  ok('BUILT → FAIL is worse-than-thought',
    movementOf({ id: 'x', pass1: 'BUILT', pass2: 'FAIL', evidence: 'e', source: 's' }) === 'worse-than-thought');
  ok('UNKNOWN → PASS is better-than-thought',
    movementOf({ id: 'x', pass1: 'UNKNOWN', pass2: 'PASS', evidence: 'e', source: 's' }) === 'better-than-thought');
  ok('PASS → PASS is confirmed',
    movementOf({ id: 'x', pass1: 'PASS', pass2: 'PASS', evidence: 'e', source: 's' }) === 'confirmed');
  ok('BUILT → UNKNOWN is still-unknown, NOT progress',
    movementOf({ id: 'x', pass1: 'BUILT', pass2: 'UNKNOWN', evidence: 'e', source: 's' }) === 'still-unknown');
  ok('SPECIFIED → FAIL is worse-than-thought',
    movementOf({ id: 'x', pass1: 'SPECIFIED', pass2: 'FAIL', evidence: 'e', source: 's' }) === 'worse-than-thought');
}

// ══ THE GAPS NAME THEIR INSTRUMENT ═══════════════════════════════════════
{
  ok('three things still cannot be measured from here', UNMEASURABLE.length === 3);
  ok('and each names what it would take, not just that it is missing',
    UNMEASURABLE.every((u) => u.needs.length > 20));
  ok('every unmeasurable criterion is actually UNKNOWN in the scorecard',
    UNMEASURABLE.every((u) => MEASURED.find((c) => c.id === u.id)?.pass2 === 'UNKNOWN'));
  ok('and fun is one of them, because only the founder can score it',
    UNMEASURABLE.some((u) => u.id === 'fun' && /founder/.test(u.needs)));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
