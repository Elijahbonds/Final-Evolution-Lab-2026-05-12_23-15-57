// JUMP-TESTS: the jump tools' copy makes no accuracy claim (owner rule, until the force-plate pilot), and the new panels
// are adults only — a kid or a teen sees none of them, so no power and no weight question ever reaches one.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CLAIM_WORDS, withoutComments } from '@/tests/helpers/claimFree';
import { PROTOCOLS, PROTOCOL_IDS, PROTOCOL_WHY, RJ_WHY } from '@/lib/jump/protocols';
import { TRIAL_TIPS } from '@/lib/jump/session';
import { BLOCK_WORDS, FLAG_WORDS } from '@/components/jump/jump-session-card';
import { SLOWMO_STEPS, SlowMoUpload } from '@/components/jump/slowmo-upload';
import { SIDE_STEPS } from '@/components/jump/side-jump-upload';
import { HISTORY_CSV_HEADER, HISTORY_TEST_NAMES } from '@/lib/jump/historyStore';
import { JumpMore } from '@/components/jump/jump-more';
import { JumpTests } from '@/components/jump/jump-tests';
import { JumpHistory } from '@/components/jump/jump-history';
import { FvProfile } from '@/components/jump/fv-profile';
import { PilotCapture } from '@/components/jump/pilot-capture';
import { JumpVelocity } from '@/components/jump/jump-velocity';
import { jumpKinematics } from '@/lib/jump/velocity';
import { protocolTake } from '@/lib/jump/protocolBench';
import { readProtocolClip } from '@/lib/jump/protocols';

const ROOT = join(__dirname, '../..');

describe('claim-free copy', () => {
  it('the guard catches what it is for (and lets "not a force-plate reading" through)', () => {
    for (const bad of ['Lab-grade read', 'accurate to the centimetre', 'validated jump', 'within ±1 cm', 'as good as a force plate', 'precise height', 'force-plate quality']) expect(bad).toMatch(CLAIM_WORDS);
    expect('An estimate, not a force-plate reading.').not.toMatch(CLAIM_WORDS);
    expect('Verified jump').not.toMatch(CLAIM_WORDS);
  });
  it('every copy table of the jump tools', () => {
    const all = [
      ...PROTOCOL_IDS.flatMap((id) => [PROTOCOLS[id].name, PROTOCOLS[id].short, ...PROTOCOLS[id].steps]),
      ...Object.values(PROTOCOL_WHY), ...Object.values(RJ_WHY), ...Object.values(TRIAL_TIPS), ...Object.values(BLOCK_WORDS),
      ...Object.values(FLAG_WORDS), ...SLOWMO_STEPS, ...Object.values(SIDE_STEPS).flat(), ...Object.values(HISTORY_TEST_NAMES), ...HISTORY_CSV_HEADER,
    ];
    for (const s of all) expect(s).not.toMatch(CLAIM_WORDS);
  });
  it('every string and JSX text in components/jump (comments aside)', () => {
    const dir = join(ROOT, 'components/jump');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.tsx'))) {
      expect(withoutComments(readFileSync(join(dir, f), 'utf8')), f).not.toMatch(CLAIM_WORDS);
    }
  });
  it('the velocity read and the slow-mo entry, rendered: estimates, said so', () => {
    const r = readProtocolClip(protocolTake('cmjHips', { fps: 120, seed: 1 }).frames, 4 / 3, 'cmjHips');
    if (!r.ok) throw new Error(r.why);
    const kin = new Map(r.t5.jumps.map((j) => [j.index, jumpKinematics(j, { frames: r.frames, front: r.front, countermovement: true })]));
    const html = renderToStaticMarkup(createElement(JumpVelocity, { t5: r.t5, kin }));
    expect(html).toContain('estimates');
    expect(html).toMatch(/\d\.\d\d m\/s/);
    expect(html).toContain('RSI-mod');
    // a jump's own ± beside its number is the read's uncertainty, not a claim: only the words are checked here
    expect(html.replace(/±\d+(\.\d+)?/g, '')).not.toMatch(CLAIM_WORDS);
    expect(renderToStaticMarkup(createElement(SlowMoUpload, {}))).not.toMatch(CLAIM_WORDS);
  });
});

describe('adults only', () => {
  it('a kid or a teen sees none of the new panels (and so no power and no weight question)', () => {
    for (const el of [
      createElement(JumpMore, { adult: false, bestHeightCm: 40 }),
      createElement(JumpTests, { adult: false }),
      createElement(JumpHistory, { adult: false, storage: null }),
      createElement(FvProfile, { adult: false, reads: [{ id: 'a', label: 'x', loadKg: 0, heightCm: 40, plusMinusCm: 2, pushOffCm: 35, cmj: true }] }),
      createElement(PilotCapture, { adult: false, enabled: true }),
    ]) expect(renderToStaticMarkup(el)).toBe('');
  });
  it('an adult sees the tests, the history and (with the flag off) no pilot panel', () => {
    const html = renderToStaticMarkup(createElement(JumpMore, { adult: true, bestHeightCm: 40, storage: null }));
    expect(html).toContain('data-tests-open');
    expect(html).toContain('data-history-open');
    expect(html).not.toContain('data-pilot');
    expect(renderToStaticMarkup(createElement(JumpMore, { adult: true, bestHeightCm: 40, storage: null, pilot: true }))).toContain('data-pilot');
  });
  it('the weight is asked only in the power panel, which is the adults-only one', () => {
    const html = renderToStaticMarkup(createElement(FvProfile, { adult: true, reads: [{ id: 'a', label: 'Squat jump', loadKg: 0, heightCm: 35, plusMinusCm: 2, pushOffCm: 33, cmj: false }] }));
    expect(html).toContain('data-fv-weight');
    expect(html).toMatch(/not saved or sent/);
    for (const f of ['components/jump/jump-tests.tsx', 'components/jump/jump-history.tsx', 'lib/jump/historyStore.ts']) {
      expect(withoutComments(readFileSync(join(ROOT, f), 'utf8')), f).not.toMatch(/massKg|body ?weight|lbToKg\(n\)\s*:\s*n\)\s*;?\s*$/im);
    }
  });
  it('assess-app hands the live read to the adult panel only', () => {
    const src = readFileSync(join(ROOT, 'app/play/mirror/assess/_components/assess-app.tsx'), 'utf8');
    expect(src).toMatch(/jumpView && !jumpView\.kid \? <JumpMore adult [^>]*t5=\{carryRef\.current\?\.t5 \?\? null\}/);
  });
});
