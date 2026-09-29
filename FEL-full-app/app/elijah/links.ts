// The /elijah links page's buttons (LINKS-PAGE, 2026-09-29; the FE PM amend of 11:35 AM PT is the approved list).
// Order, labels and hrefs are pinned byte for byte by lib/links/elijah.test.tsx, the sca_ref query string included: no
// trailing-slash change, no encoding, no added UTM or ref parameter. The two internal links are RELATIVE paths: the
// page is served from more than one host, so nothing here names a host.
//
// Pure data.

export interface LinkButton {
  /** The button's label, exactly as approved. */
  label: string;
  href: string;
  /** Opens in a new tab with rel="noopener noreferrer". */
  external: boolean;
  /** The approved list's slot (slot 9 is two buttons). */
  slot: number;
  /** A discount code printed on the button beside its label (Total Body Board). */
  code?: string;
  /** The paid-link line under the button (owner rule 2026-09-29: PJF and Total Body Board only). */
  paid?: true;
  /** Buttons that share a caption (the two Instagram accounts). */
  group?: 'Instagram';
}

/** The visible line under a paid link, byte for byte (owner wording). Never a bare "affiliate" tag. */
export const PAID_LINK_NOTE = 'Paid link: I earn a commission if you buy.';

export const ELIJAH_LINKS: readonly LinkButton[] = [
  { slot: 1, label: 'Free Jump Screen', href: '/screen', external: false },
  { slot: 2, label: 'Play the Game Free', href: '/try', external: false },
  { slot: 3, label: 'Blueprint Kindle', href: 'https://www.amazon.com/dp/B0H5J1M18H', external: true },
  { slot: 4, label: 'All Books', href: 'https://www.amazon.com/Elijah-Bonds/e/B0H63J1Q7B', external: true },
  { slot: 5, label: 'MILLIONS', href: 'https://millions.co/elijah-bonds-basketball', external: true },
  { slot: 6, label: 'Fan Arch', href: 'https://fanarch.com/collections/elijah-bonds', external: true },
  { slot: 7, label: 'PJF', href: 'https://pjf-performance-shop.myshopify.com/?sca_ref=9885072.t2P8qJogGNMRly', external: true, paid: true },
  { slot: 8, label: 'Total Body Board', href: 'https://www.totalbodyboard.com', external: true, code: 'EBondJmp', paid: true },
  { slot: 9, label: 'Elijah Bonds', href: 'https://www.instagram.com/elijahbonds', external: true, group: 'Instagram' },
  { slot: 9, label: 'Final Evolution', href: 'https://www.instagram.com/finalevolutionllc', external: true, group: 'Instagram' },
  { slot: 10, label: 'YouTube', href: 'https://www.youtube.com/channel/UCP_ziu1PO1DGWfpmIP3kEng', external: true },
  { slot: 11, label: 'LinkedIn', href: 'https://www.linkedin.com/in/elijah-bonds-771aa1228', external: true },
];

export const LINKS_TITLE = 'Elijah Bonds';
export const LINKS_TAGLINE = 'Final Evolution Lab';
