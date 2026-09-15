// Signaling client — thin HTTP wrapper used by both host and controller.
// Polls only while a handshake is outstanding; stops once the peer link opens.

const POLL_MS = 250;

export interface SignalMessage { seq: number; from: string; to: string; data: unknown }

/** Back-off before each retry of a room create (CONTROLLER-USB-QR-HELP) — the same 0.5 / 1 / 2 s Babylon uses for assets. */
export const CREATE_RETRY_MS = [500, 1000, 2000] as const;

/**
 * A fetch that survives a blip. A network failure (fetch REJECTS: "Failed to fetch") or a 5xx is retried after each
 * delay; a 4xx is the server's real answer and comes straight back. The eye's "Controller link unavailable — Failed to
 * fetch" was one POST made while the server restarted: a single rejected fetch ended the link for the page view.
 */
export async function fetchWithRetry(
  doFetch: () => Promise<Response>,
  delays: readonly number[] = CREATE_RETRY_MS,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<Response> {
  for (let i = 0; ; i++) {
    try {
      const res = await doFetch();
      if (res.status < 500 || i >= delays.length) return res;
    } catch (e) {
      if (i >= delays.length) throw e;
    }
    await wait(delays[i]);
  }
}

/** Plain words for a room that could not be opened — never a raw "Failed to fetch". */
export function linkErrorText(e: unknown): string {
  const msg = String((e as { message?: unknown })?.message ?? e);
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return "Can't reach the game server";
  const status = /createRoom failed: (\d+)/.exec(msg);
  return status ? `The game server refused the room (${status[1]})` : msg;
}

export async function createRoom(modeId: string, hostId: string): Promise<string> {
  const res = await fetchWithRetry(() => fetch('/api/controller-link/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ modeId, hostId }),
  }));
  if (!res.ok) throw new Error(`createRoom failed: ${res.status}`);
  return (await res.json()).code as string;
}

export async function lookupRoom(
  code: string,
): Promise<{ code: string; modeId: string; peers: { peerId: string; name: string }[] } | null> {
  const res = await fetch(`/api/controller-link/rooms?code=${encodeURIComponent(code)}`);
  if (!res.ok) return null;
  return res.json();
}

export async function postSignal(
  code: string, from: string, to: string, data: unknown, announce?: { name: string },
): Promise<void> {
  await fetch('/api/controller-link/signal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, from, to, data, announce }),
  });
}

/**
 * Poll for messages addressed to `self`. Returns a stop function.
 * Errors are swallowed and retried — a single failed poll during a WiFi blip
 * must not end the join.
 */
export function pollSignals(
  code: string,
  self: string,
  onMessage: (m: SignalMessage) => void,
  onPeers?: (peers: { peerId: string; name: string }[]) => void,
): () => void {
  let after = 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const res = await fetch(
        `/api/controller-link/signal?code=${encodeURIComponent(code)}&to=${encodeURIComponent(self)}&after=${after}`,
      );
      if (res.ok) {
        const body = await res.json();
        for (const m of (body.messages ?? []) as SignalMessage[]) {
          after = Math.max(after, m.seq);
          onMessage(m);
        }
        if (onPeers && body.peers) onPeers(body.peers);
      }
    } catch { /* transient — keep polling */ }
    if (!stopped) timer = setTimeout(tick, POLL_MS);
  };

  void tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
