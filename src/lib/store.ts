import { create } from 'zustand';
import { User, SportType, League, Team, Athlete, Match, Challenge } from '@/types';

interface AppState {
  currentUser: User | null;
  selectedSportFilter: SportType | 'All';
  demoLeagues: League[];
  demoTeams: Team[];
  demoAthletes: Athlete[];
  demoMatches: Match[];
  demoChallenges: Challenge[];
  setCurrentUser: (user: User | null) => void;
  setSelectedSportFilter: (sport: SportType | 'All') => void;
  addPoints: (points: number) => void;
  deductWalletBalance: (amount: number) => void;
  addDemoLeague: (league: League) => void;
  addDemoTeam: (team: Team) => void;
  addDemoAthlete: (athlete: Athlete) => void;
  addDemoMatch: (match: Match) => void;
  updateDemoMatch: (matchId: string, updates: Partial<Match>) => void;
  addDemoChallenge: (challenge: Challenge) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentUser: null,
  selectedSportFilter: 'All',
  demoLeagues: [],
  demoTeams: [],
  demoAthletes: [],
  demoMatches: [],
  demoChallenges: [],
  setCurrentUser: (user) => set({ currentUser: user }),
  setSelectedSportFilter: (sport) => set({ selectedSportFilter: sport }),
  addPoints: (points) => set((state) => ({
    currentUser: state.currentUser ? { ...state.currentUser, points: state.currentUser.points + points } : null
  })),
  deductWalletBalance: (amount) => set((state) => ({
    currentUser: state.currentUser ? { ...state.currentUser, walletBalance: Math.max(0, state.currentUser.walletBalance - amount) } : null
  })),
  addDemoLeague: (league) => set((state) => ({ demoLeagues: [league, ...state.demoLeagues] })),
  addDemoTeam: (team) => set((state) => ({ demoTeams: [team, ...state.demoTeams] })),
  addDemoAthlete: (athlete) => set((state) => ({ demoAthletes: [athlete, ...state.demoAthletes] })),
  addDemoMatch: (match) => set((state) => ({ demoMatches: [match, ...state.demoMatches] })),
  updateDemoMatch: (matchId, updates) => set((state) => ({
    demoMatches: state.demoMatches.map(m => m.id === matchId ? { ...m, ...updates } : m)
  })),
  addDemoChallenge: (challenge) => set((state) => ({ demoChallenges: [challenge, ...state.demoChallenges] })),
}));
