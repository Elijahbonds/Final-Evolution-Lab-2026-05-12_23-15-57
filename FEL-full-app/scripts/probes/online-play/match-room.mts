// ONLINE-PLAY PROBE: the `?net=` match room, measured against a REAL local netd with the app's own netcode
// (lib/net NetdTransport + NetSession, exactly what attachNetplay builds). No browser: the modes only call
// net.tick(intent) and net.sourceFor(id).poll(), so this drives those two calls the way a mode's frame loop does.
//
// What it answers (lane/online-play, 2026-11-21):
//   A. does the host's simulation receive the guest's input when the guest's page opened LATER than the host's
//      (always true in "Start together": the guest navigates 400 ms after the host, then loads a 3D mode)?
//   B. does the guest's page ever learn anything about the host's world (snapshots)?
//   C. host leaves mid-match: does authority move, and does the promoted page start reading input?
//   D. a 6-seat room (netd MAX_PLAYERS): do all five guests reach the host?
//
//   NETD_PORT=3798 npx tsx scripts/probes/online-play/match-room.mts           (starts and stops its own netd)
//   NETD_URL=ws://127.0.0.1:3798 ...                                           (use a netd you started)
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sessionNs from '../../../lib/net/NetSession';
import * as transportNs from '../../../lib/net/NetdTransport';
import type { NetStatus } from '../../../lib/net/NetdTransport';
import type { NetSession as NetSessionT } from '../../../lib/net/NetSession';
import type { Intent } from '../../../lib/net/protocol';

// .mts → .ts interop: the CJS-compiled module's exports sit on the namespace or its default
const pick = <T,>(ns: unknown, k: string): T => ((ns as Record<string, unknown>)[k] ?? ((ns as { default?: Record<string, unknown> }).default ?? {})[k]) as T;
const NetSession = pick<typeof sessionNs.NetSession>(sessionNs, 'NetSession');
const NetdTransport = pick<typeof transportNs.NetdTransport>(transportNs, 'NetdTransport');
type NetSession = NetSessionT;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const PORT = Number(process.env.NETD_PORT ?? 3798);
const URL_ = process.env.NETD_URL ?? `ws://127.0.0.1:${PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const intent = (o: Partial<Intent> = {}): Intent => ({ moveX: 0, moveY: 0, sprint: false, action: false, actionHeld: 0, pass: false, steal: false, ...o });

// NETD=old: the pre-party netd production still runs (git 6c438074^, before PARTY-CHAT), written beside room.ts for the run only
const OLD = process.env.NETD === 'old';
const oldFile = path.join(ROOT, 'server/netd/src/.probe-old-index.ts');
let netd: ReturnType<typeof spawn> | null = null;
if (!process.env.NETD_URL) {
  if (OLD) fs.writeFileSync(oldFile, execFileSync('git', ['show', '6c438074^:FEL-full-app/server/netd/src/index.ts'], { cwd: ROOT, encoding: 'utf8' }));
  netd = spawn(process.execPath, ['--import', 'tsx', OLD ? 'src/.probe-old-index.ts' : 'src/index.ts'], { cwd: path.join(ROOT, 'server/netd'), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  process.on('exit', () => { try { netd?.kill(); } catch { /* gone */ } try { if (OLD) fs.unlinkSync(oldFile); } catch { /* none */ } });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/healthz`)).ok) break; } catch { /* not yet */ } await sleep(250); }
}

/** What attachNetplay builds, without the window. */
function peer(room: string, id: string, mode = 'onevone') {
  const statuses: NetStatus[] = [];
  let session: NetSession;
  const t = new NetdTransport({
    url: URL_, roomId: room, peerId: id, mode,
    onStatus: (s) => {
      statuses.push(s);
      if (s.kind === 'open') session?.setAuthority(s.isAuthority);
      if (s.kind === 'peer_leave' && s.authorityChanged) session?.setAuthority(s.authority === id);
    },
  });
  session = new NetSession({ transport: t, selfId: id, isAuthority: false });
  return { id, session, statuses };
}

const out: Record<string, unknown> = {};
const verdict = (k: string, pass: boolean, detail: unknown) => { out[k] = { pass, detail }; console.log(`${pass ? 'PASS' : 'FAIL'} ${k} — ${JSON.stringify(detail)}`); };

/** Run `ms` of 60 fps frames: every page sends its intent; the host polls each guest's source. */
async function frames(ms: number, pages: ReturnType<typeof peer>[], send: (p: ReturnType<typeof peer>) => Intent | null, read: string[]) {
  const got: Record<string, { frames: number; nonNull: number; moved: number }> = {};
  for (const r of read) got[r] = { frames: 0, nonNull: 0, moved: 0 };
  const end = Date.now() + ms;
  while (Date.now() < end) {
    for (const p of pages) { const i = send(p); if (i) p.session.sendLocalIntent(i); }
    const host = pages.find((p) => p.session.isAuthority);
    if (host) for (const r of read) {
      const i = host.session.intentFor(r);
      got[r].frames++;
      if (i) { got[r].nonNull++; if (i.moveX > 0.5) got[r].moved++; }
    }
    await sleep(16);
  }
  return got;
}

// ── A + B: 1v1, the guest's page opens 1.2 s after the host's (navigation 400 ms + a 3D load) ─────────────────────
{
  const room = `probe-a-${Date.now()}`;
  const host = peer(room, 'hHOST');
  await sleep(1200);
  const guest = peer(room, 'foe');
  await sleep(500);
  const got = await frames(3000, [host, guest], (p) => (p.id === 'foe' ? intent({ moveX: 1 }) : intent()), ['foe']);
  verdict('A guest input reaches the host (guest opened 1.2 s later)', got.foe.moved > got.foe.frames * 0.5,
    { hostIsAuthority: host.session.isAuthority, ...got.foe, hostTick: host.session.tickNow(), guestTick: guest.session.tickNow() });
  // B: the old SnapshotBuffer path (publish()) — no mode has ever called it; the shared world rides lib/net/play.ts instead (E here,
  // the browser e2e for a real game). Kept as a record of the before: 0 snapshots.
  out['B old snapshot path (publish) — no mode calls it'] = { pass: null, detail: { snapshotsBuffered: guest.session.buffered } };
  console.log(`INFO B old snapshot path — ${JSON.stringify({ snapshotsBuffered: guest.session.buffered })}`);
  // the same pair, but opened inside one tick of each other (the only case today's tick keying handles)
  const room2 = `probe-a2-${Date.now()}`;
  const h2 = peer(room2, 'hHOST2'); const g2 = peer(room2, 'foe');
  await sleep(500);
  const got2 = await frames(2000, [h2, g2], (p) => (p.id === 'foe' ? intent({ moveX: 1 }) : intent()), ['foe']);
  verdict('A2 control: guest input reaches the host when both opened in the same tick', got2.foe.moved > got2.foe.frames * 0.5, got2.foe);
  for (const p of [host, guest, h2, g2]) p.session.dispose();
}

// ── C: host leaves ─────────────────────────────────────────────────────────────────────────────────────────────────
{
  const room = `probe-c-${Date.now()}`;
  const host = peer(room, 'hHOST');
  const guest = peer(room, 'foe');
  await sleep(600);
  host.session.dispose();
  await sleep(800);
  verdict('C authority moves to the guest when the host leaves', guest.session.isAuthority, { statuses: guest.statuses.map((s) => s.kind) });
  guest.session.dispose();
}

// ── D: six in one room ─────────────────────────────────────────────────────────────────────────────────────────────
{
  const room = `probe-d-${Date.now()}`;
  const host = peer(room, 'hHOST', 'threevthree');
  const ids = ['net1', 'net2', 'net3', 'net4', 'net5'];
  const guests: ReturnType<typeof peer>[] = [];
  for (const id of ids) { await sleep(300); guests.push(peer(room, id, 'threevthree')); }
  await sleep(600);
  const seventh = peer(room, 'net6', 'threevthree');
  await sleep(600);
  const got = await frames(2500, [host, ...guests], (p) => (p.id === 'hHOST' ? intent() : intent({ moveX: 1 })), ids);
  verdict('D five guests reach a 3v3 host', ids.every((i) => got[i].moved > got[i].frames * 0.5), got);
  verdict('D a seventh is refused (room full)', seventh.statuses.some((s) => s.kind === 'error' && s.reason === 'full'), seventh.statuses.map((s) => s.kind));
  for (const p of [host, ...guests, seventh]) p.session.dispose();
}

// ── E: the shared-play frames (world, hud, poss, end) reach the other page through this netd ───────────────────────────────
{
  const room = `probe-e-${Date.now()}`;
  const host = peer(room, 'hHOST');
  const guest = peer(room, 'foe');
  const got: string[] = [];
  guest.session.onPlay = (m) => { got.push(m.t); };
  await sleep(600);
  host.session.sendPlay({ t: 'world', from: 'hHOST', tick: 1, sent: Date.now(), bodies: [{ p: [0, 0, 0], y: 0 }], loose: [[0, 0, 0]], seats: { hHOST: 0, foe: 1 }, teams: [0, 1] });
  host.session.sendPlay({ t: 'hud', from: 'hHOST', sent: Date.now(), hud: { score: 2 } });
  host.session.sendPlay({ t: 'poss', from: 'hHOST', to: 'foe', sent: Date.now(), seq: 1, score: { hHOST: 2, foe: 0 } });
  host.session.sendPlay({ t: 'end', from: 'hHOST', sent: Date.now(), outcome: 'WIN', score: { hHOST: 11 }, teamScore: [11, 4], team: { hHOST: 0, foe: 1 } });
  await sleep(600);
  verdict('E the shared-play frames cross this netd', ['world', 'hud', 'poss', 'end'].every((t) => got.includes(t)), got);
  for (const p of [host, guest]) p.session.dispose();
}

// ── F: the party path on this netd (the old one has none: the app reads that as "Parties need a server update") ─────────────
{
  const first = await new Promise<string>((res) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/party`);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'p_hello', v: 1, create: true, name: 'PROBE' }));
    ws.onmessage = (ev) => { res(String(ev.data)); ws.close(); };
    ws.onerror = () => res('(socket error)');
    setTimeout(() => res('(nothing)'), 3000);
  });
  const health = await (await fetch(`http://127.0.0.1:${PORT}/healthz`)).json().catch(() => null);
  verdict('F the party path', OLD ? /room and peer required/.test(first) : /p_welcome/.test(first), { first: first.slice(0, 160), health });
}

console.log(JSON.stringify(out));
await sleep(300);
process.exit(0);
