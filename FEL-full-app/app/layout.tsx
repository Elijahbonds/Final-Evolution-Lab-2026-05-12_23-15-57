import type { CSSProperties } from 'react'
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

const fontVariables = {
  '--font-display': '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", sans-serif',
  '--font-sans': 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  '--font-mono': '"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
} as CSSProperties

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
      <body className="font-sans min-h-screen bg-[#050505]" style={fontVariables}>
        <Providers>
          {children}
          <Toaster theme="dark" position="top-center" />
          {/* IMPORTANT: Do not remove — handles chunk loading race conditions in the dev server */}
          <ChunkLoadErrorHandler />
        </Providers>
      </body>
    </html>
  )
}
