# GoalPlace256 Button Audit

| Button label | Location/page | Expected action | Current action | Status |
|---|---|---|---|---|
| Login | `/`, `/login`, nav | Route to login or submit auth form | Routes to `/login`; login form uses Firebase when configured and demo roles otherwise | fixed |
| Sign Up | `/`, nav, `/register` | Route to account registration | Routes to `/register`; role cards support demo preview | fixed |
| Join as Fan | `/`, `/register` | Start fan onboarding | Routes to `/register?role=fan` or demo previews as fan | fixed |
| Register Athlete | `/`, `/register` | Start athlete onboarding | Routes to `/register?role=athlete` or demo previews as athlete | fixed |
| Register League | `/`, `/register` | Start league admin onboarding | Routes to `/register?role=league-admin` and shows league status model | fixed |
| Become Sponsor | `/`, `/sponsors`, `/register` | Start sponsor onboarding or interest flow | Routes to sponsor registration or opens sponsor interest modal | fixed |
| Support Athlete | Athlete cards, feed, athlete/team pages | Open support modal and record demo support | Opens `SupportModal`, writes through `dataProvider`, shows Sonner toast | fixed |
| Pledge Support | Athlete/challenge pages, `/home` | Open pledge modal and record demo pledge | Opens `PledgeModal`, writes through `dataProvider`, shows Sonner toast | fixed |
| Follow | Athlete profile | Toggle athlete follow | Calls `dataProvider.toggleFollow`, updates visual state, shows toast | fixed |
| Save | Feed cards | Toggle saved post | Calls `dataProvider.toggleSave`, updates visual state, shows toast | fixed |
| Comment | Feed cards | Open comments and add comment | Opens comments drawer, writes through `dataProvider.createComment`, shows toast | fixed |
| Create Post | `/feed`, `/league-admin` | Open post composer and create post | Opens `CreatePostModal`, writes through `dataProvider.createFeedPost`, shows toast | fixed |
| View Match | Match cards, feed cards, `/home` | Route to match detail | Routes to `/matches/[matchId]` | fixed |
| View Athlete | Athlete cards/feed | Route to athlete profile | Routes to `/athletes/[athleteId]` | fixed |
| View Team | `/teams`, match/team surfaces | Route to team profile | Routes to `/teams/[teamId]` | fixed |
| View League | `/teams`, league cards | Route to league profile | Routes to `/leagues/[leagueId]` | fixed |
| View Awards | `/home`, nav | Route to awards | Routes to `/awards` | fixed |
| Wallet | nav, `/home`, dashboard | Route to wallet | Routes to `/wallet`; mock transactions load after demo login | fixed |
| Logout | account menu, `/home`, demo switcher | End current session and return public | Clears demo auth/Firebase auth and routes to `/` | fixed |
| Add Team | `/league-admin` | Open team setup or route to Teams section | Switches to Teams tab and shows demo toast | fixed |
| Create Fixture | `/league-admin` | Open fixture composer or toast | Switches to Fixtures tab and shows demo toast | fixed |
| Verify Result | `/league-admin` | Update match verification | Calls `dataProvider.updateMatchVerification`, shows toast | fixed |
| Verify Challenge | `/league-admin` | Update challenge verification | Calls `dataProvider.updateChallengeVerification`, shows toast | fixed |
| Review Payout | `/league-admin` | Open payout review action | Shows demo approval toast in Payout Review tab | fixed |
| Request Partner Status | `/league-admin` | Submit partner request | Shows demo request toast and opens Sponsor Visibility tab | fixed |
