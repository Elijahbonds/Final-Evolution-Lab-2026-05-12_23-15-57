// NAMED DUNKS (2026-09-16).
//
// Some combinations are not a combo, they are somebody's dunk. The vocabulary already carries other people's — the
// SCORPION, LOST & FOUND and HIDE & SEEK are Jordan Kilganon's, the EASTBAY is the East Bay Funk Dunk — and the first
// one in the table is the owner's own: the KICK-UP EASTBAY, kicked up to yourself off your own foot on the runway and
// taken between the legs in the air.
import { describe, expect, it } from 'vitest';
import { SIGNATURE_DUNKS, signatureFor, RUNWAY_TRICKS, DUNK_TRICKS, GestureRecognizer } from './DunkSystem';

describe('signature dunks', () => {
  it('the kick-up eastbay is a named dunk, credited', () => {
    const sig = signatureFor(['kickup'], ['eastbay']);
    expect(sig?.name).toBe('THE KICK-UP EASTBAY');
    expect(sig?.by).toBe('Elijah Bonds');
    expect(sig?.nod).toBeGreaterThan(0);
  });

  it('is a SEQUENCE, not a set of parts', () => {
    expect(signatureFor([], ['eastbay'])).toBeNull();                 // no kick-up: it is just an eastbay
    expect(signatureFor(['kickup'], [])).toBeNull();                  // no eastbay: it is just a kick-up
    expect(signatureFor(['kickup'], ['windmill'])).toBeNull();
    expect(signatureFor(['kickup'], ['eastbay', 'windmill'])).toBeNull();   // a chain past it is a different dunk
  });

  it('every signature names moves that actually exist', () => {
    const runway = new Set(RUNWAY_TRICKS.map((t) => t.id));
    const air = new Set(DUNK_TRICKS.map((t) => t.id));
    for (const sig of SIGNATURE_DUNKS) {
      if (sig.runway) expect(runway.has(sig.runway), `${sig.name}: ${sig.runway}`).toBe(true);
      for (const id of sig.air) expect(air.has(id), `${sig.name}: ${id}`).toBe(true);
      expect(sig.by.length, `${sig.name} has an author`).toBeGreaterThan(0);
    }
  });
});

// THE CHAINS (owner, 2026-09-16: "add combinations of dunks you can chain together, behind the back between the legs,
// 360 double eastbay, fake behind the back scorpion, behind the back scorpion", then "360 eastbay scorpion").
describe('the named chains', () => {
  const chains: [string[], string][] = [
    [['behindback', 'betweenlegs'], 'BEHIND THE BACK BETWEEN THE LEGS'],
    [['behindback', 'scorpion'], 'BEHIND THE BACK SCORPION'],
    [['fakeback', 'scorpion'], 'FAKE BEHIND THE BACK SCORPION'],
    [['spin360', 'doubleeastbay'], '360 DOUBLE EASTBAY'],
    [['spin360', 'eastbay', 'scorpion'], '360 EASTBAY SCORPION'],
    // owner, later the same day: "360 fake eastbay … whirlwind dunk … tap dunk … add 360 windmills too",
    // and the correction that matters — "whirlwind is a 360 tap dunk"
    [['spin360', 'fakeeastbay'], '360 FAKE EASTBAY'],
    [['spin360', 'tap'], 'THE WHIRLWIND'],
    [['windmill360', 'scorpion'], '360 WINDMILL SCORPION'],
    [['windmill360', 'betweenlegs'], '360 WINDMILL BETWEEN THE LEGS'],
    [['behindback', 'doubleeastbay'], 'BEHIND THE BACK DOUBLE EASTBAY'],
    [['behindback', 'windmill360'], 'BEHIND THE BACK 360 WINDMILL'],
    [['fakeback', 'betweenlegs'], 'FAKE BEHIND THE BACK BETWEEN THE LEGS'],
    [['behindback', 'eastbay', 'scorpion'], 'BEHIND THE BACK EASTBAY SCORPION'],
    [['spin360', 'betweenlegs', 'tap'], '360 BETWEEN THE LEGS TAP'],
  ];

  it('every one the owner named is in the table, credited, and reachable by throwing its parts', () => {
    for (const [air, name] of chains) {
      const sig = signatureFor([], air);
      expect(sig?.name, air.join(' + ')).toBe(name);
      expect(sig!.by.length, name).toBeGreaterThan(0);
      expect(sig!.nod, name).toBeGreaterThan(0);
    }
  });

  it('every part of every chain is a trick you can actually throw', () => {
    const ids = new Set(DUNK_TRICKS.map((t) => t.id));
    for (const sig of SIGNATURE_DUNKS) {
      for (const id of sig.air) expect(ids.has(id), `${sig.name} wants ${id}`).toBe(true);
      if (sig.runway) expect(RUNWAY_TRICKS.some((r) => r.id === sig.runway), sig.name).toBe(true);
    }
  });

  it('the ORDER is the dunk: the same parts the other way round is not the same thing', () => {
    expect(signatureFor([], ['scorpion', 'behindback'])).toBeNull();
    expect(signatureFor([], ['betweenlegs', 'behindback'])).toBeNull();
    expect(signatureFor([], ['scorpion', 'eastbay', 'spin360'])).toBeNull();
  });

  it('a chain pays more than its parts, and the harder chain pays more than the easier one', () => {
    const nod = (air: string[]) => signatureFor([], air)!.nod;
    expect(nod(['spin360', 'eastbay', 'scorpion'])).toBeGreaterThan(nod(['behindback', 'betweenlegs']));
    expect(nod(['spin360', 'doubleeastbay'])).toBeGreaterThan(nod(['fakeback', 'scorpion']));
  });

  it('the fake is worth LESS than the real behind-the-back, because it is less to do', () => {
    const t = (id: string) => DUNK_TRICKS.find((x) => x.id === id)!;
    expect(t('fakeback').difficulty).toBeLessThan(t('behindback').difficulty);
    expect(signatureFor([], ['fakeback', 'scorpion'])!.nod).toBeLessThan(signatureFor([], ['behindback', 'scorpion'])!.nod);
  });

  it('the double eastbay is the hardest single trick in the vocabulary — it is two of the hardest', () => {
    const d = DUNK_TRICKS.find((t) => t.id === 'doubleeastbay')!;
    for (const other of DUNK_TRICKS) if (other.id !== 'doubleeastbay') expect(d.difficulty, other.id).toBeGreaterThan(other.difficulty);
    expect(d.windowCost).toBeGreaterThan(DUNK_TRICKS.find((t) => t.id === 'eastbay')!.windowCost);
  });

  it('no two tricks share a direction and a button — every chain piece is reachable', () => {
    const seen = new Set<string>();
    for (const t of DUNK_TRICKS) {
      const slot = `${t.dir}+${t.btn}`;
      expect(seen.has(slot), `${t.id} collides on ${slot}`).toBe(false);
      seen.add(slot);
    }
  });
});

// THE RECOGNIZER MUST AGREE WITH THE TABLE (2026-09-16). It carried its own button list, written out twice, beside the
// lookup that already knew — so the two chain pieces that landed on X were unreachable: the table said the trick
// existed, the recognizer dropped the press, and the dunk simply did not happen (no banner, no refusal, no log).
describe('every trick in the table can actually be thrown', () => {
  it('a held direction plus its button returns that trick — for all of them', () => {
    for (const t of DUNK_TRICKS) {
      const r = new GestureRecognizer();
      r.feed({ t: 'dpad', dir: t.dir, pressed: true } as never);
      expect(r.peek({ t: 'button', btn: t.btn, pressed: true } as never)?.id, `${t.id} (${t.dir}+${t.btn})`).toBe(t.id);
    }
  });
  it('and a bare button with no direction held is still the showboat tap, not a trick', () => {
    const r = new GestureRecognizer();
    for (const t of DUNK_TRICKS) expect(r.peek({ t: 'button', btn: t.btn, pressed: true } as never)).toBeNull();
  });
});

describe('credit means credit', () => {
  it('a real person is named only where the dunk is really theirs; this contest owns the rest', () => {
    const people = ['Elijah Bonds', 'Jordan Kilganon', 'Guy Dupuy', 'Team Flight Brothers'];
    for (const sig of SIGNATURE_DUNKS) {
      expect(sig.by.length, sig.name).toBeGreaterThan(0);
      if (!people.includes(sig.by)) expect(sig.by, sig.name).toBe('FLIGHT NIGHT');
    }
  });
  it('the whirlwind is a 360 TAP — not a 360 windmill, which is its own press', () => {
    expect(signatureFor([], ['spin360', 'tap'])?.name).toBe('THE WHIRLWIND');
    expect(DUNK_TRICKS.some((t) => t.id === 'windmill360' && t.label === '360 WINDMILL')).toBe(true);
    expect(signatureFor([], ['spin360', 'windmill'])).toBeNull();   // the 360 windmill is one press, not a chain
  });
  it('a runway trick can open a chain too: the lob and the kick-up both set up the tap', () => {
    expect(signatureFor(['selflob'], ['tap'])?.name).toBe('THE TAP DUNK');
    expect(signatureFor(['kickup'], ['tap'])?.name).toBe('THE KICK-UP TAP');
  });

  it('THE 360 EASTBAY is in the book, and it is not the same dunk as the scorpion that contains it', () => {
    const two = signatureFor([], ['spin360', 'eastbay']);
    expect(two?.name).toBe('360 EASTBAY');
    const three = signatureFor([], ['spin360', 'eastbay', 'scorpion']);
    expect(three?.name).toBe('360 EASTBAY SCORPION');
    expect(three!.nod).toBeGreaterThan(two!.nod);          // the longer chain is still worth more
    // a sequence, not a set: the eastbay before the turn is not this dunk
    expect(signatureFor([], ['eastbay', 'spin360'])).toBeNull();
  });

  it('both pieces of the 360 eastbay fit one flight with air left to finish with', () => {
    const spin = DUNK_TRICKS.find((t) => t.id === 'spin360')!;
    const east = DUNK_TRICKS.find((t) => t.id === 'eastbay')!;
    const left = (1 - spin.windowCost) * (1 - east.windowCost);
    expect(left).toBeGreaterThan(0.35);                     // a good flight carries it
    expect(left).toBeLessThan(0.45);                        // and a lazy one does not
  });
});
