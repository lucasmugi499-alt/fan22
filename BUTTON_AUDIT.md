# Button Audit

## Landing Page (`/page.tsx`)
- **"Log In / Try Demo"**: Opens the `/login` page.
- **"Register for GoalPlace256"**: Opens `/register` page.
- **"Register Athlete"**: Navigates to `/register?role=athlete`.
- **"Register League"**: Navigates to `/register?role=league-admin`.
- **"Sponsor the Platform" / "Become a Sponsor"**: Navigates to `/sponsors` (Inquiry page).

## Navigation (`/layout/Navigation.tsx`)
- **"Log In / Try Demo"** (Logged out): Opens `/login` page.
- **"Home Hub"** (Logged in): Navigates to `/home`.
- **"Feed"**: Navigates to `/feed`.
- **"Athlete Dashboard"** (Athlete only): Navigates to `/athlete-dashboard`.
- **"League Operations"** (League Admin only): Navigates to `/league-admin`.
- **"Platform Admin"** (Platform Admin only): Navigates to `/admin`.
- **"Wallet"** (Fan/Athlete only): Navigates to `/wallet`.

## Home Hub (`/home/page.tsx`)
- **Role Quick Actions**: Dynamic buttons from `RoleQuickActions.tsx` based on `roleConfig.ts` `primaryActions`. Examples include "Support Athlete", "Upload Highlight", "Create Fixture", "Review Reports".
- **"Wallet"**: Opens `/wallet`.
- **"Profile"**: Opens `/profile`.
- **"Settings"**: Opens `/settings`.
- **"Logout"**: Triggers `logout()` and redirects to `/`.
- **"View All" (Matches)**: Navigates to `/matches`.
- **"View Awards"** (Fan only): Navigates to `/awards`.
