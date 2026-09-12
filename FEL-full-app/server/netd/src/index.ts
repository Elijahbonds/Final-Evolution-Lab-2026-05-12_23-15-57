// fel-netd — the socket shell (2026-09-12).
//
// Deliberately thin: every rule that decides a match lives in room.ts and is unit-tested without
// opening a port. This file moves bytes and owns the clock.
//
// Cloud Run holds WebSockets (it is not Cloud Functions), which is the whole reason a real
// authoritative server is possible here at all while the app itself stays on Firebase Hosting.
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  createRoom, join, leave, touch, reap, isCollectable, tickAt, ackMap, type Room,
} from './room.js';   // Node ESM resolves real paths: the extension is required at runtime

const PORT = Number(process.env.PORT ?? 8080);
const TICK_MS = 1000 / 30;
const REAP_EVERY_MS = 2000;

const rooms = new Map<string, Room>();
const sockets = new Map<WebSocket, { roomId: string; peerId: string }>();

const send = (ws: WebSocket, msg: unknown) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
};

function broadcast(room: Room, msg: unknown, except?: WebSocket): void {
  for (const [ws, who] of sockets) {
    if (who.roomId !== room.id || ws === except) continue;
    send(ws, msg);
  }
}

const http = createServer((req, res) => {
  // Cloud Run health check; also handy for "is netd up" from the app
  if (req.url === '/healthz') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, rooms: rooms.size, peers: sockets.size })); return; }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ server: http });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const roomId = url.searchParams.get('room');
  const peerId = url.searchParams.get('peer');
  const mode = url.searchParams.get('mode') ?? 'unknown';
  if (!roomId || !peerId) { send(ws, { t: 'error', reason: 'room and peer required' }); ws.close(); return; }

  const now = Date.now();
  let room = rooms.get(roomId);
  if (!room) { room = createRoom(roomId, mode, now); rooms.set(roomId, room); }

  const res = join(room, peerId, now);
  if (!res.ok) { send(ws, { t: 'error', reason: res.reason }); ws.close(); return; }
  sockets.set(ws, { roomId, peerId });

  send(ws, {
    t: 'welcome', peerId, roomId, mode: room.mode,
    authority: room.authority, isAuthority: res.isAuthority,
    tick: tickAt(room, now, TICK_MS), serverTime: now,
    peers: [...room.peers.keys()],
  });
  broadcast(room, { t: 'peer_join', peer: peerId, authority: room.authority }, ws);

  ws.on('message', (raw) => {
    const who = sockets.get(ws);
    if (!who) return;
    const r = rooms.get(who.roomId);
    if (!r) return;
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(String(raw)); } catch { return; }   // a malformed frame is dropped, never fatal
    touch(r, who.peerId, Date.now(), typeof msg.tick === 'number' ? msg.tick : undefined);
    if (msg.t === 'ping') { send(ws, { t: 'pong', sent: msg.sent, serverTime: Date.now() }); return; }
    // relay: stamp the sender server-side so a client cannot forge who it is
    broadcast(r, { ...msg, from: who.peerId, serverTime: Date.now(), ack: ackMap(r) }, ws);
  });

  const goodbye = () => {
    const who = sockets.get(ws);
    sockets.delete(ws);
    if (!who) return;
    const r = rooms.get(who.roomId);
    if (!r) return;
    const out = leave(r, who.peerId, Date.now());
    broadcast(r, { t: 'peer_leave', peer: who.peerId, authority: out.newAuthority, authorityChanged: out.changed });
  };
  ws.on('close', goodbye);
  ws.on('error', goodbye);
});

setInterval(() => {
  const now = Date.now();
  for (const room of [...rooms.values()]) {
    const { dropped, authorityChanged } = reap(room, now);
    for (const id of dropped) broadcast(room, { t: 'peer_leave', peer: id, authority: room.authority, authorityChanged, reason: 'timeout' });
    if (isCollectable(room, now)) rooms.delete(room.id);
  }
}, REAP_EVERY_MS);

http.listen(PORT, () => console.log(`[fel-netd] listening on ${PORT}`));
