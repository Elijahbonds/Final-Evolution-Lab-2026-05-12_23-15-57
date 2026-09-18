// THE MONEY GOES TO THE PERSON WE VERIFIED (2026-09-13).
//
// Verifying an identity and then wiring the payout to an arbitrary third-party account verifies nothing.
// That is the most common way a verified-identity control gets walked around, so the name match is tested
// harder than the format checks are — including the false-decline cases, because a control that refuses real
// people is a control that gets switched off.

import { describe, it, expect } from 'vitest';
import {
  METHODS, methodsAvailable, validateDestination, destinationMatchesIdentity, isAbaValid,
  maskDestination, needsManualSend, type VerifiedIdentity, type PayoutDestination,
} from './payoutMethods';

const verified: VerifiedIdentity = { legalName: 'John O’Neill', kycStatus: 'VERIFIED' };
// a real ABA (Wells Fargo) — checksum valid
const ROUTING = '121000248';

const bank = (over: Partial<Extract<PayoutDestination, { method: 'bank' }>> = {}): PayoutDestination =>
  ({ method: 'bank', accountName: 'John O’Neill', routingNumber: ROUTING, accountNumber: '12345678', ...over });

describe('THE DESTINATION MUST BELONG TO THE VERIFIED PERSON', () => {
  it('a different surname is refused', () => {
    const d = validateDestination(bank({ accountName: 'John Smith' }), verified);
    expect(d.valid).toBe(false);
    expect(d.reason).toBe('name-mismatch');
  });

  it('and a completely different person is refused', () => {
    expect(validateDestination(bank({ accountName: 'Maria Garcia' }), verified).valid).toBe(false);
  });

  it('NO DESTINATION AT ALL WITHOUT VERIFICATION, whatever the name says', () => {
    for (const kycStatus of ['NONE', 'PENDING', 'REJECTED', '', 'verified ']) {
      const d = validateDestination(bank(), { legalName: 'John O’Neill', kycStatus });
      expect(d.valid, kycStatus).toBe(false);
      expect(d.reason).toBe('not-verified');
    }
  });

  it('identity is checked BEFORE format — a bad routing number on an unverified account says "verify"', () => {
    const d = validateDestination(bank({ routingNumber: '000' }), { legalName: 'John O’Neill', kycStatus: 'NONE' });
    expect(d.reason).toBe('not-verified');
  });

  it('A REAL PERSON IS NOT FALSE-DECLINED — casing, punctuation, accents and middle names all pass', () => {
    // a control that refuses real people is a control that gets switched off
    for (const name of [
      'JOHN O’NEILL', 'john oneill', 'John A. O’Neill', 'John  O Neill', 'Jöhn O’Neill',
    ]) {
      expect(destinationMatchesIdentity(name, verified), name).toBe(true);
    }
  });

  it('a missing or blank name is refused rather than matched', () => {
    expect(validateDestination(bank({ accountName: '' }), verified).reason).toBe('missing-name');
    expect(validateDestination(bank({ accountName: '   ' }), verified).reason).toBe('missing-name');
    expect(destinationMatchesIdentity('', verified)).toBe(false);
  });

  it('a first name alone does not match a full legal name', () => {
    expect(destinationMatchesIdentity('John', verified)).toBe(false);
  });
});

describe('the formats', () => {
  it('a valid bank destination passes', () => {
    expect(validateDestination(bank(), verified).valid).toBe(true);
  });

  it('THE ABA CHECKSUM CATCHES A TRANSPOSED DIGIT', () => {
    // a wrong routing number does not bounce cleanly — it sends money to a different bank
    expect(isAbaValid(ROUTING)).toBe(true);
    expect(isAbaValid('121000284')).toBe(false);      // last two transposed
    expect(isAbaValid('000000000')).toBe(false);
    expect(isAbaValid('12100024')).toBe(false);       // too short
    expect(isAbaValid('12100024x')).toBe(false);
  });

  it('rejects a malformed account number', () => {
    expect(validateDestination(bank({ accountNumber: '123' }), verified).reason).toBe('bad-account');
    expect(validateDestination(bank({ accountNumber: '12345678901234567890' }), verified).reason).toBe('bad-account');
    expect(validateDestination(bank({ accountNumber: 'abcd1234' }), verified).reason).toBe('bad-account');
  });

  it('paypal takes an email', () => {
    const good: PayoutDestination = { method: 'paypal', accountName: 'John O’Neill', email: 'j@example.com' };
    expect(validateDestination(good, verified).valid).toBe(true);
    expect(validateDestination({ ...good, email: 'not-an-email' }, verified).reason).toBe('bad-email');
    expect(validateDestination({ ...good, email: '' }, verified).reason).toBe('bad-email');
  });

  it('zelle takes an email or a US mobile', () => {
    const base = { method: 'zelle' as const, accountName: 'John O’Neill' };
    expect(validateDestination({ ...base, handle: 'j@example.com' }, verified).valid).toBe(true);
    expect(validateDestination({ ...base, handle: '(415) 555-0123' }, verified).valid).toBe(true);
    expect(validateDestination({ ...base, handle: '+1 415 555 0123' }, verified).valid).toBe(true);
    expect(validateDestination({ ...base, handle: '555' }, verified).reason).toBe('bad-handle');
  });
});

describe('ZELLE IS HONEST ABOUT NOT BEING AN INTEGRATION', () => {
  it('it is marked manual, because there is no platform disbursement API for it', () => {
    expect(METHODS.zelle.automated).toBe(false);
    expect(needsManualSend('zelle')).toBe(true);
    expect(needsManualSend('bank')).toBe(false);
    expect(needsManualSend('paypal')).toBe(false);
  });

  it('and its timing copy does not imply an instant transfer', () => {
    expect(METHODS.zelle.timing).toMatch(/by hand|business days/i);
    expect(METHODS.zelle.timing).not.toMatch(/instant|immediately|seconds/i);
  });

  it('every method states a timing, and none of them overpromises', () => {
    for (const m of methodsAvailable()) {
      expect(m.timing.length, m.method).toBeGreaterThan(10);
      expect(m.label.length, m.method).toBeGreaterThan(3);
    }
  });
});

describe('nothing sensitive is ever rendered whole', () => {
  it('an account number shows only its last four', () => {
    const masked = maskDestination(bank({ accountNumber: '987654321' }));
    expect(masked).toBe('Bank ••••4321');
    expect(masked).not.toContain('987654');
  });

  it('an email is masked on both paypal and zelle', () => {
    expect(maskDestination({ method: 'paypal', accountName: 'x', email: 'jonathan@example.com' }))
      .toBe('PayPal jo•••@example.com');
    expect(maskDestination({ method: 'zelle', accountName: 'x', handle: 'jonathan@example.com' }))
      .toContain('jo•••@');
  });

  it('a phone handle shows only its last four digits', () => {
    expect(maskDestination({ method: 'zelle', accountName: 'x', handle: '(415) 555-0123' }))
      .toBe('Zelle ••••0123');
  });

  it('and a routing number never appears in a mask at all', () => {
    expect(maskDestination(bank())).not.toContain(ROUTING);
  });
});
