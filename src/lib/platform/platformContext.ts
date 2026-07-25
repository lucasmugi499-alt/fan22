import type { Athlete, League, Match, Report } from '@/types';
import { normalizeVerificationStatus } from '@/lib/status';

export interface ApprovalItem {
  id: string;
  kind: 'league' | 'athlete';
  title: string;
  subtitle: string;
}

/**
 * Things awaiting platform sign-off: leagues not yet promoted past community status, and
 * athletes whose verification is still pending. Platform admin governs these; team and
 * league admins cannot self-promote.
 */
export function pendingApprovals(leagues: League[], athletes: Athlete[]): ApprovalItem[] {
  const items: ApprovalItem[] = [];
  for (const l of leagues) {
    if (l.status === 'draft' || l.status === 'community') {
      items.push({ id: l.id, kind: 'league', title: l.name, subtitle: `${l.city} · requesting ${l.status === 'draft' ? 'listing' : 'verified status'}` });
    }
  }
  for (const a of athletes) {
    if (normalizeVerificationStatus(a.verificationStatus) === 'pending') {
      items.push({ id: a.id, kind: 'athlete', title: a.name, subtitle: `${a.position} · athlete verification` });
    }
  }
  return items;
}

export function openReports(reports: Report[]): Report[] {
  return reports
    .filter((r) => r.status === 'open' || r.status === 'reviewing')
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function severityRank(s?: Report['severity']): number {
  return s === 'Critical' ? 4 : s === 'High' ? 3 : s === 'Medium' ? 2 : s === 'Low' ? 1 : 0;
}

export function disputedMatches(matches: Match[]): Match[] {
  return matches.filter((m) => m.verificationStatus === 'disputed');
}
