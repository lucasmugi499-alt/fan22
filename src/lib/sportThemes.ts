import { Activity, CircleDot, Dumbbell, Goal, LucideIcon } from 'lucide-react';
import { SportType } from './types';

export type SportSlug = 'football' | 'basketball' | 'rugby';

export interface SportTheme {
  name: SportType;
  slug: SportSlug;
  shortLabel: string;
  color: string;
  colorVar: string;
  gradient: string;
  mutedGradient: string;
  edgeClass: string;
  icon: LucideIcon;
  statLabels: string[];
  challengeExamples: string[];
  image: string;
}

export const sportThemes: Record<SportType, SportTheme> = {
  Football: {
    name: 'Football',
    slug: 'football',
    shortLabel: 'FTB',
    color: '#22C55E',
    colorVar: 'var(--football)',
    gradient: 'from-[var(--football)] via-[var(--goal-emerald)] to-[var(--goal-mint)]',
    mutedGradient: 'from-emerald-500/24 via-green-500/10 to-slate-950',
    edgeClass: 'sport-edge-football',
    icon: Goal,
    statLabels: ['Goals', 'Assists', 'Clean sheets', 'Matches'],
    challengeExamples: ['score 1 goal', 'provide 1 assist', 'keep a clean sheet'],
    image: '/placeholders/football-gradient.svg',
  },
  Basketball: {
    name: 'Basketball',
    slug: 'basketball',
    shortLabel: 'BKB',
    color: '#F97316',
    colorVar: 'var(--basketball)',
    gradient: 'from-[var(--basketball)] via-[var(--goal-gold)] to-orange-200',
    mutedGradient: 'from-orange-500/24 via-amber-500/12 to-slate-950',
    edgeClass: 'sport-edge-basketball',
    icon: CircleDot,
    statLabels: ['Points', 'Rebounds', 'Assists', 'Steals', 'Blocks'],
    challengeExamples: ['reach 20 points', 'get 10 rebounds', 'make 5 assists'],
    image: '/placeholders/basketball-gradient.svg',
  },
  Rugby: {
    name: 'Rugby',
    slug: 'rugby',
    shortLabel: 'RGB',
    color: '#3B82F6',
    colorVar: 'var(--rugby)',
    gradient: 'from-[var(--rugby)] via-cyan-400 to-[var(--goal-mint)]',
    mutedGradient: 'from-blue-500/24 via-cyan-500/10 to-slate-950',
    edgeClass: 'sport-edge-rugby',
    icon: Dumbbell,
    statLabels: ['Tries', 'Tackles', 'Carries', 'Conversions'],
    challengeExamples: ['score a try', 'make 8 tackles', 'complete the match'],
    image: '/placeholders/rugby-gradient.svg',
  },
};

export const sports = Object.values(sportThemes);

export function getSportTheme(sport?: SportType | string): SportTheme {
  if (sport === 'Basketball') return sportThemes.Basketball;
  if (sport === 'Rugby') return sportThemes.Rugby;
  return sportThemes.Football;
}

export function getInitials(name?: string) {
  if (!name) return 'GP';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function formatUGX(value: number) {
  return `${value.toLocaleString()} UGX`;
}

export function formatCompact(value: number) {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function timeAgo(timestamp: string) {
  const then = new Date(timestamp).getTime();
  const now = new Date('2026-06-04T12:00:00+03:00').getTime();
  const minutes = Math.max(1, Math.round((now - then) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export const trustStatements = [
  'No fan cash winnings.',
  'Fans support athletes directly.',
  'Rewards are paid only after verified performance.',
  'Achievements are confirmed by league admins or officials.',
  'GoalPlace Points are loyalty and recognition points, not cash.',
  'GoalPlace256 is built for athlete support, not games of chance.',
];

export const activityIcon = Activity;
