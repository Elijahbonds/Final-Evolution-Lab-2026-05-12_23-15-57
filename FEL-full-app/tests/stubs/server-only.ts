// `import 'server-only'` is a build-time guard: it throws if a module reaches a client bundle. Under vitest
// there are no bundles, so the real package is only an obstacle to testing a service directly. Empty on
// purpose — it must export nothing, exactly like the real one.
export {};
