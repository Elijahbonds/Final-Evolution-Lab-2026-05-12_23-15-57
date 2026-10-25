// JUMP-PRO: the session card and the slow-mo entry, rendered (components/jump). Adults only is the caller's rule
// (assess-app mounts both on !kid) and is checked in the source; the trust hook hides the card on Low.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JumpSessionCard } from '@/components/jump/jump-session-card';
import { SlowMoUpload } from '@/components/jump/slowmo-upload';
import { buildTake, filmTake } from '@/lib/jump/ballistic';
import { calibrateTake } from '@/lib/jump/bench';
import { gradeT5 } from '@/lib/assess/graders/t5-cmj';

const t5 = (() => {
  const take = buildTake([0.42, 0.45, 0.43].map((m, i) => ({ trial: { heightM: m, ...(i === 1 ? { landKnee: 0.2 } : {}) } })), { leadS: 3.2 });
  const { frames } = filmTake(take, { fps: 60, seed: 4 });
  const cal = calibrateTake(frames)!;
  return gradeT5(frames, { calibration: cal, aspect: cal.aspect }).t5;
})();

describe('the session card', () => {
  const html = renderToStaticMarkup(createElement(JumpSessionCard, { t5 }));
  it('every jump with its ±, the set, the real-change line, the verified line and one tip', () => {
    expect(html.match(/data-jump-row=/g)).toHaveLength(3);
    expect(html).toMatch(/±\d\.\d/);
    expect(html).toContain('data-jump-mean');
    expect(html).toMatch(/a change of \d\.\d in or more is a real change/);
    expect(html).toContain('landed low, corrected');
    expect(html).toMatch(/data-jump-verified="(true|false)"/);
    expect(html).toContain('Land tall, on your toes');
  });
  it('PR #424\'s Low hides it (that PR hides the number too); nothing to show, nothing rendered', () => {
    expect(renderToStaticMarkup(createElement(JumpSessionCard, { t5, trustLevel: 'low' }))).toBe('');
    expect(renderToStaticMarkup(createElement(JumpSessionCard, { t5: null }))).toBe('');
  });
  it('assess-app mounts the card and the slow-mo reader for adults only', () => {
    const src = readFileSync(join(__dirname, '../../app/play/mirror/assess/_components/assess-app.tsx'), 'utf8');
    expect(src).toMatch(/jumpView && !jumpView\.kid \? <JumpSessionCard/);
    expect(src).toMatch(/jumpView && !jumpView\.kid \? <SlowMoUpload/);
  });
});

describe('the slow-mo reader', () => {
  it('opens from one button; the file is read on the phone and the steps say so', () => {
    expect(renderToStaticMarkup(createElement(SlowMoUpload, {}))).toContain('Read a slow-motion video');
    const src = readFileSync(join(__dirname, '../../components/jump/slowmo-upload.tsx'), 'utf8');
    expect(src).toContain('never uploaded');
    expect(src).not.toMatch(/fetch\(|sendBeacon|XMLHttpRequest/);
  });
});
