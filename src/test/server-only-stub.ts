/**
 * Stands in for Next's `server-only` guard under Vitest.
 *
 * `server-only` is resolved by the Next compiler rather than installed as a package, so
 * importing any server module in a test fails to resolve it. The guard's job is to break
 * the build if a server module reaches a client bundle — it has no runtime behaviour, so
 * an empty module is a faithful substitute. Aliased in `vitest.config.ts`.
 */
export {};
