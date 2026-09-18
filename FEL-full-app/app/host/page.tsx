// /host — the big screen (mission Phase B).
//
// The mission splits the runtime into two roles from one build: HOST renders the game, PAD renders no game
// and relays input. The PAD half already had a route (/controller/[code]); this is the other one, and it
// exists so a TV browser has somewhere to go that is only the host — no menus, no account wall, no other
// game chrome to get lost in with a remote control.
//
// It is deliberately thin: the HostStage client component owns the session, the presence (fullscreen, wake
// lock, orientation) and the overlay. Everything here does is pick the mode and render it.

import { HostStage } from '@/components/controller-link/host-stage';

export const dynamic = 'force-dynamic';

export default function HostPage({ searchParams }: { searchParams?: { mode?: string } }) {
  // A TV is typed on with a remote, so the mode is a query rather than a path segment and the default is the
  // pilot the mission names.
  const mode = typeof searchParams?.mode === 'string' ? searchParams.mode : 'threepoint';
  return <HostStage modeId={mode} />;
}
