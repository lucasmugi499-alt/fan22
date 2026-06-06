import { users } from "./mockUsers";
import { sports } from "./mockSports";
import { leagues } from "./mockLeagues";
import { teams } from "./mockTeams";
import { athletes } from "./mockAthletes";
import { matches } from "./mockMatches";
import { challenges } from "./mockChallenges";
import { supportPledges } from "./mockSupportPledges";
import { walletTransactions } from "./mockWalletTransactions";
import { feedPosts } from "./mockFeedPosts";
import { comments } from "./mockComments";
import { sponsors } from "./mockSponsors";
import { awards } from "./mockAwards";
import { verifications } from "./mockVerifications";
import { reports } from "./mockReports";
import { notifications } from "./mockNotifications";
import { SportSlug } from "../types";

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
};

// Helper Functions
export const getAthleteById = (id: string) => athletes.find((a) => a.id === id);
export const getTeamById = (id: string) => teams.find((t) => t.id === id);
export const getLeagueById = (id: string) => leagues.find((l) => l.id === id);
export const getMatchById = (id: string) => matches.find((m) => m.id === id);

export const getAthletesBySport = (sport: SportSlug) =>
  athletes.filter((a) => a.sport === sport);

export const getTeamsByLeague = (leagueId: string) =>
  teams.filter((t) => t.leagueId === leagueId);

export const getMatchesByLeague = (leagueId: string) =>
  matches.filter((m) => m.leagueId === leagueId);

export const getChallengesByMatch = (matchId: string) =>
  challenges.filter((c) => c.matchId === matchId);

export const getFeedBySport = (sport: SportSlug) =>
  feedPosts.filter((f) => f.sport === sport).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

export const getWalletByUser = (userId: string) =>
  walletTransactions.filter((w) => w.userId === userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

export const getStandingsByLeague = (leagueId: string) => {
  return teams
    .filter((t) => t.leagueId === leagueId)
    .sort((a, b) => b.leaguePoints - a.leaguePoints);
};

export const getTopSupportedAthletes = (limit = 10) => {
  return [...athletes]
    .sort((a, b) => b.totalSupport - a.totalSupport)
    .slice(0, limit);
};

export const getActiveChallenges = () =>
  challenges.filter((c) => c.status === "open");

export const getVerifiedMatches = () =>
  matches.filter((m) => m.verificationStatus === "verified");
