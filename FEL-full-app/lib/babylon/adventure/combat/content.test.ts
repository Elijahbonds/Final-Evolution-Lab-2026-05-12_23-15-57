// The content lines the owner drew: NO GUNS anywhere in the Adventure's fight, and the IP line (every player-facing
// name is generic and marked [PLACEHOLDER] until the owner names it; no name from a feel reference ships).
import { describe, expect, it } from 'vitest';
import { ADVENTURE_MOVES } from './strings';
import { MONSTERS } from './monsters/defs';
import { PLACEHOLDER_BOSS } from './bosses/defs';
import { STARTER_SPELLS } from '../magic/spells';

const names: { where: string; name: string }[] = [
  ...Object.values(ADVENTURE_MOVES).map((m) => ({ where: `move ${m.id}`, name: m.label })),
  ...Object.values(MONSTERS).flatMap((m) => [{ where: `monster ${m.id}`, name: m.name }, ...m.attacks.map((a) => ({ where: a.id, name: a.label }))]),
  { where: PLACEHOLDER_BOSS.id, name: PLACEHOLDER_BOSS.name },
  ...PLACEHOLDER_BOSS.phases.flatMap((p) => [...p.attacks, p.opener].map((a) => ({ where: a.id, name: a.label }))),
  ...PLACEHOLDER_BOSS.weakPoints.map((w) => ({ where: `${PLACEHOLDER_BOSS.id}.${w.part}`, name: w.label })),
  ...STARTER_SPELLS.map((s) => ({ where: s.id, name: s.name })),
];

// Words that would put a gun in the fight. The Battle Royale is no guns (owner, 2026-10-06).
const GUNS = /\b(gun|guns|rifle|pistol|shotgun|sniper|bullet|ammo|firearm|revolver|smg|reload|grenade|rocket launcher)\b/i;
// Names from the feel references (a sample of the obvious ones; the review is the real gate).
const FEEL = /(kamehameha|rasengan|chidori|hadou?ken|shoryuken|keyblade|heartless|chakra|bankai|spirit bomb|bullet time|the one|agent smith|sephiroth|sonic|tails|knuckles|eragon|saphira|brisingr|tarnished|malenia)/i;

describe('adventure A2 content: no guns, no borrowed names', () => {
  it('every player-facing name is [PLACEHOLDER]', () => {
    expect(names.length).toBeGreaterThan(40);
    for (const n of names) expect(n.name.startsWith('[PLACEHOLDER] '), n.where).toBe(true);
  });

  it('no name, id or attack kind is a gun', () => {
    const ids = [
      ...Object.keys(ADVENTURE_MOVES), ...Object.values(MONSTERS).flatMap((m) => m.attacks.map((a) => `${a.id} ${a.kind}`)),
      ...STARTER_SPELLS.map((s) => `${s.id} ${s.shape}`),
    ];
    for (const s of [...names.map((n) => n.name), ...ids]) expect(s, s).not.toMatch(GUNS);
  });

  it('no name from a feel reference', () => {
    for (const n of names) expect(n.name, n.where).not.toMatch(FEEL);
  });
});
