import type {
  DataCollectionProfile,
  EventTypeDefinition,
  OfficialSportEvent,
  StatisticDefinition,
} from '@/kernel/types';
import type { SportSlug } from '@/types';

export function validateUniqueEventCodes(eventTypes: EventTypeDefinition[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const eventType of eventTypes) {
    if (seen.has(eventType.code)) duplicates.add(eventType.code);
    seen.add(eventType.code);
  }
  return [...duplicates];
}

export function validateCollectionProfile({
  profile,
  eventTypes,
}: {
  profile: DataCollectionProfile;
  eventTypes: EventTypeDefinition[];
}) {
  const known = new Set(eventTypes.filter((event) => event.sportId === profile.sportId).map((event) => event.code));
  const referenced = [
    ...profile.requiredEventTypes,
    ...profile.optionalEventTypes,
    ...profile.unsupportedEventTypes,
  ];
  return referenced
    .filter((code) => !known.has(code))
    .map((code) => `${profile.id} references unsupported event ${code}.`);
}

export function validateOfficialEvent({
  event,
  collectionProfile,
}: {
  event: OfficialSportEvent;
  collectionProfile: DataCollectionProfile;
}) {
  const allowed = new Set([
    ...collectionProfile.requiredEventTypes,
    ...collectionProfile.optionalEventTypes,
  ]);
  const issues: string[] = [];

  if (collectionProfile.unsupportedEventTypes.includes(event.eventType)) {
    issues.push(`${event.eventType} is explicitly unsupported by ${collectionProfile.id}.`);
  }
  if (!allowed.has(event.eventType)) {
    issues.push(`${event.eventType} is not allowed by ${collectionProfile.id}.`);
  }
  if (event.sportId !== collectionProfile.sportId) {
    issues.push(`Event sport ${event.sportId} does not match profile sport ${collectionProfile.sportId}.`);
  }
  if (event.officialResultVersion < 1 || event.officialEventVersion < 1) {
    issues.push('Official events require positive official result and event versions.');
  }

  return {
    status: issues.length ? 'blocked' as const : 'valid' as const,
    issues,
  };
}

export function classifyMatchDataCoverage({
  sportId,
  hasOfficialScore,
  events,
  requiredEventTypes,
  rosterCoveragePercent,
  scoreReconciled,
  statisticLevel,
}: {
  sportId: SportSlug;
  hasOfficialScore: boolean;
  events: Pick<OfficialSportEvent, 'eventType'>[];
  requiredEventTypes: string[];
  rosterCoveragePercent: number;
  scoreReconciled: boolean;
  statisticLevel: 'result' | 'basic' | 'standard' | 'advanced';
}) {
  const eventTypes = new Set(events.map((event) => event.eventType));
  const missing = requiredEventTypes.filter((type) => !eventTypes.has(type));
  const qualityIssues: string[] = [];
  if (!hasOfficialScore) qualityIssues.push('Official score is missing.');
  if (missing.length) qualityIssues.push(`Missing required ${sportId} event types: ${missing.join(', ')}.`);
  if (rosterCoveragePercent < 80) qualityIssues.push('Roster coverage is below 80%.');
  if (events.length && !scoreReconciled) qualityIssues.push('Event score does not reconcile with the official result.');

  const eventCoverage = !events.length
    ? 'none'
    : scoreReconciled
      ? 'score_reconcilable'
      : missing.length
        ? 'partial'
        : 'complete';
  const qualityScore = Math.max(0, 100 - qualityIssues.length * 20);

  return {
    resultCoverage: hasOfficialScore ? 'complete' as const : 'incomplete' as const,
    rosterCoverage: rosterCoveragePercent >= 95 ? 'complete' as const : rosterCoveragePercent > 0 ? 'partial' as const : 'none' as const,
    eventCoverage,
    statisticCoverageLevel: statisticLevel,
    fantasyEligible: hasOfficialScore && scoreReconciled && !qualityIssues.length && statisticLevel !== 'result',
    qualityScore,
    qualityIssues,
  };
}

export function validateStatisticDefinitions({
  definitions,
  eventTypes,
}: {
  definitions: StatisticDefinition[];
  eventTypes: EventTypeDefinition[];
}) {
  const known = new Set(eventTypes.map((eventType) => eventType.code));
  return definitions.flatMap((definition) =>
    definition.sourceEventTypes
      .filter((eventType) => !known.has(eventType))
      .map((eventType) => `${definition.code} references unknown source event ${eventType}.`),
  );
}
