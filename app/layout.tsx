import { Barlow_Condensed, IBM_Plex_Sans, JetBrains_Mono } from 'next/font/google'
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

export const metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? 'http://localhost:3000'),
  title: 'Final Evolution Lab',
  description: 'Premium athlete-development game — train, compete, evolve.',
  icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' },
  openGraph: {
    title: 'Final Evolution Lab',
    description: 'Premium athlete-development game — train, compete, evolve.',
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
      <head>
        <script defer src="https://apps.abacus.ai/chatllm/appllm-lib.js"></script>
      </head>
      <body className={`${barlow.variable} ${plexSans.variable} ${jetbrainsMono.variable} font-sans min-h-screen bg-[#050505]`}>
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
