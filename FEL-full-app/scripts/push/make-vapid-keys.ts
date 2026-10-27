#!/usr/bin/env -S npx tsx
/**
 * scripts/push/make-vapid-keys.ts — the owner's step for web push (OWN-19; docs/OFFLINE-AND-PUSH.md). Prints a fresh
 * VAPID key pair (P-256, base64url) made with Node's own crypto; no dependency, nothing written to disk, nothing sent.
 *
 *   npx tsx scripts/push/make-vapid-keys.ts
 *
 * Put both lines in the deploy env (the private key is a SECRET: never commit it, never paste it in a chat), set
 * VAPID_SUBJECT to "mailto:<the ops address>" and PUSH_ENABLED=true. Keep the pair: a new pair invalidates every
 * browser's subscription (each must turn notifications on again).
 */
import { newVapidKeyPair } from '../../lib/push/crypto';

const { publicKey, privateKey } = newVapidKeyPair();
console.log(`VAPID_PUBLIC_KEY="${publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${privateKey}"`);
