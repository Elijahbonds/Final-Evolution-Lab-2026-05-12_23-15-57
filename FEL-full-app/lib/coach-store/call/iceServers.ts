/**
 * ICE servers live in this one file so a TURN relay can be added later without touching the room.
 * v1 is STUN + peer-to-peer. No relay is configured unless both env vars are set.
 */
export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

const STUN: IceServer = { urls: ['stun:stun.l.google.com:19302'] };

export function iceServers(env: NodeJS.ProcessEnv = process.env): IceServer[] {
  const servers = [STUN];
  const urls = (env.COACH_CALL_TURN_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const secret = (env.COACH_CALL_TURN_SECRET ?? '').trim();
  if (urls.length && secret) {
    servers.push({ urls, username: 'fel', credential: secret });
  }
  return servers;
}
