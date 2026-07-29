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
  Bell,
  SoccerBall,
  Trophy,
  Coins,
  Gavel,
  SlidersHorizontal,
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
export interface NavDestination {
  name: string;
  href: string;
  icon: IconComponent;
}

export interface RoleNav {
  /** Shown in the top bar as the workspace identity. */
  workspace: string;
  /** ≤4 primary destinations; the shell adds "More" as the 5th on mobile. */
  primary: NavDestination[];
  /** Lower-frequency destinations, surfaced under "More". */
  more: NavDestination[];
}

const COMMON_MORE: NavDestination[] = [
  { name: 'Notifications', href: '/notifications', icon: Bell },
  { name: 'Profile', href: '/profile', icon: User },
  { name: 'Settings', href: '/settings', icon: Gear },
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
      { name: 'Feed', href: '/feed', icon: ListBullets },
    ],
    more: [
      { name: 'Leagues', href: '/leagues', icon: Buildings },
      { name: 'Teams', href: '/teams', icon: SoccerBall },
      { name: 'Awards', href: '/awards', icon: Trophy },
      { name: 'Support activity', href: '/contributions', icon: Wallet },
      { name: 'Local map', href: '/map', icon: MapPin },
      { name: 'Support', href: '/support', icon: HandHeart },
      ...COMMON_MORE,
    ],
  },
  athlete: {
    workspace: 'My Career',
    primary: [
      { name: 'Dashboard', href: '/athlete-dashboard', icon: SquaresFour },
      { name: 'Matches', href: '/matches', icon: Calendar },
      { name: 'Support activity', href: '/contributions', icon: Wallet },
      { name: 'Profile', href: '/profile', icon: User },
    ],
    more: [
      { name: 'Feed', href: '/feed', icon: ListBullets },
      { name: 'Leagues', href: '/leagues', icon: Buildings },
      { name: 'Awards', href: '/awards', icon: Trophy },
      ...COMMON_MORE.filter((d) => d.name !== 'Profile'),
    ],
  },
  team_admin: {
    workspace: 'Team Console',
    primary: [
      { name: 'Team', href: '/team-admin', icon: SquaresFour },
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
  platform_admin: {
    workspace: 'Governance',
    primary: [
      { name: 'Control', href: '/admin', icon: SlidersHorizontal },
      { name: 'Approvals', href: '/admin/approvals', icon: ShieldCheck },
      { name: 'Trust', href: '/admin/trust', icon: Gavel },
      { name: 'Reports', href: '/admin/reports', icon: ChartLine },
    ],
    more: [
      { name: 'Sponsors', href: '/admin/sponsors', icon: Coins },
      { name: 'Financial operations', href: '/admin/finance', icon: Wallet },
      ...COMMON_MORE,
    ],
  },
};

export function navForRole(role: AppRole | null | undefined): RoleNav {
  if (!role) return ROLE_NAV.guest;
  if (role === 'super_admin') return ROLE_NAV.platform_admin;
  if (role && ROLE_NAV[role]) return ROLE_NAV[role];
  return ROLE_NAV.guest;
}
