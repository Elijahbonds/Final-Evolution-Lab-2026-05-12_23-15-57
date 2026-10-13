/**
 * Test fixture only: the policy a FUTURE terms version (EBOOK-1) would give, with every format sold and downloads on.
 * The tests that pin generic checkout / fulfilment / delivery behaviour (idempotency, refunds, signing) run against it
 * so those code paths stay covered while the live policy is audiobooks only. Never import this from app code.
 */
import { bookPolicyFor, type BookTermsPolicy } from './bookTerms';

export const EBOOK_ENABLED_POLICY: BookTermsPolicy = {
  termsVersion: 'store-terms-test-ebook-1',
  formats: ['audiobook', 'ebook', 'bundle'],
  downloads: true,
};

export const CLOSED_POLICY: BookTermsPolicy = bookPolicyFor('store-terms-not-listed');
