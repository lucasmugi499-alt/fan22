import { isFirebaseConfigured } from '@/lib/firebase/client';
import { firebaseProvider } from './providers/firebaseProvider';
import { mockProvider } from './providers/mockProvider';

export const dataMode = process.env.NEXT_PUBLIC_DATA_MODE === 'firebase' ? 'firebase' : 'mock';

if (dataMode === 'firebase' && !isFirebaseConfigured && typeof window !== 'undefined') {
  console.warn('NEXT_PUBLIC_DATA_MODE=firebase is set, but Firebase env variables are missing. GoalPlace256 will use mock mode.');
}

export const dataProvider = dataMode === 'firebase' && isFirebaseConfigured ? firebaseProvider : mockProvider;

