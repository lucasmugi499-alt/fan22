import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

type DemoRole = 'fan' | 'athlete' | 'team_admin' | 'league_admin' | 'sponsor' | 'platform_admin' | 'super_admin';

type DemoUser = {
  email: string;
  name: string;
  role: DemoRole;
  points: number;
  walletBalance: number;
};

const demoUsers: DemoUser[] = [
  { email: 'fan@goalplace256.com', name: 'Fan Demo', role: 'fan', points: 8450, walletBalance: 250000 },
  { email: 'athlete@goalplace256.com', name: 'Athlete Demo', role: 'athlete', points: 3200, walletBalance: 85000 },
  { email: 'team@goalplace256.com', name: 'Team Admin Demo', role: 'team_admin', points: 4100, walletBalance: 125000 },
  { email: 'league@goalplace256.com', name: 'League Admin Demo', role: 'league_admin', points: 5400, walletBalance: 175000 },
  { email: 'sponsor@goalplace256.com', name: 'Sponsor Demo', role: 'sponsor', points: 2800, walletBalance: 500000 },
  { email: 'admin@goalplace256.com', name: 'Platform Admin Demo', role: 'platform_admin', points: 9000, walletBalance: 0 },
  { email: 'superadmin@goalplace256.com', name: 'Super Admin Demo', role: 'super_admin', points: 12000, walletBalance: 0 },
];

function serviceAccountCredential() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return cert({ projectId, clientEmail, privateKey });
  }

  return applicationDefault();
}

function initAdmin() {
  if (getApps().length > 0) return;

  initializeApp({
    credential: serviceAccountCredential(),
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

async function ensureUser(user: DemoUser, password: string) {
  const auth = getAuth();

  try {
    const existing = await auth.getUserByEmail(user.email);
    await auth.updateUser(existing.uid, { displayName: user.name, password, disabled: false });
    return existing;
  } catch {
    return auth.createUser({
      email: user.email,
      password,
      displayName: user.name,
      emailVerified: true,
      disabled: false,
    });
  }
}

async function seedDemoUsers(password: string) {
  const auth = getAuth();
  const db = getFirestore();
  const ids: Record<DemoRole, string> = {} as Record<DemoRole, string>;

  for (const demoUser of demoUsers) {
    const authUser = await ensureUser(demoUser, password);
    ids[demoUser.role] = authUser.uid;

    const adminRole = demoUser.role === 'platform_admin' || demoUser.role === 'super_admin' ? demoUser.role : null;
    await auth.setCustomUserClaims(authUser.uid, adminRole ? { role: adminRole } : {});
    await db.collection('users').doc(authUser.uid).set(
      {
        id: authUser.uid,
        uid: authUser.uid,
        email: demoUser.email,
        name: demoUser.name,
        role: demoUser.role,
        status: demoUser.role === 'fan' || adminRole ? 'active' : 'pending',
        points: demoUser.points,
        walletBalance: demoUser.walletBalance,
        followedAthletes: ['athlete-brian-okello'],
        followedTeams: ['team-kisenyi-fc'],
        followedLeagues: ['league-kampala-premier'],
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  return ids;
}

async function seedCollections(ids: Record<DemoRole, string>) {
  const db = getFirestore();
  const leagueAdminIds = [ids.league_admin, ids.platform_admin, ids.super_admin].filter(Boolean);
  const teamAdminIds = [ids.team_admin, ids.platform_admin, ids.super_admin].filter(Boolean);

  const docs: Array<{ collection: string; id: string; data: Record<string, unknown> }> = [
    {
      collection: 'leagues',
      id: 'league-kampala-premier',
      data: {
        name: 'Kampala Premier League',
        sport: 'Football',
        city: 'Kampala',
        country: 'Uganda',
        adminUserIds: leagueAdminIds,
        status: 'verified',
        plan: 'free',
        verified: true,
        teamsCount: 2,
        athletesCount: 3,
        matchesCount: 2,
        ranking: 1,
        logoUrl: '',
        verifiedPercentage: 94,
        completionRate: 91,
        goalPlaceIndex: 88,
        indexSignals: {
          verification: 94,
          matchCompletionRate: 91,
          athleteProfileCompletion: 86,
          fanEngagement: 82,
          supportActivity: 78,
          adminReliability: 92,
          mediaUploads: 79,
        },
        verificationRules: [
          'Match results require league admin confirmation.',
          'Athlete payouts require verified performance evidence.',
          'Paid tools never affect sporting standings.',
        ],
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
    },
    {
      collection: 'leagues',
      id: 'league-makindye-community',
      data: {
        name: 'Makindye Community Hoops',
        sport: 'Basketball',
        city: 'Kampala',
        country: 'Uganda',
        adminUserIds: leagueAdminIds,
        status: 'community',
        plan: 'free',
        verified: false,
        teamsCount: 1,
        athletesCount: 1,
        matchesCount: 1,
        ranking: 2,
        logoUrl: '',
        verifiedPercentage: 62,
        completionRate: 74,
        goalPlaceIndex: 67,
        indexSignals: {
          verification: 55,
          matchCompletionRate: 74,
          athleteProfileCompletion: 70,
          fanEngagement: 68,
          supportActivity: 58,
          adminReliability: 69,
          mediaUploads: 66,
        },
        verificationRules: ['Submit fixture list, admin contacts, and athlete profile checks for review.'],
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
    },
    {
      collection: 'teams',
      id: 'team-kisenyi-fc',
      data: {
        name: 'Kisenyi FC',
        sport: 'Football',
        location: 'Kisenyi, Kampala',
        leagueId: 'league-kampala-premier',
        adminUserIds: teamAdminIds,
        logoUrl: '',
        supportPool: 740000,
        recentResults: ['W', 'D', 'W'],
        stats: { wins: 8, draws: 2, losses: 1 },
      },
    },
    {
      collection: 'teams',
      id: 'team-makindye-stars',
      data: {
        name: 'Makindye Stars',
        sport: 'Football',
        location: 'Makindye, Kampala',
        leagueId: 'league-kampala-premier',
        adminUserIds: teamAdminIds,
        logoUrl: '',
        supportPool: 520000,
        recentResults: ['W', 'L', 'W'],
        stats: { wins: 7, draws: 1, losses: 3 },
      },
    },
    {
      collection: 'athletes',
      id: 'athlete-brian-okello',
      data: {
        userId: ids.athlete,
        name: 'Brian Okello',
        sport: 'Football',
        position: 'Forward',
        teamId: 'team-kisenyi-fc',
        leagueId: 'league-kampala-premier',
        country: 'Uganda',
        city: 'Kampala',
        verified: true,
        avatarUrl: '',
        coverUrl: '',
        supportersCount: 148,
        totalEarnings: 1240000,
        stats: { Goals: 12, Assists: 7 },
        bio: 'Fast forward building a verified support profile through local league results and community highlights.',
      },
    },
    {
      collection: 'athletes',
      id: 'athlete-daniel-semulya',
      data: {
        name: 'Daniel Semulya',
        sport: 'Basketball',
        position: 'Guard',
        teamId: 'team-kisenyi-fc',
        leagueId: 'league-makindye-community',
        country: 'Uganda',
        city: 'Kampala',
        verified: false,
        avatarUrl: '',
        coverUrl: '',
        supportersCount: 82,
        totalEarnings: 620000,
        stats: { Points: 20, Rebounds: 5 },
        bio: 'Community basketball athlete awaiting league verification and profile completion.',
      },
    },
    {
      collection: 'matches',
      id: 'match-kpl-001',
      data: {
        sport: 'Football',
        leagueId: 'league-kampala-premier',
        teamAId: 'team-kisenyi-fc',
        teamBId: 'team-makindye-stars',
        teamAScore: 2,
        teamBScore: 1,
        status: 'Completed',
        date: '2026-06-12T15:00:00.000Z',
        venue: 'KCCA Stadium',
        verificationStatus: 'Pending',
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    {
      collection: 'challenges',
      id: 'challenge-brian-goal',
      data: {
        athleteId: 'athlete-brian-okello',
        matchId: 'match-kpl-001',
        leagueId: 'league-kampala-premier',
        targetDescription: 'Brian scores at least one goal',
        totalPledged: 340000,
        supportersCount: 41,
        status: 'Active',
        verificationStatus: 'Pending',
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    {
      collection: 'supportPledges',
      id: 'pledge-demo-001',
      data: {
        fanId: ids.fan,
        athleteId: 'athlete-brian-okello',
        challengeId: 'challenge-brian-goal',
        leagueId: 'league-kampala-premier',
        amount: 25000,
        currency: 'UGX',
        type: 'performance_pledge',
        status: 'held',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    {
      collection: 'walletTransactions',
      id: 'wallet-demo-001',
      data: {
        userId: ids.fan,
        type: 'Performance pledge',
        label: 'Demo support for Brian Okello',
        amount: -25000,
        currency: 'UGX',
        status: 'held',
        supportPledgeId: 'pledge-demo-001',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    {
      collection: 'feedPosts',
      id: 'feed-demo-001',
      data: {
        authorId: 'athlete-brian-okello',
        authorType: 'Athlete',
        sport: 'Football',
        type: 'AthleteHighlight',
        caption: 'Brian Okello led Kisenyi FC with a verified match-winning performance.',
        mediaUrl: '',
        mediaType: 'image',
        timestamp: new Date().toISOString(),
        likes: 240,
        comments: 18,
        shares: 8,
        statsRow: ['2 goals', '41 supporters'],
        verified: true,
        status: 'published',
      },
    },
    {
      collection: 'sponsors',
      id: 'sponsor-demo-001',
      data: {
        name: 'GoalPlace256 Pilot Sponsor',
        contactUserId: ids.sponsor,
        package: 'League Builder',
        status: 'active',
        focus: ['athlete support', 'league reporting', 'annual awards'],
        createdAt: FieldValue.serverTimestamp(),
      },
    },
    {
      collection: 'awards',
      id: 'award-demo-001',
      data: {
        name: 'GoalPlace Annual Awards',
        season: '2026',
        category: 'Verified Athlete of the Year',
        eligibleLeagueIds: ['league-kampala-premier'],
        status: 'open',
        createdAt: FieldValue.serverTimestamp(),
      },
    },
    {
      collection: 'verifications',
      id: 'verification-match-kpl-001',
      data: {
        type: 'match_result',
        leagueId: 'league-kampala-premier',
        matchId: 'match-kpl-001',
        status: 'Pending',
        submittedBy: ids.league_admin,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    {
      collection: 'reports',
      id: 'report-demo-001',
      data: {
        reporterId: ids.fan,
        type: 'support_issue',
        status: 'open',
        summary: 'Demo support receipt review request.',
        createdAt: FieldValue.serverTimestamp(),
      },
    },
    {
      collection: 'adminLogs',
      id: 'admin-log-demo-001',
      data: {
        actorId: ids.platform_admin,
        action: 'seed_demo_data',
        target: 'goalplace256',
        createdAt: FieldValue.serverTimestamp(),
      },
    },
  ];

  const batch = db.batch();
  for (const item of docs) {
    batch.set(db.collection(item.collection).doc(item.id), item.data, { merge: true });
  }

  await batch.commit();
}

export async function seedDemoData() {
  initAdmin();

  const password = process.env.FIREBASE_DEMO_PASSWORD;
  if (!password) {
    throw new Error('Set FIREBASE_DEMO_PASSWORD before running pnpm seed:demo.');
  }

  const ids = await seedDemoUsers(password);
  await seedCollections(ids);
  console.log('GoalPlace256 demo users and Firestore seed data are ready.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedDemoData().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
