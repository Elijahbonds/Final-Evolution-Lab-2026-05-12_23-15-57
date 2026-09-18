// StreamingBridge — the external-streaming layer (M58, Phase 8). The honest
// architecture, stated plainly:
//
//   WORKS TODAY, ZERO CREDENTIALS: both Spotify and Apple Music publish
//   official EMBED players (open.spotify.com/embed/…, embed.music.apple.com)
//   that render and play inside an iframe with no API keys — full tracks
//   for listeners logged into those services in the same browser, previews
//   otherwise. parseStreamingUrl() turns any pasted track/album/playlist
//   link into its official embed. This is ToS-clean display + playback of
//   Spotify/Apple-hosted content inside FEL, live the day this ships.
//
//   NEEDS REAL CREDENTIALS (the marked seams below): full in-app playback
//   CONTROL (play/pause/skip/seek/queue on OUR buttons, no iframe) requires
//   per-provider SDKs and owner-supplied credentials:
//     Spotify — Web Playback SDK: a (free) Spotify Developer app's CLIENT_ID
//       + OAuth (PKCE) + the listener having Spotify Premium.
//       Env seam: FEL_SPOTIFY_CLIENT_ID, redirect https://<app>/callback/spotify
//     Apple Music — MusicKit JS: an Apple Developer Program membership
//       ($99/yr) + a MusicKit private key used to mint a DEVELOPER_TOKEN
//       server-side.  Env seam: FEL_APPLE_DEV_TOKEN (minted, short-lived).
//   connect() records intent and reports exactly what's missing — it never
//   fakes a connected state.

export type Provider = 'spotify' | 'apple';

export interface StreamingLink {
  provider: Provider;
  url: string;                 // the original share URL the creator pasted
  embedUrl: string;            // the official embed player URL
  kind: 'track' | 'album' | 'playlist' | 'artist' | 'unknown';
}

export const PROVIDER_META: Record<Provider, { label: string; color: string; connectNeeds: string }> = {
  spotify: {
    label: 'Spotify', color: '#1DB954',
    connectNeeds: 'a Spotify Developer app CLIENT_ID (free at developer.spotify.com) + listener Premium for full in-app control',
  },
  apple: {
    label: 'Apple Music', color: '#FA2D48',
    connectNeeds: 'an Apple Developer membership + a MusicKit developer token minted server-side',
  },
};

/** Parse a pasted share URL into its official embed. Returns null if the
 *  URL isn't a recognized Spotify/Apple Music content link. */
export function parseStreamingUrl(raw: string): StreamingLink | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }

  if (u.hostname === 'open.spotify.com') {
    const m = u.pathname.match(/^\/(intl-[a-z]+\/)?(track|album|playlist|artist)\/([A-Za-z0-9]+)/);
    if (!m) return null;
    const kind = m[2] as StreamingLink['kind'];
    return {
      provider: 'spotify', url: raw.trim(), kind,
      embedUrl: `https://open.spotify.com/embed/${m[2]}/${m[3]}`,
    };
  }

  if (u.hostname === 'music.apple.com') {
    // embed.music.apple.com mirrors the exact same path+query
    const kind: StreamingLink['kind'] = u.pathname.includes('/album/')
      ? (u.searchParams.has('i') ? 'track' : 'album')
      : u.pathname.includes('/playlist/') ? 'playlist'
      : u.pathname.includes('/artist/') ? 'artist' : 'unknown';
    if (kind === 'unknown') return null;
    return {
      provider: 'apple', url: raw.trim(), kind,
      embedUrl: `https://embed.music.apple.com${u.pathname}${u.search}`,
    };
  }

  return null;
}

// ── Connection state (the credential seams — never fakes connected) ───────
export type ConnState = 'unconnected' | 'awaiting-credentials';
const KEY_CONN = 'fel_streaming_conn_v1';

function readConn(): Record<Provider, ConnState> {
  try { return { spotify: 'unconnected', apple: 'unconnected', ...JSON.parse(localStorage.getItem(KEY_CONN) ?? '{}') }; }
  catch { return { spotify: 'unconnected', apple: 'unconnected' }; }
}

export const StreamingConnect = {
  state(): Record<Provider, ConnState> { return readConn(); },

  /** Record the user's intent to connect. Reports what is still needed.
   *  CREDENTIAL SEAM: when FEL_SPOTIFY_CLIENT_ID / FEL_APPLE_DEV_TOKEN are
   *  provisioned, replace the body of this branch with the real flow:
   *    spotify → OAuth PKCE redirect, then load the Web Playback SDK and
   *              transfer playback to the FEL device_id
   *    apple   → MusicKit.configure({ developerToken }), music.authorize()
   *  Until then this stays truthful: intent recorded, nothing pretended. */
  requestConnect(p: Provider): { ok: false; needs: string } {
    const conn = readConn();
    conn[p] = 'awaiting-credentials';
    localStorage.setItem(KEY_CONN, JSON.stringify(conn));
    console.info(`[FEL-STREAM] connect(${p}) — CREDENTIAL SEAM not provisioned. Needs: ${PROVIDER_META[p].connectNeeds}`);
    return { ok: false, needs: PROVIDER_META[p].connectNeeds };
  },

  reset(p: Provider): void {
    const conn = readConn();
    conn[p] = 'unconnected';
    localStorage.setItem(KEY_CONN, JSON.stringify(conn));
  },
};

// ── Saved streaming picks (the listening shelf) ───────────────────────────
const KEY_SHELF = 'fel_streaming_shelf_v1';

export const StreamingShelf = {
  list(): StreamingLink[] {
    try { return JSON.parse(localStorage.getItem(KEY_SHELF) ?? '[]') as StreamingLink[]; }
    catch { return []; }
  },
  add(link: StreamingLink): void {
    const all = this.list().filter((l) => l.url !== link.url);
    localStorage.setItem(KEY_SHELF, JSON.stringify([link, ...all].slice(0, 30)));
    // SYNC SEAM: POST /api/streaming/shelf — per-user, cross-device.
  },
  remove(url: string): void {
    localStorage.setItem(KEY_SHELF, JSON.stringify(this.list().filter((l) => l.url !== url)));
  },
};
