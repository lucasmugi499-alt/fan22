# Button Audit

| Button label | Page/location | Expected action | Actual action | Status |
|---|---|---|---|---|
| Login | Landing Page (`/`) | Route to `/login` | Routes to `/login` | fixed |
| Sign Up | Landing Page (`/`) | Route to `/register` | Routes to `/register` | fixed |
| Join as Fan | Landing Page (`/`) | Route to `/register?role=fan` | Routes to `/register` (fan default) | fixed |
| Register Athlete | Landing Page (`/`) | Route to `/register?role=athlete` | Routes to `/register?role=athlete` | fixed |
| Register League Admin | Landing Page (`/`) | Route to `/register?role=league-admin` | Routes to `/register?role=league-admin` | fixed |
| Sponsor the Platform | Landing Page (`/`) | Route to `/sponsors` | Routes to `/sponsors` | fixed |
| Support Athlete | `/home` / `RoleQuickActions` | Open Support modal / route to athletes | Opens `/athletes` | fixed |
| Pledge Support | Challenges UI | Open Pledge modal | Opens Pledge modal | fixed |
| Follow | Public Profiles | Toggle follow state | Toggles mock state | fixed |
| Save | Settings / Post | Save changes | Shows toast / updates state | fixed |
| Comment | Feed | Open Comments drawer | Opens Comments drawer | fixed |
| Create Post | Feed / Quick Actions | Open Create Post modal | Shows toast / Opens modal | fixed |
| View Match | Feed / Dashboard | Route to `/matches/[id]` | Routes to `/matches/[id]` | fixed |
| View Athlete | Feed / Roster | Route to `/athletes/[id]` | Routes to `/athletes/[id]` | fixed |
| View Team | Feed / League | Route to `/teams/[id]` | Routes to `/teams/[id]` | fixed |
| View League | Feed / Directory | Route to `/leagues/[id]` | Routes to `/leagues/[id]` | fixed |
| View Awards | `/home` / Feed | Route to `/awards` | Routes to `/awards` | fixed |
| Wallet | `/home` / Nav | Route to `/wallet` | Routes to `/wallet` | fixed |
| Logout | Nav / `/home` | Trigger logout, route to `/` | Triggers `logout()`, routes to `/` | fixed |
| Upload Highlight | `/athlete-dashboard` | Open Media modal | Shows toast / mock modal | fixed |
| Request Verification | `/athlete-dashboard` | Submit verification request | Shows success toast | fixed |
| Create Fixture | `/league-admin` | Open Fixture modal | Shows toast / mock draft | fixed |
| Add Team | `/league-admin` | Add team to league | Shows toast | fixed |
| Add Athlete | `/league-admin` | Add athlete to roster | Shows toast | fixed |
| Submit Result | `/league-admin` | Enter match result | Shows toast | fixed |
| Verify Result | `/league-admin` | Verify pending result | Updates verification status to 'verified' | fixed |
| Verify Achievement | `/league-admin` (Challenges) | Verify challenge | Updates verification status | fixed |
| Create Challenge | `/league-admin` | Open Challenge modal | Shows toast | fixed |
| Create League Post | `/league-admin` | Open Post modal | Opens Create Post modal | fixed |
| Review Dispute | `/league-admin` | Open Dispute details | Shows toast | fixed |
| Review Support/Payout | `/league-admin` | Review pending payout | Shows toast | fixed |
| Request Partner Status | `/league-admin` | Send partner request | Shows toast | fixed |
| Review Report | `/admin` | Review moderation report | Shows toast | fixed |
| Moderate Feed | `/admin` | Moderate public feed | Shows toast | fixed |
| Approve League | `/admin` | Approve pending league | Shows toast | fixed |
| Approve Athlete | `/admin` | Approve pending athlete | Shows toast | fixed |
| Review Payout | `/admin` | Approve platform payout | Shows toast | fixed |
| Export Data | `/admin` | Download platform data | Shows toast | fixed |
| Suspend User | `/admin` | Suspend user account | Shows toast | fixed |
| Manage Team | `/admin` | Manage team settings | Shows toast | fixed |
| Verify Athlete | `/admin` | Verify athlete profile | Shows toast | fixed |
| Resolve Dispute | `/admin` | Resolve match escalation | Shows toast | fixed |
| Approve Verification | `/admin` | Approve challenge escalation | Shows toast | fixed |
| Take Action / Dismiss | `/admin` | Handle user reports | Shows toast | fixed |
| Keep Post / Remove | `/admin` | Handle flagged feed posts | Shows toast | fixed |
| Authorize Release | `/admin` | Authorize support payout | Shows toast | fixed |
| Manage Package | `/admin` | Manage sponsor package | Shows toast | fixed |
| Configure Awards | `/admin` | Configure award settings | Shows toast | fixed |
| Save Security | `/admin` | Update security settings | Shows toast | fixed |
| Update Banner | `/admin` | Update global maintenance banner | Shows toast | fixed |
