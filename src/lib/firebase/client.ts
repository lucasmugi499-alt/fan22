'use client';

import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { FirebaseStorage, getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
};

const requiredFirebaseConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.storageBucket,
  firebaseConfig.messagingSenderId,
  firebaseConfig.appId,
];

export const isFirebaseConfigured = requiredFirebaseConfig.every(Boolean);

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;

const dbId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID;

if (isFirebaseConfigured) {
  appInstance = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  authInstance = getAuth(appInstance);
  dbInstance = dbId ? getFirestore(appInstance, dbId) : getFirestore(appInstance);
  storageInstance = getStorage(appInstance);
}

export const firebaseApp = appInstance;
export const auth = authInstance;
export const db = dbInstance;
export const storage = storageInstance;

export function requireFirebaseClient() {
  if (!firebaseApp || !auth || !db || !storage) {
    throw new Error('Firebase client is not configured. Add NEXT_PUBLIC_FIREBASE_* env vars.');
  }

  return { app: firebaseApp, auth, db, storage };
}
