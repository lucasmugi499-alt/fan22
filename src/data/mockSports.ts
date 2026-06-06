import { Sport } from "@/types";

export const sports: Sport[] = [
  {
    "id": "football",
    "name": "Football",
    "icon": "football",
    "color": "#22c55e",
    "gradient": "from-green-500 to-green-700",
    "description": "The beautiful game uniting communities across Uganda.",
    "statLabels": [
      "Goals",
      "Assists",
      "Clean Sheets",
      "Yellow Cards"
    ],
    "challengeExamples": [
      "Score 2 goals in the next match",
      "Keep a clean sheet"
    ]
  },
  {
    "id": "basketball",
    "name": "Basketball",
    "icon": "basketball",
    "color": "#f97316",
    "gradient": "from-orange-500 to-orange-700",
    "description": "High-flying action and community hoops.",
    "statLabels": [
      "Points",
      "Rebounds",
      "Assists",
      "Steals"
    ],
    "challengeExamples": [
      "Score 20 points",
      "Get 10 rebounds"
    ]
  },
  {
    "id": "rugby",
    "name": "Rugby",
    "icon": "rugby",
    "color": "#3b82f6",
    "gradient": "from-blue-500 to-blue-700",
    "description": "Strength, speed, and brotherhood on the pitch.",
    "statLabels": [
      "Tries",
      "Conversions",
      "Tackles",
      "Penalties"
    ],
    "challengeExamples": [
      "Score a try",
      "Make 15 tackles"
    ]
  }
];
