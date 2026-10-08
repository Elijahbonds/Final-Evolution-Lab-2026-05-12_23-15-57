// A3 character partner identity (docs/ADVENTURE-PLAN.md A3): the partner is one of the player's Creator slots, by id;
// its look resolves through the same reader and identityFrom every spawn uses; a teen's comes from the device copy;
// a deleted slot resolves to null (the default look), never to someone else's character.
import { describe, expect, it } from 'vitest';
import { blankSlot } from '@/lib/creator/look/slots';
import { defaultFace } from '@/lib/closet/wearable-catalog';
import { createCharacterPartner, createCreaturePartner } from './defs';
import { partnerHeroBody, partnerIdentityInputs, partnerSlotChoices, resolvePartnerLook } from './identity';
import { partnerBodyVisible, partnerIdentity } from './view';

function faceWithSlots() {
  const me = blankSlot({ id: 's1', label: 'ME', body: 'male' });
  const rival = blankSlot({ id: 's2', label: 'RIVAL', body: 'female' });
  rival.base = { ...rival.base, hairColor: '#112233' };
  const third = blankSlot({ id: 's3', label: 'BIG', body: 'scan' });
  return { ...defaultFace(), creatorSlots: [me, rival, third], activeSlot: 's1' };
}

const partner = createCharacterPartner({ id: 'pt', creatorSlotId: 's2', element: 'wind' });

describe('a character partner\'s look', () => {
  it('resolves its slot from the server face for a verified adult', () => {
    const closet = { look: { face: faceWithSlots() }, lookLocal: false };
    const look = resolvePartnerLook(partner, closet, null)!;
    expect(look.slot?.id).toBe('s2');
    expect(look.face.hairColor).toBe('#112233');
    expect(look.body).toBe('female');
    expect(partnerSlotChoices(closet, null)).toEqual([{ id: 's2', label: 'RIVAL' }, { id: 's3', label: 'BIG' }]);
  });

  it('a teen\'s comes from the device copy (the server row holds only defaults)', () => {
    const closet = { look: { face: defaultFace() }, lookLocal: true };
    const local = { face: faceWithSlots() };
    expect(resolvePartnerLook(partner, closet, local)?.face.hairColor).toBe('#112233');
    const inputs = partnerIdentityInputs(partner, closet, local)!;
    expect((inputs.local!.face as { activeSlot: string }).activeSlot).toBe('s2');
    expect(inputs.closet.look).toEqual(closet.look);   // the server face is not touched
    // without the device copy, a teen's partner has no slot to resolve: the default look
    expect(resolvePartnerLook(partner, closet, null)).toBeNull();
  });

  it('a deleted slot, a creature, or no closet resolves to null', () => {
    const closet = { look: { face: faceWithSlots() }, lookLocal: false };
    expect(resolvePartnerLook(createCharacterPartner({ id: 'pt', creatorSlotId: 's9', element: 'wind' }), closet, null)).toBeNull();
    expect(resolvePartnerLook(createCreaturePartner({ id: 'pt', speciesId: 'cinderpup' })!, closet, null)).toBeNull();
    expect(partnerIdentityInputs(partner, null, null)).toBeNull();
  });

  it('the partner wears its own body, never the player\'s Athlete Creator frame or palette', () => {
    const look = resolvePartnerLook(partner, { look: { face: faceWithSlots() }, lookLocal: false }, null);
    expect(partnerHeroBody(look, { body: 'kit-male', scanOwned: true })).toEqual({ body: 'kit-female', frame: null, palette: null, scanOwned: true });
    const scanSlot = resolvePartnerLook(createCharacterPartner({ id: 'pt', creatorSlotId: 's3', element: 'wind' }), { look: { face: faceWithSlots() } }, null);
    expect(partnerHeroBody(scanSlot, { body: 'kit-male', scanOwned: false }).body).toBe('kit-male');
    expect(partnerHeroBody(scanSlot, { body: 'kit-male', scanOwned: true }).body).toBe('scan');
  });

  it('goes through identityFrom, as the player\'s own spawn does', () => {
    const closet = { look: { face: faceWithSlots(), equipped: {} }, lookLocal: false };
    const id = partnerIdentity(partner, closet, { body: 'kit-male', scanOwned: false }, null)!;
    expect(id.body).toBe('kit-female');
    expect(id.face.hairColor).toBe('#112233');
    const teen = partnerIdentity(partner, { look: { face: defaultFace() }, lookLocal: true }, null, { face: faceWithSlots() })!;
    expect(teen.face.hairColor).toBe('#112233');
    expect(teen.lookFromDevice).toBe(true);
    expect(partnerIdentity(createCreaturePartner({ id: 'pt', speciesId: 'cinderpup' })!, closet, null, null)).toBeNull();
  });

  it('a fused partner\'s body is hidden', () => {
    expect(partnerBodyVisible({ kind: 'partner', fusion: { active: true } as never })).toBe(false);
    expect(partnerBodyVisible({ kind: 'partner', fusion: { active: false } as never })).toBe(true);
  });
});
