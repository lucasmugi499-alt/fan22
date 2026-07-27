# Mobile And Desktop Browser QA

Updated: July 26, 2026.

Environment: local Next.js mock-data build using the canonical six-league investor
dataset. Mobile checks used a 390 x 844 browser viewport; desktop checks used 1440 x 900.

## Mobile

- Landing page: no horizontal overflow, broken images, unnamed buttons, or console errors.
- Marketing navigation: Home, Leagues, Matches, Athletes, How It Works, Sponsors, and
  Sign In are reachable from the mobile menu.
- Public directories: Leagues, Teams, Athletes, Matches, Support, Discover, and Map render
  with a page heading and no horizontal overflow.
- Discover controls have accessible labels.
- Local sports map fits the viewport; venue cards no longer force the grid wider.
- Trevor Lukwago athlete profile fits the viewport, constrains all media, and leaves the
  bottom navigation unobstructed.
- Football, basketball, and rugby match pages use sport-specific event language.
- Responsive standings use compact labels without horizontal scrolling.

## Desktop

- Landing page has no horizontal overflow, broken media, or unnamed controls.
- Team Admin, League Admin, Athlete, Platform Admin, and Fan workspaces render their
  role-specific Today content.
- Team result review opens the real opponent-confirmation workflow.
- League exception, Platform governance, and athlete career surfaces render without
  console errors.

## Data And Trust Cues

- Marketing and application surfaces identify seeded figures as demonstration data.
- Public profile actions link to exact entities.
- Operational role switching remains a local demonstration control and is not shown on
  public discovery routes.

## Staging Check

The deployed staging environment passed Firebase authentication, named-database reads,
public provenance sanitization, opponent confirmation, trusted finalization, duplicate
finalization, and derived standings verification.
