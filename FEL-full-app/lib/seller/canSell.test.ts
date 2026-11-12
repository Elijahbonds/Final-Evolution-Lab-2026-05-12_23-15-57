// SELLER-18-1 (Cyber S-2): the one seller gate, driven with the REAL age check (lib/coach-store/adult.ts isVerifiedAdult)
// and the REAL coach-store role (lib/teach/role.ts isStoreCoachWith) over fake reads.
import { describe, expect, it, vi } from 'vitest';
import { isVerifiedAdult } from '@/lib/coach-store/adult';
import { isStoreCoachWith, type RoleDeps } from '@/lib/teach/role';
import { SELLER_AGE_MESSAGES, sellerRefusal, type SellerGateDeps } from './canSell';

const YEAR = new Date().getFullYear();
const TEEN = YEAR - 15;

/** A user table with one row per id; `undefined` = no row; 'throw' = the read fails. */
function db(rows: Record<string, number | null | 'throw'>) {
  const reads: string[] = [];
  return {
    reads,
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        reads.push(where.id);
        const v = rows[where.id];
        if (v === 'throw') throw new Error('db down');
        return v === undefined ? null : { dobYear: v };
      },
    },
  };
}

function deps(rows: Record<string, number | null | 'throw'>, hasRole: (id: string) => Promise<boolean> = async () => true) {
  const d = db(rows);
  const onMinorSeller = vi.fn(async (_id: string) => undefined);
  const g: SellerGateDeps = { db: d as never, hasRole, isAdult: isVerifiedAdult, onMinorSeller };
  return { g, d, onMinorSeller };
}

/** The coach-store role with no env list: only the owner-granted row or a Camp certification. */
function storeRole(o: { teacherRow?: string[]; camp?: string[]; env?: string } = {}): (id: string) => Promise<boolean> {
  const r: RoleDeps = {
    teacherRow: async (id) => (o.teacherRow ?? []).includes(id),
    campCertified: async (id) => (o.camp ?? []).includes(id),
    env: { COACH_STORE_COACH_USER_IDS: o.env ?? '' } as unknown as NodeJS.ProcessEnv,
  };
  return (id) => isStoreCoachWith(id, r);
}

describe('canSell = the role AND a verified adult by the database birth year', () => {
  it('an adult seller with the role passes', async () => {
    const { g, onMinorSeller } = deps({ adult: 1990 }, storeRole({ teacherRow: ['adult'] }));
    expect(await sellerRefusal('adult', g)).toBeNull();
    expect(onMinorSeller).not.toHaveBeenCalled();
  });

  it('a teen (birth year now − 15) with the role is refused under_18, and the takedown starts once', async () => {
    const { g, onMinorSeller } = deps({ teen: TEEN }, storeRole({ teacherRow: ['teen'] }));
    expect(await sellerRefusal('teen', g)).toBe('under_18');
    expect(onMinorSeller).toHaveBeenCalledTimes(1);
    expect(onMinorSeller).toHaveBeenCalledWith('teen');
  });

  it('a Camp-certified teen is refused: certification is a role, never the adult check', async () => {
    const role = storeRole({ camp: ['camp-teen'] });
    expect(await role('camp-teen')).toBe(true);           // the role really is held
    const { g } = deps({ 'camp-teen': TEEN }, role);
    expect(await sellerRefusal('camp-teen', g)).toBe('under_18');
  });

  it('an env-listed (owner fallback) account is refused too when under 18 or of unknown age', async () => {
    const role = storeRole({ env: 'listed-teen,listed-unknown' });
    const { g } = deps({ 'listed-teen': TEEN, 'listed-unknown': null }, role);
    expect(await sellerRefusal('listed-teen', g)).toBe('under_18');
    expect(await sellerRefusal('listed-unknown', g)).toBe('age_unknown');
  });

  it('unknown age is refused: no birth year, no user row, or a failed read — and nothing is taken down', async () => {
    const { g, onMinorSeller } = deps({ blank: null, broken: 'throw' });
    expect(await sellerRefusal('blank', g)).toBe('age_unknown');
    expect(await sellerRefusal('no-row', g)).toBe('age_unknown');
    expect(await sellerRefusal('broken', g)).toBe('age_unknown');
    expect(onMinorSeller).not.toHaveBeenCalled();
  });

  it('the strict rule: a year gap of exactly 18 may still be 17, so it is refused', async () => {
    const { g } = deps({ edge: YEAR - 18, over: YEAR - 19 });
    expect(await sellerRefusal('edge', g)).toBe('under_18');
    expect(await sellerRefusal('over', g)).toBeNull();
  });

  it('no role: not_a_seller, and the birth year is never read', async () => {
    const { g, d, onMinorSeller } = deps({ adult: 1990, teen: TEEN }, async () => false);
    expect(await sellerRefusal('adult', g)).toBe('not_a_seller');
    expect(await sellerRefusal('teen', g)).toBe('not_a_seller');
    expect(d.reads).toEqual([]);
    expect(onMinorSeller).not.toHaveBeenCalled();
  });

  it('no user id, or a role read that fails, is not_a_seller', async () => {
    const { g } = deps({ adult: 1990 }, async () => { throw new Error('role table missing'); });
    expect(await sellerRefusal(null, g)).toBe('not_a_seller');
    expect(await sellerRefusal('', g)).toBe('not_a_seller');
    expect(await sellerRefusal('adult', g)).toBe('not_a_seller');
  });

  it('a takedown that fails never turns a refusal into a pass', async () => {
    const { g } = deps({ teen: TEEN });
    g.onMinorSeller = async () => { throw new Error('stripe down'); };
    expect(await sellerRefusal('teen', g)).toBe('under_18');
  });

  it('the refusal copy is plain words: no stake/bet wording, no placeholders', () => {
    for (const m of Object.values(SELLER_AGE_MESSAGES)) {
      expect(m).toMatch(/18\+/);
      expect(m).not.toMatch(/stake|staking|bet|wager|TBD|placeholder|lorem/i);
    }
  });
});
