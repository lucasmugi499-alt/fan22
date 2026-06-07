import { Match } from "@/types";

export const matches: Match[] = [
  {
    "id": "match_001",
    "sport": "football",
    "leagueId": "league_001",
    "homeTeamId": "team_001",
    "awayTeamId": "team_002",
    "venue": "Old Kampala Grounds",
    "city": "Kampala",
    "scheduledAt": "2026-05-30T03:03:00.243Z",
    "status": "verified",
    "score": {
      "home": 1,
      "away": 2
    },
    "verificationStatus": "pending",
    "supportersCount": 42,
    "totalSupport": 114621,
    "events": [
      {
        "minute": 18,
        "type": "goal",
        "teamId": "team_001",
        "description": "Early finish after a through ball"
      },
      {
        "minute": 55,
        "type": "save",
        "teamId": "team_002",
        "description": "Keeper pushed a close-range shot wide"
      }
    ],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_002",
    "sport": "football",
    "leagueId": "league_001",
    "homeTeamId": "team_002",
    "awayTeamId": "team_003",
    "venue": "Makerere Sports Complex",
    "city": "Kampala",
    "scheduledAt": "2026-05-30T03:03:00.243Z",
    "status": "verified",
    "score": {
      "home": 2,
      "away": 3
    },
    "verificationStatus": "verified",
    "supportersCount": 37,
    "totalSupport": 141376,
    "events": [
      {
        "minute": 18,
        "type": "goal",
        "teamId": "team_002",
        "description": "Early finish after a through ball"
      },
      {
        "minute": 55,
        "type": "save",
        "teamId": "team_003",
        "description": "Keeper pushed a close-range shot wide"
      }
    ],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_003",
    "sport": "football",
    "leagueId": "league_001",
    "homeTeamId": "team_003",
    "awayTeamId": "team_004",
    "venue": "Wakiso Sports Field",
    "city": "Wakiso",
    "scheduledAt": "2026-06-13T03:03:00.243Z",
    "status": "scheduled",
    "score": {
      "home": null,
      "away": null
    },
    "verificationStatus": "pending",
    "supportersCount": 24,
    "totalSupport": 102925,
    "events": [],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_004",
    "sport": "football",
    "leagueId": "league_001",
    "homeTeamId": "team_004",
    "awayTeamId": "team_001",
    "venue": "Jinja Main Ground",
    "city": "Jinja",
    "scheduledAt": "2026-05-27T03:03:00.243Z",
    "status": "verified",
    "score": {
      "home": 4,
      "away": 0
    },
    "verificationStatus": "verified",
    "supportersCount": 22,
    "totalSupport": 48270,
    "events": [
      {
        "minute": 18,
        "type": "goal",
        "teamId": "team_004",
        "description": "Early finish after a through ball"
      },
      {
        "minute": 55,
        "type": "save",
        "teamId": "team_001",
        "description": "Keeper pushed a close-range shot wide"
      }
    ],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_005",
    "sport": "football",
    "leagueId": "league_002",
    "homeTeamId": "team_005",
    "awayTeamId": "team_006",
    "venue": "Mbarara Community Court",
    "city": "Mbarara",
    "scheduledAt": "2026-06-13T03:03:00.243Z",
    "status": "scheduled",
    "score": {
      "home": null,
      "away": null
    },
    "verificationStatus": "pending",
    "supportersCount": 39,
    "totalSupport": 129355,
    "events": [],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_006",
    "sport": "football",
    "leagueId": "league_002",
    "homeTeamId": "team_006",
    "awayTeamId": "team_007",
    "venue": "Gulu City Sports Ground",
    "city": "Gulu",
    "scheduledAt": "2026-06-16T03:03:00.243Z",
    "status": "scheduled",
    "score": {
      "home": null,
      "away": null
    },
    "verificationStatus": "pending",
    "supportersCount": 26,
    "totalSupport": 27544,
    "events": [],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_007",
    "sport": "football",
    "leagueId": "league_002",
    "homeTeamId": "team_007",
    "awayTeamId": "team_008",
    "venue": "Entebbe Works Ground",
    "city": "Entebbe",
    "scheduledAt": "2026-05-28T03:03:00.243Z",
    "status": "verified",
    "score": {
      "home": 2,
      "away": 3
    },
    "verificationStatus": "verified",
    "supportersCount": 38,
    "totalSupport": 187048,
    "events": [
      {
        "minute": 18,
        "type": "goal",
        "teamId": "team_007",
        "description": "Early finish after a through ball"
      },
      {
        "minute": 55,
        "type": "save",
        "teamId": "team_008",
        "description": "Keeper pushed a close-range shot wide"
      }
    ],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_008",
    "sport": "football",
    "leagueId": "league_002",
    "homeTeamId": "team_008",
    "awayTeamId": "team_005",
    "venue": "Masaka Recreation Ground",
    "city": "Masaka",
    "scheduledAt": "2026-06-13T03:03:00.243Z",
    "status": "scheduled",
    "score": {
      "home": null,
      "away": null
    },
    "verificationStatus": "pending",
    "supportersCount": 21,
    "totalSupport": 20346,
    "events": [],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_009",
    "sport": "football",
    "leagueId": "league_003",
    "homeTeamId": "team_009",
    "awayTeamId": "team_010",
    "venue": "KCCA Stadium",
    "city": "Kampala",
    "scheduledAt": "2026-06-04T03:03:00.243Z",
    "status": "verified",
    "score": {
      "home": 4,
      "away": 0
    },
    "verificationStatus": "pending",
    "supportersCount": 26,
    "totalSupport": 190972,
    "events": [
      {
        "minute": 18,
        "type": "goal",
        "teamId": "team_009",
        "description": "Early finish after a through ball"
      },
      {
        "minute": 55,
        "type": "save",
        "teamId": "team_010",
        "description": "Keeper pushed a close-range shot wide"
      }
    ],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_010",
    "sport": "football",
    "leagueId": "league_003",
    "homeTeamId": "team_010",
    "awayTeamId": "team_011",
    "venue": "YMCA Court Kampala",
    "city": "Kampala",
    "scheduledAt": "2026-06-12T03:03:00.243Z",
    "status": "scheduled",
    "score": {
      "home": null,
      "away": null
    },
    "verificationStatus": "pending",
    "supportersCount": 5,
    "totalSupport": 190192,
    "events": [],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_011",
    "sport": "football",
    "leagueId": "league_003",
    "homeTeamId": "team_011",
    "awayTeamId": "team_012",
    "venue": "Lugogo Indoor Arena",
    "city": "Kampala",
    "scheduledAt": "2026-06-08T03:03:00.243Z",
    "status": "scheduled",
    "score": {
      "home": null,
      "away": null
    },
    "verificationStatus": "pending",
    "supportersCount": 42,
    "totalSupport": 116540,
    "events": [],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_012",
    "sport": "football",
    "leagueId": "league_003",
    "homeTeamId": "team_012",
    "awayTeamId": "team_009",
    "venue": "Kyadondo Rugby Grounds",
    "city": "Kampala",
    "scheduledAt": "2026-06-08T03:03:00.243Z",
    "status": "scheduled",
    "score": {
      "home": null,
      "away": null
    },
    "verificationStatus": "pending",
    "supportersCount": 34,
    "totalSupport": 64773,
    "events": [],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_013",
    "sport": "football",
    "leagueId": "league_004",
    "homeTeamId": "team_013",
    "awayTeamId": "team_014",
    "venue": "Old Kampala Grounds",
    "city": "Kampala",
    "scheduledAt": "2026-06-14T03:03:00.243Z",
    "status": "scheduled",
    "score": {
      "home": null,
      "away": null
    },
    "verificationStatus": "pending",
    "supportersCount": 43,
    "totalSupport": 71026,
    "events": [],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_014",
    "sport": "football",
    "leagueId": "league_004",
    "homeTeamId": "team_014",
    "awayTeamId": "team_015",
    "venue": "Makerere Sports Complex",
    "city": "Kampala",
    "scheduledAt": "2026-05-27T03:03:00.243Z",
    "status": "verified",
    "score": {
      "home": 4,
      "away": 0
    },
    "verificationStatus": "verified",
    "supportersCount": 39,
    "totalSupport": 27549,
    "events": [
      {
        "minute": 18,
        "type": "goal",
        "teamId": "team_014",
        "description": "Early finish after a through ball"
      },
      {
        "minute": 55,
        "type": "save",
        "teamId": "team_015",
        "description": "Keeper pushed a close-range shot wide"
      }
    ],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_015",
    "sport": "football",
    "leagueId": "league_004",
    "homeTeamId": "team_015",
    "awayTeamId": "team_016",
    "venue": "Wakiso Sports Field",
    "city": "Wakiso",
    "scheduledAt": "2026-06-01T03:03:00.243Z",
    "status": "verified",
    "score": {
      "home": 0,
      "away": 1
    },
    "verificationStatus": "verified",
    "supportersCount": 50,
    "totalSupport": 169640,
    "events": [
      {
        "minute": 18,
        "type": "goal",
        "teamId": "team_015",
        "description": "Early finish after a through ball"
      },
      {
        "minute": 55,
        "type": "save",
        "teamId": "team_016",
        "description": "Keeper pushed a close-range shot wide"
      }
    ],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_016",
    "sport": "football",
    "leagueId": "league_004",
    "homeTeamId": "team_016",
    "awayTeamId": "team_013",
    "venue": "Jinja Main Ground",
    "city": "Jinja",
    "scheduledAt": "2026-06-07T03:03:00.243Z",
    "status": "scheduled",
    "score": {
      "home": null,
      "away": null
    },
    "verificationStatus": "pending",
    "supportersCount": 46,
    "totalSupport": 116274,
    "events": [],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_017",
    "sport": "basketball",
    "leagueId": "league_005",
    "homeTeamId": "team_017",
    "awayTeamId": "team_018",
    "venue": "Wakiso Sports Field",
    "city": "Wakiso",
    "scheduledAt": "2026-05-28T03:03:00.243Z",
    "status": "verified",
    "score": {
      "home": 93,
      "away": 58
    },
    "verificationStatus": "pending",
    "supportersCount": 49,
    "totalSupport": 72458,
    "events": [
      {
        "period": "Q2",
        "type": "three_pointer",
        "teamId": "team_017",
        "description": "Corner three opened the fourth quarter"
      },
      {
        "period": "Q3",
        "type": "steal",
        "teamId": "team_018",
        "description": "Fast-break steal shifted momentum"
      }
    ],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_018",
    "sport": "basketball",
    "leagueId": "league_005",
    "homeTeamId": "team_018",
    "awayTeamId": "team_019",
    "venue": "Jinja Main Ground",
    "city": "Jinja",
    "scheduledAt": "2026-05-30T03:03:00.243Z",
    "status": "verified",
    "score": {
      "home": 58,
      "away": 65
    },
    "verificationStatus": "verified",
    "supportersCount": 28,
    "totalSupport": 135857,
    "events": [
      {
        "period": "Q2",
        "type": "three_pointer",
        "teamId": "team_018",
        "description": "Corner three opened the fourth quarter"
      },
      {
        "period": "Q3",
        "type": "steal",
        "teamId": "team_019",
        "description": "Fast-break steal shifted momentum"
      }
    ],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_019",
    "sport": "basketball",
    "leagueId": "league_005",
    "homeTeamId": "team_019",
    "awayTeamId": "team_020",
    "venue": "Mbarara Community Court",
    "city": "Mbarara",
    "scheduledAt": "2026-06-07T03:03:00.243Z",
    "status": "scheduled",
    "score": {
      "home": null,
      "away": null
    },
    "verificationStatus": "pending",
    "supportersCount": 29,
    "totalSupport": 65731,
    "events": [],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_020",
    "sport": "basketball",
    "leagueId": "league_005",
    "homeTeamId": "team_020",
    "awayTeamId": "team_017",
    "venue": "Gulu City Sports Ground",
    "city": "Gulu",
    "scheduledAt": "2026-06-04T03:03:00.243Z",
    "status": "verified",
    "score": {
      "home": 72,
      "away": 79
    },
    "verificationStatus": "verified",
    "supportersCount": 16,
    "totalSupport": 116489,
    "events": [
      {
        "period": "Q2",
        "type": "three_pointer",
        "teamId": "team_020",
        "description": "Corner three opened the fourth quarter"
      },
      {
        "period": "Q3",
        "type": "steal",
        "teamId": "team_017",
        "description": "Fast-break steal shifted momentum"
      }
    ],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_021",
    "sport": "basketball",
    "leagueId": "league_006",
    "homeTeamId": "team_021",
    "awayTeamId": "team_022",
    "venue": "Entebbe Works Ground",
    "city": "Entebbe",
    "scheduledAt": "2026-06-08T03:03:00.243Z",
    "status": "scheduled",
    "score": {
      "home": null,
      "away": null
    },
    "verificationStatus": "pending",
    "supportersCount": 43,
    "totalSupport": 13521,
    "events": [],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_022",
    "sport": "basketball",
    "leagueId": "league_006",
    "homeTeamId": "team_022",
    "awayTeamId": "team_023",
    "venue": "Masaka Recreation Ground",
    "city": "Masaka",
    "scheduledAt": "2026-05-29T03:03:00.243Z",
    "status": "verified",
    "score": {
      "home": 86,
      "away": 93
    },
    "verificationStatus": "verified",
    "supportersCount": 40,
    "totalSupport": 87692,
    "events": [
      {
        "period": "Q2",
        "type": "three_pointer",
        "teamId": "team_022",
        "description": "Corner three opened the fourth quarter"
      },
      {
        "period": "Q3",
        "type": "steal",
        "teamId": "team_023",
        "description": "Fast-break steal shifted momentum"
      }
    ],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_023",
    "sport": "basketball",
    "leagueId": "league_006",
    "homeTeamId": "team_023",
    "awayTeamId": "team_024",
    "venue": "KCCA Stadium",
    "city": "Kampala",
    "scheduledAt": "2026-06-14T03:03:00.243Z",
    "status": "scheduled",
    "score": {
      "home": null,
      "away": null
    },
    "verificationStatus": "pending",
    "supportersCount": 9,
    "totalSupport": 79799,
    "events": [],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_024",
    "sport": "basketball",
    "leagueId": "league_006",
    "homeTeamId": "team_024",
    "awayTeamId": "team_021",
    "venue": "YMCA Court Kampala",
    "city": "Kampala",
    "scheduledAt": "2026-06-04T03:03:00.243Z",
    "status": "verified",
    "score": {
      "home": 58,
      "away": 65
    },
    "verificationStatus": "verified",
    "supportersCount": 17,
    "totalSupport": 38067,
    "events": [
      {
        "period": "Q2",
        "type": "three_pointer",
        "teamId": "team_024",
        "description": "Corner three opened the fourth quarter"
      },
      {
        "period": "Q3",
        "type": "steal",
        "teamId": "team_021",
        "description": "Fast-break steal shifted momentum"
      }
    ],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_025",
    "sport": "basketball",
    "leagueId": "league_007",
    "homeTeamId": "team_025",
    "awayTeamId": "team_026",
    "venue": "Lugogo Indoor Arena",
    "city": "Kampala",
    "scheduledAt": "2026-06-05T03:03:00.243Z",
    "status": "verified",
    "score": {
      "home": 65,
      "away": 72
    },
    "verificationStatus": "pending",
    "supportersCount": 20,
    "totalSupport": 97452,
    "events": [
      {
        "period": "Q2",
        "type": "three_pointer",
        "teamId": "team_025",
        "description": "Corner three opened the fourth quarter"
      },
      {
        "period": "Q3",
        "type": "steal",
        "teamId": "team_026",
        "description": "Fast-break steal shifted momentum"
      }
    ],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_026",
    "sport": "basketball",
    "leagueId": "league_007",
    "homeTeamId": "team_026",
    "awayTeamId": "team_027",
    "venue": "Kyadondo Rugby Grounds",
    "city": "Kampala",
    "scheduledAt": "2026-06-12T03:03:00.243Z",
    "status": "scheduled",
    "score": {
      "home": null,
      "away": null
    },
    "verificationStatus": "pending",
    "supportersCount": 32,
    "totalSupport": 76451,
    "events": [],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_027",
    "sport": "basketball",
    "leagueId": "league_007",
    "homeTeamId": "team_027",
    "awayTeamId": "team_028",
    "venue": "Old Kampala Grounds",
    "city": "Kampala",
    "scheduledAt": "2026-05-28T03:03:00.243Z",
    "status": "verified",
    "score": {
      "home": 79,
      "away": 86
    },
    "verificationStatus": "verified",
    "supportersCount": 18,
    "totalSupport": 78919,
    "events": [
      {
        "period": "Q2",
        "type": "three_pointer",
        "teamId": "team_027",
        "description": "Corner three opened the fourth quarter"
      },
      {
        "period": "Q3",
        "type": "steal",
        "teamId": "team_028",
        "description": "Fast-break steal shifted momentum"
      }
    ],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_028",
    "sport": "basketball",
    "leagueId": "league_007",
    "homeTeamId": "team_028",
    "awayTeamId": "team_025",
    "venue": "Makerere Sports Complex",
    "city": "Kampala",
    "scheduledAt": "2026-06-11T03:03:00.243Z",
    "status": "scheduled",
    "score": {
      "home": null,
      "away": null
    },
    "verificationStatus": "pending",
    "supportersCount": 5,
    "totalSupport": 69001,
    "events": [],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_029",
    "sport": "rugby",
    "leagueId": "league_008",
    "homeTeamId": "team_029",
    "awayTeamId": "team_030",
    "venue": "Jinja Main Ground",
    "city": "Jinja",
    "scheduledAt": "2026-05-27T03:03:00.243Z",
    "status": "verified",
    "score": {
      "home": 8,
      "away": 13
    },
    "verificationStatus": "pending",
    "supportersCount": 28,
    "totalSupport": 190826,
    "events": [
      {
        "minute": 18,
        "type": "try",
        "teamId": "team_029",
        "description": "Breakaway try from the left channel"
      },
      {
        "minute": 55,
        "type": "turnover",
        "teamId": "team_030",
        "description": "Counter-ruck forced a turnover"
      }
    ],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_030",
    "sport": "rugby",
    "leagueId": "league_008",
    "homeTeamId": "team_030",
    "awayTeamId": "team_031",
    "venue": "Mbarara Community Court",
    "city": "Mbarara",
    "scheduledAt": "2026-06-04T03:03:00.243Z",
    "status": "verified",
    "score": {
      "home": 13,
      "away": 18
    },
    "verificationStatus": "verified",
    "supportersCount": 43,
    "totalSupport": 86458,
    "events": [
      {
        "minute": 18,
        "type": "try",
        "teamId": "team_030",
        "description": "Breakaway try from the left channel"
      },
      {
        "minute": 55,
        "type": "turnover",
        "teamId": "team_031",
        "description": "Counter-ruck forced a turnover"
      }
    ],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_031",
    "sport": "rugby",
    "leagueId": "league_008",
    "homeTeamId": "team_031",
    "awayTeamId": "team_032",
    "venue": "Gulu City Sports Ground",
    "city": "Gulu",
    "scheduledAt": "2026-06-07T03:03:00.243Z",
    "status": "scheduled",
    "score": {
      "home": null,
      "away": null
    },
    "verificationStatus": "pending",
    "supportersCount": 7,
    "totalSupport": 181705,
    "events": [],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_032",
    "sport": "rugby",
    "leagueId": "league_008",
    "homeTeamId": "team_032",
    "awayTeamId": "team_029",
    "venue": "Entebbe Works Ground",
    "city": "Entebbe",
    "scheduledAt": "2026-06-08T03:03:00.243Z",
    "status": "scheduled",
    "score": {
      "home": null,
      "away": null
    },
    "verificationStatus": "pending",
    "supportersCount": 44,
    "totalSupport": 148159,
    "events": [],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_033",
    "sport": "rugby",
    "leagueId": "league_009",
    "homeTeamId": "team_033",
    "awayTeamId": "team_034",
    "venue": "Masaka Recreation Ground",
    "city": "Masaka",
    "scheduledAt": "2026-05-28T03:03:00.243Z",
    "status": "verified",
    "score": {
      "home": 28,
      "away": 33
    },
    "verificationStatus": "pending",
    "supportersCount": 46,
    "totalSupport": 138933,
    "events": [
      {
        "minute": 18,
        "type": "try",
        "teamId": "team_033",
        "description": "Breakaway try from the left channel"
      },
      {
        "minute": 55,
        "type": "turnover",
        "teamId": "team_034",
        "description": "Counter-ruck forced a turnover"
      }
    ],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_034",
    "sport": "rugby",
    "leagueId": "league_009",
    "homeTeamId": "team_034",
    "awayTeamId": "team_035",
    "venue": "KCCA Stadium",
    "city": "Kampala",
    "scheduledAt": "2026-05-27T03:03:00.243Z",
    "status": "verified",
    "score": {
      "home": 33,
      "away": 38
    },
    "verificationStatus": "verified",
    "supportersCount": 22,
    "totalSupport": 59677,
    "events": [
      {
        "minute": 18,
        "type": "try",
        "teamId": "team_034",
        "description": "Breakaway try from the left channel"
      },
      {
        "minute": 55,
        "type": "turnover",
        "teamId": "team_035",
        "description": "Counter-ruck forced a turnover"
      }
    ],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_035",
    "sport": "rugby",
    "leagueId": "league_009",
    "homeTeamId": "team_035",
    "awayTeamId": "team_036",
    "venue": "YMCA Court Kampala",
    "city": "Kampala",
    "scheduledAt": "2026-06-07T03:03:00.243Z",
    "status": "scheduled",
    "score": {
      "home": null,
      "away": null
    },
    "verificationStatus": "pending",
    "supportersCount": 10,
    "totalSupport": 17427,
    "events": [],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_036",
    "sport": "rugby",
    "leagueId": "league_009",
    "homeTeamId": "team_036",
    "awayTeamId": "team_033",
    "venue": "Lugogo Indoor Arena",
    "city": "Kampala",
    "scheduledAt": "2026-06-13T03:03:00.243Z",
    "status": "scheduled",
    "score": {
      "home": null,
      "away": null
    },
    "verificationStatus": "pending",
    "supportersCount": 19,
    "totalSupport": 171602,
    "events": [],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_037",
    "sport": "rugby",
    "leagueId": "league_010",
    "homeTeamId": "team_037",
    "awayTeamId": "team_038",
    "venue": "Kyadondo Rugby Grounds",
    "city": "Kampala",
    "scheduledAt": "2026-05-30T03:03:00.243Z",
    "status": "verified",
    "score": {
      "home": 12,
      "away": 17
    },
    "verificationStatus": "pending",
    "supportersCount": 48,
    "totalSupport": 133861,
    "events": [
      {
        "minute": 18,
        "type": "try",
        "teamId": "team_037",
        "description": "Breakaway try from the left channel"
      },
      {
        "minute": 55,
        "type": "turnover",
        "teamId": "team_038",
        "description": "Counter-ruck forced a turnover"
      }
    ],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_038",
    "sport": "rugby",
    "leagueId": "league_010",
    "homeTeamId": "team_038",
    "awayTeamId": "team_039",
    "venue": "Old Kampala Grounds",
    "city": "Kampala",
    "scheduledAt": "2026-06-09T03:03:00.243Z",
    "status": "scheduled",
    "score": {
      "home": null,
      "away": null
    },
    "verificationStatus": "pending",
    "supportersCount": 37,
    "totalSupport": 176889,
    "events": [],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_039",
    "sport": "rugby",
    "leagueId": "league_010",
    "homeTeamId": "team_039",
    "awayTeamId": "team_040",
    "venue": "Makerere Sports Complex",
    "city": "Kampala",
    "scheduledAt": "2026-06-02T03:03:00.243Z",
    "status": "verified",
    "score": {
      "home": 22,
      "away": 27
    },
    "verificationStatus": "verified",
    "supportersCount": 30,
    "totalSupport": 36690,
    "events": [
      {
        "minute": 18,
        "type": "try",
        "teamId": "team_039",
        "description": "Breakaway try from the left channel"
      },
      {
        "minute": 55,
        "type": "turnover",
        "teamId": "team_040",
        "description": "Counter-ruck forced a turnover"
      }
    ],
    "createdAt": "2026-06-06T03:03:00.243Z"
  },
  {
    "id": "match_040",
    "sport": "rugby",
    "leagueId": "league_010",
    "homeTeamId": "team_040",
    "awayTeamId": "team_037",
    "venue": "Wakiso Sports Field",
    "city": "Wakiso",
    "scheduledAt": "2026-06-05T03:03:00.243Z",
    "status": "verified",
    "score": {
      "home": 27,
      "away": 32
    },
    "verificationStatus": "verified",
    "supportersCount": 16,
    "totalSupport": 99106,
    "events": [
      {
        "minute": 18,
        "type": "try",
        "teamId": "team_040",
        "description": "Breakaway try from the left channel"
      },
      {
        "minute": 55,
        "type": "turnover",
        "teamId": "team_037",
        "description": "Counter-ruck forced a turnover"
      }
    ],
    "createdAt": "2026-06-06T03:03:00.243Z"
  }
];
