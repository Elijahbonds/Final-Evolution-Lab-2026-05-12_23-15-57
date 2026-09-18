import { describe, expect, it } from 'vitest';
import { applyKit, kitOf } from './kit';
import { FALLBACK_KIT, sportKitDefault } from './sportKitDefaults';

const mesh = (name: string, felModeId?: string) => ({
  name, isVisible: true,
  // a fake scene carrying the harness's mode stamp (ModeHarness: scene.metadata.felModeId)
  ...(felModeId ? { getScene: () => ({ metadata: { felModeId } }) } : {}),
}) as unknown as import('@babylonjs/core').AbstractMesh;
const visible = (ms: import('@babylonjs/core').AbstractMesh[]) => ms.filter((m) => m.isVisible).map((m) => m.name);

describe('kit', () => {
  it('parses kit mesh names and ignores the rest', () => {
    expect(kitOf('Kit_tops_top_lab')).toEqual({ slot: 'tops', itemId: 'top_lab' });
    expect(kitOf('Kit_shoes_shoes_flight_c27')).toEqual({ slot: 'shoes', itemId: 'shoes_flight' });   // identity clone suffix
    expect(kitOf('Kit_tops_top_lab_c31')).toEqual({ slot: 'tops', itemId: 'top_lab' });
    // `_c<n>` is the identity layer's clone suffix, never part of an item id (wearable-catalog ids end in a word)
    expect(kitOf('Kit_shoes_shoes_evo_c12')).toEqual({ slot: 'shoes', itemId: 'shoes_evo' });
    expect(kitOf('Body_c10')).toBeNull(); expect(kitOf('Hair_afro')).toBeNull();
    expect(kitOf('KitSole_evo_c12')).toBeNull();   // the split-off sole (garmentFixes) is not a garment
  });
  it('shows the equipped garment per slot and hides the others — a Closet pick always wins', () => {
    const ms = [mesh('Kit_tops_top_lab'), mesh('Kit_tops_top_bonds'), mesh('Kit_shorts_shorts_court'), mesh('Kit_shorts_shorts_glitch'), mesh('Body')];
    expect(applyKit(ms, { tops: 'top_bonds', shorts: 'shorts_glitch' }, 'karate')).toBe(4);   // karate's default is top_lab / shorts_court
    expect(ms.map((m) => m.isVisible)).toEqual([false, true, false, true, true]);
  });
  it('an empty slot takes the SPORT default (owner decision 2026-09-05), by explicit mode or the scene stamp', () => {
    const wardrobeOnlyTop = { tops: 'top_bonds', shorts: null, shoes: null };
    const full = () => [mesh('Kit_tops_top_lab'), mesh('Kit_tops_top_bonds'), mesh('Kit_shorts_shorts_court'), mesh('Kit_shorts_shorts_glitch'), mesh('Kit_shoes_shoes_evo'), mesh('Kit_shoes_shoes_flight')];
    const karate = full(); applyKit(karate, wardrobeOnlyTop, 'karate');
    expect(visible(karate)).toEqual(['Kit_tops_top_bonds', `Kit_shorts_${sportKitDefault('karate').shorts}`, `Kit_shoes_${sportKitDefault('karate').shoes}`]);
    const skate = full(); applyKit(skate, wardrobeOnlyTop, 'skateboard');
    expect(visible(skate)).toEqual(['Kit_tops_top_bonds', `Kit_shorts_${sportKitDefault('skateboard').shorts}`, `Kit_shoes_${sportKitDefault('skateboard').shoes}`]);
    // no explicit mode: the scene's felModeId decides
    const stamped = [mesh('Kit_shoes_shoes_evo', 'skateboard'), mesh('Kit_shoes_shoes_flight', 'skateboard')];
    applyKit(stamped, null);
    expect(visible(stamped)).toEqual([`Kit_shoes_${sportKitDefault('skateboard').shoes}`]);
    // no Closet at all (the dev harness): every slot is the sport's
    const none = full(); applyKit(none, null, 'tennis');
    const t = sportKitDefault('tennis');
    expect(visible(none)).toEqual([`Kit_tops_${t.tops}`, `Kit_shorts_${t.shorts}`, `Kit_shoes_${t.shoes}`]);
  });
  it('falls back to the fallback kit, then the first garment, when the mode is unknown or the body lacks the item', () => {
    const ms = [mesh('Kit_tops_top_lab'), mesh('Kit_tops_top_bonds')];
    applyKit(ms, null); expect(visible(ms)).toEqual([`Kit_tops_${FALLBACK_KIT.tops}`]);
    applyKit(ms, { tops: 'top_from_the_future' }, 'karate'); expect(visible(ms)).toEqual(['Kit_tops_top_lab']);   // karate's default
    const odd = [mesh('Kit_tops_top_future_a'), mesh('Kit_tops_top_future_b')];
    applyKit(odd, { tops: 'top_from_the_future' }, 'karate'); expect(visible(odd)).toEqual(['Kit_tops_top_future_a']);   // nothing matches: first
  });
  it('is a no-op on a body without kit meshes', () => {
    const ms = [mesh('jersey'), mesh('shorts')]; expect(applyKit(ms, { tops: 'top_lab' })).toBe(0); expect(ms.every((m) => m.isVisible)).toBe(true);
  });
});
