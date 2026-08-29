/**
 * /dev/anim — Phase 1 deliverable D: Animation diagnostic harness.
 *
 * Acceptance gate for the animation-binding remediation: if a clip plays
 * correctly HERE, it plays correctly in-game. Not linked from nav; a plain dev
 * route for visual verification of clip playback, cross-fade, and bone binding.
 */
import type { Metadata } from 'next';
import AnimHarnessClient from './_components/anim-harness-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'FEL — Animation Diagnostic Harness',
  robots: { index: false, follow: false },
};

export default function DevAnimPage() {
  return <AnimHarnessClient />;
}
