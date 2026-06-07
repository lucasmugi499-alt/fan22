# Button Audit

| Button label | Page/location | Expected action | Actual action | Status |
|---|---|---|---|---|
| Login | `/` | Route to `/login` | Routes to `/login` | fixed |
| Sign Up | `/` | Route to `/register` | Routes to `/register` | fixed |
| Join as Fan | `/` | Register fan | Routes to `/register` with fan default | fixed |
| Register Athlete | `/` | Register athlete | Routes to `/register?role=athlete` | fixed |
| Register League | `/` | Register league admin | Routes to `/register?role=league-admin` | fixed |
| Become Sponsor | `/` | Sponsor inquiry | Routes to `/sponsors` | fixed |
| Support Athlete | `/home`, athlete cards | Open support flow | Opens Support modal | fixed |
| Pledge Support | `/home`, challenge cards | Open pledge flow | Opens Pledge modal | fixed |
| Create Post | `/home`, `/athlete-dashboard`, `/league-admin` | Open post composer | Opens `CreatePostModal` | fixed |
| Comment | Feed cards | Open comments | Opens Comments drawer | fixed |
| View Match/Profile/Team/League | Cards and lists | Navigate to detail route | Routes to matching detail route | fixed |
| Logout | Nav and `/home` | Clear auth and return public | Runs logout and routes to `/` | fixed |
| Upload Highlight | `/athlete-dashboard` | Open upload placeholder | Opens DetailDrawer | fixed |
| Request Verification | `/athlete-dashboard` | Confirm request | Shows success toast | fixed |
| View Supporters | `/athlete-dashboard` | Show supporters tab | Switches to Supporters tab | fixed |
| View Challenges | `/athlete-dashboard` | Show challenges tab | Switches to Challenges tab | fixed |
| View Public Profile | `/athlete-dashboard` | Open athlete profile | Routes to `/athletes/[id]` | fixed |
| Edit Profile | `/athlete-dashboard` | Edit profile | Opens DetailDrawer | fixed |
| Create Fixture | `/league-admin` | Compose fixture | Opens DetailDrawer and switches to Fixtures on submit | fixed |
| Add Team | `/league-admin` | Add/invite team | Opens DetailDrawer and switches to Teams on submit | fixed |
| Add Athlete | `/league-admin` | Add athlete profile | Opens DetailDrawer and switches to Athletes on submit | fixed |
| Verify Result | `/league-admin` | Review result | Opens Verification Queue or updates status | fixed |
| Submit Result | `/league-admin` | Enter result | Opens Verification Queue action path | fixed |
| Create Challenge | `/league-admin` | Draft challenge | Opens DetailDrawer and switches to Challenges on submit | fixed |
| Verify Challenge | `/league-admin` | Update challenge review | Updates visible verification status and shows toast | fixed |
| Create League Post | `/league-admin` | Publish update | Opens `CreatePostModal` | fixed |
| Review Dispute | `/league-admin` | Review dispute detail | Opens DetailDrawer and records demo action | fixed |
| Approve Demo Review | `/league-admin` | Review support release | Shows demo approval toast; real payments disabled | fixed |
| Request Partner Status | `/league-admin` | Request partner review | Switches to Sponsor Visibility and shows toast | fixed |
| Export Data | `/admin` | Export platform data | Shows demo export toast | fixed |
| Approve League | `/admin` | Approve league | Updates visible league status in local state and shows toast | fixed |
| Review Reports | `/admin` | Open reports | Switches to Reports tab | fixed |
| Moderate Feed | `/admin` | Open moderation | Switches to Feed Moderation tab | fixed |
| Hide/Restore Post | `/admin` | Moderate feed post | Updates visible post status and shows toast | fixed |
| Review Support | `/admin` | Open support review | Switches to Support/Payout Review tab | fixed |
| Inspect/Manage | `/admin` tables/cards | View details | Opens DetailDrawer | fixed |
| Resolve Report | `/admin` | Resolve report | Shows demo resolution toast | fixed |
| Configure Awards | `/admin` | Configure award | Shows demo configuration toast | fixed |
| Save Settings | `/admin`, `/league-admin`, `/athlete-dashboard` | Save demo settings | Shows success toast | fixed |
| Future module CTA | `/team-admin`, `/sponsor-dashboard` | Route to active MVP page | Routes to `/league-admin` or `/sponsors` | fixed |
