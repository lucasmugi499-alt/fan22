import { create } from 'zustand';
import { User, SportType, League, Team, Athlete, Match, Challenge, SupportPledge } from '@/types';

interface AppState {
  currentUser: User | null;
  selectedSportFilter: SportType | 'All';
  demoLeagues: League[];
  demoTeams: Team[];
  demoAthletes: Athlete[];
  demoMatches: Match[];
  demoChallenges: Challenge[];
  demoMatchOverrides: Record<string, Partial<Match>>;
  demoChallengeOverrides: Record<string, Partial<Challenge>>;
  demoAthleteOverrides: Record<string, Partial<Athlete>>;
  /** Pledges made this session, newest first. Mirrors what the backend would persist. */
  demoPledges: SupportPledge[];
  /** Wallet spend this session, per user id; subtracted from the mock profile balance. */
  demoWalletSpent: Record<string, number>;
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
  updateDemoChallenge: (challengeId: string, updates: Partial<Challenge>) => void;
  updateDemoAthlete: (athleteId: string, updates: Partial<Athlete>) => void;
  addDemoPledge: (pledge: SupportPledge) => void;
  addDemoWalletSpend: (userId: string, amount: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentUser: null,
  selectedSportFilter: 'All',
  demoLeagues: [],
  demoTeams: [],
  demoAthletes: [],
  demoMatches: [],
  demoChallenges: [],
  demoMatchOverrides: {},
  demoChallengeOverrides: {},
  demoAthleteOverrides: {},
  demoPledges: [],
  demoWalletSpent: {},
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
  updateDemoMatch: (matchId, updates) => set((state) => {
    const isDemo = state.demoMatches.some(m => m.id === matchId);
    if (isDemo) {
      return { demoMatches: state.demoMatches.map(m => m.id === matchId ? { ...m, ...updates } : m) };
    }
    return { demoMatchOverrides: { ...state.demoMatchOverrides, [matchId]: { ...state.demoMatchOverrides[matchId], ...updates } } };
  }),
  updateDemoAthlete: (athleteId, updates) => set((state) => {
    const isDemo = state.demoAthletes.some(a => a.id === athleteId);
    if (isDemo) {
      return { demoAthletes: state.demoAthletes.map(a => a.id === athleteId ? { ...a, ...updates } : a) };
    }
    return { demoAthleteOverrides: { ...state.demoAthleteOverrides, [athleteId]: { ...state.demoAthleteOverrides[athleteId], ...updates } } };
  }),
  addDemoPledge: (pledge) => set((state) => ({ demoPledges: [pledge, ...state.demoPledges] })),
  addDemoWalletSpend: (userId, amount) => set((state) => ({
    demoWalletSpent: { ...state.demoWalletSpent, [userId]: (state.demoWalletSpent[userId] ?? 0) + amount }
  })),
  addDemoChallenge: (challenge) => set((state) => ({ demoChallenges: [challenge, ...state.demoChallenges] })),
  updateDemoChallenge: (challengeId, updates) => set((state) => {
    const isDemo = state.demoChallenges.some(c => c.id === challengeId);
    if (isDemo) {
      return { demoChallenges: state.demoChallenges.map(c => c.id === challengeId ? { ...c, ...updates } : c) };
    }
    return { demoChallengeOverrides: { ...state.demoChallengeOverrides, [challengeId]: { ...state.demoChallengeOverrides[challengeId], ...updates } } };
  }),
}));
