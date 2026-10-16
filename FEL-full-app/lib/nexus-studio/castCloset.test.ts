// Track 3 (studio-4b): "Edit in the Closet" — the hand-off between the Studio and the Closet Studio on this device. The Studio hands
// a character's code over; only the tab opened for that session can read it; the edited code comes back once, for that session
// and that character; stale, foreign or malformed keys are ignored; the return lands as ONE undo step.
import { describe, expect, it } from 'vitest';
import {
  CLOSET_EDIT_KEY, CLOSET_EDIT_TTL_MS, CLOSET_RETURN_KEY, cancelClosetEdit, closetEditUrl, newClosetSession, readClosetEdit,
  startClosetEdit, takeClosetReturn, writeClosetReturn,
} from './castCloset';
import { addCharacter, setCharacterLook } from './edits';
import { createStack, execute, undo } from './commands';
import { everyKindProject, memoryKV } from '@/tests/helpers/nexusStudio';
import { CAST_SLOT, castCode } from '@/tests/helpers/studioCast';

const T0 = 1_760_000_000_000;

describe('the hand-off', () => {
  it('Studio → Closet → Studio: the session pairs the tab with its return; the return is read once and both keys go', async () => {
    const kv = memoryKV();
    const code = await castCode();
    const edited = await castCode({ ...CAST_SLOT, base: { ...CAST_SLOT.base, hairColor: '#FF0000' } });
    const h = startClosetEdit(kv, { id: 'char_1', name: 'Nova', lookCode: code }, T0, 'ce_session0001')!;
    expect(h).toEqual({ session: 'ce_session0001', url: '/closet?studioEdit=ce_session0001' });
    // the Closet tab opened for it reads it; any other session does not
    expect(readClosetEdit(kv, 'ce_session0001', T0 + 1000)).toMatchObject({ characterId: 'char_1', name: 'Nova', code });
    expect(readClosetEdit(kv, 'ce_someoneelse', T0)).toBeNull();
    expect(readClosetEdit(kv, null, T0)).toBeNull();
    // nothing comes back until the Closet sends it
    expect(takeClosetReturn(kv, 'ce_session0001', T0)).toBeNull();
    expect(writeClosetReturn(kv, 'ce_session0001', edited, 'Nova red', T0 + 5000)).toBe(true);
    expect(takeClosetReturn(kv, 'ce_other00000', T0 + 6000)).toBeNull();   // another session's tab cannot take it
    const r = takeClosetReturn(kv, 'ce_session0001', T0 + 6000)!;
    expect(r).toMatchObject({ characterId: 'char_1', code: edited, name: 'Nova red' });
    expect(kv.data.has(CLOSET_RETURN_KEY)).toBe(false);
    expect(kv.data.has(CLOSET_EDIT_KEY)).toBe(false);
    expect(takeClosetReturn(kv, 'ce_session0001', T0 + 7000)).toBeNull();   // once
  });
  it('a stale, foreign or malformed key is ignored; a code that is not code-shaped never travels', async () => {
    const kv = memoryKV();
    const code = await castCode();
    expect(startClosetEdit(kv, { id: 'char_1', name: 'x' }, T0)).toBeNull();                    // no code
    expect(startClosetEdit(kv, { id: 'char_1', name: 'x', lookCode: 'hello' }, T0)).toBeNull(); // not a code
    expect(startClosetEdit(null, { id: 'char_1', name: 'x', lookCode: code }, T0)).toBeNull();  // no device storage
    startClosetEdit(kv, { id: 'char_1', name: 'x', lookCode: code }, T0, 'ce_session0002');
    expect(readClosetEdit(kv, 'ce_session0002', T0 + CLOSET_EDIT_TTL_MS + 1)).toBeNull();        // stale
    expect(writeClosetReturn(kv, 'ce_session0002', 'javascript:alert(1)', undefined, T0)).toBe(false);
    for (const junk of ['not json', '[]', JSON.stringify({ v: 2, session: 'ce_session0002' }), JSON.stringify({ v: 1, session: 'ce_session0002', characterId: '../../x', code, at: T0 })]) {
      kv.data.set(CLOSET_RETURN_KEY, junk);
      expect(takeClosetReturn(kv, 'ce_session0002', T0), junk).toBeNull();
    }
    kv.failReads = true;
    expect(readClosetEdit(kv, 'ce_session0002', T0)).toBeNull();
    kv.failReads = false;
    cancelClosetEdit(kv);
    expect(kv.data.size).toBe(0);
  });
  it('a long name is capped and control characters are stripped on the way through', async () => {
    const kv = memoryKV();
    startClosetEdit(kv, { id: 'c', name: 'A\u0007'.repeat(100), lookCode: await castCode() }, T0, 'ce_session0003');
    expect(readClosetEdit(kv, 'ce_session0003', T0)!.name).toBe('A'.repeat(60));
  });
  it('sessions are url-safe and distinct', () => {
    const a = newClosetSession(), b = newClosetSession();
    expect(a).toMatch(/^ce_[a-z0-9]{16}$/);
    expect(a).not.toBe(b);
    expect(closetEditUrl(a)).toBe(`/closet?studioEdit=${a}`);
  });
});

describe('the edited look lands as one undo step', () => {
  it('setCharacterLook replaces the code (and the name, when the Closet renamed it); Undo puts the old look back', async () => {
    const p = everyKindProject();
    const code = await castCode();
    const edited = await castCode({ ...CAST_SLOT, base: { ...CAST_SLOT.base, hairColor: '#FF0000' } });
    const add = addCharacter(p, { name: 'Nova', lookCode: code });
    let s = execute(createStack(p), add.cmd);
    s = execute(s, setCharacterLook(add.id, edited, 'Nova\u0000 red'));
    expect(s.doc.characters[0]).toMatchObject({ lookCode: edited, name: 'Nova red' });
    expect(s.past.at(-1)?.label).toBe('Edit look in the Closet');
    s = undo(s);
    expect(s.doc.characters[0]).toMatchObject({ lookCode: code, name: 'Nova' });
  });
});
