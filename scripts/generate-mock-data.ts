import fs from "fs";
import path from "path";

// Output directory
const DATA_DIR = path.join(process.cwd(), "src/data");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const CITIES = [
  "Kampala",
  "Wakiso",
  "Entebbe",
  "Jinja",
  "Mbarara",
  "Gulu",
  "Mukono",
  "Masaka",
  "Fort Portal",
  "Mbale",
];

const NAMES = {
  male: [
    "Brian Okello", "Moses Ssentongo", "Isaac Mutebi", "Patrick Ouma", "Samuel Kisekka",
    "Daniel Mugisha", "Robert Kato", "Daniel Kato", "Joseph Sserwadda", "Kevin Ocen",
    "Allan Tumwesigye", "Peter Byaruhanga", "Samuel Ocen", "Ivan Mugisha", "Hassan Lubega",
    "Collins Waiswa", "Timothy Kidega", "Alex Semakula"
  ],
  female: [
    "Amina Nakato", "Faridah Nambooze", "Grace Namatovu", "Grace Namuli", "Patricia Akello",
    "Martha Nansubuga", "Irene Nakiwala", "Sarah Namutebi", "Norah Atim", "Juliet Namukasa",
    "Miriam Adoch", "Rebecca Nanyonjo"
  ]
};

const ALL_NAMES = [...NAMES.male, ...NAMES.female];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const generateId = (prefix: string, index: number) =>
  `${prefix}_${index.toString().padStart(3, "0")}`;

const sports = [
  {
    id: "football",
    name: "Football",
    icon: "football",
    color: "#22c55e",
    gradient: "from-green-500 to-green-700",
    description: "The beautiful game uniting communities across Uganda.",
    statLabels: ["Goals", "Assists", "Clean Sheets", "Yellow Cards"],
    challengeExamples: ["Score 2 goals in the next match", "Keep a clean sheet"],
  },
  {
    id: "basketball",
    name: "Basketball",
    icon: "basketball",
    color: "#f97316",
    gradient: "from-orange-500 to-orange-700",
    description: "High-flying action and community hoops.",
    statLabels: ["Points", "Rebounds", "Assists", "Steals"],
    challengeExamples: ["Score 20 points", "Get 10 rebounds"],
  },
  {
    id: "rugby",
    name: "Rugby",
    icon: "rugby",
    color: "#3b82f6",
    gradient: "from-blue-500 to-blue-700",
    description: "Strength, speed, and brotherhood on the pitch.",
    statLabels: ["Tries", "Conversions", "Tackles", "Penalties"],
    challengeExamples: ["Score a try", "Make 15 tackles"],
  },
];

const writeTsFile = (filename: string, varName: string, data: any, importType: string) => {
  const fileContent = `import { ${importType} } from "../types";\n\nexport const ${varName}: ${importType}[] = ${JSON.stringify(
    data,
    null,
    2
  )};\n`;
  fs.writeFileSync(path.join(DATA_DIR, filename), fileContent);
};

async function main() {
  const users: any[] = [];
  const leagues: any[] = [];
  const teams: any[] = [];
  const athletes: any[] = [];
  const matches: any[] = [];
  const challenges: any[] = [];
  const supportPledges: any[] = [];
  const walletTransactions: any[] = [];
  const feedPosts: any[] = [];
  const sponsors: any[] = [];
  const awards: any[] = [];
  const verifications: any[] = [];
  const notifications: any[] = []; // Mock
  const comments: any[] = []; // Mock
  const reports: any[] = []; // Mock

  // Generate 200 Users (mixed roles)
  for (let i = 1; i <= 200; i++) {
    const role =
      i <= 5
        ? "super_admin"
        : i <= 15
        ? "league_admin"
        : i <= 30
        ? "team_admin"
        : i <= 40
        ? "sponsor"
        : i <= 130
        ? "athlete"
        : "fan";
    
    users.push({
      id: generateId("user", i),
      email: `user${i}@example.com`,
      displayName: randomItem(ALL_NAMES),
      role,
      city: randomItem(CITIES),
      country: "Uganda",
      points: randomNumber(0, 1000),
      walletBalance: randomNumber(0, 500000),
      status: "active",
      createdAt: new Date().toISOString(),
    });
  }

  // Generate 10 Leagues (4 FB, 3 BB, 3 RB)
  const leagueNames = {
    football: [
      "Kampala Grassroots Football League",
      "Wakiso Community Football Championship",
      "Jinja Urban Football League",
      "Masaka Youth Football League",
    ],
    basketball: [
      "Kampala Community Basketball League",
      "Wakiso Hoops Circuit",
      "Jinja Streetball Championship",
    ],
    rugby: [
      "Kampala Rugby Sevens League",
      "Kyadondo Community Rugby Cup",
      "Entebbe Rugby Development League",
    ],
  };

  let leagueIndex = 1;
  Object.keys(leagueNames).forEach((sport) => {
    leagueNames[sport as keyof typeof leagueNames].forEach((name) => {
      leagues.push({
        id: generateId("league", leagueIndex++),
        name,
        sport,
        city: randomItem(CITIES),
        country: "Uganda",
        description: `Community ${sport} league in Uganda.`,
        status: "verified",
        plan: "pro",
        verified: true,
        adminUserIds: [randomItem(users.filter((u) => u.role === "league_admin")).id],
        season: "2026",
        teamsCount: 8,
        athletesCount: 0, // will compute
        matchesCount: 0,
        matchCompletionRate: randomNumber(60, 100),
        verifiedResultsRate: randomNumber(50, 100),
        goalPlaceIndex: randomNumber(500, 1000),
        totalSupport: randomNumber(100000, 5000000),
        supportersCount: randomNumber(10, 100),
        verificationRules: {
          requiresLeagueAdminApproval: true,
          requiresRefereeConfirmation: true,
          allowsPerformancePledges: true,
        },
        createdAt: new Date().toISOString(),
      });
    });
  });

  // Generate Teams (At least 24 total, let's do 4 per league -> 40 teams)
  let teamIndex = 1;
  const teamPrefixes = ["City", "United", "Warriors", "Lions", "Stars", "Kings", "Rangers", "Flyers"];
  leagues.forEach((league) => {
    for (let i = 0; i < 4; i++) {
      teams.push({
        id: generateId("team", teamIndex++),
        name: `${league.city} ${teamPrefixes[i]}`,
        sport: league.sport,
        leagueId: league.id,
        city: league.city,
        country: "Uganda",
        description: `A formidable ${league.sport} team from ${league.city}.`,
        plan: "free",
        verified: true,
        adminUserIds: [randomItem(users.filter((u) => u.role === "team_admin")).id],
        totalSupport: randomNumber(10000, 500000),
        supportersCount: randomNumber(5, 50),
        wins: randomNumber(2, 10),
        losses: randomNumber(2, 10),
        pointsFor: randomNumber(10, 50),
        pointsAgainst: randomNumber(10, 50),
        leaguePoints: randomNumber(5, 30),
        createdAt: new Date().toISOString(),
      });
    }
  });

  // Generate Athletes (At least 80, let's do 3 per team -> 120 athletes)
  let athleteIndex = 1;
  const athleteUsers = users.filter((u) => u.role === "athlete");
  let auIndex = 0;

  teams.forEach((team) => {
    for (let i = 0; i < 3; i++) {
      const u = athleteUsers[auIndex++ % athleteUsers.length];
      athletes.push({
        id: generateId("ath", athleteIndex++),
        userId: u.id,
        name: u.displayName,
        sport: team.sport,
        position: team.sport === "football" ? "Striker" : team.sport === "basketball" ? "Point Guard" : "Fly-half",
        teamId: team.id,
        leagueId: team.leagueId,
        city: team.city,
        country: "Uganda",
        ageGroup: "Senior",
        bio: `Passionate ${team.sport} player representing ${team.name}.`,
        verified: true,
        verificationStatus: "verified",
        totalSupport: randomNumber(5000, 100000),
        supportersCount: randomNumber(1, 20),
        goalPlacePoints: randomNumber(100, 1000),
        stats: {
          appearances: randomNumber(5, 20),
          goals: team.sport === "football" ? randomNumber(0, 15) : undefined,
          points: team.sport === "basketball" ? randomNumber(50, 300) : undefined,
          tries: team.sport === "rugby" ? randomNumber(0, 10) : undefined,
        },
        impactNeeds: ["New boots", "Transport fare for away games"],
        createdAt: new Date().toISOString(),
      });
    }
  });

  // Generate Matches (At least 40, let's do 4 per league -> 40 matches)
  let matchIndex = 1;
  leagues.forEach((league) => {
    const leagueTeams = teams.filter((t) => t.leagueId === league.id);
    for (let i = 0; i < 4; i++) {
      const t1 = leagueTeams[i % leagueTeams.length];
      const t2 = leagueTeams[(i + 1) % leagueTeams.length];
      const isCompleted = Math.random() > 0.5;

      matches.push({
        id: generateId("match", matchIndex++),
        sport: league.sport,
        leagueId: league.id,
        homeTeamId: t1.id,
        awayTeamId: t2.id,
        venue: `${league.city} Stadium`,
        city: league.city,
        scheduledAt: new Date(Date.now() + (isCompleted ? -1 : 1) * 86400000 * randomNumber(1, 10)).toISOString(),
        status: isCompleted ? "verified" : "scheduled",
        score: {
          home: isCompleted ? randomNumber(0, 5) : null,
          away: isCompleted ? randomNumber(0, 5) : null,
        },
        verificationStatus: isCompleted ? "verified" : "pending",
        supportersCount: randomNumber(5, 50),
        totalSupport: randomNumber(10000, 200000),
        events: [],
        createdAt: new Date().toISOString(),
      });
    }
  });

  // Generate Challenges (At least 50)
  for (let i = 1; i <= 60; i++) {
    const ath = randomItem(athletes);
    const m = randomItem(matches.filter(m => m.homeTeamId === ath.teamId || m.awayTeamId === ath.teamId));
    challenges.push({
      id: generateId("challenge", i),
      athleteId: ath.id,
      matchId: m ? m.id : generateId("match", 1),
      leagueId: ath.leagueId,
      sport: ath.sport,
      type: "performance",
      target: randomNumber(1, 3),
      description: `Score ${randomNumber(1, 3)} goals/points in the upcoming match.`,
      totalPledged: randomNumber(10000, 100000),
      supportersCount: randomNumber(1, 10),
      status: "open",
      verificationStatus: "pending",
      createdAt: new Date().toISOString(),
    });
  }

  // Generate Support Pledges (At least 30)
  for (let i = 1; i <= 40; i++) {
    const isDirect = Math.random() > 0.5;
    const ath = randomItem(athletes);
    supportPledges.push({
      id: generateId("pledge", i),
      fanId: randomItem(users.filter(u => u.role === "fan")).id,
      athleteId: ath.id,
      challengeId: isDirect ? undefined : randomItem(challenges).id,
      amount: randomNumber(5000, 50000),
      currency: "UGX",
      type: isDirect ? "direct_support" : "performance_pledge",
      status: "released",
      platformFee: 500,
      netAmount: 4500,
      message: "Keep pushing hard!",
      createdAt: new Date().toISOString(),
    });
  }

  // Generate Wallet Transactions (At least 30)
  for (let i = 1; i <= 40; i++) {
    walletTransactions.push({
      id: generateId("txn", i),
      userId: randomItem(users).id,
      type: "support",
      amount: randomNumber(5000, 50000),
      currency: "UGX",
      status: "completed",
      description: "Support sent to athlete.",
      createdAt: new Date().toISOString(),
    });
  }

  // Generate Feed Posts (At least 40)
  for (let i = 1; i <= 50; i++) {
    const ath = randomItem(athletes);
    feedPosts.push({
      id: generateId("feed", i),
      authorId: randomItem(users).id,
      authorName: randomItem(ALL_NAMES),
      authorRole: "fan",
      sport: ath.sport,
      type: "athlete_highlight",
      caption: `Great performance by ${ath.name} in the last game! Real talent in ${ath.city}.`,
      relatedAthleteId: ath.id,
      likesCount: randomNumber(5, 100),
      commentsCount: randomNumber(0, 20),
      sharesCount: randomNumber(0, 10),
      status: "active",
      createdAt: new Date().toISOString(),
    });
  }

  // Generate Sponsors (At least 10)
  for (let i = 1; i <= 15; i++) {
    sponsors.push({
      id: generateId("sponsor", i),
      name: `Sponsor Company ${i}`,
      category: "Sports Gear",
      city: randomItem(CITIES),
      packageType: "league_builder",
      amountCommitted: randomNumber(1000000, 5000000),
      currency: "UGX",
      supportedAthleteIds: [randomItem(athletes).id],
      supportedTeamIds: [randomItem(teams).id],
      supportedLeagueIds: [randomItem(leagues).id],
      impactSummary: "Providing boots and jerseys for grassroots talent.",
      active: true,
    });
  }

  // Generate Awards (At least 12)
  for (let i = 1; i <= 15; i++) {
    awards.push({
      id: generateId("award", i),
      name: `Best Player of the Year ${i}`,
      description: "Awarded to the most consistent performer.",
      sport: randomItem(sports).id,
      categoryType: "athlete",
      eligibilityRules: ["Must have played 10 matches", "Verified profile"],
      currentLeaderIds: [randomItem(athletes).id, randomItem(athletes).id],
      sponsorId: randomItem(sponsors).id,
    });
  }

  // Generate Verifications (At least 20)
  for (let i = 1; i <= 25; i++) {
    verifications.push({
      id: generateId("verify", i),
      type: "match_result",
      relatedId: randomItem(matches).id,
      status: "verified",
      submittedBy: randomItem(users).id,
      notes: "Result confirmed by referee.",
      createdAt: new Date().toISOString(),
    });
  }

  // Write files
  writeTsFile("mockSports.ts", "sports", sports, "Sport");
  writeTsFile("mockUsers.ts", "users", users, "User");
  writeTsFile("mockLeagues.ts", "leagues", leagues, "League");
  writeTsFile("mockTeams.ts", "teams", teams, "Team");
  writeTsFile("mockAthletes.ts", "athletes", athletes, "Athlete");
  writeTsFile("mockMatches.ts", "matches", matches, "Match");
  writeTsFile("mockChallenges.ts", "challenges", challenges, "Challenge");
  writeTsFile("mockSupportPledges.ts", "supportPledges", supportPledges, "SupportPledge");
  writeTsFile("mockWalletTransactions.ts", "walletTransactions", walletTransactions, "WalletTransaction");
  writeTsFile("mockFeedPosts.ts", "feedPosts", feedPosts, "FeedPost");
  writeTsFile("mockSponsors.ts", "sponsors", sponsors, "Sponsor");
  writeTsFile("mockAwards.ts", "awards", awards, "AwardCategory");
  writeTsFile("mockVerifications.ts", "verifications", verifications, "Verification");

  // Write empty mocks for the rest to satisfy requirements
  fs.writeFileSync(path.join(DATA_DIR, "mockComments.ts"), `export const comments: any[] = [];\n`);
  fs.writeFileSync(path.join(DATA_DIR, "mockReports.ts"), `export const reports: any[] = [];\n`);
  fs.writeFileSync(path.join(DATA_DIR, "mockNotifications.ts"), `export const notifications: any[] = [];\n`);

  console.log("Mock data generated successfully!");
}

main().catch(console.error);
