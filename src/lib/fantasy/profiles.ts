import type {
  FantasyScoringProfile,
  FantasySquadRules,
  FantasySport,
} from '@/types/fantasy';

const createdAt = '2026-07-29T00:00:00.000Z';

export const FANTASY_SCORING_PROFILES: FantasyScoringProfile[] = [
  {
    id: 'fantasy_scoring_football_v1',
    sport: 'football',
    variant: 'association_football',
    name: 'GoalPlace Football Fantasy Lite',
    version: 1,
    status: 'approved',
    captainMultiplier: 2,
    createdAt,
    publishedAt: createdAt,
    rules: [
      rule('active_squad', 'Active match squad', 1, 'basic', 'active_squad'),
      rule('appearance', 'Match appearance', 2, 'basic', 'appearance'),
      { ...rule('minimum_duration', 'Plays at least 60 minutes', 1, 'standard', 'minutes_played'), minimumMinutes: 60 },
      {
        ...rule('goal', 'Goal', 4, 'basic', 'goal'),
        positionPoints: { goalkeeper: 6, defender: 6, midfielder: 5, forward: 4 },
      },
      // One observer cannot capture an assist while also running the clock, so the field
      // palette does not record one. Scoring it would mean scoring a statistic that does not
      // exist for most athletes, which is the silent unfairness this profile exists to avoid.
      disabled(rule('assist', 'Official assist', 3, 'standard', 'assist')),
      {
        ...rule('clean_sheet', 'Clean sheet', 0, 'standard', 'clean_sheet'),
        /*
         * Midfielders raised from 1 to 2 to absorb the loss of assists.
         *
         * Without assists a midfielder loses their main route to points and the game tilts
         * toward forwards. The correction is to reward what is actually recorded rather than
         * to invent a proxy statistic: position-weighted goals already make a midfielder's
         * goal worth 5 against a forward's 4, and the clean sheet closes the rest of the gap.
         * A game that scores fewer things accurately beats one that scores more things badly.
         */
        positionPoints: { goalkeeper: 4, defender: 4, midfielder: 2, forward: 0 },
      },
      // Saves and penalty saves are not in the capture palette.
      disabled({ ...rule('saves', 'Every three saves', 1, 'advanced', 'saves'), per: 3 }),
      disabled(rule('penalty_save', 'Penalty save', 5, 'advanced', 'penalty_save')),
      { ...rule('goals_conceded', 'Every two goals conceded', -1, 'standard', 'goals_conceded'), per: 2 },
      rule('own_goal', 'Own goal', -2, 'standard', 'own_goal'),
      rule('player_of_match', 'Player of the Match', 3, 'standard', 'player_of_match'),
      rule('win_participation', 'Win participation', 1, 'basic', 'win_participation'),
      rule('yellow_card', 'Yellow card', -1, 'basic', 'yellow_card'),
      rule('red_card', 'Red card', -3, 'basic', 'red_card'),
    ],
  },
  {
    id: 'fantasy_scoring_basketball_v1',
    sport: 'basketball',
    variant: 'five_a_side',
    name: 'GoalPlace Basketball Fantasy Lite',
    version: 1,
    status: 'approved',
    captainMultiplier: 2,
    createdAt,
    publishedAt: createdAt,
    rules: [
      rule('active_squad', 'Active match squad', 1, 'basic', 'active_squad'),
      rule('appearance', 'Match appearance', 2, 'basic', 'appearance'),
      { ...rule('minimum_duration', 'Plays at least 20 minutes', 1, 'standard', 'minutes_played'), minimumMinutes: 20 },
      { ...rule('points_scored', 'Every five points', 1, 'basic', 'points_scored'), per: 5 },
      /*
       * Basketball's box score is the most demanding thing in the capture design: a scoring
       * event roughly every forty seconds, with rebounds and assists happening faster than
       * that. One observer with a phone cannot record them, so nine of the fifteen rules
       * below would score zero for most athletes and full value for whoever happened to have
       * a second scorer. Disabled rather than pretended.
       */
      disabled({ ...rule('rebound', 'Every three rebounds', 1, 'standard', 'rebound'), per: 3 }),
      disabled({ ...rule('assist', 'Every two assists', 1, 'standard', 'assist'), per: 2 }),
      disabled(rule('steal', 'Steal', 3, 'advanced', 'steal')),
      disabled(rule('block', 'Block', 3, 'advanced', 'block')),
      // Turnovers are on the palette, so this one stays.
      { ...rule('turnover', 'Every three turnovers', -1, 'advanced', 'turnover'), per: 3 },
      disabled(rule('double_double', 'Double-double', 4, 'advanced', 'double_double')),
      disabled(rule('triple_double', 'Triple-double', 8, 'advanced', 'triple_double')),
      rule('player_of_match', 'Player of the Match', 3, 'standard', 'player_of_match'),
      rule('win_participation', 'Win participation', 1, 'basic', 'win_participation'),
      rule('yellow_card', 'Technical foul', -2, 'standard', 'technical_foul'),
      // Ejections are not on the basketball palette; technical fouls are.
      disabled(rule('red_card', 'Ejection', -4, 'standard', 'ejection')),
    ],
  },
  {
    id: 'fantasy_scoring_rugby_v1',
    sport: 'rugby',
    variant: 'rugby_union',
    name: 'GoalPlace Rugby Fantasy Lite',
    version: 1,
    status: 'approved',
    captainMultiplier: 2,
    createdAt,
    publishedAt: createdAt,
    rules: [
      rule('active_squad', 'Active match squad', 1, 'basic', 'active_squad'),
      rule('appearance', 'Match appearance', 2, 'basic', 'appearance'),
      { ...rule('minimum_duration', 'Plays configured minimum duration', 1, 'standard', 'minutes_played'), minimumMinutes: 40 },
      rule('try', 'Try', 5, 'basic', 'try'),
      rule('conversion', 'Conversion', 2, 'standard', 'conversion'),
      rule('penalty_goal', 'Penalty goal', 3, 'standard', 'penalty_goal'),
      rule('drop_goal', 'Drop goal', 3, 'standard', 'drop_goal'),
      disabled(rule('assist', 'Official assist', 3, 'advanced', 'assist')),
      rule('player_of_match', 'Player of the Match', 3, 'standard', 'player_of_match'),
      rule('win_participation', 'Win participation', 1, 'basic', 'win_participation'),
      rule('yellow_card', 'Yellow card', -1, 'basic', 'yellow_card'),
      rule('red_card', 'Red card', -4, 'basic', 'red_card'),
    ],
  },
];

export const FANTASY_SQUAD_RULES: FantasySquadRules[] = [
  {
    id: 'fantasy_squad_football_v1',
    sport: 'football',
    variant: 'association_football',
    version: 1,
    squadSize: 15,
    startingSize: 11,
    benchSize: 4,
    budgetCredits: 100,
    maxFromRealTeam: 3,
    captainRequired: true,
    viceCaptainRequired: true,
    transferAllowancePerRound: 2,
    deadlineStrategy: 'first_round_kickoff',
    positionGroups: [
      group('goalkeeper', 'Goalkeepers', ['Goalkeeper'], 2, 2),
      group('defender', 'Defenders', ['Right Back', 'Centre Back', 'Left Back', 'Utility Defender'], 5, 5),
      group('midfielder', 'Midfielders', ['Defensive Midfielder', 'Central Midfielder', 'Attacking Midfielder', 'Right Wing', 'Left Wing', 'Utility Midfielder'], 5, 5),
      group('forward', 'Forwards', ['Striker', 'Forward'], 3, 3),
    ],
    createdAt,
  },
  {
    id: 'fantasy_squad_basketball_v1',
    sport: 'basketball',
    variant: 'five_a_side',
    version: 1,
    squadSize: 10,
    startingSize: 5,
    benchSize: 5,
    budgetCredits: 100,
    maxFromRealTeam: 2,
    captainRequired: true,
    viceCaptainRequired: true,
    transferAllowancePerRound: 2,
    deadlineStrategy: 'first_round_kickoff',
    positionGroups: [
      group('guard', 'Guards', ['Point Guard', 'Shooting Guard', 'Guard'], 3, 4),
      group('wing', 'Wings', ['Small Forward', 'Forward'], 2, 4),
      group('big', 'Bigs', ['Power Forward', 'Center'], 2, 4),
    ],
    createdAt,
  },
  {
    id: 'fantasy_squad_rugby_15s_v1',
    sport: 'rugby',
    variant: 'rugby_15s',
    version: 1,
    squadSize: 23,
    startingSize: 15,
    benchSize: 8,
    budgetCredits: 120,
    maxFromRealTeam: 4,
    captainRequired: true,
    viceCaptainRequired: true,
    transferAllowancePerRound: 3,
    deadlineStrategy: 'first_round_kickoff',
    positionGroups: [
      group('front_row', 'Front row', ['Loosehead Prop', 'Hooker', 'Tighthead Prop', 'Prop'], 4, 6),
      group('second_row', 'Second row', ['Lock'], 2, 4),
      group('back_row', 'Back row', ['Blindside Flanker', 'Openside Flanker', 'Number 8', 'Back Row', 'Utility Forward'], 4, 6),
      group('half_back', 'Half backs', ['Scrum-half', 'Fly-half'], 2, 4),
      group('back', 'Backs', ['Left Wing', 'Inside Centre', 'Outside Centre', 'Right Wing', 'Fullback', 'Utility Back'], 6, 9),
    ],
    createdAt,
  },
  {
    id: 'fantasy_squad_rugby_7s_v1',
    sport: 'rugby',
    variant: 'rugby_7s',
    version: 1,
    squadSize: 12,
    startingSize: 7,
    benchSize: 5,
    budgetCredits: 100,
    maxFromRealTeam: 3,
    captainRequired: true,
    viceCaptainRequired: true,
    transferAllowancePerRound: 2,
    deadlineStrategy: 'first_round_kickoff',
    positionGroups: [
      group('forward', 'Forwards', ['Prop', 'Hooker', 'Loosehead Prop', 'Tighthead Prop', 'Utility Forward'], 4, 6),
      group('back', 'Backs', ['Scrum-half', 'Fly-half', 'Left Wing', 'Inside Centre', 'Outside Centre', 'Right Wing', 'Fullback', 'Utility Back'], 6, 8),
    ],
    createdAt,
  },
];

/**
 * A rule that stays in the profile but does not score.
 *
 * Deleting it would lose the record that the platform considered this statistic and decided
 * it cannot be collected honestly. Keeping it disabled means the reason travels with the
 * profile, and re-enabling it later is a deliberate act rather than a rediscovery.
 */
function disabled(
  base: FantasyScoringProfile['rules'][number],
): FantasyScoringProfile['rules'][number] {
  return { ...base, enabled: false };
}

function rule(
  stat: FantasyScoringProfile['rules'][number]['stat'],
  label: string,
  points: number,
  requiredDataLevel: FantasyScoringProfile['rules'][number]['requiredDataLevel'],
  requiredStatKey: string,
): FantasyScoringProfile['rules'][number] {
  return {
    id: stat,
    label,
    stat,
    points,
    requiredDataLevel,
    requiredStatKey,
    enabled: true,
  };
}

function group(
  id: string,
  label: string,
  positions: string[],
  minimum: number,
  maximum: number,
): FantasySquadRules['positionGroups'][number] {
  return { id, label, positions, minimum, maximum };
}

export function scoringProfileFor(sport: FantasySport) {
  return FANTASY_SCORING_PROFILES.find((profile) => profile.sport === sport);
}

export function squadRulesFor(sport: FantasySport, variant?: string) {
  return FANTASY_SQUAD_RULES.find((rules) =>
    rules.sport === sport && (!variant || rules.variant === variant),
  );
}

export function positionGroupFor(rules: FantasySquadRules, position: string) {
  return rules.positionGroups.find((groupRule) => groupRule.positions.includes(position))?.id;
}
