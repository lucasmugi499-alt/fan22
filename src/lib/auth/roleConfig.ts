import { AppRole } from '@/types';
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
  Coins,
  Pulse,
  CheckCircle,
  Users,
} from '@phosphor-icons/react';
import type { IconComponent } from '@/lib/icons';

export interface RoleConfig {
  role: AppRole;
  label: string;
  description: string;
  defaultRoute: string;
  dashboardTitle: string;
  dashboardSubtitle: string;
  primaryActions: string[];
  navItems: { name: string; href: string; icon: IconComponent }[];
  quickStats: string[];
  allowedRoutes: string[];
}

export const ROLE_CONFIGS: Record<string, RoleConfig> = {
  fan: {
    role: 'fan',
    label: 'Fan',
    description: 'Follow matches, support athletes, join the feed, earn GoalPlace Points, and track your impact.',
    defaultRoute: '/home',
    dashboardTitle: 'Your Sports Hub',
    dashboardSubtitle: 'Follow the game and make an impact.',
    primaryActions: ['Support Athlete', 'Follow Team', 'View Match', 'Open Wallet'],
    navItems: [
      { name: 'Home', href: '/home', icon: House },
      { name: 'Feed', href: '/feed', icon: ListBullets },
      { name: 'Matches', href: '/matches', icon: Calendar },
      { name: 'Athletes', href: '/athletes', icon: Users },
      { name: 'Leagues', href: '/leagues', icon: Buildings },
      { name: 'Wallet', href: '/wallet', icon: Wallet },
    ],
    quickStats: ['walletBalance', 'followedAthletes', 'awardsProgress'],
    allowedRoutes: ['/home', '/dashboard', '/feed', '/sports', '/matches', '/athletes', '/teams', '/leagues', '/awards', '/wallet', '/notifications', '/profile', '/settings']
  },
  athlete: {
    role: 'athlete',
    label: 'Athlete',
    description: 'Manage your profile, view supporters, track verified challenges, post highlights, and build your sports portfolio.',
    defaultRoute: '/athlete-dashboard',
    dashboardTitle: 'Athlete Command Center',
    dashboardSubtitle: 'Manage your profile and track your impact.',
    primaryActions: ['Publish Highlight', 'Request Athlete Verification', 'View Supporters', 'Review Public Profile'],
    navItems: [
      { name: 'Dashboard', href: '/athlete-dashboard', icon: SquaresFour },
      { name: 'Matches', href: '/matches', icon: Calendar },
      { name: 'Profile', href: '/athlete-dashboard?tab=Profile', icon: User },
      { name: 'Wallet', href: '/wallet', icon: Wallet },
      { name: 'Settings', href: '/athlete-dashboard?tab=Settings', icon: Gear },
    ],
    quickStats: ['totalSupport', 'supportersCount', 'activeChallenges'],
    allowedRoutes: ['/home', '/athlete-dashboard', '/feed', '/sports', '/matches', '/athletes', '/teams', '/leagues', '/awards', '/wallet', '/notifications', '/profile', '/settings']
  },
  league_admin: {
    role: 'league_admin',
    label: 'League Admin',
    description: 'Manage teams, athletes, fixtures, results, verifications, challenges, standings, and league operations.',
    defaultRoute: '/league-admin',
    dashboardTitle: 'League Operations',
    dashboardSubtitle: 'Manage your league, verify results, and oversee challenges.',
    primaryActions: ['Create Fixture', 'Add Team', 'Review Match Queue', 'Generate Sponsor Report'],
    navItems: [
      { name: 'League Ops', href: '/league-admin', icon: SquaresFour },
      { name: 'Teams', href: '/league-admin?tab=Teams%20%26%20Athletes', icon: Buildings },
      { name: 'Fixtures', href: '/league-admin?tab=Fixtures%20%26%20Results', icon: Calendar },
      { name: 'Verification', href: '/league-admin?tab=Verification', icon: ShieldCheck },
      { name: 'Reports', href: '/league-admin?tab=Sponsor%20Report', icon: ChartLine },
      { name: 'Settings', href: '/league-admin?tab=Settings', icon: Gear },
    ],
    quickStats: ['pendingVerifications', 'fixtures', 'disputes'],
    allowedRoutes: ['/home', '/league-admin', '/team-admin', '/feed', '/sports', '/matches', '/athletes', '/teams', '/leagues', '/awards', '/notifications', '/profile', '/settings']
  },
  team_admin: {
    role: 'team_admin',
    label: 'Team Admin',
    description: 'Keep your team roster current, submit match results, request athlete verification, and manage team updates.',
    defaultRoute: '/team-admin',
    dashboardTitle: 'Team Console',
    dashboardSubtitle: 'Manage your roster and submit team data.',
    primaryActions: ['Add Athlete to Roster', 'Submit Match Result', 'Publish Team Update', 'Request Athlete Verification'],
    navItems: [
      { name: 'Team Console', href: '/team-admin', icon: SquaresFour },
      { name: 'Roster', href: '/team-admin?tab=Roster', icon: Users },
      { name: 'Fixtures', href: '/team-admin?tab=Fixtures%20%26%20Results', icon: Calendar },
      { name: 'Updates', href: '/team-admin?tab=Athlete%20Updates', icon: ListBullets },
      { name: 'Profile', href: '/team-admin?tab=Team%20Profile', icon: User },
    ],
    quickStats: ['rosterCompleteness', 'pendingSubmissions', 'supportPool'],
    allowedRoutes: ['/home', '/team-admin', '/feed', '/sports', '/matches', '/athletes', '/teams', '/leagues', '/awards', '/notifications', '/profile', '/settings']
  },
  platform_admin: {
    role: 'platform_admin',
    label: 'Platform Admin',
    description: 'Approve leagues and athletes, moderate content, review reports, manage verification, and oversee the platform.',
    defaultRoute: '/admin',
    dashboardTitle: 'Platform Control Center',
    dashboardSubtitle: 'Oversee verifications, users, and platform health.',
    primaryActions: ['Review Approvals', 'Review Escalations', 'Export Platform Report', 'Review Payout Request'],
    navItems: [
      { name: 'Control Center', href: '/admin', icon: ShieldCheck },
      { name: 'Approvals', href: '/admin?tab=Leagues', icon: CheckCircle },
      { name: 'Trust & Safety', href: '/admin?tab=Verifications', icon: ShieldCheck },
      { name: 'Reports', href: '/admin?tab=Reports', icon: ListBullets },
      { name: 'Sponsors', href: '/admin?tab=Sponsors', icon: Coins },
      { name: 'System', href: '/admin?tab=System%20Health', icon: Pulse },
    ],
    quickStats: ['pendingApprovals', 'activeReports', 'systemHealth'],
    allowedRoutes: ['/home', '/admin', '/league-admin', '/team-admin', '/athlete-dashboard', '/sponsor-dashboard', '/feed', '/sports', '/matches', '/athletes', '/teams', '/leagues', '/awards', '/wallet', '/notifications', '/profile', '/settings']
  },
  // Sponsor packages remain public/business content. Sponsor is no longer an active
  // in-app persona in the main role switcher or onboarding flow.
};
