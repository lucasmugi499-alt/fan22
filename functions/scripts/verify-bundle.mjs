/**
 * Fails the Functions build if the emitted bundle still contains a TypeScript path alias.
 *
 * `tsc` resolves `@/...` at compile time using tsconfig `paths`, and then emits the alias
 * verbatim into the CommonJS output. Node cannot resolve it at require time, so the build is
 * green, the typecheck is green, and the deploy dies with MODULE_NOT_FOUND — or worse,
 * deploys a bundle whose entry point throws on first invocation.
 *
 * That happened on 2026-08-23: an `@/lib/sport/submissionLimits` import added to the shared
 * finalizer passed every local check and broke the Functions deploy. Every module compiled
 * into this bundle must import relatively.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const LIB = path.join(process.cwd(), 'lib');
const offenders = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!full.endsWith('.js')) continue;
    const source = readFileSync(full, 'utf8');
    for (const [index, line] of source.split('\n').entries()) {
      if (line.includes('require("@/') || line.includes("require('@/")) {
        offenders.push(`${path.relative(process.cwd(), full)}:${index + 1}  ${line.trim()}`);
      }
    }
  }
}

try {
  walk(LIB);
} catch {
  console.error('verify-bundle: lib/ not found — run tsc first.');
  process.exit(1);
}

if (offenders.length) {
  console.error('Unresolved TypeScript path alias in the emitted Functions bundle:');
  for (const offender of offenders) console.error(`  ${offender}`);
  console.error('\nModules compiled into Functions must use relative imports.');
  process.exit(1);
}
console.log('verify-bundle: no unresolved path aliases');
