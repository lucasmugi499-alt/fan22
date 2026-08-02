import { adminDb } from '@/lib/firebase/admin';
import { jsonError, requireAuthenticatedUser, requireRole } from '@/server/api/security';

export const runtime = 'nodejs';

type FirestoreTimestampLike = {
  toDate?: () => Date;
};

type QueueTone = 'critical' | 'warning' | 'normal';

type QueueItem = {
  id: string;
  type: string;
  title: string;
  organization: string;
  priority: QueueTone;
  stage: string;
  nextAction: string;
  href: string;
  createdAt?: string;
};

function iso(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  const timestamp = value as FirestoreTimestampLike | undefined;
  const date = timestamp?.toDate?.();
  return date instanceof Date ? date.toISOString() : undefined;
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function snapshotData(doc: FirebaseFirestore.QueryDocumentSnapshot): Record<string, unknown> {
  return { id: doc.id, ...doc.data() };
}

async function getLimited(collectionName: string, max = 120, orderField?: string) {
  const collection = adminDb.collection(collectionName);
  const run = (query: FirebaseFirestore.Query) => query.limit(max).get();
  try {
    const snapshot = await run(orderField ? collection.orderBy(orderField, 'desc') : collection);
    return snapshot.docs.map(snapshotData);
  } catch {
    const snapshot = await run(collection);
    return snapshot.docs.map(snapshotData);
  }
}

async function getCount(collectionName: string) {
  const collection = adminDb.collection(collectionName) as FirebaseFirestore.CollectionReference & {
    count?: () => { get: () => Promise<{ data: () => { count?: number } }> };
  };
  if (typeof collection.count === 'function') {
    const snapshot = await collection.count().get();
    return Number(snapshot.data().count ?? 0);
  }
  const snapshot = await collection.limit(250).get();
  return snapshot.size;
}

function applicationQueueItem(record: Record<string, unknown>): QueueItem | null {
  const status = stringValue(record.status, 'submitted');
  if (!['pending', 'submitted', 'under_review', 'needs_information', 'resubmitted', 'risk_review', 'waitlisted'].includes(status)) {
    return null;
  }
  const riskFlags = Array.isArray(record.riskFlags) ? record.riskFlags.length : 0;
  const id = stringValue(record.id);
  return {
    id,
    type: 'League application',
    title: stringValue(record.leagueName, 'Unnamed league application'),
    organization: stringValue(record.city, stringValue(record.region, 'Unknown region')),
    priority: status === 'risk_review' || riskFlags ? 'critical' : status === 'needs_information' ? 'warning' : 'normal',
    stage: status.replace(/_/g, ' '),
    nextAction: status === 'needs_information' ? 'Review applicant response' : 'Open application review',
    href: `/admin/applications/${encodeURIComponent(id)}`,
    createdAt: iso(record.updatedAt) ?? iso(record.createdAt),
  };
}

function athleteQueueItem(record: Record<string, unknown>): QueueItem | null {
  const status = stringValue(record.verificationStatus, record.verified === true ? 'verified' : 'pending');
  if (status !== 'pending' && status !== 'disputed') return null;
  const id = stringValue(record.id);
  return {
    id,
    type: 'Athlete verification',
    title: stringValue(record.name, 'Athlete profile'),
    organization: stringValue(record.teamName, stringValue(record.city, 'Unassigned')),
    priority: status === 'disputed' ? 'critical' : 'normal',
    stage: status,
    nextAction: 'Review identity and roster evidence',
    href: `/athletes/${encodeURIComponent(id)}`,
    createdAt: iso(record.updatedAt) ?? iso(record.createdAt),
  };
}

function matchQueueItem(record: Record<string, unknown>): QueueItem | null {
  const status = stringValue(record.verificationStatus);
  if (status !== 'disputed') return null;
  const id = stringValue(record.id);
  return {
    id,
    type: 'Result dispute',
    title: `${stringValue(record.homeTeamName, 'Home team')} vs ${stringValue(record.awayTeamName, 'Away team')}`,
    organization: stringValue(record.venue, stringValue(record.leagueId, 'Competition')),
    priority: 'critical',
    stage: 'disputed',
    nextAction: 'Inspect submissions and evidence',
    href: `/matches/${encodeURIComponent(id)}`,
    createdAt: iso(record.updatedAt) ?? iso(record.date) ?? iso(record.scheduledAt),
  };
}

function finalizationQueueItem(record: Record<string, unknown>): QueueItem | null {
  if (stringValue(record.status) !== 'failed') return null;
  const id = stringValue(record.id);
  return {
    id,
    type: 'Failed finalization',
    title: `Finalization ${id}`,
    organization: stringValue(record.matchId, 'Match finalizer'),
    priority: 'critical',
    stage: 'failed',
    nextAction: 'Retry approved idempotent job',
    href: '/admin/competition',
    createdAt: iso(record.appliedAt) ?? iso(record.createdAt),
  };
}

function reportQueueItem(record: Record<string, unknown>): QueueItem | null {
  const status = stringValue(record.status);
  if (status !== 'open' && status !== 'reviewing') return null;
  const severity = stringValue(record.severity, 'Medium');
  const id = stringValue(record.id);
  return {
    id,
    type: stringValue(record.type, 'Trust case').replace(/_/g, ' '),
    title: stringValue(record.summary, 'Reported platform issue'),
    organization: stringValue(record.affectedEntity, stringValue(record.reportedEntity, 'Platform')),
    priority: severity === 'Critical' || severity === 'High' ? 'critical' : severity === 'Medium' ? 'warning' : 'normal',
    stage: status,
    nextAction: 'Open investigation workspace',
    href: `/admin/trust/${encodeURIComponent(id)}`,
    createdAt: iso(record.updatedAt) ?? iso(record.createdAt),
  };
}

function sortQueue(left: QueueItem, right: QueueItem) {
  const priority = { critical: 3, warning: 2, normal: 1 };
  const byPriority = priority[right.priority] - priority[left.priority];
  if (byPriority) return byPriority;
  return Date.parse(right.createdAt ?? '') - Date.parse(left.createdAt ?? '');
}

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response;

  const forbidden = requireRole(auth.actor, ['platform_admin', 'super_admin'], 'Platform Admin access required.');
  if (forbidden) return forbidden;

  const profile = await adminDb.collection('users').doc(auth.actor.uid).get();
  const profileData = profile.data();
  if (profileData?.accountClass !== 'platform_operator') {
    return jsonError('A dedicated Platform Operator account is required.', 403);
  }

  const [
    leagues,
    teams,
    athletes,
    matches,
    applications,
    reports,
    finalizations,
    auditEvents,
    users,
    leagueCount,
    teamCount,
    athleteCount,
    matchCount,
  ] = await Promise.all([
    getLimited('leagues', 180),
    getLimited('teams', 220),
    getLimited('athletes', 220),
    getLimited('matches', 260),
    getLimited('leagueAdminApplications', 80, 'updatedAt'),
    getLimited('reports', 80, 'updatedAt'),
    getLimited('finalizations', 80, 'appliedAt'),
    getLimited('adminAuditEvents', 12, 'createdAt'),
    getLimited('users', 160, 'createdAt'),
    getCount('leagues'),
    getCount('teams'),
    getCount('athletes'),
    getCount('matches'),
  ]);

  const failedFinalizations = finalizations.filter((record) => stringValue(record.status) === 'failed').length;
  const criticalReports = reports.filter((record) => (
    ['open', 'reviewing'].includes(stringValue(record.status)) && stringValue(record.severity) === 'Critical'
  )).length;
  const suspendedLeagues = leagues.filter((record) => stringValue(record.status) === 'suspended' || stringValue(record.lifecycleStatus) === 'suspended').length;
  const blockedTeams = teams.filter((record) => stringValue(record.verificationStatus) === 'rejected').length;
  const officialMatches = matches.filter((record) => (
    stringValue(record.verificationStatus) === 'verified'
    || stringValue(record.status) === 'official'
    || record.official === true
  )).length;
  const disputedResults = matches.filter((record) => stringValue(record.verificationStatus) === 'disputed').length;
  const suspendedAccounts = users.filter((record) => ['suspended', 'disabled', 'deletion_pending'].includes(stringValue(record.accountStatus))).length;
  const pendingApplications = applications.filter((record) => {
    const status = stringValue(record.status);
    return ['pending', 'submitted', 'under_review', 'needs_information', 'resubmitted', 'risk_review', 'waitlisted'].includes(status);
  }).length;

  const queueCandidates = [
    ...applications.map(applicationQueueItem),
    ...athletes.map(athleteQueueItem),
    ...matches.map(matchQueueItem),
    ...finalizations.map(finalizationQueueItem),
    ...reports.map(reportQueueItem),
  ];
  const workQueue = queueCandidates
    .filter((item): item is QueueItem => Boolean(item))
    .sort(sortQueue)
    .slice(0, 12);

  return Response.json({
    generatedAt: new Date().toISOString(),
    environment: process.env.NEXT_PUBLIC_GOALPLACE_ENVIRONMENT ?? process.env.NODE_ENV ?? 'unknown',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? process.env.GOALPLACE_FIREBASE_PROJECT_ID ?? 'unconfigured',
    databaseId: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID ?? process.env.FIRESTORE_DATABASE_ID ?? '(default)',
    statusStrip: [
      { label: 'System status', value: failedFinalizations || criticalReports ? 'Attention' : 'Operational', tone: failedFinalizations || criticalReports ? 'warning' : 'good' },
      { label: 'Failed finalizations', value: failedFinalizations, tone: failedFinalizations ? 'critical' : 'good' },
      { label: 'Security incidents', value: criticalReports, tone: criticalReports ? 'critical' : 'good' },
      { label: 'Payment exceptions', value: 0, tone: 'muted', note: 'Real payment authority disabled' },
      { label: 'Suspended orgs', value: suspendedLeagues + blockedTeams, tone: suspendedLeagues + blockedTeams ? 'warning' : 'good' },
    ],
    workQueue,
    networkHealth: [
      { label: 'Active leagues', value: leagueCount - suspendedLeagues },
      { label: 'Active teams', value: teamCount - blockedTeams },
      { label: 'Registered athletes', value: athleteCount },
      { label: 'Official matches', value: officialMatches || matchCount },
      { label: 'Verified-result rate', value: `${Math.round((officialMatches / Math.max(1, matches.length)) * 100)}%` },
      { label: 'Results disputed', value: disputedResults },
      { label: 'Data-completeness rate', value: `${Math.round((athletes.filter((record) => stringValue(record.teamId)).length / Math.max(1, athletes.length)) * 100)}%` },
      { label: 'Suspended accounts', value: suspendedAccounts },
    ],
    recentActivity: auditEvents.map((record) => ({
      id: stringValue(record.id),
      action: stringValue(record.action, 'recorded'),
      actorUserId: stringValue(record.actorUserId, 'system'),
      target: `${stringValue(record.targetCollection, 'record')}/${stringValue(record.targetId, 'unknown')}`,
      note: stringValue(record.note),
      createdAt: iso(record.createdAt),
    })),
    quickCommands: [
      { label: 'Review next application', href: '/admin/applications', count: pendingApplications },
      { label: 'Create organization', href: '/admin/organizations', count: leagueCount },
      { label: 'Find person or organization', href: '/admin/people', count: users.length },
      { label: 'Open failed finalizations', href: '/admin/competition', count: failedFinalizations },
      { label: 'Open active incident', href: '/admin/trust', count: criticalReports },
    ],
  }, { headers: { 'cache-control': 'no-store' } });
}
