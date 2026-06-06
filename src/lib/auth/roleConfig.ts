import { AppRole } from '@/types';
import { Home, List, Calendar, LayoutDashboard, Users, Landmark, ShieldCheck, User, Wallet } from 'lucide-react';
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
      { name: 'Home', href: '/home', icon: Home },
      { name: 'Feed', href: '/feed', icon: List },
      { name: 'Matches', href: '/matches', icon: Calendar },
      { name: 'Athletes', href: '/athletes', icon: Users },
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
    primaryActions: ['Upload Highlight', 'Create Post', 'View Supporters', 'Request Verification'],
    navItems: [
      { name: 'Home', href: '/home', icon: Home },
      { name: 'Feed', href: '/feed', icon: List },
      { name: 'Matches', href: '/matches', icon: Calendar },
      { name: 'Dashboard', href: '/athlete-dashboard', icon: LayoutDashboard },
      { name: 'Profile', href: '/profile', icon: User },
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
    primaryActions: ['Create Fixture', 'Add Team', 'Add Athlete', 'Submit Result', 'Verify Result', 'Create Challenge'],
    navItems: [
      { name: 'Home', href: '/home', icon: Home },
      { name: 'Matches', href: '/matches', icon: Calendar },
      { name: 'Verify', href: '/league-admin', icon: ShieldCheck },
      { name: 'League', href: '/leagues', icon: Landmark },
      { name: 'Profile', href: '/profile', icon: User },
    ],
    quickStats: ['pendingVerifications', 'fixtures', 'disputes'],
    allowedRoutes: ['/home', '/league-admin', '/feed', '/sports', '/matches', '/athletes', '/teams', '/leagues', '/awards', '/notifications', '/profile', '/settings']
  },
  platform_admin: {
    role: 'platform_admin',
    label: 'Platform Admin',
    description: 'Approve leagues and athletes, moderate content, review reports, manage verification, and oversee the platform.',
    defaultRoute: '/admin',
    dashboardTitle: 'Platform Control Center',
    dashboardSubtitle: 'Oversee verifications, users, and platform health.',
    primaryActions: ['Review Reports', 'Approve League', 'Moderate Feed', 'Review Payouts'],
    navItems: [
      { name: 'Home', href: '/home', icon: Home },
      { name: 'Admin', href: '/admin', icon: ShieldCheck },
      { name: 'Reports', href: '/admin', icon: List },
      { name: 'Profile', href: '/profile', icon: User },
    ],
    quickStats: ['pendingApprovals', 'activeReports', 'systemHealth'],
    allowedRoutes: ['/home', '/admin', '/league-admin', '/athlete-dashboard', '/feed', '/sports', '/matches', '/athletes', '/teams', '/leagues', '/awards', '/wallet', '/notifications', '/profile', '/settings']
  }
};
