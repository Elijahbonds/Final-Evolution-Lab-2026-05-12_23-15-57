import { describe, expect, it } from 'vitest';
import { REAL_MAILING_ADDRESS, isMailingAddressSet, renderMailingAddress } from './business';

const CLAUSE = 'Email x from the email address on your account, or write to Final Evolution LLC, M. We may ask you.';

describe('renderMailingAddress', () => {
  it.each([null, '', '   '])('drops the address lines when unset (%j)', (unset) => {
    expect(renderMailingAddress('a\nMail: M\nb\n', 'M', unset)).toBe('a\nb\n');
    expect(renderMailingAddress(CLAUSE, 'M', unset)).toBe(
      'Email x from the email address on your account. We may ask you.',
    );
    expect(renderMailingAddress('no marker\nhere\n', 'M', unset)).toBe('no marker\nhere\n');
  });

  it('fills every marker when set', () => {
    const text = `Mail: @@\n${CLAUSE.replace('M.', '@@.')}\n`;
    const out = renderMailingAddress(text, '@@', 'TEST ADDRESS LINE');
    expect(out).toBe(text.split('@@').join('TEST ADDRESS LINE'));
    expect(out).not.toContain('@@');
  });

  it('has no real address today', () => {
    expect(REAL_MAILING_ADDRESS).toBeNull();
    expect(isMailingAddressSet(REAL_MAILING_ADDRESS)).toBe(false);
  });
});
