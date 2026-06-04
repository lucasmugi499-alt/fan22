import { Athlete, Team, League, Match, FeedPost, Challenge, User } from './types';

export const mockCurrentUser: User = {
  id: 'u1',
  name: 'Ben O.',
  email: 'beno1017@example.com',
  role: 'Fan',
  points: 8450,
  walletBalance: 150000,
  followedAthletes: ['a1', 'a3', 'a5'],
  followedTeams: ['t1', 't4'],
  followedLeagues: ['l1', 'l2']
};

export const mockLeagues: League[] = [
  { id: 'l1', name: 'Kampala Grassroots Football League', sport: 'Football', country: 'Uganda', city: 'Kampala', ranking: 1, logoUrl: 'https://images.unsplash.com/photo-1518605368461-1e1e11415053?auto=format&fit=crop&q=80&w=150&h=150', verifiedPercentage: 98, completionRate: 95 },
  { id: 'l2', name: 'Uganda Community Basketball League', sport: 'Basketball', country: 'Uganda', city: 'Wakiso', ranking: 2, logoUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&q=80&w=150&h=150', verifiedPercentage: 95, completionRate: 90 },
  { id: 'l3', name: 'Kampala Rugby Sevens League', sport: 'Rugby', country: 'Uganda', city: 'Entebbe', ranking: 3, logoUrl: 'https://images.unsplash.com/photo-1555592837-1959b3986a77?auto=format&fit=crop&q=80&w=150&h=150', verifiedPercentage: 100, completionRate: 100 }
];

export const mockTeams: Team[] = [
  // Football
  { id: 't1', name: 'Kisenyi FC', sport: 'Football', location: 'Kampala', leagueId: 'l1', logoUrl: 'https://images.unsplash.com/photo-1628891435222-06592ce293c0?auto=format&fit=crop&q=80&w=150&h=150', supportPool: 450000, recentResults: ['W', 'W', 'D'], stats: { 'Wins': 12, 'Draws': 2, 'Losses': 1 } },
  { id: 't2', name: 'Makindye Stars', sport: 'Football', location: 'Kampala', leagueId: 'l1', logoUrl: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&q=80&w=150&h=150', supportPool: 320000, recentResults: ['L', 'W', 'W'], stats: { 'Wins': 10, 'Draws': 3, 'Losses': 2 } },
  { id: 't3', name: 'Old Kampala United', sport: 'Football', location: 'Kampala', leagueId: 'l1', logoUrl: 'https://images.unsplash.com/photo-1516709849202-0e86b0391ab1?auto=format&fit=crop&q=80&w=150&h=150', supportPool: 210000, recentResults: ['D', 'L', 'L'], stats: { 'Wins': 5, 'Draws': 5, 'Losses': 5 } },
  // Basketball
  { id: 't4', name: 'Kampala Hoopers', sport: 'Basketball', location: 'Kampala', leagueId: 'l2', logoUrl: 'https://images.unsplash.com/photo-1519861531473-920026073336?auto=format&fit=crop&q=80&w=150&h=150', supportPool: 500000, recentResults: ['W', 'W', 'W'], stats: { 'Wins': 15, 'Losses': 2 } },
  { id: 't5', name: 'Wakiso Falcons', sport: 'Basketball', location: 'Wakiso', leagueId: 'l2', logoUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80&w=150&h=150', supportPool: 280000, recentResults: ['L', 'W', 'L'], stats: { 'Wins': 8, 'Losses': 9 } },
  { id: 't6', name: 'Jinja Titans', sport: 'Basketball', location: 'Jinja', leagueId: 'l2', logoUrl: 'https://images.unsplash.com/photo-1505666287802-931dc83948e9?auto=format&fit=crop&q=80&w=150&h=150', supportPool: 340000, recentResults: ['W', 'L', 'W'], stats: { 'Wins': 11, 'Losses': 6 } },
  // Rugby
  { id: 't7', name: 'Kyadondo Lions', sport: 'Rugby', location: 'Kampala', leagueId: 'l3', logoUrl: 'https://images.unsplash.com/photo-1582239335607-b2db580327f1?auto=format&fit=crop&q=80&w=150&h=150', supportPool: 620000, recentResults: ['W', 'W', 'W'], stats: { 'Wins': 8, 'Losses': 0 } },
  { id: 't8', name: 'Kampala Rugby Club', sport: 'Rugby', location: 'Kampala', leagueId: 'l3', logoUrl: 'https://images.unsplash.com/photo-1534067332219-58b456bd8b88?auto=format&fit=crop&q=80&w=150&h=150', supportPool: 410000, recentResults: ['L', 'W', 'W'], stats: { 'Wins': 6, 'Losses': 2 } },
  { id: 't9', name: 'Entebbe Rhinos', sport: 'Rugby', location: 'Entebbe', leagueId: 'l3', logoUrl: 'https://images.unsplash.com/photo-1563227914-7e8c3ef94676?auto=format&fit=crop&q=80&w=150&h=150', supportPool: 250000, recentResults: ['L', 'L', 'W'], stats: { 'Wins': 3, 'Losses': 5 } },
];

export const mockAthletes: Athlete[] = [
  // Football
  { id: 'a1', name: 'Brian Okello', sport: 'Football', position: 'Forward', teamId: 't1', leagueId: 'l1', country: 'Uganda', city: 'Kampala', verified: true, avatarUrl: 'https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?auto=format&fit=crop&q=80&w=300&h=300', coverUrl: 'https://images.unsplash.com/photo-1518605368461-1e1e11415053?auto=format&fit=crop&q=80&w=800&h=400', supportersCount: 124, totalEarnings: 1500000, stats: { 'Goals': 14, 'Assists': 5, 'Matches': 15, 'POTM': 4 }, bio: 'Top scorer for Kisenyi FC. Passionate about bringing the cup home.' },
  { id: 'a2', name: 'Amina Nakato', sport: 'Football', position: 'Goalkeeper', teamId: 't2', leagueId: 'l1', country: 'Uganda', city: 'Kampala', verified: true, avatarUrl: 'https://images.unsplash.com/photo-1531123897727-8f129e1bf98c?auto=format&fit=crop&q=80&w=300&h=300', coverUrl: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&q=80&w=800&h=400', supportersCount: 89, totalEarnings: 850000, stats: { 'Clean Sheets': 8, 'Matches': 15, 'Saves': 42 }, bio: 'Safe hands of Makindye Stars.' },
  // Basketball
  { id: 'a3', name: 'Daniel Kato', sport: 'Basketball', position: 'Guard', teamId: 't4', leagueId: 'l2', country: 'Uganda', city: 'Kampala', verified: true, avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=300&h=300', coverUrl: 'https://images.unsplash.com/photo-1519861531473-920026073336?auto=format&fit=crop&q=80&w=800&h=400', supportersCount: 210, totalEarnings: 3200000, stats: { 'Points': 22.5, 'Assists': 8.2, 'Steals': 2.1, 'Games': 17 }, bio: 'Playmaker and leader for the Hoopers.' },
  { id: 'a4', name: 'Grace Namuli', sport: 'Basketball', position: 'Forward', teamId: 't5', leagueId: 'l2', country: 'Uganda', city: 'Wakiso', verified: true, avatarUrl: 'https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43?auto=format&fit=crop&q=80&w=300&h=300', coverUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80&w=800&h=400', supportersCount: 145, totalEarnings: 1200000, stats: { 'Points': 18.0, 'Rebounds': 11.5, 'Blocks': 1.8, 'Games': 17 }, bio: 'Dominating the paint for Wakiso Falcons.' },
  // Rugby
  { id: 'a5', name: 'Samuel Ocen', sport: 'Rugby', position: 'Wing', teamId: 't7', leagueId: 'l3', country: 'Uganda', city: 'Kampala', verified: true, avatarUrl: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&q=80&w=300&h=300', coverUrl: 'https://images.unsplash.com/photo-1582239335607-b2db580327f1?auto=format&fit=crop&q=80&w=800&h=400', supportersCount: 178, totalEarnings: 2100000, stats: { 'Tries': 12, 'Carries': 85, 'Matches': 8 }, bio: 'Lightning fast wing for the Lions.' },
  { id: 'a6', name: 'Ivan Mugisha', sport: 'Rugby', position: 'Flanker', teamId: 't8', leagueId: 'l3', country: 'Uganda', city: 'Kampala', verified: true, avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=300&h=300', coverUrl: 'https://images.unsplash.com/photo-1534067332219-58b456bd8b88?auto=format&fit=crop&q=80&w=800&h=400', supportersCount: 92, totalEarnings: 750000, stats: { 'Tackles': 112, 'Turnovers': 15, 'Matches': 8 }, bio: 'Defensive anchor for KRC.' }
];

export const mockMatches: Match[] = [
  { id: 'm1', sport: 'Football', leagueId: 'l1', teamAId: 't1', teamBId: 't2', status: 'Live', teamAScore: 2, teamBScore: 1, date: new Date().toISOString(), venue: 'KCCA Stadium, Kampala', verificationStatus: 'Pending' },
  { id: 'm2', sport: 'Basketball', leagueId: 'l2', teamAId: 't4', teamBId: 't5', status: 'Upcoming', date: new Date(Date.now() + 86400000).toISOString(), venue: 'Lugogo Indoor Stadium', verificationStatus: 'Pending' },
  { id: 'm3', sport: 'Rugby', leagueId: 'l3', teamAId: 't7', teamBId: 't8', status: 'Completed', teamAScore: 24, teamBScore: 12, date: new Date(Date.now() - 86400000).toISOString(), venue: 'Kyadondo Rugby Grounds', verificationStatus: 'Verified' }
];

export const mockChallenges: Challenge[] = [
  { id: 'c1', athleteId: 'a1', matchId: 'm1', targetDescription: 'Support Brian if he scores 1 goal.', totalPledged: 250000, supportersCount: 32, status: 'Active', verificationStatus: 'Pending' },
  { id: 'c2', athleteId: 'a2', matchId: 'm1', targetDescription: 'Support Amina for a clean sheet.', totalPledged: 150000, supportersCount: 18, status: 'Active', verificationStatus: 'Pending' },
  { id: 'c3', athleteId: 'a3', matchId: 'm2', targetDescription: 'Support Daniel if he reaches 20 points.', totalPledged: 420000, supportersCount: 55, status: 'Active', verificationStatus: 'Pending' },
  { id: 'c4', athleteId: 'a5', matchId: 'm3', targetDescription: 'Support Samuel if he scores a try.', totalPledged: 310000, supportersCount: 41, status: 'Achieved', verificationStatus: 'Verified' }
];

export const mockFeed: FeedPost[] = [
  { id: 'f1', authorId: 'a3', authorType: 'Athlete', sport: 'Basketball', type: 'VerifiedAchievement', caption: 'Daniel K. reached 20 points and unlocked 120,000 UGX from 47 supporters.', timestamp: new Date(Date.now() - 3600000).toISOString(), likes: 234, comments: 45, shares: 12, statsRow: ['20 Points', '120,000 UGX Unlocked'], verified: true, mediaUrl: 'https://images.unsplash.com/photo-1519861531473-920026073336?auto=format&fit=crop&q=80&w=800&h=400', mediaType: 'image' },
  { id: 'f2', authorId: 'a4', authorType: 'Athlete', sport: 'Basketball', type: 'SupportMilestone', caption: 'Grace A. reached 300,000 UGX in support for transport, meals, and training. Thank you fans!', timestamp: new Date(Date.now() - 7200000).toISOString(), likes: 412, comments: 89, shares: 34, verified: true },
  { id: 'f3', authorId: 't1', authorType: 'Team', sport: 'Football', type: 'MatchResult', caption: 'Huge 2-1 win today in the derby! Thanks to everyone who backed the team support pool.', timestamp: new Date(Date.now() - 14400000).toISOString(), likes: 892, comments: 156, shares: 88, statsRow: ['2-1 Win', '450,000 UGX Pool'], verified: true, mediaUrl: 'https://images.unsplash.com/photo-1628891435222-06592ce293c0?auto=format&fit=crop&q=80&w=800&h=400', mediaType: 'image' }
];
