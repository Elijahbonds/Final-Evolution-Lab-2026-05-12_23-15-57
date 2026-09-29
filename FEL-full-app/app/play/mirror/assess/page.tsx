import { AssessApp } from './_components/assess-app';

// Mirror Assess: the Quick Screen (lib/assess; FEL-MIRROR-REALTIME-SPEC phases 1–2). A new route beside the Mirror's
// existing tabs, which it does not touch. Open to anyone, with no sign-in: camera and pose run in the browser, there is
// no Babylon here, and nothing is saved to the server (SCREEN-SHIP A2-3): the results stay on the phone. The QR code's
// stable address is /screen, which sends here.
export default function MirrorAssessPage() {
  return <AssessApp />;
}
