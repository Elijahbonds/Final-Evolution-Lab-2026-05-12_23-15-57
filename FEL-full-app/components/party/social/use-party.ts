'use client';
// The party, for React (PARTY-CHAT lane, 2026-10-13): one external store (lib/party/social/client.ts), read with
// useSyncExternalStore so every surface — the floating bar, the panel, the /party hub — draws the same state.
import { useSyncExternalStore } from 'react';
import { partyClient } from '@/lib/party/social/client';
import { EMPTY_PARTY, type PartyState } from '@/lib/party/social/state';

const SERVER: PartyState = EMPTY_PARTY;

export function useParty(): PartyState {
  const c = typeof window === 'undefined' ? null : partyClient();
  return useSyncExternalStore(c ? c.subscribe : () => () => {}, c ? c.getState : () => SERVER, () => SERVER);
}
