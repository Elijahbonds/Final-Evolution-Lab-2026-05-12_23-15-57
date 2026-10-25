// The key flows, in the order the owner named them (quality round 2026-10-20).
import type { Flow } from '../../../scripts/e2e/flow';
import { signupFlow } from './signup.flow';
import { coachInviteFlow } from './coach-invite.flow';
import { checkoutFlow } from './checkout.flow';
import { playModeFlow } from './play-mode.flow';
import { studioFlow } from './studio.flow';

export const KEY_FLOWS: Flow[] = [signupFlow, playModeFlow, coachInviteFlow, checkoutFlow, studioFlow];
