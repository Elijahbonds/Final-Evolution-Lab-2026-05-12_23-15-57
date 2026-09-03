/**
 * scripts/closet-jersey-tests.ts — Jersey ID (number + name plate) guards.
 *
 * Harness: `npx tsx scripts/closet-jersey-tests.ts` + node:assert.
 *
 * Coverage (pure):
 *   - sanitizeJersey clamps the number to 0–99 and rounds
 *   - name: uppercased, charset-limited (A–Z 0–9 space hyphen), 12 chars
 *   - garbage input never throws and never invents data
 */

import assert from 'node:assert';
import { sanitizeJersey, defaultJersey } from '../lib/closet/wearable-catalog';

let passed = 0;
const t = (label: string, fn: () => void) => { fn(); passed++; console.log(`  ok — ${label}`); };

t('number clamps to 0–99', () => {
  assert.equal(sanitizeJersey({ number: -4, name: '' }).number, 0);
  assert.equal(sanitizeJersey({ number: 231, name: '' }).number, 99);
  assert.equal(sanitizeJersey({ number: 23.6, name: '' }).number, 24);
});

t('name is uppercased and charset-limited', () => {
  assert.equal(sanitizeJersey({ number: 1, name: 'bonds' }).name, 'BONDS');
  assert.equal(sanitizeJersey({ number: 1, name: 'O\'Neal-Jr!<script>' }).name, 'ONEAL-JRSCRI'); // charset-stripped, 12-char cap
  assert.equal(sanitizeJersey({ number: 1, name: 'A Very Long Nameplate Indeed' }).name, 'A VERY LONG');
});

t('garbage never throws, never invents', () => {
  assert.deepEqual(sanitizeJersey(null), { number: 0, name: '' });
  assert.deepEqual(sanitizeJersey(undefined), defaultJersey());
  assert.deepEqual(sanitizeJersey('23'), { number: 0, name: '' });
  assert.equal(sanitizeJersey({ number: 'abc', name: 42 }).number, 0);
  assert.equal(sanitizeJersey({ number: 'abc', name: 42 }).name, '42'); // coercion is fine — digits are legal on a plate
});

console.log(`closet-jersey-tests: ${passed} checks green`);
