# GoalPlace256 Audit And Feature Completion

Status: core product and internal money architecture complete. Real-money provider
integration, recipient KYC, payouts, refunds, chargebacks, reconciliation, production-rules
promotion, and legal approval remain blocked. Payments must remain sandbox-only.

## Scope

This ledger combines the build 27 audit with the requested product feature roadmap. The
"What I would not add yet" list is intentionally excluded: scouting tools, AI rankings,
cryptocurrency, fantasy sport, open direct messaging, betting-style predictions, large 3D
scenes, and spend-based fan leaderboards are not part of this completion pass.

Synthetic data must always remain visibly labelled as demonstration data.

## Already Complete

- [x] Public read-only league, team, athlete, and match routes
- [x] Exact public card links
- [x] Mobile marketing navigation
- [x] Canonical six-league investor data package used by mock mode
- [x] Firebase mode fails closed when configuration is incomplete
- [x] Scoped Firestore reads for primary screens
- [x] Official-only, sport-specific standings
- [x] Route protection mounted in the application shell
- [x] Fan registration is fixed to the `fan` role
- [x] User, athlete, team, league, and match rule allowlists
- [x] Trusted result submission, confirmation, dispute, correction, and finalization path
- [x] Nested immutable result-submission events
- [x] Mobile athlete profile overflow fix
- [x] One canonical investor dataset; obsolete generated mock collections removed
- [x] No stored-value wallet or client-side financial writes
- [x] Immutable double-entry contribution settlement journal
- [x] Signed, timestamp-validated, idempotent sandbox webhook boundary
- [x] Provider-neutral sandbox/Airtel/MTN adapter contract with status-polled callback boundary
- [x] Terminal payment state transitions, support reservations, recipient eligibility gate, and points projection
- [x] Flat, capped, non-cash GoalPlace Points
- [x] Non-cash/sponsor-funded challenge lifecycle and role separation
- [x] Team and League approval workflow for verified support needs

## Public And Fan Experience

- [x] Landing sports content comes from the canonical provider
- [x] Dynamic live, pre-match, and post-match homepage states
- [x] Honest follow, save, reminder, and profile actions
- [x] Fan onboarding for sport, city, leagues, teams, and athletes
- [x] Personalized fan home based on follows
- [x] `/discover` with For You, Athletes, Teams, Leagues, Matches, and Challenges
- [x] Discovery filters and official-activity rankings
- [x] Universal search for athletes, teams, leagues, matches, venues, seasons, and actions
- [x] Fan identity, participation history, and non-spend-based badges
- [x] Public venue map/list experience without private athlete locations

## Competition Experience

- [x] Match broadcast centre with lineups, events, top performers, reactions, and challenges
- [x] Sticky mini-score on match pages
- [x] Result verification journey backed by submission events
- [x] League competition hub with fixtures, results, standings, leaders, notices, and sponsors
- [x] Generated season story from official records
- [x] Team identity hub with story, roster, form, results, needs, support, and sponsors
- [x] Sport-specific football, basketball, and rugby terminology and presentation

## Athlete Experience

- [x] Athlete Career Passport
- [x] Career and season timeline
- [x] Profile editor
- [x] Support-need creation and updates
- [x] Challenge proposal
- [x] Highlight publishing
- [x] Shareable verified athlete card with QR link

## Team And League Operations

- [x] One-minute mobile Matchday Field Mode
- [x] Offline result draft and queued retry
- [x] Scorer selection and evidence attachment
- [x] Opponent confirmation card with a live deadline
- [x] Real roster editing and team update publishing
- [x] Team profile editing
- [x] League launch wizard and season creation
- [x] Team import and Team Admin invitations
- [x] Fixture generation and fixture management
- [x] League Communications Centre
- [x] Persistent dispute decisions and correction requests

## Platform, Sponsor, And Support

- [x] Persistent platform approvals with immutable audit events
- [x] Persistent trust-case resolution with immutable audit events
- [x] Transparent support needs, progress, recipient updates, and completion evidence
- [x] Sponsor Proof Packet and report export
- [x] Campaign story timeline and verified impact measures

## Authentication And Security

- [x] Password reset
- [x] Email verification
- [x] Team Admin invitation acceptance
- [x] League Admin application and platform approval
- [x] Assignment-aware client permissions
- [x] Candidate Firestore rules and tests for every new write surface

## Daily Use And Resilience

- [x] Role-specific Today layer
- [x] Grouped notification centre with preferences and unread state
- [x] Low-data mode
- [x] Cached last-known fixtures, standings, and rosters
- [x] Offline drafts and visible queued/synced states
- [x] Layout-matching loading, empty, error, and offline states
- [x] Reduced-motion-safe premium interactions
- [x] Mobile and desktop accessibility QA

## Documentation Cleanup

- [x] One navigation source of truth
- [x] One role-routing source of truth
- [x] Current route audit
- [x] Data visibility map
- [x] Mobile QA record
- [x] Result workflow and staging runbooks match implementation

## Real-Money Blockers

- [ ] Airtel Money sandbox credentials, callback contract, collection/disbursement tests, and reconciliation certification
- [ ] MTN MoMo sandbox credentials, collection/disbursement tests, callback status-polling tests, and reconciliation certification
- [ ] Staging payment egress IP provisioned and registered only after the provider adapter tests pass
- [ ] Recipient KYC, guardian, and payout-destination operations
- [ ] Payout, refund, chargeback, and daily reconciliation operations
- [ ] Candidate Firestore rules reviewed and promoted to production through the explicit candidate command
- [ ] Written legal, tax, PDPO, safeguarding, and PSP approvals

## Final Verification Gate

- [x] Unit and integration tests pass
- [x] Candidate Firestore rules tests pass
- [x] Functions and application builds pass
- [x] Lint passes
- [x] Browser QA passes at mobile and desktop widths
- [x] No broken public routes, console errors, image failures, or horizontal overflow
- [x] Authenticated role workflow QA passes
- [x] Synthetic-data disclosure is present where required
- [x] Current code review has no unresolved demo-environment high-severity findings
- [ ] Only after the real-money blockers above are closed: enable provider collection or payout

## Dependency Advisory Note

Next.js 16.2.12 is the latest stable release on July 26, 2026, but its package metadata
still pins advisory-affected PostCSS and sharp versions. Runtime image optimization is
disabled, styles are compiled only from trusted repository sources, and no forced
framework downgrade is accepted. Recheck the Next stable channel before each deployment
and remove this mitigation when a patched release is available.
