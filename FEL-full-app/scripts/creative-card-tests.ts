/**
 * scripts/creative-card-tests.ts — M28 Creative Card server acceptance tests.
 *
 * Harness: `yarn tsx scripts/creative-card-tests.ts` + node:assert (no jest).
 * Exits non-zero on any failure. Uses throwaway users, cleaned up in finally.
 *
 * Proves acceptance #4 (the server-verifiable contract):
 *   1. Unlicensed card  -> 422 (license gate is SERVER-enforced).
 *   2. Music/acting card -> pending_review + NOT public (moderation queue).
 *   3. Remix pays the PARENT creator a royalty (a real LEDGER ENTRY).
 *   4. Moderator approve -> card becomes public + publish faucet fires.
 * Plus discipline validation guards (secondary rules, sport designation, art/kind).
 */

import 'dotenv/config';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import {
  createCard, reviewCard, CardError, type CreateCardInput,
} from '../lib/creator/creative-card-service';
import { REASON } from '../lib/wallet/reward-rules';
import { defaultStats, defaultRarity } from '../lib/creator/creative-card-types';

const prisma = new PrismaClient();

let passed = 0, failed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  \u2713 ${name}`); }
  catch (e) { failed++; console.error(`  \u2717 ${name}\n      ${(e as Error).message}`); }
}

const artPayload = () => ({
  kind: 'art' as const,
  canvasDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  palette: ['#111111', '#ffffff'],
  brushSetId: 'default',
  appliedSurface: 'court' as const,
});

function baseInput(over: Partial<CreateCardInput> = {}): CreateCardInput {
  return {
    title: 'Test Card',
    primary: 'art',
    secondary: [],
    sportDesignation: undefined,
    art: artPayload(),
    stats: defaultStats(),
    rarity: defaultRarity(),
    isPublic: true,
    licenseAccepted: true,
    ...over,
  } as CreateCardInput;
}

async function mkUser(tag: string): Promise<string> {
  const u = await prisma.user.create({
    data: { email: `__cctest_${tag}_${Date.now()}@fel.test`, name: `CC ${tag}`, password: 'x' },
    select: { id: true },
  });
  return u.id;
}

async function cleanupUser(userId: string) {
  await prisma.creativeCard.deleteMany({ where: { ownerId: userId } }).catch(() => {});
  await prisma.cardSlot.deleteMany({ where: { userId } }).catch(() => {});
  const wallet = await prisma.wallet.findUnique({ where: { playerId: userId } }).catch(() => null);
  if (wallet) {
    await prisma.walletLedgerEntry.deleteMany({ where: { walletId: wallet.id } }).catch(() => {});
    await prisma.wallet.delete({ where: { id: wallet.id } }).catch(() => {});
  }
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
}

async function ledgerCount(userId: string, reasonCode: string): Promise<number> {
  const wallet = await prisma.wallet.findUnique({ where: { playerId: userId } });
  if (!wallet) return 0;
  return prisma.walletLedgerEntry.count({ where: { walletId: wallet.id, reasonCode } });
}

async function main() {
  console.log('M28 CREATIVE CARD — server acceptance');
  const alice = await mkUser('alice'); // creator / moderator target
  const bob = await mkUser('bob');     // remixer
  // These tests author many cards; grant ample slots so the 3-free cap doesn't
  // fire mid-suite (slot enforcement itself is covered by economy/catalog tests).
  await prisma.cardSlot.create({ data: { userId: alice, extra: 50 } });
  await prisma.cardSlot.create({ data: { userId: bob, extra: 50 } });

  try {
    // 1) License gate (server-enforced) -> 422
    await check('unlicensed card is rejected with 422', async () => {
      await assert.rejects(
        () => createCard(prisma, alice, baseInput({ licenseAccepted: false as unknown as true })),
        (e: unknown) => e instanceof CardError && e.status === 422,
      );
    });

    // discipline validation guards
    await check('>2 secondary disciplines -> 422', async () => {
      await assert.rejects(
        () => createCard(prisma, alice, baseInput({ secondary: ['music', 'dance', 'acting'] })),
        (e: unknown) => e instanceof CardError && e.status === 422,
      );
    });
    await check('sport primary without designation -> 422', async () => {
      await assert.rejects(
        () => createCard(prisma, alice, baseInput({ primary: 'sport', art: { kind: 'sport' } as any })),
        (e: unknown) => e instanceof CardError && e.status === 422,
      );
    });
    await check('art kind must match primary -> 422', async () => {
      await assert.rejects(
        () => createCard(prisma, alice, baseInput({ primary: 'dance' })),
        (e: unknown) => e instanceof CardError && e.status === 422,
      );
    });

    // 2) Music/acting -> pending_review + NOT public
    await check('music card enters pending_review and is NOT public', async () => {
      const card = await createCard(prisma, alice, baseInput({
        primary: 'music',
        art: { kind: 'music', trackId: 't1', stemUrls: ['https://x/stem.wav'], coverArtUrl: '', bpm: 120, keySignature: 'Am' } as any,
      }));
      assert.equal(card.reviewState, 'pending_review');
      assert.equal(card.isPublic, false);
    });
    await check('acting card enters pending_review and is NOT public', async () => {
      const card = await createCard(prisma, alice, baseInput({
        primary: 'acting',
        art: { kind: 'acting', sceneId: 'sc1', performanceUrl: 'https://x/line.webm', voiceLineIds: ['slot'] } as any,
      }));
      assert.equal(card.reviewState, 'pending_review');
      assert.equal(card.isPublic, false);
    });

    // 4) Moderator approve -> public + publish faucet
    await check('approving a pending music card publishes it + fires faucet', async () => {
      const card = await createCard(prisma, alice, baseInput({
        primary: 'music',
        art: { kind: 'music', trackId: 't2', stemUrls: ['https://x/s.wav'], coverArtUrl: '', bpm: 90, keySignature: 'C' } as any,
      }));
      const before = await ledgerCount(alice, REASON.CREATIVE_CARD_PUBLISH);
      await reviewCard(prisma, card.id, 'approved');
      const row = await prisma.creativeCard.findUnique({ where: { id: card.id } });
      assert.equal(row?.reviewState, 'approved');
      assert.equal(row?.isPublic, true);
      const after = await ledgerCount(alice, REASON.CREATIVE_CARD_PUBLISH);
      assert.ok(after > before, 'expected a publish faucet ledger entry after approval');
    });

    // 3) Remix pays the PARENT creator a royalty ledger entry
    await check('remix credits the parent creator a royalty (ledger entry)', async () => {
      const parent = await createCard(prisma, alice, baseInput({ title: 'Parent Art' }));
      const before = await ledgerCount(alice, REASON.CREATIVE_CARD_REMIX_ROYALTY);
      await createCard(prisma, bob, baseInput({ title: 'Bob Remix', remixOf: parent.id }));
      const after = await ledgerCount(alice, REASON.CREATIVE_CARD_REMIX_ROYALTY);
      assert.equal(after, before + 1, 'parent creator should get exactly one royalty entry');
    });

    await check('self-remix does NOT pay a royalty', async () => {
      const parent = await createCard(prisma, alice, baseInput({ title: 'Alice Original' }));
      const before = await ledgerCount(alice, REASON.CREATIVE_CARD_REMIX_ROYALTY);
      await createCard(prisma, alice, baseInput({ title: 'Alice Self-Remix', remixOf: parent.id }));
      const after = await ledgerCount(alice, REASON.CREATIVE_CARD_REMIX_ROYALTY);
      assert.equal(after, before, 'no royalty when remixing your own card');
    });
  } finally {
    await cleanupUser(bob);
    await cleanupUser(alice);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
