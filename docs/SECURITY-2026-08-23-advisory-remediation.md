# Dependency advisory remediation — 2026-08-23

Resolved the waivers that were due to expire on 2026-08-30, without extending any date and
without `npm audit fix --force`.

## Headline

| | Before | After |
|---|---:|---:|
| Distinct advisories (both trees) | 16 | **3** |
| Critical | 0 | 0 |
| High | 5 | **0** |
| Moderate | 10 | 3 |
| Low | 1 | 0 |
| Register entries | 22 | **3** |

Every remaining advisory is moderate, and every one of the three is the same situation: an
upstream package that has not yet advanced its own dependency, where npm's only proposed
"fix" is a major **downgrade**.

## Counting note

`npm audit` reports a graph, so one upstream CVE appears once as the vulnerable package and
again on every dependent reaching it. The Functions tree reported "9 moderate
vulnerabilities"; normalized, it is **one advisory** (uuid) reached through seven packages.
`scripts/security/normalize-audit.ts` does that reduction, and the before/after evidence is
in `security/audit-evidence/`.

## Advisories before remediation

| Advisory | Package | Sev | Tree | Path | Class | Fix |
|---|---|---|---|---|---|---|
| GHSA-1124252 / 1139510 / 1117015 / 1130709 | postcss | high ×2, moderate ×2 | root | next > postcss | runtime-build | in-range |
| GHSA-1130720 | fast-uri | high | root | transitive | dev-tooling | in-range |
| GHSA-1130722 / 1130723 / 1130724 | ip-address | high, moderate ×2 | root | transitive | dev-tooling | in-range |
| GHSA-1138115 | js-yaml | high | root | transitive | dev-tooling | in-range |
| GHSA-1130733 / 1138771 / 1138773 / 1138772 | hono | moderate ×3, low | root | transitive | dev-tooling | in-range |
| GHSA-w5hq-g745-h8pq | uuid | moderate | root | firebase-tools > gaxios > uuid | dev-tooling | major-downgrade only |
| GHSA-8988-4f7v-96qf | @opentelemetry/core | moderate | root | firebase-tools > @google-cloud/pubsub > @opentelemetry/core | dev-tooling | major-downgrade only |
| GHSA-w5hq-g745-h8pq | uuid | moderate | functions | firebase-admin > @google-cloud/storage > gaxios > uuid | functions-runtime | major-downgrade only |

## Packages upgraded

Each family in its own commit, verified before the next.

| Family | Change | Result |
|---|---|---|
| Next.js / runtime | next 16.2.12 → 16.3.2, eslint-config-next → 16.3.2 | Cleared all four postcss advisories |
| Firebase (root) | firebase-admin 14.2.0 → 14.3.0, firebase 12.16.0 → 12.18.0 | In-range; no advisory change |
| Cloud Functions | firebase-admin 13.10 → 14.3, firebase-functions 6.6 → 7.3 | Aligned with root; restored `npm ci` |
| Firebase CLI | firebase-tools 15.25.1 → 15.28.1 | In-range; chain advisories persist |
| Transitive chains | `npm audit fix` (no `--force`) | Cleared fast-uri, ip-address, js-yaml, hono |

### Why two majors landed together

firebase-functions 6.6 declares `firebase-admin ^11 || ^12 || ^13`. Aligning Functions to
root's firebase-admin 14 made `npm ci` fail outright with ERESOLVE, so the pair is
peer-coupled rather than unrelated. Splitting them would have left the Functions lockfile
unbuildable between two commits — the opposite of the reproducibility this work is for.

**Alignment answer:** root and Functions now both run firebase-admin 14.3.0.

## Waivers removed (20)

`*`, `@google-cloud/firestore`, `@google-cloud/pubsub`, `@google-cloud/storage`,
`@modelcontextprotocol/sdk`, `brace-expansion`, `eslint`, `eslint-config-next`, `fast-uri`,
`firebase-admin`, `firebase-functions`, `firebase-tools`, `hono`, `ip-address`, `js-yaml`,
`minimatch`, `next`, `postcss`, `retry-request`, `teeny-request`.

None were removed because they were old. Each was removed because the advisory no longer
appears in either audit.

## Waivers remaining (3)

### 1. uuid — Functions runtime — moderate — expires **2026-10-22**

`firebase-admin 14.3.0 > @google-cloud/storage 7.22.0 > gaxios 6.7.1 > uuid 9.0.1`

*No safe upgrade:* firebase-admin is already at current latest and still pins the chain.
npm proposes firebase-admin@10.3.0 — three majors backwards.

*Reachability — not reachable.* GHSA-w5hq-g745-h8pq affects uuid **v3/v5/v6, and only when
the caller supplies a `buf`**. Verified in `node_modules` on 2026-08-23: both consumers call
the unaffected v4 generator with no arguments —
`gaxios/build/src/gaxios.js:417` `uuid_1.v4()` and
`teeny-request/build/src/index.js:135` `uuid.v4()`. No GoalPlace code calls uuid directly.

### 2. uuid — root — moderate — expires **2026-11-21**

`firebase-tools 15.28.1 > gaxios > uuid`. Same advisory, same unreachable analysis, plus it
is a devDependency and ships in no artifact.

### 3. @opentelemetry/core — root — moderate — expires **2026-11-21**

`firebase-tools 15.28.1 > @google-cloud/pubsub > @opentelemetry/core (<2.8.0)`. Unbounded
memory allocation in W3C Baggage propagation, which requires processing attacker-controlled
baggage headers. Exists only inside the Firebase CLI; GoalPlace ships no OpenTelemetry
instrumentation and no deployed service parses baggage headers through it.

**Next waiver expiry: 2026-10-22.**

## Gate and register changes

- Both trees audited into one merged report — a Functions-only vulnerability can no longer
  escape because root is clean.
- **Critical can never be waived**, checked before the register is consulted.
- **High-severity runtime advisories require a documented reachability analysis.** Dev
  tooling is exempt: a vulnerable devDependency is exposed to whoever runs the build and to
  nobody else.
- Waivers must name advisory id, tree, dependency path, classification and owner, and must
  give real analysis for reason, reachability and mitigation. `n/a` and `dev only` are
  rejected.

Five new tests in `scripts/release/advisory-gate.test.ts` prove each rule bites.

## Reproducibility

`postinstall` is `npm --prefix functions ci` with no `|| install` fallback, so an
inconsistent Functions lockfile fails the build instead of silently resolving whatever is
current. Both lockfiles were updated deliberately inside their upgrade commits.

## Verification

Run after every dependency family:

| Command | Result |
|---|---|
| `npm run lint` | pass (8 warnings, see below) |
| `npx tsc --noEmit` | pass |
| `npm test` | 1082 passed |
| `npm run test:rules` | 122 passed |
| `npm --prefix functions run build` | pass |
| `npm --prefix functions ci` | pass (was failing with ERESOLVE mid-upgrade) |
| `npm run build` | pass |
| `npm run deploy:ready` | **exit 0** |

Nothing was deployed to production.

### The 8 lint warnings

`eslint-config-next` 16.3.2 adds `no-location-assign-relative-destination`, which flags
existing `window.location.assign()` calls in the logout and demo-role paths. Those hard
reloads are deliberate — they exist to guarantee no stale auth state survives, which is
precisely what `router.push()` would preserve. Left as warnings rather than converted;
changing auth navigation semantics is not dependency remediation.

## Unresolved blockers

None for this gate. The three remaining advisories are moderate, evidence-backed, and
tracked with owners and dated expiries.

The standing caveat is unchanged: all three clear only when upstream advances its own
dependencies. If firebase-admin has not moved by **2026-10-22**, that waiver needs a real
re-review — not a new date.
