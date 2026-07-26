import { isFirebaseConfigured } from '@/lib/firebase/client';
import { firebaseProvider } from './providers/firebaseProvider';
import { mockProvider } from './providers/mockProvider';

export const dataMode = process.env.NEXT_PUBLIC_DATA_MODE === 'firebase' ? 'firebase' : 'mock';

if (dataMode === 'firebase' && !isFirebaseConfigured) {
  throw new Error(
    'GoalPlace256 is configured for Firebase, but the Firebase client environment is incomplete.',
  );
}

export const dataProvider = dataMode === 'firebase' ? firebaseProvider : mockProvider;
