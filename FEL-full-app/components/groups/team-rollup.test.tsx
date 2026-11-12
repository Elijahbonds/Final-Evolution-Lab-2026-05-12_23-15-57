// PLAT-BBS04-2: the team roll-up's daily-drill checkbox is a 44 px tap target, and the row around it did not move.
//
// No DOM in this runner (node), so this holds the MARKUP the sizes come from; the pixels are measured in a real browser by
// scripts/probes/platform/team-rollup-tap.mts (390 and 1280 px: the input's box 44 x 44, the sentence starting where it
// did when the box was 20 x 20, the rig's 2.5.8 finding gone, a tap on the box's corner sending the one PATCH).
//   · the real <input type="checkbox"> is the target: h-11 w-11 (44 px), centred on a 20 px slot (-inset-3 = 12 px past
//     each edge), so the label's flex row lays out exactly as it did around the old 20 px box;
//   · what the eye sees (the box, the tick) is aria-hidden and never takes the tap;
//   · it is still one native checkbox inside its label: same name for a screen reader, same checked and disabled state.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeamRollup } from './team-rollup';
import type { Rollup } from '@/lib/groups/activity';

const rollup = (drillAssigned: boolean): Rollup => ({
  weekKey: '2026-W45',
  rows: [{ userId: 'a1', name: 'Jordan', minor: false, drillDays: 3, runsThisWeek: 2, runsLastWeek: 1, trend: 'up' }],
  totals: { athletes: 1, active: 1, drillDays: 3, runs: 2 },
  drillAssigned,
});
const html = (on: boolean) => renderToStaticMarkup(createElement(TeamRollup, { groupId: 'g1', rollup: rollup(on), onChanged: () => undefined }));
const classesOf = (tag: string): string[] => (/class="([^"]*)"/.exec(tag)?.[1] ?? '').split(/\s+/);

describe('the daily-drill checkbox', () => {
  const off = html(false);
  const label = /<label[^>]*>[\s\S]*?<\/label>/.exec(off)![0];
  const input = /<input[^>]*>/.exec(label)![0];
  const slot = /<span[^>]*data-rollup-drill-slot[^>]*>/.exec(label)![0];

  it('is one native checkbox, inside the label that names it', () => {
    expect(off.match(/<input/g)).toHaveLength(1);
    expect(input).toContain('type="checkbox"');
    expect(label).toContain('Assign the daily drill to the whole team');
    expect(input).not.toMatch(/aria-hidden|tabindex="-1"|opacity-0|sr-only/);
  });

  it('is a 44 px target: h-11 w-11, centred on its slot (12 px past each edge)', () => {
    const c = classesOf(input);
    expect(c).toEqual(expect.arrayContaining(['h-11', 'w-11', 'absolute', '-inset-3', 'appearance-none']));
    expect(c.some((x) => /^(h|w|size)-(?!11$)/.test(x))).toBe(false);   // no second size fighting the 44
  });

  it('leaves the row as it was: the slot is the 20 px the old box took, in the same label row', () => {
    const s = classesOf(slot);
    expect(s).toEqual(expect.arrayContaining(['relative', 'h-5', 'w-5', 'shrink-0']));
    expect(classesOf(/<label[^>]*>/.exec(label)![0])).toEqual(expect.arrayContaining(['flex', 'min-h-[44px]', 'items-center', 'gap-3', 'mt-3']));
    // slot → input → the drawn box → the tick → the sentence: nothing else in the row
    expect(label.replace(/\s(class|d|points|x1|x2|y1|y2|cx|cy|r|width|height|viewBox|fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|xmlns)="[^"]*"/g, ''))
      .toMatch(/^<label><span data-rollup-drill-slot="true"><input[^>]*\/><span aria-hidden="true"><\/span><svg[^>]*>.*<\/svg><\/span>Assign the daily drill to the whole team<\/label>$/);
  });

  it('what the eye sees never takes the tap, and follows the real box (checked, disabled, focus)', () => {
    const drawn = [...label.matchAll(/<(?:span|svg)[^>]*aria-hidden="true"[^>]*>/g)].map((m) => m[0]);
    expect(drawn).toHaveLength(2);   // the box and the tick
    for (const d of drawn) expect(classesOf(d)).toContain('pointer-events-none');
    expect(classesOf(input)).toContain('peer');
    expect(classesOf(drawn[0])).toEqual(expect.arrayContaining(['peer-checked:bg-fel-emerald', 'peer-disabled:opacity-50']));
    expect(classesOf(drawn[1])).toEqual(expect.arrayContaining(['opacity-0', 'peer-checked:opacity-100']));
    expect(classesOf(input).some((x) => x.startsWith('focus-visible:outline'))).toBe(true);
  });

  it('shows the team\'s setting: checked when the drill is assigned, not when it is not', () => {
    expect(input).not.toContain('checked=""');
    expect(/<input[^>]*>/.exec(html(true))![0]).toContain('checked=""');
  });
});
