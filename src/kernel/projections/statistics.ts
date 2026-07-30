import type {
  AthleteMatchStatisticProjection,
  OfficialSportEvent,
  ProjectionMetadata,
  StatisticDefinition,
} from '@/kernel/types';

export function buildAthleteMatchStatistics({
  athleteId,
  matchId,
  competitionId,
  seasonId,
  definitions,
  events,
  metadata,
}: {
  athleteId: string;
  matchId: string;
  competitionId: string;
  seasonId: string;
  definitions: StatisticDefinition[];
  events: OfficialSportEvent[];
  metadata: ProjectionMetadata;
}): AthleteMatchStatisticProjection {
  const athleteEvents = events.filter((event) => event.primaryAthleteId === athleteId);
  const values: Record<string, number> = {};
  const sourceEventIds = new Set<string>();

  for (const definition of definitions.filter((item) => item.entityType === 'athlete')) {
    const matchingEvents = athleteEvents.filter((event) => definition.sourceEventTypes.includes(event.eventType));
    if (!matchingEvents.length) {
      values[definition.code] = 0;
      continue;
    }
    matchingEvents.forEach((event) => sourceEventIds.add(event.id));

    if (definition.aggregation === 'count' || definition.aggregation === 'conditional_count') {
      values[definition.code] = matchingEvents.length;
    } else {
      values[definition.code] = matchingEvents.reduce((total, event) => {
        const value = typeof event.payload === 'object'
          && event.payload !== null
          && 'value' in event.payload
          && typeof event.payload.value === 'number'
          ? event.payload.value
          : 0;
        return total + value;
      }, 0);
    }
  }

  return {
    athleteId,
    matchId,
    competitionId,
    seasonId,
    values,
    sourceEventIds: [...sourceEventIds],
    ...metadata,
  };
}
