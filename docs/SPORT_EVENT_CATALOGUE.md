# Sport Event Catalogue

GoalPlace256 does not use free-form `MatchEvent.type` strings as official records.

## Football Basic

`football.lineup_named`, `football.starter`, `football.substitution_on`, `football.substitution_off`, `football.goal`, `football.own_goal`, `football.assist`, `football.yellow_card`, `football.second_yellow_card`, `football.red_card`, `football.penalty_scored`, `football.penalty_missed`, `football.player_of_match`.

Football score is reconstructed from goals, own goals and scored penalties.

## Basketball Basic

`basketball.appearance`, `basketball.starter`, `basketball.minutes_played`, `basketball.points`, `basketball.offensive_rebounds`, `basketball.defensive_rebounds`, `basketball.assists`, `basketball.steals`, `basketball.blocks`, `basketball.turnovers`, `basketball.personal_fouls`, `basketball.technical_fouls`.

Basketball Basic uses verified box scores. Player points must reconcile to the official team score before the data can power fantasy.

## Basketball Standard

`basketball.free_throw_made`, `basketball.free_throw_missed`, `basketball.two_point_made`, `basketball.two_point_missed`, `basketball.three_point_made`, `basketball.three_point_missed`, `basketball.rebound`, `basketball.assist`, `basketball.steal`, `basketball.block`, `basketball.turnover`, `basketball.foul`, `basketball.substitution`, `basketball.timeout`.

## Rugby Basic

`rugby.lineup_named`, `rugby.starter`, `rugby.substitution_on`, `rugby.substitution_off`, `rugby.try`, `rugby.penalty_try`, `rugby.conversion_made`, `rugby.conversion_missed`, `rugby.penalty_goal_made`, `rugby.penalty_goal_missed`, `rugby.drop_goal_made`, `rugby.drop_goal_missed`, `rugby.yellow_card`, `rugby.red_card`, `rugby.player_of_match`.

Rugby score is reconstructed as: try 5, penalty try 7, conversion 2, penalty goal 3, drop goal 3.
