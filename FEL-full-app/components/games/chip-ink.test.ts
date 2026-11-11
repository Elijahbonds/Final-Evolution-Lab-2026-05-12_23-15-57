// SCREEN-FIXES-2 (2026-11-11): the start card's picked chips at AA (components/games/chip-ink.ts). The every-screen crawl
// measured the picked PLACE chip at 3.51-4.15:1 on sprint, tennis, soccer and Brain Brawl: black letters on each game's own
// dark colour. Every colour stays exactly as it is; only the letters change, and only where black fails.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as wcagNs from '@/lib/a11y/wcag';
import { CHIP_AA, CHIP_INK_DARK, chipInk, pickedChip } from './chip-ink';
import { SplashCard } from './boot-splash';
import { PLACE_LOOKS } from '@/lib/babylon/nexus/placeLooks';
import { COURT_LOCATIONS } from '@/lib/babylon/nexus/courtLocations';
import { BALL_SKINS } from '@/lib/babylon/nexus/ballSkins';
import { readyVenues, type BoardDiscipline } from '@/lib/babylon/nexus/boardVenues';
import { skinsFor } from '@/lib/babylon/nexus/boardSkins';
import { readyWeathers, WEATHER_FAMILY_OF } from '@/lib/babylon/nexus/weather';
import { arenasFor, COMBAT_MODE_IDS } from '@/lib/babylon/combat/arenas';
import { COURT_LAYOUTS } from '@/lib/babylon/nexus/courtLayout';
import { SET_LENGTH_MODES, setLengthsFor } from '@/lib/babylon/nexus/setLength';
import { readyMusicStages } from '@/lib/babylon/music/musicStage';
import { readyCourses } from '@/lib/babylon/core/RaceCourse';
import { readyVehicles } from '@/lib/babylon/racing/garage';
import { readyWeapons } from '@/lib/babylon/combat/arsenal';
import { readySchools } from '@/lib/babylon/combat/schools';
import { tierList } from '@/lib/babylon/core/Difficulty';

const { contrastRatio, parseColor } = ((wcagNs as { default?: unknown }).default ?? wcagNs) as typeof wcagNs;
const ratio = (ink: string, fill: string) => contrastRatio(parseColor(ink)!, parseColor(fill)!);

/** Every colour a picked chip on the start card can be filled with, by picker. */
function allTints(): [string, string][] {
  const out: [string, string][] = [];
  const add = (picker: string, tints: string[]) => { for (const t of tints) out.push([picker, t]); };
  add('place', Object.values(PLACE_LOOKS).flat().map((l) => l.tint));
  add('location', Object.values(COURT_LOCATIONS).map((l) => l.tint));
  add('ball', Object.values(BALL_SKINS).map((b) => b.tint));
  for (const d of ['skate', 'snow', 'surf'] as BoardDiscipline[]) {
    add(`venue:${d}`, readyVenues(d).map((v) => v.palette.accent));
    add(`deck:${d}`, skinsFor(d).map((s) => s.tint));
  }
  for (const fam of new Set(Object.values(WEATHER_FAMILY_OF))) add(`weather:${fam}`, readyWeathers(fam).map((w) => w.tint));
  for (const m of COMBAT_MODE_IDS) add(`arena:${m}`, arenasFor(m).map((a) => a.tint));
  add('court', COURT_LAYOUTS.map((l) => l.tint));
  for (const m of SET_LENGTH_MODES) add(`set:${m}`, setLengthsFor(m).map((l) => l.tint));
  add('stage', readyMusicStages().map((s) => s.tint));
  for (const r of ['kart', 'aero'] as const) {
    add(`map:${r}`, readyCourses(r).map((c) => c.tint));
    add(`ride:${r}`, readyVehicles(r).map((v) => v.tint));
  }
  add('weapon', readyWeapons().map((w) => w.tint));
  add('school', readySchools().map((s) => s.tint));
  add('opponent', tierList().map((t) => t.tint));
  return out;
}

/** The picked chip of a rendered card (aria-pressed="true", first match after `label`): its fill and its letters. */
function pickedAfter(html: string, label: string): { fill: string; ink: string; name: string } {
  const from = html.indexOf(`>${label}</p>`);
  expect(from, `${label} picker on the card`).toBeGreaterThan(-1);
  const m = html.slice(from).match(/<button[^>]*aria-pressed="true"[^>]*>([^<]*)/);
  expect(m, `a picked ${label} chip`).toBeTruthy();
  const tag = m![0];
  const style = tag.match(/style="([^"]*)"/)?.[1] ?? '';
  const fill = style.match(/background:([^;]+)/)?.[1].trim() ?? '';
  // the letters: an inline colour, else the class the old card used (`text-black`)
  const ink = style.match(/(?:^|;)color:([^;]+)/)?.[1].trim() ?? (/\btext-black\b/.test(tag) ? '#000000' : '#ffffff');
  return { fill, ink, name: m![1] };
}

describe('the start card\'s picked chips are readable on their own colour', () => {
  it('every colour a picker can fill a chip with gets letters at AA (4.5:1)', () => {
    const tints = allTints();
    expect(tints.length).toBeGreaterThan(60);
    const failing = tints.filter(([, t]) => ratio(chipInk(t), t) < CHIP_AA).map(([p, t]) => `${p} ${t} ${ratio(chipInk(t), t).toFixed(2)}`);
    expect(failing).toEqual([]);
  });

  it('a colour black already reads on keeps its black letters (nothing changes where nothing was wrong)', () => {
    for (const [, t] of allTints()) if (ratio(CHIP_INK_DARK, t) >= CHIP_AA) expect(chipInk(t), t).toBe(CHIP_INK_DARK);
  });

  it('the fill and the border are the pick\'s own colour, unchanged', () => {
    expect(pickedChip('#2B6CB0')).toEqual({ background: '#2B6CB0', borderColor: '#2B6CB0', color: '#ffffff' });
    expect(pickedChip('#ffd166')).toEqual({ background: '#ffd166', borderColor: '#ffd166', color: '#000000' });
  });

  // the four games the crawl measured, as a phone first sees them: the home place picked
  for (const [modeId, place, was] of [['sprint', 'Stadium Straight', 3.51], ['tennis', 'Center Court', 3.87], ['penalty', 'Global Pitch', 4.14], ['brainbrawl', 'Neuro Arena', 4.15]] as const) {
    it(`${modeId}: the picked PLACE chip (${place}, ${was}:1 before) is at AA, on the same colour`, () => {
      const html = renderToStaticMarkup(createElement(SplashCard, { modeId, title: 'T', phase: 'ready', onStart: () => {}, onRetry: () => {} }));
      const chip = pickedAfter(html, 'PLACE');
      expect(chip.name.toLowerCase()).toBe(place.toLowerCase());
      expect(chip.fill.toLowerCase()).toBe(PLACE_LOOKS[modeId][0].tint.toLowerCase());
      expect(ratio(chip.ink, chip.fill)).toBeGreaterThanOrEqual(CHIP_AA);
    });
  }
});
