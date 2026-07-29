import { investorDemo } from "./investorDemo";
import { SportSlug } from "@/types";
import { buildLeagueStandings } from "@/lib/leagueModel";

const {
  users,
  sports,
  leagues,
  teams,
  athletes,
  matches,
  challenges,
  supportPledges,
  walletTransactions,
  feedPosts,
  comments,
  sponsors,
  awards,
  verifications,
  reports,
  notifications,
  seasons,
  teamAssignments,
  rosters,
  resultSubmissions,
  resultSubmissionEvents,
  standings,
  sponsorReports,
  leagueNotices,
  finalizations,
} = investorDemo;

export {
  users,
  sports,
  leagues,
  teams,
  athletes,
  matches,
  challenges,
  supportPledges,
  walletTransactions,
  feedPosts,
  comments,
  sponsors,
  awards,
  verifications,
  reports,
  notifications,
  seasons,
  teamAssignments,
  rosters,
  resultSubmissions,
  resultSubmissionEvents,
  standings,
  sponsorReports,
  leagueNotices,
  finalizations,
};

export const mockDatabase = {
  users,
  sports,
  leagues,
  teams,
  athletes,
  matches,
  challenges,
  supportPledges,
  walletTransactions,
  feedPosts,
  comments,
  sponsors,
  awards,
  verifications,
  reports,
  notifications,
  seasons,
  teamAssignments,
  rosters,
  resultSubmissions,
  resultSubmissionEvents,
  standings,
  sponsorReports,
  leagueNotices,
  finalizations,
};

// Helper Functions
export const getUserById = (id: string) => users.find((user) => user.id === id);
export const getAthleteById = (id: string) => athletes.find((a) => a.id === id);
export const getTeamById = (id: string) => teams.find((t) => t.id === id);
export const getLeagueById = (id: string) => leagues.find((l) => l.id === id);
export const getMatchById = (id: string) => matches.find((m) => m.id === id);
export const getReportById = (id: string) => reports.find((report) => report.id === id);
export const getVerificationById = (id: string) =>
  verifications.find((verification) => verification.id === id);

export const getAthletesBySport = (sport: SportSlug) =>
  athletes.filter((a) => a.sport === sport);

export const getTeamsByLeague = (leagueId: string) =>
  teams.filter((t) => t.leagueId === leagueId);

export const getAthletesByTeam = (teamId: string) =>
  athletes.filter((athlete) => athlete.teamId === teamId);

export const getMatchesByLeague = (leagueId: string) =>
  matches.filter((m) => m.leagueId === leagueId);

export const getMatchesByTeam = (teamId: string) =>
  matches.filter((match) => match.homeTeamId === teamId || match.awayTeamId === teamId);

export const getChallengesByMatch = (matchId: string) =>
  challenges.filter((c) => c.matchId === matchId);

export const getChallengesByAthlete = (athleteId: string) =>
  challenges.filter((challenge) => challenge.athleteId === athleteId);

export const getFeedBySport = (sport: SportSlug) =>
  feedPosts.filter((f) => f.sport === sport).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

export const getFeedByUser = (userId: string) =>
  feedPosts.filter((post) => post.authorId === userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

export const getCommentsByPost = (postId: string) =>
  comments.filter((comment) => comment.postId === postId).sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());

export const getWalletByUser = (userId: string) =>
  walletTransactions.filter((w) => w.userId === userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

export type StandingRow = {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  difference: number;
  points: number;
};

export const getStandingsByLeague = (leagueId: string) => {
  return buildLeagueStandings(
    teams.filter((team) => team.leagueId === leagueId),
    matches.filter((match) => match.leagueId === leagueId),
  );
};

export const getTopSupportedAthletes = (limit = 10) => {
  return [...athletes]
    .sort((a, b) => b.totalSupport - a.totalSupport)
    .slice(0, limit);
};

export const getActiveChallenges = () =>
  challenges.filter((challenge) =>
    ['open', 'active', 'funding_open', 'funding_locked', 'in_progress'].includes(
      String(challenge.status),
    ),
  );

export const getVerifiedMatches = () =>
  matches.filter((m) => m.verificationStatus === "verified");

export const getLeagueGoalPlaceIndex = (leagueId: string) =>
  getLeagueById(leagueId)?.goalPlaceIndex ?? 0;

export const getNotificationsByUser = (userId: string) =>
  notifications.filter((notification) => notification.userId === userId).sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
