import { Athlete, Challenge, FeedPost, League, Match, Team, User } from './types';

export const mockCurrentUser: User = {
  id: 'u1',
  name: 'Ben O.',
  email: 'beno1017@example.com',
  role: 'Fan',
  points: 8450,
  walletBalance: 150000,
  followedAthletes: ['a1', 'a3', 'a5'],
  followedTeams: ['t1', 't4'],
  followedLeagues: ['l1', 'l2'],
};

export const mockLeagues: League[] = [
  {
    id: 'l1',
    name: 'Kampala Grassroots Football League',
    sport: 'Football',
    country: 'Uganda',
    city: 'Kampala',
    status: 'Verified League',
    ranking: 1,
    logoUrl: '/placeholders/football-gradient.svg',
    verifiedPercentage: 98,
    completionRate: 95,
    goalPlaceIndex: 92,
    indexSignals: {
      verification: 98,
      matchCompletionRate: 95,
      athleteProfileCompletion: 91,
      fanEngagement: 88,
      supportActivity: 90,
      adminReliability: 94,
      mediaUploads: 89,
    },
  },
  {
    id: 'l2',
    name: 'Uganda Community Basketball League',
    sport: 'Basketball',
    country: 'Uganda',
    city: 'Wakiso',
    status: 'Community League',
    ranking: 2,
    logoUrl: '/placeholders/basketball-gradient.svg',
    verifiedPercentage: 95,
    completionRate: 90,
    goalPlaceIndex: 84,
    indexSignals: {
      verification: 88,
      matchCompletionRate: 90,
      athleteProfileCompletion: 86,
      fanEngagement: 82,
      supportActivity: 78,
      adminReliability: 87,
      mediaUploads: 79,
    },
  },
  {
    id: 'l3',
    name: 'Kampala Rugby Sevens League',
    sport: 'Rugby',
    country: 'Uganda',
    city: 'Entebbe',
    status: 'Partner League',
    ranking: 3,
    logoUrl: '/placeholders/rugby-gradient.svg',
    verifiedPercentage: 100,
    completionRate: 100,
    goalPlaceIndex: 96,
    indexSignals: {
      verification: 100,
      matchCompletionRate: 100,
      athleteProfileCompletion: 94,
      fanEngagement: 92,
      supportActivity: 93,
      adminReliability: 98,
      mediaUploads: 95,
    },
  },
];

export const mockTeams: Team[] = [
  { id: 't1', name: 'Kisenyi FC', sport: 'Football', location: 'Kampala', leagueId: 'l1', logoUrl: '/placeholders/football-gradient.svg', supportPool: 450000, recentResults: ['W', 'W', 'D'], stats: { Wins: 12, Draws: 2, Losses: 1 } },
  { id: 't2', name: 'Makindye Stars', sport: 'Football', location: 'Kampala', leagueId: 'l1', logoUrl: '/placeholders/football-gradient.svg', supportPool: 320000, recentResults: ['L', 'W', 'W'], stats: { Wins: 10, Draws: 3, Losses: 2 } },
  { id: 't3', name: 'Old Kampala United', sport: 'Football', location: 'Kampala', leagueId: 'l1', logoUrl: '/placeholders/football-gradient.svg', supportPool: 210000, recentResults: ['D', 'L', 'L'], stats: { Wins: 5, Draws: 5, Losses: 5 } },
  { id: 't4', name: 'Kampala Hoopers', sport: 'Basketball', location: 'Kampala', leagueId: 'l2', logoUrl: '/placeholders/basketball-gradient.svg', supportPool: 500000, recentResults: ['W', 'W', 'W'], stats: { Wins: 15, Losses: 2 } },
  { id: 't5', name: 'Wakiso Falcons', sport: 'Basketball', location: 'Wakiso', leagueId: 'l2', logoUrl: '/placeholders/basketball-gradient.svg', supportPool: 280000, recentResults: ['L', 'W', 'L'], stats: { Wins: 8, Losses: 9 } },
  { id: 't6', name: 'Jinja Titans', sport: 'Basketball', location: 'Jinja', leagueId: 'l2', logoUrl: '/placeholders/basketball-gradient.svg', supportPool: 340000, recentResults: ['W', 'L', 'W'], stats: { Wins: 11, Losses: 6 } },
  { id: 't7', name: 'Kyadondo Lions', sport: 'Rugby', location: 'Kampala', leagueId: 'l3', logoUrl: '/placeholders/rugby-gradient.svg', supportPool: 620000, recentResults: ['W', 'W', 'W'], stats: { Wins: 8, Losses: 0 } },
  { id: 't8', name: 'Kampala Rugby Club', sport: 'Rugby', location: 'Kampala', leagueId: 'l3', logoUrl: '/placeholders/rugby-gradient.svg', supportPool: 410000, recentResults: ['L', 'W', 'W'], stats: { Wins: 6, Losses: 2 } },
  { id: 't9', name: 'Entebbe Rhinos', sport: 'Rugby', location: 'Entebbe', leagueId: 'l3', logoUrl: '/placeholders/rugby-gradient.svg', supportPool: 250000, recentResults: ['L', 'L', 'W'], stats: { Wins: 3, Losses: 5 } },
];

export const mockAthletes: Athlete[] = [
  { id: 'a1', name: 'Brian Okello', sport: 'Football', position: 'Forward', teamId: 't1', leagueId: 'l1', country: 'Uganda', city: 'Kampala', verified: true, avatarUrl: '', coverUrl: '/placeholders/football-gradient.svg', supportersCount: 124, totalEarnings: 1500000, stats: { Goals: 14, Assists: 5, Matches: 15, POTM: 4 }, bio: 'Top scorer for Kisenyi FC with a sharp first touch and a loyal fan base across downtown Kampala.' },
  { id: 'a2', name: 'Amina Nakato', sport: 'Football', position: 'Goalkeeper', teamId: 't2', leagueId: 'l1', country: 'Uganda', city: 'Kampala', verified: true, avatarUrl: '', coverUrl: '/placeholders/football-gradient.svg', supportersCount: 89, totalEarnings: 850000, stats: { 'Clean Sheets': 8, Matches: 15, Saves: 42 }, bio: 'A calm shot stopper for Makindye Stars and a mentor for young keepers.' },
  { id: 'a3', name: 'Daniel Kato', sport: 'Basketball', position: 'Guard', teamId: 't4', leagueId: 'l2', country: 'Uganda', city: 'Kampala', verified: true, avatarUrl: '', coverUrl: '/placeholders/basketball-gradient.svg', supportersCount: 210, totalEarnings: 3200000, stats: { Points: 22.5, Assists: 8.2, Steals: 2.1, Games: 17 }, bio: 'Playmaker and leader for the Hoopers, known for fourth-quarter control and community clinics.' },
  { id: 'a4', name: 'Grace Namuli', sport: 'Basketball', position: 'Forward', teamId: 't5', leagueId: 'l2', country: 'Uganda', city: 'Wakiso', verified: true, avatarUrl: '', coverUrl: '/placeholders/basketball-gradient.svg', supportersCount: 145, totalEarnings: 1200000, stats: { Points: 18.0, Rebounds: 11.5, Blocks: 1.8, Games: 17 }, bio: 'A physical forward creating second chances for Wakiso Falcons every week.' },
  { id: 'a5', name: 'Samuel Ocen', sport: 'Rugby', position: 'Wing', teamId: 't7', leagueId: 'l3', country: 'Uganda', city: 'Kampala', verified: true, avatarUrl: '', coverUrl: '/placeholders/rugby-gradient.svg', supportersCount: 178, totalEarnings: 2100000, stats: { Tries: 12, Carries: 85, Matches: 8 }, bio: 'Lightning fast wing for the Lions with game-breaking pace on the outside channel.' },
  { id: 'a6', name: 'Ivan Mugisha', sport: 'Rugby', position: 'Flanker', teamId: 't8', leagueId: 'l3', country: 'Uganda', city: 'Kampala', verified: true, avatarUrl: '', coverUrl: '/placeholders/rugby-gradient.svg', supportersCount: 92, totalEarnings: 750000, stats: { Tackles: 112, Turnovers: 15, Matches: 8 }, bio: 'Defensive anchor for Kampala Rugby Club, valued for work rate and leadership.' },
  { id: 'a7', name: 'Ruth Nansubuga', sport: 'Football', position: 'Midfielder', teamId: 't3', leagueId: 'l1', country: 'Uganda', city: 'Kampala', verified: true, avatarUrl: '', coverUrl: '/placeholders/football-gradient.svg', supportersCount: 76, totalEarnings: 640000, stats: { Goals: 6, Assists: 11, Matches: 14 }, bio: 'Creative midfielder connecting youth football with senior league opportunity.' },
  { id: 'a8', name: 'Moses Baluku', sport: 'Basketball', position: 'Center', teamId: 't6', leagueId: 'l2', country: 'Uganda', city: 'Jinja', verified: false, avatarUrl: '', coverUrl: '/placeholders/basketball-gradient.svg', supportersCount: 58, totalEarnings: 410000, stats: { Points: 14.2, Rebounds: 13.4, Blocks: 2.4, Games: 16 }, bio: 'Rising center helping Jinja Titans protect the rim and own the boards.' },
];

export const mockMatches: Match[] = [
  { id: 'm1', sport: 'Football', leagueId: 'l1', teamAId: 't1', teamBId: 't2', status: 'Live', teamAScore: 2, teamBScore: 1, date: '2026-06-04T18:30:00+03:00', venue: 'KCCA Stadium, Kampala', verificationStatus: 'Pending' },
  { id: 'm2', sport: 'Basketball', leagueId: 'l2', teamAId: 't4', teamBId: 't5', status: 'Upcoming', date: '2026-06-05T19:00:00+03:00', venue: 'Lugogo Indoor Stadium', verificationStatus: 'Pending' },
  { id: 'm3', sport: 'Rugby', leagueId: 'l3', teamAId: 't7', teamBId: 't8', status: 'Completed', teamAScore: 24, teamBScore: 12, date: '2026-06-03T16:00:00+03:00', venue: 'Kyadondo Rugby Grounds', verificationStatus: 'Verified' },
  { id: 'm4', sport: 'Football', leagueId: 'l1', teamAId: 't3', teamBId: 't1', status: 'Upcoming', date: '2026-06-06T17:30:00+03:00', venue: 'Old Kampala Arena', verificationStatus: 'Pending' },
  { id: 'm5', sport: 'Basketball', leagueId: 'l2', teamAId: 't6', teamBId: 't4', status: 'Live', teamAScore: 48, teamBScore: 52, date: '2026-06-04T20:00:00+03:00', venue: 'Jinja Community Court', verificationStatus: 'Pending' },
  { id: 'm6', sport: 'Rugby', leagueId: 'l3', teamAId: 't9', teamBId: 't7', status: 'Upcoming', date: '2026-06-07T15:00:00+03:00', venue: 'Entebbe Works Grounds', verificationStatus: 'Pending' },
];

export const mockChallenges: Challenge[] = [
  { id: 'c1', athleteId: 'a1', matchId: 'm1', targetDescription: 'Verified reward: Brian scores 1 goal.', totalPledged: 250000, supportersCount: 32, status: 'Active', verificationStatus: 'Pending' },
  { id: 'c2', athleteId: 'a2', matchId: 'm1', targetDescription: 'Verified reward: Amina keeps a clean sheet.', totalPledged: 150000, supportersCount: 18, status: 'Active', verificationStatus: 'Pending' },
  { id: 'c3', athleteId: 'a3', matchId: 'm2', targetDescription: 'Verified reward: Daniel reaches 20 points.', totalPledged: 420000, supportersCount: 55, status: 'Active', verificationStatus: 'Pending' },
  { id: 'c4', athleteId: 'a5', matchId: 'm3', targetDescription: 'Verified reward: Samuel scores a try.', totalPledged: 310000, supportersCount: 41, status: 'Achieved', verificationStatus: 'Verified' },
  { id: 'c5', athleteId: 'a4', matchId: 'm2', targetDescription: 'Verified reward: Grace gets 10 rebounds.', totalPledged: 275000, supportersCount: 29, status: 'Active', verificationStatus: 'Pending' },
  { id: 'c6', athleteId: 'a6', matchId: 'm6', targetDescription: 'Verified reward: Ivan makes 8 tackles.', totalPledged: 195000, supportersCount: 21, status: 'Active', verificationStatus: 'Pending' },
];

export const mockFeed: FeedPost[] = [
  { id: 'f1', authorId: 'a3', authorType: 'Athlete', sport: 'Basketball', type: 'VerifiedAchievement', caption: 'Daniel Kato reached 20 points and unlocked 120,000 UGX from 47 supporters after official confirmation.', timestamp: '2026-06-04T10:00:00+03:00', likes: 234, comments: 45, shares: 12, statsRow: ['20 Points', '120,000 UGX Released'], verified: true, mediaUrl: '/placeholders/basketball-gradient.svg', mediaType: 'image' },
  { id: 'f2', authorId: 'a4', authorType: 'Athlete', sport: 'Basketball', type: 'SupportMilestone', caption: 'Grace Namuli reached 300,000 UGX in support for transport, meals, and training. The Wakiso crowd showed up.', timestamp: '2026-06-04T08:30:00+03:00', likes: 412, comments: 89, shares: 34, statsRow: ['300,000 UGX', '145 Supporters'], verified: true, mediaUrl: '/placeholders/basketball-gradient.svg', mediaType: 'image' },
  { id: 'f3', authorId: 't1', authorType: 'Team', sport: 'Football', type: 'MatchResult', caption: 'Kisenyi FC leads the derby 2-1. Active challenges remain open until official verification after full time.', timestamp: '2026-06-04T09:25:00+03:00', likes: 892, comments: 156, shares: 88, statsRow: ['2-1 Live', '450,000 UGX Pool'], verified: true, mediaUrl: '/placeholders/football-gradient.svg', mediaType: 'image' },
  { id: 'f4', authorId: 'l3', authorType: 'League', sport: 'Rugby', type: 'LeagueUpdate', caption: 'Kampala Rugby Sevens confirmed all weekend rosters. Athlete verification desks open two hours before kickoff.', timestamp: '2026-06-03T19:15:00+03:00', likes: 188, comments: 32, shares: 21, statsRow: ['Rosters Confirmed', '100% Completion'], verified: true, mediaUrl: '/placeholders/rugby-gradient.svg', mediaType: 'image' },
  { id: 'f5', authorId: 'a5', authorType: 'Athlete', sport: 'Rugby', type: 'AthleteHighlight', caption: 'Samuel Ocen broke the outside line twice and finished with a verified try in front of a packed Kyadondo touchline.', timestamp: '2026-06-03T18:05:00+03:00', likes: 520, comments: 71, shares: 49, statsRow: ['1 Try', '85 Carries This Season'], verified: true, mediaUrl: '/placeholders/rugby-gradient.svg', mediaType: 'image' },
  { id: 'f6', authorId: 's1', authorType: 'Sponsor', sport: 'Football', type: 'SponsorImpact', caption: 'A local business funded recovery kits for six verified football athletes ahead of Saturday fixtures.', timestamp: '2026-06-03T13:15:00+03:00', likes: 305, comments: 40, shares: 28, statsRow: ['6 Athletes', 'Recovery Kits'], verified: true, mediaUrl: '/placeholders/football-gradient.svg', mediaType: 'image' },
  { id: 'f7', authorId: 'admin1', authorType: 'Admin', sport: 'Basketball', type: 'AnnualAwards', caption: 'The GoalPlace Annual Awards race is heating up. GoalPlace Points are loyalty and recognition points, not cash.', timestamp: '2026-06-02T17:45:00+03:00', likes: 680, comments: 102, shares: 64, statsRow: ['8 Categories Live', 'Recognition Points'], verified: true, mediaUrl: '/placeholders/stadium-glow.svg', mediaType: 'image' },
];

export const walletTransactions = [
  { id: 'tx1', type: 'Support', label: 'Support to Brian Okello', amount: -25000, date: '2026-06-04', status: 'Completed', method: 'MTN Mobile Money' },
  { id: 'tx2', type: 'Points', label: 'GoalPlace Points earned', amount: 450, date: '2026-06-04', status: 'Completed', method: 'GoalPlace Points' },
  { id: 'tx3', type: 'Funds', label: 'Wallet top up', amount: 100000, date: '2026-06-02', status: 'Completed', method: 'Airtel Money' },
  { id: 'tx4', type: 'Reward', label: 'Verified performance reward released', amount: -50000, date: '2026-06-01', status: 'Verified', method: 'Flutterwave' },
];

export const awardCategories = [
  'Top Contributor',
  'Most Active Fan',
  'Community Champion',
  'Top Supported Athlete',
  'Breakthrough Talent',
  'Football Athlete of the Year',
  'Basketball Athlete of the Year',
  'Rugby Athlete of the Year',
  'Team of the Year',
  'Best Organized League',
  'Youth Talent Award',
  'Women and Youth Sport Impact Award',
];

export const sponsorPackages = [
  { name: 'Athlete Supporter', price: 'From 500k UGX', detail: 'Back individual verified athletes with transparent impact reporting.' },
  { name: 'Team Partner', price: 'From 2M UGX', detail: 'Support equipment, travel, and matchday operations for a team.' },
  { name: 'League Builder', price: 'From 6M UGX', detail: 'Help leagues run fixtures, verification, media, and awards.' },
  { name: 'Annual Awards Sponsor', price: 'Custom', detail: 'Own premium recognition moments across Uganda grassroots sport.' },
  { name: 'Women & Youth Sport Sponsor', price: 'Custom', detail: 'Fund targeted development programs with measurable community value.' },
];

export const dashboardSeries = [
  { month: 'Jan', support: 220000, fans: 38 },
  { month: 'Feb', support: 340000, fans: 54 },
  { month: 'Mar', support: 520000, fans: 78 },
  { month: 'Apr', support: 610000, fans: 94 },
  { month: 'May', support: 760000, fans: 118 },
  { month: 'Jun', support: 910000, fans: 138 },
];
