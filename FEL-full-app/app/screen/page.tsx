import { ScreenStart } from './screen-start';

export const dynamic = 'force-dynamic';

/**
 * /screen — the Quick Screen's one stable QR address. One plain page, the same for every event: the jump button
 * first, then the full screen. A query string is not forwarded (no tracking tag on the QR). No sign-in.
 * The pose runtime loads only after a button opens /play/mirror/assess.
 */
export default function ScreenEntry() {
  return <ScreenStart />;
}
