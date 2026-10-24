const path = require('path');
const fs = require('fs');

// PRISMA-PUBLIC step 2 (docs/PRISMA-PUBLIC-PLAN.md §4). The app's Prisma client is lib/generated/prisma. Webpack bundles
// its JS into the server chunks, but its 17 MB query engine is a native file webpack does not carry, and the deployed
// function never receives lib/ (it gets public/ and <distDir>/ — firebase-tools copies <distDir>/** whole). So the
// production server compilation copies the one engine into <distDir>/prisma-engine, and lib/db/queryEngine.ts points
// PRISMA_QUERY_ENGINE_LIBRARY at it. It runs inside `next build`, which Firebase does run; it ignores the custom build
// script. assumption: that is why scripts/copy-prisma-schema.mjs's .next copy "never arrived" (it was never written on
// the deploy machine); the step-2 deploy proof settles it. A missing engine (no generate yet) copies nothing rather than
// failing the build.
const PRISMA_ENGINE_FILES = ['libquery_engine-debian-openssl-3.0.x.so.node'];
function copyPrismaEngine(distDir = process.env.NEXT_DIST_DIR || '.next') {
  const from = path.join(__dirname, 'lib', 'generated', 'prisma');
  const to = path.resolve(__dirname, distDir, 'prisma-engine');
  const copied = [];
  for (const f of PRISMA_ENGINE_FILES) {
    if (!fs.existsSync(path.join(from, f))) continue;
    fs.mkdirSync(to, { recursive: true });
    fs.copyFileSync(path.join(from, f), path.join(to, f));
    copied.push(f);
  }
  return copied;
}

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
    // PRISMA-PUBLIC step 2: the client is lib/generated/prisma now; nothing imports node_modules/.prisma any more.
    outputFileTracingIncludes: {
      '/**/*': [
        './lib/generated/prisma/**/*',
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
  webpack: (config, { isServer, dev, nextRuntime }) => {
    // PRISMA-PUBLIC step 2: the production Node server build only (not dev, not edge, not a bare call in a test).
    if (isServer && !dev && nextRuntime === 'nodejs') copyPrismaEngine();
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /node_modules[\\/]@mediapipe[\\/]tasks-vision[\\/]vision_bundle\.mjs$/,
        message: /Critical dependency: the request of a dependency is an expression/,
      },
    ];

    if (!isServer) {
      config.output.filename = 'static/chunks/[name]-[contenthash:8].js';
      config.output.chunkFilename = 'static/chunks/[contenthash:16].js';
    }
    return config;
  },
};

module.exports = nextConfig;
