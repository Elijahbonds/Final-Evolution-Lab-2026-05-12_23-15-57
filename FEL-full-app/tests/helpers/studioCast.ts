// Test helpers for Nexus Studio's track 3 (lib/nexus-studio/cast.ts): a Closet slot with a look worth seeing (a female body,
// teal skin, a visor part, kit colours) and its share code, made the way the Closet's Share button makes one.
import { encodeSlotCode } from '@/lib/creator/look/shareCode';
import { emptyCreatorDoc, type CreatorSlotV2 } from '@/lib/creator/look/doc';

export const CAST_SLOT: CreatorSlotV2 = {
  id: 's1', label: 'NOVA', body: 'female',
  base: { skinTone: '#33AA77', hairColor: '#F4F6FA', eyeColor: '#7FD8FF', hairStyle: 'Ponytail' },
  frame: { heightScale: 1.06, buildScale: 1.1 },
  doc: {
    ...emptyCreatorDoc(),
    colours: { jersey: '#FF3366', shorts: '#111111' },
    parts: [{ id: 'a1', shape: 'visor', bone: 'Head', pos: [0, 0.09, 0.035], rot: [0, 0, 0], scale: [0.97, 1.1, 1.18], colour: '#00E5FF', finish: 'glow', mirror: false }],
  },
};

/** NOVA's share code (FEL2 where CompressionStream exists, as in a browser). */
export const castCode = (slot: CreatorSlotV2 = CAST_SLOT): Promise<string> => encodeSlotCode(slot);
