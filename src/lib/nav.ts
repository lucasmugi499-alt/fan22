import {
  House,
  ListBullets,
  Calendar,
  SquaresFour,
  Buildings,
  ShieldCheck,
  User,
  Wallet,
  ChartLine,
  Gear,
  Megaphone,
  Users,
  SoccerBall,
  Trophy,
  Coins,
  Gavel,
  SignIn,
  Info,
  MapPin,
  HandHeart,
  Broadcast,
  Images,
  PersonSimpleRun,
} from '@phosphor-icons/react/dist/ssr';
import type { AppRole } from '@/types';
import type { IconComponent } from '@/lib/icons';

/**
 * Global navigation — the *where am I going* layer, and only that. Kept deliberately
 * separate from workspace tabs (*which section within a destination*) and from actions
 * (*what am I doing*): the old UI's clutter came from making one thing appear as all three.
 *
 * Each role gets ≤5 primary mobile destinations; anything lower-frequency lives under
 * "More". Every href resolves to a route the role can actually reach (see
 * `canAccessRoute`), so the shell never offers a link that a guard will refuse.
 */
/**
 * The order groups appear in, and the single definition of what a group IS.
 *
 * The desktop rail previously carried its own hardcoded copy of this list, so a nav item in
 * a group the rail did not know about was silently dropped — present in the config,
 * invisible on screen. Exporting the order means adding a workspace cannot half-land.
 */
export const NAV_GROUP_ORDER = [
  'COMMAND',
  // League Operations groups. Named for what a league actually runs rather than for the
  // records behind it: an admin looks for "Competition", not for "entities".
  'COMPETITION',
  'LEAGUE',
  'NETWORK',
  'INTEGRITY',
  'WEBSITE & SETTINGS',
  'FINANCE & SUPPORT',
  'AUDIT & ACCESS',
] as const;

export type NavGroup = (typeof NAV_GROUP_ORDER)[number];

export interface NavDestination {
  name: string;
  href: string;
  icon: IconComponent;
  group?: NavGroup;
}

export interface RoleNav {
  /** Shown in the top bar as the workspace identity. */
  workspace: string;
  /** Up to five primary destinations. The shell adds More only when `more` is non-empty. */
  primary: NavDestination[];
  /** Lower-frequency destinations, surfaced under "More". */
  more: NavDestination[];
}

const COMMON_MORE: NavDestination[] = [
  { name: 'Account settings', href: '/settings', icon: Gear },
];

export const ROLE_NAV: Record<string, RoleNav> = {
  guest: {
    workspace: 'Explore GoalPlace',
    primary: [
      { name: 'Leagues', href: '/leagues', icon: Buildings },
      { name: 'Matches', href: '/matches', icon: Calendar },
      { name: 'Athletes', href: '/athletes', icon: Users },
      { name: 'Teams', href: '/teams', icon: SoccerBall },
    ],
    more: [
      { name: 'How it works', href: '/how-it-works', icon: Info },
      { name: 'Verification', href: '/verification', icon: ShieldCheck },
      { name: 'Sponsors', href: '/sponsors', icon: Coins },
      { name: 'Local map', href: '/map', icon: MapPin },
      { name: 'Support', href: '/support', icon: HandHeart },
      { name: 'Sign in', href: '/login', icon: SignIn },
    ],
  },
  fan: {
    workspace: 'GoalPlace',
    primary: [
      { name: 'Home', href: '/home', icon: House },
      { name: 'Matches', href: '/matches', icon: Calendar },
      { name: 'Discover', href: '/discover', icon: Users },
      { name: 'Fantasy', href: '/fantasy', icon: Trophy },
    ],
    more: [
      { name: 'Leagues', href: '/leagues', icon: Buildings },
      { name: 'Teams', href: '/teams', icon: SoccerBall },
      { name: 'Awards', href: '/awards', icon: Trophy },
      { name: 'My support', href: '/contributions', icon: Wallet },
      { name: 'Local map', href: '/map', icon: MapPin },
      { name: 'Support athletes', href: '/support', icon: HandHeart },
      { name: 'Feed', href: '/feed', icon: ListBullets },
      ...COMMON_MORE,
    ],
  },
  /**
   * An athlete's account is not a place they edit their sporting record — their club writes
   * that. Payouts is promoted to a primary destination because it is the one thing an
   * athlete account genuinely exists for, and an athlete who cannot find it cannot be paid.
   */
  athlete: {
    workspace: 'My Career',
    primary: [
      { name: 'Dashboard', href: '/athlete-dashboard', icon: SquaresFour },
      { name: 'Matches', href: '/matches', icon: Calendar },
      { name: 'Payouts', href: '/athlete/payouts', icon: Wallet },
      { name: 'Account', href: '/profile', icon: User },
    ],
    more: [
      { name: 'My support', href: '/contributions', icon: HandHeart },
      { name: 'Feed', href: '/feed', icon: ListBullets },
      { name: 'Leagues', href: '/leagues', icon: Buildings },
      { name: 'Awards', href: '/awards', icon: Trophy },
      ...COMMON_MORE,
    ],
  },
  /**
   * A club VIEW, not an operations console.
   *
   * ADR-004 retired Team Admin as an account class and the deployed environments run the
   * bundles at `retired`, so nothing on these screens can be written by the person the nav is
   * being drawn for. The label said "Team Console" and the six entries read as a set of jobs,
   * which is what made the refusals feel like breakage rather than a boundary.
   *
   * The screens stay — a club official genuinely needs to see their roster, fixtures and
   * results, and all of it is theirs to read. What is gone is `Field mode`, which was never
   * theirs at all: field capture belongs to a Field Manager the league assigns, who works
   * through `/m/{secret}` with a PIN and has no Firebase account.
   */
  team_admin: {
    workspace: 'My Club',
    primary: [
      { name: 'Overview', href: '/team-admin', icon: SquaresFour },
      { name: 'Squad', href: '/team-admin/roster', icon: Users },
      { name: 'Fixtures', href: '/team-admin/fixtures', icon: Calendar },
      { name: 'Updates', href: '/team-admin/updates', icon: Megaphone },
    ],
    more: [
      { name: 'Club profile', href: '/team-admin/profile', icon: Buildings },
      { name: 'Matches', href: '/matches', icon: Calendar },
      ...COMMON_MORE,
    ],
  },
  /**
   * League Operations, in five mobile destinations and eight grouped desktop ones.
   *
   * `primary` is what the phone shows in its bottom bar, so it holds only what a League Admin
   * reaches for on a matchday. The desktop rail renders primary and more together as grouped
   * sections, which is why Competition and Settings can sit in `more` without being demoted:
   * on a laptop they are visible at all times, and on a phone they are one tap into More.
   */
  league_admin: {
    workspace: 'League Operations',
    primary: [
      { name: 'Command', href: '/league-admin', icon: Broadcast, group: 'COMMAND' },
      { name: 'Matches', href: '/league-admin/matches', icon: Calendar, group: 'COMMAND' },
      { name: 'Teams', href: '/league-admin/teams', icon: Buildings, group: 'COMPETITION' },
      { name: 'Athletes', href: '/league-admin/athletes', icon: PersonSimpleRun, group: 'COMPETITION' },
    ],
    more: [
      { name: 'Competition', href: '/league-admin/competition', icon: Trophy, group: 'COMPETITION' },
      { name: 'Media', href: '/league-admin/media', icon: Images, group: 'LEAGUE' },
      { name: 'Reports', href: '/league-admin/reports', icon: ChartLine, group: 'LEAGUE' },
      { name: 'Settings', href: '/league-admin/settings', icon: Gear, group: 'LEAGUE' },
    ],
  },
  /** Five operator destinations. Sections are workspace tabs; commands are not navigation. */
  platform_admin: {
    workspace: 'Platform Console',
    primary: [
      { name: 'Desk', href: '/admin', icon: ListBullets },
      { name: 'Network', href: '/admin/network', icon: Buildings },
      { name: 'Integrity', href: '/admin/integrity', icon: Gavel },
      { name: 'Money', href: '/admin/money', icon: Wallet },
      { name: 'Platform', href: '/admin/platform', icon: Gear },
    ],
    more: [],
  },
};

export function navForRole(role: AppRole | null | undefined): RoleNav {
  if (!role) return ROLE_NAV.guest;
  if (role === 'super_admin') return ROLE_NAV.platform_admin;
  if (role && ROLE_NAV[role]) return ROLE_NAV[role];
  return ROLE_NAV.guest;
}
