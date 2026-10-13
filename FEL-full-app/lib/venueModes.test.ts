// QA P1-28 (2026-09-27): /venues cards left out live modes (Venice Beach Court: Downtown, Game Night, Prove It; Venice
// Tennis Court: Tiebreak Blitz; Mountain Slope: Stomp), and three had no photo. A card lists the /play shelf's modes whose
// MODE_INFO venue it is; a card with no photo gets the branded placeholder tile.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MODE_INFO, VENUES } from './game-data';
import { modesAtVenue, shelfModeKeys, venueCardModes } from './venueModes';

const live = shelfModeKeys();

describe('venue cards list their live modes', () => {
  it('for each venue, the card equals the live MODE_INFO entries with that venue (or its own list where none live there)', () => {
    for (const v of VENUES) {
      const expected = Object.entries(MODE_INFO).filter(([k, i]) => live.has(k) && i.venue === v.name).map(([, i]) => i.name);
      expect(venueCardModes(v), v.name).toEqual(expected.length ? expected : v.modes);
      expect(venueCardModes(v).length, v.name).toBeGreaterThan(0);
    }
  });

  it('the QA\'s three: Venice Beach Court, Venice Tennis Court, Mountain Slope', () => {
    expect(modesAtVenue('Venice Beach Court')).toEqual(expect.arrayContaining(['Flight Night', 'Ones', 'Threes', 'Downtown', 'Game Night', 'Prove It']));
    expect(modesAtVenue('Venice Tennis Court')).toEqual(expect.arrayContaining(['Match Point', 'Tiebreak Blitz']));
    expect(modesAtVenue('Mountain Slope')).toEqual(expect.arrayContaining(['Gate Crasher', 'Stomp']));
  });

  it('a mode off the shelf is not listed, and the Duel is not in the dojo', () => {
    expect(modesAtVenue('Venice Beach Court', new Set(['dunkContest']))).toEqual(['Flight Night']);
    expect(modesAtVenue('Shimogamo Dojo')).not.toContain('Duel');
  });

  it('every card has art: a photo, or the branded placeholder tile', () => {
    const shelf = readFileSync(path.resolve(__dirname, '../components/shell/venue-shelf.tsx'), 'utf8');
    expect(shelf).toMatch(/\{venue\.image \? \([\s\S]*<Image[\s\S]*\) : \([\s\S]*A venue whose art has not shipped yet gets a branded tile/);
    expect(shelf).toContain('venueCardModes(venue)');
    for (const v of VENUES.filter((x) => !x.image)) expect(['gridiron', 'octagon', 'dunkduel']).toContain(v.key);
  });
});
