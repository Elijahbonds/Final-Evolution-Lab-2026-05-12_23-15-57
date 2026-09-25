const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: process.env.NEXT_OUTPUT_MODE,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../'),
    // Prisma's generated client lives in node_modules/.prisma, which the hosting
    // packager reinstalls from scratch — the deployed function got the stubs and
    // threw "@prisma/client did not initialize yet" on every page. Tracing it (and
    // the schema the client resolves at runtime) into .next means it ships with the
    // build instead of depending on a generate step that never runs there.
    outputFileTracingIncludes: {
      '/**/*': [
        './node_modules/.prisma/client/**/*',
        './prisma/schema.prisma',
      ],
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: { unoptimized: true },
  // Ship pass, Phase 9 (2026-09-03): baseline security headers. The Closet's
  // face scan uses the camera, so the permissions policy keeps camera=(self);
  // frame-ancestors 'self' — the game is not embedded anywhere else.
  // HOTFIX (2026-09-24): microphone=(self), the owner's call. `microphone=()` blocked getUserMedia on every page, so
  // Acting mode, Music vocals, the Flip recorder and voice chat could never get a mic at all. Our own pages only;
  // geolocation stays off. lib/build-config.test.ts pins this header.
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
      ],
    }];
  },
  // HOTFIX (2026-09-24): the Abacus platform's error reporter is gone. With NEXT_OUTPUT_MODE=standalone this hook
  // wrote a base64-encoded script into the tree and prepended it to the client entry, where it wrapped console.error
  // and beaconed up to 20 client errors a page (stack + URL) to /__abacus/client-error — a route this app never had.
  // Crashes are reported to our own /api/telemetry/crash. lib/build-config.test.ts fails if an injection like it
  // comes back.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.output.filename = 'static/chunks/[name]-[contenthash:8].js';
      config.output.chunkFilename = 'static/chunks/[contenthash:16].js';
    }
    return config;
  },
};

module.exports = nextConfig;
