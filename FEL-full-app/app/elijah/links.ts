// The /elijah links page's buttons (LINKS-PAGE, 2026-09-29). Order, labels and hrefs are pinned byte for byte by
// lib/links/elijah.test.tsx, the affiliate query strings included: no trailing-slash change, no encoding, no added
// UTM or ref parameter. Two internal links (/screen, /try) and the rest external.
//
// Pure data.

export interface LinkButton {
  label: string;
  href: string;
  /** Opens in a new tab with rel="noopener noreferrer". */
  external: boolean;
  /** A small "affiliate" label beside the button (Lead confirmed 2026-09-29: PJF and Total Body Board only). */
  affiliate?: true;
  /** Buttons that share a caption (the two Instagram accounts). */
  group?: 'Instagram';
}

export const ELIJAH_LINKS: readonly LinkButton[] = [
  { label: 'Free Jump Screen', href: '/screen', external: false },
  { label: 'Play the Game, Free', href: '/try', external: false },
  { label: 'The Neuro-Mechanic\'s Blueprint (Kindle)', href: 'https://www.amazon.com/dp/B0H5J1M18H', external: true },
  { label: 'All Books on Amazon', href: 'https://www.amazon.com/Elijah-Bonds/e/B0H63J1Q7B', external: true },
  { label: 'Merch (MILLIONS)', href: 'https://millions.co/elijah-bonds-basketball', external: true },
  { label: 'Merch (Fan Arch)', href: 'https://fanarch.com/collections/elijah-bonds', external: true },
  { label: 'PJF Performance Band', href: 'https://pjf-performance-shop.myshopify.com/?sca_ref=9885072.t2P8qJogGNMRly', external: true, affiliate: true },
  { label: 'Total Body Board, code EBondJmp', href: 'https://www.totalbodyboard.com', external: true, affiliate: true },
  { label: 'Elijah Bonds', href: 'https://www.instagram.com/elijahbonds/', external: true, group: 'Instagram' },
  { label: 'Final Evolution', href: 'https://www.instagram.com/finalevolutionllc/', external: true, group: 'Instagram' },
  { label: 'YouTube', href: 'https://www.youtube.com/channel/UCP_ziu1PO1DGWfpmIP3kEng', external: true },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/elijah-bonds-771aa1228', external: true },
];

export const LINKS_TITLE = 'Elijah Bonds';
export const LINKS_TAGLINE = 'Final Evolution Lab';
export const AFFILIATE_NOTE = 'Some links are affiliate links.';
