# Route Audit

| Route | Allowed Roles | Description |
|-------|---------------|-------------|
| `/` | Public | Public landing page |
| `/login` | Public | Login/Demo select (Demo limits to Fan, Athlete, League Admin, Platform Admin) |
| `/register` | Public | Registration (Limits to Fan, Athlete, League Admin) |
| `/home` | Fan, Athlete, League Admin, Platform Admin | Role-aware hub. Redirects logged-out users to `/login?next=/home` |
| `/athlete-dashboard` | Athlete, Platform Admin | Athlete command center |
| `/league-admin` | League Admin, Platform Admin | League operations command center |
| `/admin` | Platform Admin | Platform control center |
| `/feed` | Fan, Athlete, League Admin, Platform Admin | Role-aware feed |
| `/team-admin` | League Admin, Platform Admin | Placeholder for future module |
| `/sponsor-dashboard` | Fan (Sponsor mapped), Platform Admin | Placeholder for future module |
| `/dashboard` | Fan, Athlete, League Admin, Platform Admin | Redirects to `/home` |
| `/profile` | Fan, Athlete, League Admin, Platform Admin | User profile management |
| `/settings` | Fan, Athlete, League Admin, Platform Admin | Account settings |
| `/wallet` | Fan, Athlete, League Admin, Platform Admin | Financials (primary for fans/athletes) |
| `/athletes` | Public/All | Public directory of athletes |
| `/teams` | Public/All | Public directory of teams |
| `/leagues` | Public/All | Public directory of leagues |
| `/matches` | Public/All | Public match listings |
| `/sponsors` | Public/All | Public inquiry for sponsors |
| `/awards` | Public/All | Public awards progress page |
