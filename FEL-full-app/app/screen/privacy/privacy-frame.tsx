'use client';

// S-15: Back from privacy must not drop adult results via the /screen redirect loop.
import { useRouter } from 'next/navigation';
import { recall, tabStorage } from '@/lib/screen/store';
import { ASSESS_PATH, RESULTS_PATH } from '@/lib/screen/routes';
import { ScreenFrame } from '@/app/play/mirror/assess/_components/screen-ui';

export function PrivacyFrame({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const back = () => {
    const tab = tabStorage();
    if (recall(tab)) router.replace(RESULTS_PATH);
    else if (typeof window !== 'undefined' && window.history.length > 1) window.history.back();
    else router.replace(ASSESS_PATH);
  };
  return <ScreenFrame back={back} title="Privacy">{children}</ScreenFrame>;
}
