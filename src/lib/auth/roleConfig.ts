import { AppRole } from '@/types';
import { Home01Icon, ListViewIcon, Calendar01Icon, DashboardSquare01Icon, Building01Icon, Building03Icon, SecurityCheckIcon, UserIcon, Wallet01Icon, ChartLineData01Icon, Video01Icon, Settings01Icon, Coins01Icon, Activity01Icon, CheckmarkCircle01Icon } from 'hugeicons-react';
import { Users } from '@phosphor-icons/react';
import React from 'react';

export interface RoleConfig {
  role: AppRole;
  label: string;
  description: string;
  defaultRoute: string;
  dashboardTitle: string;
  dashboardSubtitle: string;
  primaryActions: string[];
  navItems: { name: string; href: string; icon: React.ElementType }[];
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
    primaryActions: ['Support Athlete', 'Explore Matches', 'Open Wallet', 'View Awards'],
    navItems: [
      { name: 'Home', href: '/home', icon: Home01Icon },
      { name: 'Feed', href: '/feed', icon: ListViewIcon },
      { name: 'Matches', href: '/matches', icon: Calendar01Icon },
      { name: 'Athletes', href: '/athletes', icon: Users },
      { name: 'Wallet', href: '/wallet', icon: Wallet01Icon },
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
    primaryActions: ['Upload Highlight', 'Request Verification', 'View Supporters', 'Review Public Profile'],
    navItems: [
      { name: 'Dashboard', href: '/athlete-dashboard', icon: DashboardSquare01Icon },
      { name: 'Profile', href: '/profile', icon: UserIcon },
      { name: 'Matches', href: '/matches', icon: Calendar01Icon },
      { name: 'Media', href: '/athlete-dashboard?tab=Media', icon: Video01Icon },
      { name: 'Supporters', href: '/athlete-dashboard?tab=Supporters', icon: Users },
      { name: 'Challenges', href: '/athlete-dashboard?tab=Challenges', icon: ListViewIcon },
      { name: 'Wallet', href: '/wallet', icon: Wallet01Icon },
      { name: 'Settings', href: '/settings', icon: Settings01Icon },
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
    primaryActions: ['Create Fixture', 'Submit Result', 'Add Team', 'Add Athlete', 'Request Verification', 'Download Impact Report'],
    navItems: [
      { name: 'League Dashboard', href: '/league-admin', icon: DashboardSquare01Icon },
      { name: 'Fixtures', href: '/league-admin?tab=Fixtures%20%26%20Results', icon: Calendar01Icon },
      { name: 'Results', href: '/league-admin?tab=Fixtures%20%26%20Results', icon: Activity01Icon },
      { name: 'Teams', href: '/league-admin?tab=Teams%20%26%20Athletes', icon: Building01Icon },
      { name: 'Athletes', href: '/league-admin?tab=Teams%20%26%20Athletes', icon: Users },
      { name: 'Verification', href: '/league-admin?tab=Verification', icon: SecurityCheckIcon },
      { name: 'Reports', href: '/league-admin?tab=Sponsor%20Report', icon: ChartLineData01Icon },
      { name: 'Sponsors', href: '/league-admin?tab=Sponsor%20Report', icon: Building03Icon },
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
    primaryActions: ['Add Athlete', 'Update Roster', 'Submit Result', 'Upload Team Update'],
    navItems: [
      { name: 'Home', href: '/home', icon: Home01Icon },
      { name: 'Team Admin', href: '/team-admin', icon: DashboardSquare01Icon },
      { name: 'Matches', href: '/matches', icon: Calendar01Icon },
      { name: 'Roster', href: '/team-admin', icon: Users },
      { name: 'Profile', href: '/profile', icon: UserIcon },
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
    primaryActions: ['Approve League', 'Review Moderation Report', 'Review Verification Evidence', 'Review Payout Request', 'Manage Sponsor Package'],
    navItems: [
      { name: 'Control Center', href: '/admin', icon: SecurityCheckIcon },
      { name: 'Approvals', href: '/admin?tab=Leagues', icon: CheckmarkCircle01Icon },
      { name: 'Reports', href: '/admin?tab=Reports', icon: ListViewIcon },
      { name: 'Verification', href: '/admin?tab=Verifications', icon: SecurityCheckIcon },
      { name: 'Users', href: '/admin?tab=Users', icon: UserIcon },
      { name: 'Leagues', href: '/admin?tab=Leagues', icon: Building01Icon },
      { name: 'Sponsors', href: '/admin?tab=Sponsors', icon: Building03Icon },
      { name: 'Payouts', href: '/admin?tab=Support%2FPayout%20Review', icon: Coins01Icon },
      { name: 'System Health', href: '/admin?tab=System%20Health', icon: Activity01Icon },
    ],
    quickStats: ['pendingApprovals', 'activeReports', 'systemHealth'],
    allowedRoutes: ['/home', '/admin', '/league-admin', '/team-admin', '/athlete-dashboard', '/sponsor-dashboard', '/feed', '/sports', '/matches', '/athletes', '/teams', '/leagues', '/awards', '/wallet', '/notifications', '/profile', '/settings']
  },
  sponsor: {
    role: 'sponsor',
    label: 'Sponsor',
    description: 'Track commitments, funded needs, brand visibility, evidence, and measurable grassroots impact.',
    defaultRoute: '/sponsor-dashboard',
    dashboardTitle: 'Sponsor Dashboard',
    dashboardSubtitle: 'See where your money went, who benefited, what proof exists, and what to fund next.',
    primaryActions: ['Download Impact Report', 'View Supported Entities', 'View Brand Visibility', 'View Sponsor Package'],
    navItems: [
      { name: 'Sponsor Dashboard', href: '/sponsor-dashboard', icon: DashboardSquare01Icon },
      { name: 'Impact Report', href: '/sponsor-dashboard?tab=Monthly%20Report', icon: ChartLineData01Icon },
      { name: 'Supported Entities', href: '/sponsor-dashboard?tab=Supported%20Entities', icon: Users },
      { name: 'Brand Visibility', href: '/sponsor-dashboard?tab=Brand%20Visibility', icon: Building03Icon },
      { name: 'Packages', href: '/sponsor-dashboard?tab=Packages', icon: Coins01Icon },
      { name: 'Account', href: '/sponsor-dashboard?tab=Account', icon: Settings01Icon },
    ],
    quickStats: ['totalCommitted', 'athletesImpacted', 'needsFunded'],
    allowedRoutes: ['/home', '/sponsor-dashboard', '/sponsors', '/athletes', '/teams', '/leagues', '/notifications', '/profile', '/settings']
  }
};
