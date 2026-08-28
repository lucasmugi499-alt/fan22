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
  DeviceMobile,
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
  team_admin: {
    workspace: 'Team Console',
    primary: [
      { name: 'Overview', href: '/team-admin', icon: SquaresFour },
      { name: 'Roster', href: '/team-admin/roster', icon: Users },
      { name: 'Fixtures', href: '/team-admin/fixtures', icon: Calendar },
      { name: 'Updates', href: '/team-admin/updates', icon: Megaphone },
    ],
    more: [
      { name: 'Field mode', href: '/team-admin/field-mode', icon: DeviceMobile },
      { name: 'Team profile', href: '/team-admin/profile', icon: Buildings },
      { name: 'Matches', href: '/matches', icon: Calendar },
      ...COMMON_MORE,
    ],
  },
  league_admin: {
    workspace: 'League Desk',
    primary: [
      { name: 'Overview', href: '/league-admin', icon: SquaresFour },
      { name: 'Teams', href: '/league-admin/teams', icon: Buildings },
      { name: 'Fixtures', href: '/league-admin/fixtures', icon: Calendar },
      { name: 'Verification', href: '/league-admin/verification', icon: ShieldCheck },
    ],
    more: [
      { name: 'Reports', href: '/league-admin/reports', icon: ChartLine },
      { name: 'Matches', href: '/matches', icon: Calendar },
      ...COMMON_MORE,
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
