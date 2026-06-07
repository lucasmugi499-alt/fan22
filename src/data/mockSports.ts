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
      "Score 1 goal",
      "Create 3 chances",
      "Make 5 key recoveries"
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
      "Reach 20 points",
      "Hit 3 three-pointers",
      "Complete the game with 80% free throws"
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
      "Make 8 tackles",
      "Force a turnover"
    ]
  }
];
