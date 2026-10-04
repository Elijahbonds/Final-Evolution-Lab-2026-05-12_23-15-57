'use client';

// /screen — the QR page. Two ways in, and nothing else loaded: no pose runtime until a button is tapped.
import { ScreenFrame } from '@/app/play/mirror/assess/_components/screen-ui';
import { StartStep } from '@/app/play/mirror/assess/_components/gate-steps';
import { ASSESS_PATH } from '@/lib/screen/routes';

export function ScreenStart() {
  const back = () => { if (typeof window !== 'undefined' && window.history.length > 1) window.history.back(); };
  return (
    <ScreenFrame back={back}>
      <StartStep jumpHref={`${ASSESS_PATH}?run=jump`} fullHref={`${ASSESS_PATH}?run=full`} />
    </ScreenFrame>
  );
}
