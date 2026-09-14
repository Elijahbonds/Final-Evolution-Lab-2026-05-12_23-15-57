import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// CLAIM-NOT-BLOCK. /try is a guest run that is saved nowhere, so any CLAIM that navigates the
// tab to /signup throws the night — and GO AGAIN — away. The claim may only open the soft sheet,
// and the sheet's sign-up may only open in a new tab. Source scan, because the failure is a
// single attribute on a link and a render test would need the whole Babylon stage to see it.
const src = readFileSync(path.resolve(__dirname, '../../components/games/guest-dunk-shell.tsx'), 'utf8');

/** Every JSX element that carries `href={claimHref}`, as its full opening tag. */
function claimAnchors(s: string): string[] {
  const out: string[] = [];
  const re = /<(Link|a)\b[^>]*?href=\{claimHref\}[^>]*>/gs;
  for (let m = re.exec(s); m; m = re.exec(s)) out.push(m[0]);
  return out;
}

describe('CLAIM-NOT-BLOCK: the guest claim never leaves /try', () => {
  it('the only claim href is a plain <a> that opens a new tab', () => {
    const anchors = claimAnchors(src);
    expect(anchors).toHaveLength(1);
    const [a] = anchors;
    expect(a.startsWith('<a')).toBe(true);           // not next/link — that is a same-tab client navigation
    expect(a).toMatch(/target="_blank"/);
    expect(a).toMatch(/rel="[^"]*noopener[^"]*"/);
  });

  it('no same-tab /signup link, router push or location write anywhere in the shell', () => {
    expect(src).not.toMatch(/<Link[^>]*href=\{?['"`]\/signup/s);
    expect(src).not.toMatch(/router\.(push|replace)\(/);
    expect(src).not.toMatch(/(window\.)?location\.(href|assign|replace)/);
  });

  it('every CLAIM button only opens the sheet', () => {
    const opens = src.match(/onClick=\{\(\) => setClaimOpen\(true\)\}/g) ?? [];
    expect(opens.length).toBeGreaterThanOrEqual(2);   // the card slot + the header link
  });

  it('GO AGAIN stays primary: the card slot sits under the Babylon card, and the fallback card leads with GO AGAIN', () => {
    expect(src).toMatch(/cardSlot=\{cards === 1 \? claimLink : null\}/);
    const fallbackGo = src.indexOf('onClick={replay}');
    const fallbackClaim = src.indexOf('{claimLink}', fallbackGo);
    expect(fallbackGo).toBeGreaterThan(-1);
    expect(fallbackClaim).toBeGreaterThan(fallbackGo);
    // the Babylon engine is never keyed, so dismissing the claim cannot remount (and cold-boot) the stage
    expect(src).not.toMatch(/<DunkBabylon[^>]*key=/s);
  });
});

describe('CLAIM-NOT-BLOCK: the sheet owns the keyboard while it is open', () => {
  it('swallows keydown in the capture phase, so Esc (= START = pause in InputBus) never reaches the mode', () => {
    expect(src).toMatch(/addEventListener\('keydown', onKey, true\)/);
    expect(src).toMatch(/e\.stopPropagation\(\)/);
    expect(src).not.toMatch(/addEventListener\('keyup'/);   // keyups must still release latches in the mode
    const bus = readFileSync(path.resolve(__dirname, '../../lib/babylon/core/InputBus.ts'), 'utf8');
    // the capture listener only wins if the bus listens in the bubble phase
    expect(bus).toMatch(/window\.addEventListener\('keydown', this\.onKey\);/);
  });
});
