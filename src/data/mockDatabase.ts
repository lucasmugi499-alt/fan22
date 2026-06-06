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
import { Match, SportSlug, Team } from "@/types";

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
};

// Helper Functions
export const getUserById = (id: string) => users.find((user) => user.id === id);
export const getAthleteById = (id: string) => athletes.find((a) => a.id === id);
export const getTeamById = (id: string) => teams.find((t) => t.id === id);
export const getLeagueById = (id: string) => leagues.find((l) => l.id === id);
export const getMatchById = (id: string) => matches.find((m) => m.id === id);

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

function emptyStanding(team: Team): StandingRow {
  return {
    teamId: team.id,
    teamName: team.name,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    difference: 0,
    points: 0,
  };
}

function hasResult(match: Match) {
  return (
    (match.status === "completed" || match.status === "verified" || match.status === "disputed") &&
    typeof match.score.home === "number" &&
    typeof match.score.away === "number"
  );
}

export const getStandingsByLeague = (leagueId: string) => {
  const league = getLeagueById(leagueId);
  const standings = new Map(teams.filter((team) => team.leagueId === leagueId).map((team) => [team.id, emptyStanding(team)]));

  matches.filter((match) => match.leagueId === leagueId && hasResult(match)).forEach((match) => {
    const home = standings.get(match.homeTeamId);
    const away = standings.get(match.awayTeamId);
    if (!home || !away || typeof match.score.home !== "number" || typeof match.score.away !== "number") return;

    home.played += 1;
    away.played += 1;
    home.pointsFor += match.score.home;
    home.pointsAgainst += match.score.away;
    away.pointsFor += match.score.away;
    away.pointsAgainst += match.score.home;

    if (match.score.home > match.score.away) {
      home.wins += 1;
      away.losses += 1;
      home.points += league?.sport === "football" ? 3 : 1;
    } else if (match.score.home < match.score.away) {
      away.wins += 1;
      home.losses += 1;
      away.points += league?.sport === "football" ? 3 : 1;
    } else {
      home.draws += 1;
      away.draws += 1;
      if (league?.sport === "football") {
        home.points += 1;
        away.points += 1;
      }
    }
  });

  return [...standings.values()]
    .map((standing) => ({
      ...standing,
      difference: standing.pointsFor - standing.pointsAgainst,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.difference !== a.difference) return b.difference - a.difference;
      if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
      return a.teamName.localeCompare(b.teamName);
    });
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

export const getLeagueGoalPlaceIndex = (leagueId: string) =>
  getLeagueById(leagueId)?.goalPlaceIndex ?? 0;

export const getNotificationsByUser = (userId: string) =>
  notifications.filter((notification) => notification.userId === userId).sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
