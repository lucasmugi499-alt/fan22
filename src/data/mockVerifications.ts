import { Verification } from "@/types";

export const verifications: Verification[] = [
  {
    "id": "verify_001",
    "type": "match_result",
    "relatedId": "match_001",
    "status": "pending",
    "submittedBy": "user_070",
    "notes": "Score sheet, venue note, and match media are ready for review.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "match result review 001",
    "evidenceStatus": "Clip uploaded",
    "amountAffected": 0,
    "actionHistory": [
      "Submission received",
      "Clip uploaded",
      "Reviewer follow-up pending"
    ]
  },
  {
    "id": "verify_002",
    "type": "challenge_result",
    "relatedId": "challenge_002",
    "status": "verified",
    "submittedBy": "user_083",
    "notes": "Challenge target evidence is attached with timestamped media.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "challenge result review 002",
    "evidenceStatus": "Score sheet attached",
    "amountAffected": 29200,
    "actionHistory": [
      "Submission received",
      "Score sheet attached",
      "Ready for admin decision"
    ],
    "reviewedBy": "Brian - League Ops",
    "reviewedAt": "2026-06-06T03:03:00.244Z"
  },
  {
    "id": "verify_003",
    "type": "athlete_profile",
    "relatedId": "ath_003",
    "status": "disputed",
    "submittedBy": "user_181",
    "notes": "Roster identity and athlete profile details need admin confirmation.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "athlete profile review 003",
    "evidenceStatus": "Referee note pending",
    "amountAffected": 0,
    "actionHistory": [
      "Submission received",
      "Referee note pending",
      "Ready for admin decision"
    ],
    "reviewedBy": "Grace - Support Desk",
    "reviewedAt": "2026-06-06T03:03:00.244Z"
  },
  {
    "id": "verify_004",
    "type": "team_profile",
    "relatedId": "team_004",
    "status": "rejected",
    "submittedBy": "user_192",
    "notes": "Team admin request includes roster proof and venue contact.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "team profile review 004",
    "evidenceStatus": "Captain confirmation uploaded",
    "amountAffected": 0,
    "actionHistory": [
      "Submission received",
      "Captain confirmation uploaded",
      "Reviewer follow-up pending"
    ]
  },
  {
    "id": "verify_005",
    "type": "league_status",
    "relatedId": "league_005",
    "status": "pending",
    "submittedBy": "user_109",
    "notes": "League onboarding status requires platform review notes.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "league status review 005",
    "evidenceStatus": "League admin review needed",
    "amountAffected": 0,
    "actionHistory": [
      "Submission received",
      "League admin review needed",
      "Ready for admin decision"
    ],
    "reviewedBy": "Irene - Content Desk",
    "reviewedAt": "2026-06-06T03:03:00.244Z"
  },
  {
    "id": "verify_006",
    "type": "payout_review",
    "relatedId": "pledge_006",
    "status": "verified",
    "submittedBy": "user_039",
    "notes": "Support release is waiting for verified challenge evidence.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "payout review review 006",
    "evidenceStatus": "Media timestamp verified",
    "amountAffected": 46000,
    "actionHistory": [
      "Submission received",
      "Media timestamp verified",
      "Ready for admin decision"
    ],
    "reviewedBy": "Amina - Trust Desk",
    "reviewedAt": "2026-06-06T03:03:00.244Z"
  },
  {
    "id": "verify_007",
    "type": "match_result",
    "relatedId": "match_007",
    "status": "disputed",
    "submittedBy": "user_045",
    "notes": "Score sheet, venue note, and match media are ready for review.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "match result review 007",
    "evidenceStatus": "Clip uploaded",
    "amountAffected": 0,
    "actionHistory": [
      "Submission received",
      "Clip uploaded",
      "Reviewer follow-up pending"
    ]
  },
  {
    "id": "verify_008",
    "type": "challenge_result",
    "relatedId": "challenge_008",
    "status": "rejected",
    "submittedBy": "user_050",
    "notes": "Challenge target evidence is attached with timestamped media.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "challenge result review 008",
    "evidenceStatus": "Score sheet attached",
    "amountAffected": 54400,
    "actionHistory": [
      "Submission received",
      "Score sheet attached",
      "Ready for admin decision"
    ],
    "reviewedBy": "Grace - Support Desk",
    "reviewedAt": "2026-06-06T03:03:00.244Z"
  },
  {
    "id": "verify_009",
    "type": "athlete_profile",
    "relatedId": "ath_009",
    "status": "pending",
    "submittedBy": "user_176",
    "notes": "Roster identity and athlete profile details need admin confirmation.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "athlete profile review 009",
    "evidenceStatus": "Referee note pending",
    "amountAffected": 0,
    "actionHistory": [
      "Submission received",
      "Referee note pending",
      "Ready for admin decision"
    ],
    "reviewedBy": "Daniel - Platform Review",
    "reviewedAt": "2026-06-06T03:03:00.244Z"
  },
  {
    "id": "verify_010",
    "type": "team_profile",
    "relatedId": "team_010",
    "status": "verified",
    "submittedBy": "user_170",
    "notes": "Team admin request includes roster proof and venue contact.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "team profile review 010",
    "evidenceStatus": "Captain confirmation uploaded",
    "amountAffected": 0,
    "actionHistory": [
      "Submission received",
      "Captain confirmation uploaded",
      "Reviewer follow-up pending"
    ]
  },
  {
    "id": "verify_011",
    "type": "league_status",
    "relatedId": "league_011",
    "status": "disputed",
    "submittedBy": "user_021",
    "notes": "League onboarding status requires platform review notes.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "league status review 011",
    "evidenceStatus": "League admin review needed",
    "amountAffected": 0,
    "actionHistory": [
      "Submission received",
      "League admin review needed",
      "Ready for admin decision"
    ],
    "reviewedBy": "Amina - Trust Desk",
    "reviewedAt": "2026-06-06T03:03:00.244Z"
  },
  {
    "id": "verify_012",
    "type": "payout_review",
    "relatedId": "pledge_012",
    "status": "rejected",
    "submittedBy": "user_120",
    "notes": "Support release is waiting for verified challenge evidence.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "payout review review 012",
    "evidenceStatus": "Media timestamp verified",
    "amountAffected": 71200,
    "actionHistory": [
      "Submission received",
      "Media timestamp verified",
      "Ready for admin decision"
    ],
    "reviewedBy": "Brian - League Ops",
    "reviewedAt": "2026-06-06T03:03:00.244Z"
  },
  {
    "id": "verify_013",
    "type": "match_result",
    "relatedId": "match_013",
    "status": "pending",
    "submittedBy": "user_024",
    "notes": "Score sheet, venue note, and match media are ready for review.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "match result review 013",
    "evidenceStatus": "Clip uploaded",
    "amountAffected": 0,
    "actionHistory": [
      "Submission received",
      "Clip uploaded",
      "Reviewer follow-up pending"
    ]
  },
  {
    "id": "verify_014",
    "type": "challenge_result",
    "relatedId": "challenge_014",
    "status": "verified",
    "submittedBy": "user_181",
    "notes": "Challenge target evidence is attached with timestamped media.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "challenge result review 014",
    "evidenceStatus": "Score sheet attached",
    "amountAffected": 79600,
    "actionHistory": [
      "Submission received",
      "Score sheet attached",
      "Ready for admin decision"
    ],
    "reviewedBy": "Daniel - Platform Review",
    "reviewedAt": "2026-06-06T03:03:00.244Z"
  },
  {
    "id": "verify_015",
    "type": "athlete_profile",
    "relatedId": "ath_015",
    "status": "disputed",
    "submittedBy": "user_015",
    "notes": "Roster identity and athlete profile details need admin confirmation.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "athlete profile review 015",
    "evidenceStatus": "Referee note pending",
    "amountAffected": 0,
    "actionHistory": [
      "Submission received",
      "Referee note pending",
      "Ready for admin decision"
    ],
    "reviewedBy": "Irene - Content Desk",
    "reviewedAt": "2026-06-06T03:03:00.244Z"
  },
  {
    "id": "verify_016",
    "type": "team_profile",
    "relatedId": "team_016",
    "status": "rejected",
    "submittedBy": "user_191",
    "notes": "Team admin request includes roster proof and venue contact.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "team profile review 016",
    "evidenceStatus": "Captain confirmation uploaded",
    "amountAffected": 0,
    "actionHistory": [
      "Submission received",
      "Captain confirmation uploaded",
      "Reviewer follow-up pending"
    ]
  },
  {
    "id": "verify_017",
    "type": "league_status",
    "relatedId": "league_017",
    "status": "pending",
    "submittedBy": "user_107",
    "notes": "League onboarding status requires platform review notes.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "league status review 017",
    "evidenceStatus": "League admin review needed",
    "amountAffected": 0,
    "actionHistory": [
      "Submission received",
      "League admin review needed",
      "Ready for admin decision"
    ],
    "reviewedBy": "Brian - League Ops",
    "reviewedAt": "2026-06-06T03:03:00.244Z"
  },
  {
    "id": "verify_018",
    "type": "payout_review",
    "relatedId": "pledge_018",
    "status": "verified",
    "submittedBy": "user_028",
    "notes": "Support release is waiting for verified challenge evidence.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "payout review review 018",
    "evidenceStatus": "Media timestamp verified",
    "amountAffected": 96400,
    "actionHistory": [
      "Submission received",
      "Media timestamp verified",
      "Ready for admin decision"
    ],
    "reviewedBy": "Grace - Support Desk",
    "reviewedAt": "2026-06-06T03:03:00.244Z"
  },
  {
    "id": "verify_019",
    "type": "match_result",
    "relatedId": "match_019",
    "status": "disputed",
    "submittedBy": "user_005",
    "notes": "Score sheet, venue note, and match media are ready for review.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "match result review 019",
    "evidenceStatus": "Clip uploaded",
    "amountAffected": 0,
    "actionHistory": [
      "Submission received",
      "Clip uploaded",
      "Reviewer follow-up pending"
    ]
  },
  {
    "id": "verify_020",
    "type": "challenge_result",
    "relatedId": "challenge_020",
    "status": "rejected",
    "submittedBy": "user_200",
    "notes": "Challenge target evidence is attached with timestamped media.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "challenge result review 020",
    "evidenceStatus": "Score sheet attached",
    "amountAffected": 104800,
    "actionHistory": [
      "Submission received",
      "Score sheet attached",
      "Ready for admin decision"
    ],
    "reviewedBy": "Irene - Content Desk",
    "reviewedAt": "2026-06-06T03:03:00.244Z"
  },
  {
    "id": "verify_021",
    "type": "athlete_profile",
    "relatedId": "ath_021",
    "status": "pending",
    "submittedBy": "user_036",
    "notes": "Roster identity and athlete profile details need admin confirmation.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "athlete profile review 021",
    "evidenceStatus": "Referee note pending",
    "amountAffected": 0,
    "actionHistory": [
      "Submission received",
      "Referee note pending",
      "Ready for admin decision"
    ],
    "reviewedBy": "Amina - Trust Desk",
    "reviewedAt": "2026-06-06T03:03:00.244Z"
  },
  {
    "id": "verify_022",
    "type": "team_profile",
    "relatedId": "team_022",
    "status": "verified",
    "submittedBy": "user_138",
    "notes": "Team admin request includes roster proof and venue contact.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "team profile review 022",
    "evidenceStatus": "Captain confirmation uploaded",
    "amountAffected": 0,
    "actionHistory": [
      "Submission received",
      "Captain confirmation uploaded",
      "Reviewer follow-up pending"
    ]
  },
  {
    "id": "verify_023",
    "type": "league_status",
    "relatedId": "league_023",
    "status": "disputed",
    "submittedBy": "user_120",
    "notes": "League onboarding status requires platform review notes.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "league status review 023",
    "evidenceStatus": "League admin review needed",
    "amountAffected": 0,
    "actionHistory": [
      "Submission received",
      "League admin review needed",
      "Ready for admin decision"
    ],
    "reviewedBy": "Grace - Support Desk",
    "reviewedAt": "2026-06-06T03:03:00.244Z"
  },
  {
    "id": "verify_024",
    "type": "payout_review",
    "relatedId": "pledge_024",
    "status": "rejected",
    "submittedBy": "user_106",
    "notes": "Support release is waiting for verified challenge evidence.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "payout review review 024",
    "evidenceStatus": "Media timestamp verified",
    "amountAffected": 121600,
    "actionHistory": [
      "Submission received",
      "Media timestamp verified",
      "Ready for admin decision"
    ],
    "reviewedBy": "Daniel - Platform Review",
    "reviewedAt": "2026-06-06T03:03:00.244Z"
  },
  {
    "id": "verify_025",
    "type": "match_result",
    "relatedId": "match_025",
    "status": "pending",
    "submittedBy": "user_154",
    "notes": "Score sheet, venue note, and match media are ready for review.",
    "createdAt": "2026-06-06T03:03:00.244Z",
    "relatedLabel": "match result review 025",
    "evidenceStatus": "Clip uploaded",
    "amountAffected": 0,
    "actionHistory": [
      "Submission received",
      "Clip uploaded",
      "Reviewer follow-up pending"
    ]
  }
];
