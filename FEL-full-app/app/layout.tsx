import localFont from 'next/font/local'
import { TabBar } from '@/components/shell/tab-bar'
import { StatusRail } from '@/components/shell/status-rail'
import './globals.css'
import './theme.css'
// M95 (Pass 2): mobile canvas fix — on portrait phones the shared 16:10 game
// wrapper letterboxes to ~33% of the screen; these scoped overrides take it to
// ~80% without clipping any control. Desktop/landscape/tablet are untouched.
import './game-surface.css'
import { Providers } from '@/components/providers'
import { Toaster } from '@/components/ui/sonner'
import { ChunkLoadErrorHandler } from '@/components/chunk-load-error-handler'
import { SoundtrackDock } from '@/components/soundtrack/soundtrack-dock'

export const dynamic = 'force-dynamic'

// THE APP'S FONTS, LOADED ONCE, FROM OUR OWN FILES. Two passes meet here:
//  - FONT-SHARED (2026-09-29): next/font names every face by a hash, so a family written by name in CSS ('Chakra
//    Petch', 'JetBrains Mono') never matches: the READY cards, TAP TO START and the JuiceKit banners asked for exactly
//    that and got Courier. app/theme.css builds --fel-font-display from the variables below instead, and the variables
//    sit on <html> so its :root tokens can see them. It added the display face, Chakra Petch.
//  - FONT-LOCAL (2026-09-30): every face loads from files committed in app/fonts (next/font/local), never from
//    next/font/google, which fetched from Google at build time and failed CI's builds whenever that fetch did. The
//    files are the latin subsets next/font/google itself served (provenance, SHA-256s, licence: app/fonts/README.md).
// preload: false (owner, 2026-09-29): a face downloads only where text is set in it, so a page that never uses one
// (the Quick Screen draws in the system stack) loads none. The first visit to a page may swap from next/font's
// metric-matched fallback once; the file is cached after that.
const barlow = localFont({
  src: [
    { path: './fonts/barlow-condensed-latin-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/barlow-condensed-latin-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/barlow-condensed-latin-700.woff2', weight: '700', style: 'normal' },
    { path: './fonts/barlow-condensed-latin-800.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
  preload: false,
})
const plexSans = localFont({
  src: [{ path: './fonts/ibm-plex-sans-latin-variable.woff2', weight: '400 700', style: 'normal' }],
  variable: '--font-sans',
  display: 'swap',
  preload: false,
})
const jetbrainsMono = localFont({
  src: [{ path: './fonts/jetbrains-mono-latin-variable.woff2', weight: '100 800', style: 'normal' }],
  variable: '--font-mono',
  display: 'swap',
  preload: false,
})
// The display face (owner, 2026-09-29: Chakra Petch, the face the token was written for). Its heaviest cut is 700; the
// 800/900 the display rules ask for draw at 700.
const chakraPetch = localFont({
  src: [
    { path: './fonts/chakra-petch-latin-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/chakra-petch-latin-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/chakra-petch-latin-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/chakra-petch-latin-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-chakra',
  display: 'swap',
  preload: false,
})

// A shared link is the product's first impression, so the card carries the page's own
// promise. It used to read "Premium athlete-development game — train, compete, evolve":
// a category, not a hook, and a different pitch from the landing page's "60 seconds to a
// dunk — no account, no download". Whoever opened the link was sold something vaguer than
// what they were about to get.
const HOOK = '60 seconds to a dunk. No account, no download — drop into Venice Beach and throw down right now.'

export const metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? 'http://localhost:3000'),
  title: 'Final Evolution Lab',
  description: HOOK,
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
  openGraph: {
    type: 'website',
    siteName: 'Final Evolution Lab',
    title: '60 Seconds to a Dunk',
    description: HOOK,
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Final Evolution Lab — Venice Beach court at golden hour' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '60 Seconds to a Dunk',
    description: HOOK,
    images: ['/og-image.png'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`dark ${barlow.variable} ${plexSans.variable} ${jetbrainsMono.variable} ${chakraPetch.variable}`} suppressHydrationWarning>
      <body className="font-sans min-h-screen bg-[#050505]">
        <Providers>
          {/* THE ONE BAR (2026-09-20). Above the page, not inside it: thirty-three routes each mounted their own
              AppHeader and BottomNav, which meant nine chips at the top and, once the tabs arrived, two navigation
              bars stacked at the bottom. The rail carries PRQ, the wallet and the way out; on a desktop it carries
              the tabs too. */}
          <StatusRail />
          {/* CREATOR SOUNDTRACK (owner, 2026-10-06): the menu music and its Now Playing chip; silent on the Quick Screen */}
          <SoundtrackDock />
          {children}
          {/* The same three tabs, at the bottom of a phone where a thumb is. On a desktop this renders nothing and
              the rail above carries them instead. */}
          <TabBar />
          <Toaster theme="dark" position="top-center" />
          {/* IMPORTANT: Do not remove — handles chunk loading race conditions in the dev server */}
          <ChunkLoadErrorHandler />
        </Providers>
      </body>
    </html>
  )
}
