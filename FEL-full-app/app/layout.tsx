import { Barlow_Condensed, IBM_Plex_Sans, JetBrains_Mono } from 'next/font/google'
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

export const dynamic = 'force-dynamic'

const barlow = Barlow_Condensed({ subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-display' })
const plexSans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

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
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${barlow.variable} ${plexSans.variable} ${jetbrainsMono.variable} font-sans min-h-screen bg-[#050505]`}>
        <Providers>
          {/* THE ONE BAR (2026-09-20). Above the page, not inside it: thirty-three routes each mounted their own
              AppHeader and BottomNav, which meant nine chips at the top and, once the tabs arrived, two navigation
              bars stacked at the bottom. The rail carries PRQ, the wallet and the way out; on a desktop it carries
              the tabs too. */}
          <StatusRail />
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
