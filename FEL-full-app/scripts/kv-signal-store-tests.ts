// Proof for the KV-backed SignalStore — the production Controller Link store.
//
// This is the piece that decides whether Controller Link works on Vercel at all.
// The memory store is single-instance by construction, so the KV store is what
// actually has to be right, and it cannot be exercised against a real endpoint
// here. It is driven against a fake transport instead, which also lets the
// multi-instance property be tested directly: TWO store objects over ONE backing
// map is exactly the isolate-split that breaks the memory store.

import { KvSignalStore, type KvTransport } from '../lib/controller-link/kvSignalStore';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

/** Fake KV. `backing` is shared so several stores can front the same data. */
function fakeKv(backing: Map<string, string>): KvTransport & { calls: number } {
  const t = {
    calls: 0,
    async get(key: string) { t.calls++; return backing.get(key) ?? null; },
    async set(key: string, value: string) { t.calls++; backing.set(key, value); },
    async incr(key: string) {
      t.calls++;
      const n = Number(backing.get(key) ?? '0') + 1;
      backing.set(key, String(n));
      return n;
    },
  };
  return t;
}

async function main(): Promise<void> {
  // ── A. basic room lifecycle ───────────────────────────────────────────────
  const backing = new Map<string, string>();
  const store = new KvSignalStore(fakeKv(backing));

  await store.createRoom('AB12', 'threepoint', 'host-1');
  const room = await store.getRoom('AB12');
  ok(room !== null, 'A1 room is retrievable after create');
  ok(room?.modeId === 'threepoint', 'A2 modeId round-trips');
  ok((await store.getRoom('ZZZZ')) === null, 'A3 unknown room is null');

  // ── B. THE reason this class exists ───────────────────────────────────────
  // Two separate store objects over one backing map = two serverless isolates.
  // The memory store fails this by construction; this must not.
  const isolateA = new KvSignalStore(fakeKv(backing));
  const isolateB = new KvSignalStore(fakeKv(backing));
  await isolateA.push('AB12', { from: 'phone-1', to: 'host', data: { hello: 1 } });
  const seenByB = await isolateB.poll('AB12', 'host', 0);
  ok(seenByB.length === 1, `B1 a message written by one isolate is read by another (got ${seenByB.length})`);
  ok((seenByB[0]?.data as { hello?: number })?.hello === 1, 'B2 payload survives the isolate split');
  ok((await isolateB.getRoom('AB12')) !== null, 'B3 the room itself is visible across isolates');

  // ── C. mailbox routing ────────────────────────────────────────────────────
  await store.push('AB12', { from: 'host', to: 'phone-1', data: { offer: 1 } });
  const hostBox = await store.poll('AB12', 'host', 0);
  const phoneBox = await store.poll('AB12', 'phone-1', 0);
  ok(hostBox.length === 1, `C1 host mailbox holds only its own mail (${hostBox.length})`);
  ok(phoneBox.length === 1, `C2 phone mailbox holds only its own mail (${phoneBox.length})`);
  ok((phoneBox[0].data as { offer?: number }).offer === 1, 'C3 phone got the offer, not the hello');

  // ── D. the poll cursor ────────────────────────────────────────────────────
  ok((await store.poll('AB12', 'host', hostBox[0].seq)).length === 0,
    'D1 after-cursor suppresses already-read messages');

  // Sequence must be globally monotonic across mailboxes, or two pollers can
  // agree on a cursor value that means different things to each of them.
  const s1 = await store.push('AB12', { from: 'a', to: 'host', data: 1 });
  const s2 = await store.push('AB12', { from: 'b', to: 'phone-1', data: 2 });
  ok(typeof s1 === 'number' && typeof s2 === 'number' && s2 > s1,
    `D2 sequence is monotonic across different mailboxes (${s1} -> ${s2})`);

  // ── E. reconnect must not create a ghost peer ─────────────────────────────
  await store.addPeer('AB12', 'phone-1', 'Elijah');
  await store.addPeer('AB12', 'phone-1', 'Elijah');
  const r2 = await store.getRoom('AB12');
  ok(r2?.peers.length === 1, `E1 reconnecting peer is not duplicated (${r2?.peers.length})`);
  await store.addPeer('AB12', 'phone-2', 'Sam');
  ok((await store.getRoom('AB12'))?.peers.length === 2, 'E2 a genuinely new peer is added');

  // ── F. failure modes must not throw ───────────────────────────────────────
  ok((await store.push('NOPE', { from: 'x', to: 'y', data: 1 })) === null,
    'F1 pushing to a missing room returns null rather than throwing');
  ok((await store.poll('NOPE', 'host', 0)).length === 0, 'F2 polling a missing room is empty');
  ok((await store.addPeer('NOPE', 'p', 'n')) === null, 'F3 addPeer on a missing room is null');

  // A transport that throws must degrade, not crash a join.
  const broken = new KvSignalStore({
    async get() { throw new Error('kv down'); },
    async set() { throw new Error('kv down'); },
    async incr() { throw new Error('kv down'); },
  });
  let threw = false;
  try { await broken.poll('AB12', 'host', 0); } catch { threw = true; }
  ok(!threw, 'F4 a dead transport does not throw out of poll()');

  if (fail.length) {
    console.error(`kv-signal-store-tests: ${fail.length} FAILED of ${checks}`);
    for (const f of fail) console.error('  ✗ ' + f);
    process.exit(1);
  }
  console.log(`kv-signal-store-tests: ${checks} checks green — multi-instance safe`);
}

void main();
