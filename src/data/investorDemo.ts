import databaseJson from '../../data/investor-demo/database.json';
import type {
  AdminAuditEvent,
  Athlete,
  AthleteClaim,
  AwardCategory,
  Challenge,
  Comment,
  FeedPost,
  FinalizationRecord,
  League,
  LeagueAdminApplication,
  LeagueNotice,
  Match,
  Notification,
  Report,
  ResultSubmission,
  ResultSubmissionEvent,
  Roster,
  Season,
  Sponsor,
  SponsorCampaign,
  SponsorReport,
  Sport,
  StoredStanding,
  SupportNeed,
  SupportPledge,
  Team,
  TeamAssignment,
  User,
  Verification,
  WalletTransaction,
} from '@/types';
import type {
  Allocation,
  ComplianceCase,
  Contribution,
  LedgerEntry,
  LedgerTransaction,
  PaymentIntent,
  PointsEvent,
} from '@/types/money';

type InvestorDemoDatabase = {
  metadata: {
    synthetic: true;
    notice: string;
  };
  sports: Sport[];
  users: User[];
  leagues: League[];
  seasons: Season[];
  teams: Team[];
  teamAssignments: TeamAssignment[];
  rosters: Roster[];
  athletes: Athlete[];
  matches: Match[];
  resultSubmissions: ResultSubmission[];
  resultSubmissionEvents: ResultSubmissionEvent[];
  standings: StoredStanding[];
  challenges: Challenge[];
  supportPledges: SupportPledge[];
  walletTransactions: WalletTransaction[];
  feedPosts: FeedPost[];
  comments: Comment[];
  notifications: Notification[];
  sponsors: Sponsor[];
  sponsorReports: SponsorReport[];
  leagueNotices: LeagueNotice[];
  verifications: Verification[];
  reports: Report[];
  awards: AwardCategory[];
  finalizations: FinalizationRecord[];
};

// JSON is the canonical demonstration package. The cast lives at this one boundary so the
// rest of the app consumes normal domain types instead of maintaining a second generated
// demo database that can drift from staging.
export const investorDemo = databaseJson as unknown as InvestorDemoDatabase;

export const investorDemoRuntime = {
  adminAuditEvents: [] as AdminAuditEvent[],
  athleteClaims: [] as AthleteClaim[],
  leagueAdminApplications: [] as LeagueAdminApplication[],
  supportNeeds: investorDemo.athletes.slice(0, 6).map((athlete, index): SupportNeed => ({
    id: `support_need_${index + 1}`,
    athleteId: athlete.id,
    teamId: athlete.teamId,
    leagueId: athlete.leagueId,
    title: athlete.impactNeeds[0] ?? 'Season participation support',
    story: `Verified development support helps ${athlete.name} continue training and attend official league fixtures.`,
    targetAmount: 250_000 + index * 50_000,
    raisedAmount: (index % 3) * 50_000,
    status: 'open',
    approvalStatus: 'league_approved',
    verificationStatus: 'verified',
    preferredPayoutDestination: 'approved_vendor',
    payoutDestinationStatus: 'verified',
    teamVerifiedByUserId: `demo_team_admin_${index + 1}`,
    leagueApprovedByUserId: `demo_league_admin_${index + 1}`,
    recipientUpdates: index === 1 ? [{
      id: 'update_1',
      message: 'The team confirmed the need and identified an approved local vendor.',
      createdAt: '2026-07-20T10:00:00.000Z',
    }] : [],
    createdByUserId: athlete.userId ?? `demo_athlete_${index + 1}`,
    createdAt: '2026-07-15T10:00:00.000Z',
  })),
  paymentIntents: [] as PaymentIntent[],
  contributions: [] as Contribution[],
  ledgerTransactions: [] as LedgerTransaction[],
  ledgerEntries: [] as LedgerEntry[],
  pointsEvents: [] as PointsEvent[],
  allocations: [] as Allocation[],
  complianceCases: [] as ComplianceCase[],
  sponsorCampaigns: investorDemo.sponsorReports.map((report, index): SponsorCampaign => ({
    id: report.campaignId ?? `campaign_${report.id}`,
    sponsorId: investorDemo.sponsors[index % Math.max(1, investorDemo.sponsors.length)]?.id ?? 'sponsor_demo',
    name: `${report.period} community sport programme`,
    objective: 'Support verified participation and athlete development in the selected league.',
    budgetUGX: Math.max(report.supportValueUGX, 5_000_000),
    supportedLeagueIds: [report.leagueId],
    supportedTeamIds: [],
    supportedAthleteIds: [],
    evidenceUrls: [],
    status: report.status === 'shared' ? 'completed' : 'active',
    startsAt: report.generatedAt,
    createdAt: report.generatedAt,
  })),
};

export const syntheticDataNotice = investorDemo.metadata.notice;
