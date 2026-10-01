// The Mirror's correctives page (MIRROR-COACH P9, 2026-09-30), rendered on the server the way the page renders it: the
// picker and the three sections for an adult; the program with its retest schedule and the last retest; the honest line
// when sets are not kept; the intake hold; and, under youth rules, the reason and nothing else.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CorrectivesView, doseLadderLine } from './correctives-view';
import {
  CORRECTIVES_INTAKE_FIRST, CORRECTIVES_YOUTH_OFF, PRESS_ROW_PATTERN_ID, PROGRAM_NOT_KEPT, programView, type SavedSetRow,
} from '@/lib/mirror/correctives';
import { PROGRAM_DISCLAIMER } from '@/lib/mirror/program';
import { CAMERA_NOT_DIAGNOSIS, type YouthGate } from '@/lib/mirror/screenCorrectives';
import { screenText } from '@/lib/share/screen';
import { CORRECTIVE_CAUTION } from '@/lib/babylon/nexus/neuro-mirror/rules/rnt-breath';

const row = (at: number, faultCounts: Record<string, number>): SavedSetRow => ({ patternId: PRESS_ROW_PATTERN_ID, startedAt: new Date(at), reps: 10, faultCounts });
const render = (youth: YouthGate, rows: SavedSetRow[] = [], opts: { keeping?: boolean; hold?: string | null } = {}) =>
  renderToStaticMarkup(createElement(CorrectivesView, { youth, hold: opts.hold ?? null, program: programView(rows, youth, { keeping: opts.keeping ?? true }) }));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ');

describe('an adult', () => {
  it('the picker names the three correctives and each section is there to land on', () => {
    const html = render(null);
    expect([...html.matchAll(/<a[^>]*href="#([\w-]+)"/g)].map((m) => m[1])).toEqual(['band-drills', 'release', 'program']);
    for (const id of ['band-drills', 'release', 'program']) expect(html).toContain(`id="${id}"`);
  });

  it('every band drill says what it answers, and the dose ladder comes from the prescriber', () => {
    const html = render(null);
    expect([...html.matchAll(/data-band="(\w+)"/g)].map((m) => m[1])).toEqual(['trunkShift', 'elbowPath', 'shoulderRise']);
    const t = text(html);
    expect(t).toContain(doseLadderLine());
    expect(doseLadderLine()).toBe('2 x 5 with a 3s hold; the more a set drifted, the more it earns, up to 3 x 6 with a 5s hold.');
    expect(t).toMatch(/For a set where the camera read .* \(estimated\)\./);
  });

  it('the release lists the three that remain — no middle-zone pin — each with its avoid line', () => {
    const html = render(null);
    expect([...html.matchAll(/data-release-zone="(\w+)"/g)].map((m) => m[1])).toEqual(['posterior_chain', 'lat_rhomboid', 'upper_traps']);
    expect(text(html)).not.toMatch(/under the (lower )?ribs|front of the hip bone|hip flexor|psoas/i);
    expect((text(html).match(/that is nerve/g) ?? []).length).toBe(3);
  });

  it('the program with its retest schedule', () => {
    const html = render(null, [row(1, { upper_traps: 3 }), row(2, { upper_traps: 4 })]);
    expect(html).toContain('data-block="release"');
    expect(text(html)).toContain('Retest in 4 press/row sets in the Mirror.');
    expect(text(html)).toContain(PROGRAM_DISCLAIMER);
    expect(html).not.toContain('data-last-retest');
  });

  it('after a retest, what it showed, under the title of the block that was worked on', () => {
    const rows = [row(1, { upper_traps: 3 }), row(2, { upper_traps: 4 }), row(3, {}), row(4, {}), row(5, {}), row(6, {})];
    const html = render(null, rows);
    expect(html).toContain('data-last-retest');
    expect(text(html)).toMatch(/Last retest .*: Showing up less often than it was\./);
  });

  it('sets not kept on this account: says so, instead of promising a program', () => {
    const html = render(null, [], { keeping: false });
    expect(text(html)).toContain(text(PROGRAM_NOT_KEPT).trim());
    expect(html).not.toContain('data-retest-schedule');
  });

  it('held by the intake: the line and the way to the Mirror, nothing else', () => {
    const html = render(null, [row(1, { upper_traps: 3 }), row(2, { upper_traps: 4 })], { hold: CORRECTIVES_INTAKE_FIRST });
    expect(html).toContain('data-correctives-hold');
    expect(html).not.toContain('data-band');
    expect(html).not.toContain('data-release-zone');
    expect(html).not.toContain('data-program');
  });
});

describe('youth rules', () => {
  for (const youth of ['minor', 'unknownAge'] as const) {
    it(`${youth}: the reason, and none of the correctives`, () => {
      const html = render(youth, [row(1, { upper_traps: 3 }), row(2, { upper_traps: 4 })]);
      expect(text(html)).toContain(text(CORRECTIVES_YOUTH_OFF[youth]).trim());
      for (const m of ['data-band', 'data-release-zone', 'data-program', 'data-corrective-picker']) expect(html).not.toContain(m);
    });
  }
});

describe('honesty', () => {
  it('every line on the page passes the screen rules, and it closes on "what the camera saw"', () => {
    const t = text(render(null, [row(1, { upper_traps: 3 }), row(2, { upper_traps: 4 })]));
    // the three denials are the only lines that say "diagnosis" — they say it to deny it
    for (const denial of [CAMERA_NOT_DIAGNOSIS, CORRECTIVE_CAUTION, PROGRAM_DISCLAIMER]) expect(t).toContain(denial);
    const rest = [CAMERA_NOT_DIAGNOSIS, CORRECTIVE_CAUTION, PROGRAM_DISCLAIMER].reduce((acc, d) => acc.split(d).join(' '), t);
    expect(screenText(rest)).toEqual([]);
    expect(t).not.toMatch(/prevent|reduces? (the |your )?risk|\bRNT\b|pin-and-stretch/i);
  });
});
