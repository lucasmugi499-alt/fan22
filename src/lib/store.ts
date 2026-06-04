import { create } from 'zustand';
import { User, SportType } from './types';
import { mockCurrentUser } from './mockData';

interface AppState {
  currentUser: User | null;
  selectedSportFilter: SportType | 'All';
  setCurrentUser: (user: User | null) => void;
  setSelectedSportFilter: (sport: SportType | 'All') => void;
  addPoints: (points: number) => void;
  deductWalletBalance: (amount: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentUser: mockCurrentUser,
  selectedSportFilter: 'All',
  setCurrentUser: (user) => set({ currentUser: user }),
  setSelectedSportFilter: (sport) => set({ selectedSportFilter: sport }),
  addPoints: (points) => set((state) => ({
    currentUser: state.currentUser ? { ...state.currentUser, points: state.currentUser.points + points } : null
  })),
  deductWalletBalance: (amount) => set((state) => ({
    currentUser: state.currentUser ? { ...state.currentUser, walletBalance: Math.max(0, state.currentUser.walletBalance - amount) } : null
  }))
}));
