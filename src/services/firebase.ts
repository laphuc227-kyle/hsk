import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  getDocFromServer,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Character, WordList, UserStats } from '../types';

// Initialize Firebase App singleton
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
// CRITICAL: Must pass firestoreDatabaseId if provided in config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test initial connection as required by Firebase skill
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is currently offline.');
      return false;
    }
    // Permissions error on /test/connection is normal since default rule is deny
    return true;
  }
}

// Google Authentication
export async function signInWithGoogle(): Promise<User | null> {
  try {
    googleProvider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, googleProvider);
    if (result.user) {
      // Save user profile info in Firestore
      const userDocRef = doc(db, 'users', result.user.uid);
      await setDoc(
        userDocRef,
        {
          uid: result.user.uid,
          email: result.user.email || '',
          displayName: result.user.displayName || '',
          photoURL: result.user.photoURL || '',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }
    return result.user;
  } catch (err: any) {
    console.error('Google Sign-in failed:', err);
    throw err;
  }
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export function subscribeToAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

// ================= CLOUD SYNC FUNCTIONS =================

/**
 * Loads all user vocabulary characters from Cloud Firestore
 */
export async function loadCharactersFromCloud(userId: string): Promise<Character[]> {
  const path = `users/${userId}/characters`;
  try {
    const colRef = collection(db, 'users', userId, 'characters');
    const snapshot = await getDocs(colRef);
    const chars: Character[] = [];
    snapshot.forEach((docSnap) => {
      chars.push(docSnap.data() as Character);
    });
    return chars;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

/**
 * Saves or updates a single character in Cloud Firestore
 */
export async function saveCharacterToCloud(userId: string, character: Character): Promise<void> {
  const path = `users/${userId}/characters/${character.id}`;
  try {
    const docRef = doc(db, 'users', userId, 'characters', character.id);
    await setDoc(docRef, { ...character, userId, updatedAt: Date.now() }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Deletes a character from Cloud Firestore
 */
export async function deleteCharacterFromCloud(userId: string, characterId: string): Promise<void> {
  const path = `users/${userId}/characters/${characterId}`;
  try {
    const docRef = doc(db, 'users', userId, 'characters', characterId);
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

/**
 * Saves a batch of characters to Cloud Firestore (max 450 per batch)
 */
export async function saveCharactersBatchToCloud(userId: string, characters: Character[]): Promise<void> {
  if (characters.length === 0) return;
  const chunkSize = 400;
  for (let i = 0; i < characters.length; i += chunkSize) {
    const chunk = characters.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    chunk.forEach((c) => {
      const docRef = doc(db, 'users', userId, 'characters', c.id);
      batch.set(docRef, { ...c, userId, updatedAt: Date.now() }, { merge: true });
    });
    await batch.commit();
  }
}

/**
 * Loads custom word lists from Cloud Firestore
 */
export async function loadWordListsFromCloud(userId: string): Promise<WordList[]> {
  const path = `users/${userId}/wordLists`;
  try {
    const colRef = collection(db, 'users', userId, 'wordLists');
    const snapshot = await getDocs(colRef);
    const lists: WordList[] = [];
    snapshot.forEach((docSnap) => {
      lists.push(docSnap.data() as WordList);
    });
    return lists;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

/**
 * Saves custom word lists to Cloud Firestore
 */
export async function saveWordListsToCloud(userId: string, wordLists: WordList[]): Promise<void> {
  if (wordLists.length === 0) return;
  const batch = writeBatch(db);
  wordLists.forEach((list) => {
    const docRef = doc(db, 'users', userId, 'wordLists', list.id);
    batch.set(docRef, { ...list, userId, updatedAt: Date.now() }, { merge: true });
  });
  await batch.commit();
}

/**
 * Loads user stats from Cloud Firestore
 */
export async function loadUserStatsFromCloud(userId: string): Promise<UserStats | null> {
  const path = `users/${userId}/stats/main`;
  try {
    const docRef = doc(db, 'users', userId, 'stats', 'main');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as UserStats;
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    return null;
  }
}

/**
 * Saves user stats to Cloud Firestore
 */
export async function saveUserStatsToCloud(userId: string, stats: UserStats): Promise<void> {
  const path = `users/${userId}/stats/main`;
  try {
    const docRef = doc(db, 'users', userId, 'stats', 'main');
    await setDoc(docRef, { ...stats, userId, updatedAt: Date.now() }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}
