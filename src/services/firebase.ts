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
  getDocFromServer,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  Character,
  WordList,
  UserStats,
  QuizQuestion,
  SavedStudySession,
  SavedSessionResult,
} from '../types';
import { DEFAULT_SRS } from './dictionary';
import { lookupBuiltIn } from './builtInDictionary';

// Initialize Firebase App singleton
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
// CRITICAL: Must pass firestoreDatabaseId if provided in config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export async function testFirestoreConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration (client offline).');
    }
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

// Utility to safely sanitize objects for Firestore (removes undefined values which cause Firestore to fail)
export function sanitizeForFirestore<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_, value) => (value === undefined ? null : value))
  );
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const rawCode = (error as any)?.code || '';
  const rawMessage = error instanceof Error ? error.message : String(error);
  
  const errInfo = {
    error: rawMessage,
    code: rawCode,
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
  const customError: any = new Error(rawMessage);
  customError.code = rawCode;
  customError.info = errInfo;
  customError.operationType = operationType;
  customError.path = path;
  throw customError;
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
    const cleanData = sanitizeForFirestore({ ...character, userId, updatedAt: Date.now() });
    await setDoc(docRef, cleanData, { merge: true });
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
 * Saves a batch of characters to Cloud Firestore (max 400 per batch)
 */
export async function saveCharactersBatchToCloud(userId: string, characters: Character[]): Promise<void> {
  if (characters.length === 0) return;
  const path = `users/${userId}/characters`;
  const chunkSize = 400;
  try {
    for (let i = 0; i < characters.length; i += chunkSize) {
      const chunk = characters.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((c) => {
        const docRef = doc(db, 'users', userId, 'characters', c.id);
        const cleanChar = sanitizeForFirestore({ ...c, userId, updatedAt: Date.now() });
        batch.set(docRef, cleanChar, { merge: true });
      });
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
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
  const path = `users/${userId}/wordLists`;
  try {
    const batch = writeBatch(db);
    wordLists.forEach((list) => {
      const docRef = doc(db, 'users', userId, 'wordLists', list.id);
      const cleanList = sanitizeForFirestore({ ...list, userId, updatedAt: Date.now() });
      batch.set(docRef, cleanList, { merge: true });
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
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
    const cleanStats = sanitizeForFirestore({ ...stats, userId, updatedAt: Date.now() });
    await setDoc(docRef, cleanStats, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// ================= SAVED STUDY SESSIONS (CROSS-DEVICE RESUME) =================

function compactQuestionForCloud(q: QuizQuestion) {
  return {
    id: q.id,
    type: q.type,
    characterId: q.character?.id || '',
    hanzi: q.character?.hanzi || '',
    pinyin: q.character?.pinyin || '',
    hanViet: q.character?.hanViet || '',
    meaning: q.character?.meaning || '',
    radical: q.character?.radical || '',
    strokeCount: q.character?.strokeCount || q.character?.hanzi?.length || 1,
    prompt: q.prompt,
    subtitle: q.subtitle ?? null,
    audioText: q.audioText ?? null,
    options: q.options ?? null,
    correctAnswer: q.correctAnswer,
    explanation: q.explanation ?? null,
    matchPairs: q.matchPairs ?? null,
    scrambledTokens: q.scrambledTokens ?? null,
    clozeSentence: q.clozeSentence ?? null,
  };
}

function hydrateQuestionFromCloud(
  rawQ: any,
  charById: Map<string, Character>,
  charByHanzi: Map<string, Character>
): QuizQuestion | null {
  if (!rawQ || typeof rawQ.id !== 'string') return null;
  const hanzi = typeof rawQ.hanzi === 'string' ? rawQ.hanzi : '';
  const characterId = typeof rawQ.characterId === 'string' ? rawQ.characterId : '';
  const matchedChar =
    (characterId && charById.get(characterId)) ||
    (hanzi && charByHanzi.get(hanzi)) ||
    rawQ.character;

  let character: Character;
  if (matchedChar && matchedChar.hanzi) {
    character = matchedChar;
  } else {
    const dict = hanzi ? lookupBuiltIn(hanzi) : undefined;
    character = {
      id: characterId || `cloud_${hanzi}`,
      hanzi,
      pinyin: rawQ.pinyin || dict?.pinyin || '',
      hanViet: rawQ.hanViet || dict?.hanViet || '',
      meaning: rawQ.meaning || dict?.meaning || '',
      radical: rawQ.radical || dict?.radical || '',
      strokeCount: Number(rawQ.strokeCount) || dict?.strokeCount || Math.max(1, hanzi.length),
      components: dict?.components,
      mnemonic: dict?.mnemonic,
      examples: dict?.examples,
      compoundWords: dict?.compoundWords,
      listIds: [],
      createdAt: Date.now(),
      srs: { ...DEFAULT_SRS },
    };
  }

  return {
    id: rawQ.id,
    type: rawQ.type,
    character,
    prompt: rawQ.prompt || '',
    subtitle: rawQ.subtitle ?? undefined,
    audioText: rawQ.audioText ?? undefined,
    options: Array.isArray(rawQ.options) ? rawQ.options : undefined,
    correctAnswer: rawQ.correctAnswer || '',
    explanation: rawQ.explanation ?? undefined,
    matchPairs: Array.isArray(rawQ.matchPairs) ? rawQ.matchPairs : undefined,
    scrambledTokens: Array.isArray(rawQ.scrambledTokens) ? rawQ.scrambledTokens : undefined,
    clozeSentence: rawQ.clozeSentence ?? undefined,
  };
}

function compactResultForCloud(r: SavedSessionResult) {
  return {
    questionId: r.question?.id || '',
    hanzi: r.question?.character?.hanzi || '',
    userAnswer: r.userAnswer ?? null,
    isCorrect: Boolean(r.isCorrect),
    ratingLabel: r.ratingLabel ?? null,
  };
}

function hydrateResultFromCloud(
  rawR: any,
  questions: QuizQuestion[]
): SavedSessionResult | null {
  if (!rawR) return null;
  if (rawR.question && rawR.question.character) {
    return {
      question: rawR.question,
      userAnswer: rawR.userAnswer ?? undefined,
      isCorrect: Boolean(rawR.isCorrect),
      ratingLabel: rawR.ratingLabel ?? undefined,
    };
  }
  const matchedQuestion =
    questions.find((q) => q.id === rawR.questionId) ||
    questions.find((q) => q.character?.hanzi === rawR.hanzi);
  if (!matchedQuestion) return null;
  return {
    question: matchedQuestion,
    userAnswer: rawR.userAnswer ?? undefined,
    isCorrect: Boolean(rawR.isCorrect),
    ratingLabel: rawR.ratingLabel ?? undefined,
  };
}

function compactSessionForCloud(userId: string, session: SavedStudySession) {
  return sanitizeForFirestore({
    id: session.id,
    userId,
    mode: session.mode,
    selectedListId: session.selectedListId ?? null,
    questionLimit: session.questionLimit,
    questions: session.questions.map(compactQuestionForCloud),
    currentIndex: session.currentIndex,
    correctCount: session.correctCount,
    incorrectCount: session.incorrectCount,
    sessionResults: (session.sessionResults || []).map(compactResultForCloud),
    elapsedMs: session.elapsedMs || 0,
    createdAt: session.createdAt || Date.now(),
    updatedAt: session.updatedAt || Date.now(),
  });
}

export async function loadSavedSessionsFromCloud(
  userId: string,
  allCharacters: Character[]
): Promise<SavedStudySession[]> {
  const path = `users/${userId}/savedSessions`;
  try {
    const colRef = collection(db, 'users', userId, 'savedSessions');
    const snapshot = await getDocs(colRef);
    const charById = new Map<string, Character>();
    const charByHanzi = new Map<string, Character>();
    allCharacters.forEach((c) => {
      if (c.id) charById.set(c.id, c);
      if (c.hanzi) charByHanzi.set(c.hanzi, c);
    });

    const sessions: SavedStudySession[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!data || !Array.isArray(data.questions) || data.questions.length === 0) return;

      const hydratedQuestions = data.questions
        .map((q: any) => hydrateQuestionFromCloud(q, charById, charByHanzi))
        .filter((q: QuizQuestion | null): q is QuizQuestion => Boolean(q));

      if (hydratedQuestions.length === 0) return;

      const currentIndex = typeof data.currentIndex === 'number' ? data.currentIndex : 0;
      if (currentIndex < 0 || currentIndex >= hydratedQuestions.length) return;

      const hydratedResults = Array.isArray(data.sessionResults)
        ? data.sessionResults
            .map((r: any) => hydrateResultFromCloud(r, hydratedQuestions))
            .filter((r: SavedSessionResult | null): r is SavedSessionResult => Boolean(r))
        : [];

      sessions.push({
        id: data.id || docSnap.id,
        mode: data.mode,
        selectedListId: data.selectedListId ?? null,
        questionLimit: data.questionLimit ?? 'all',
        questions: hydratedQuestions,
        currentIndex,
        correctCount: Number(data.correctCount) || 0,
        incorrectCount: Number(data.incorrectCount) || 0,
        sessionResults: hydratedResults,
        elapsedMs: Number(data.elapsedMs) || 0,
        createdAt: Number(data.createdAt) || Date.now(),
        updatedAt: Number(data.updatedAt) || Date.now(),
      });
    });

    return sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

export async function saveSavedSessionToCloud(
  userId: string,
  session: SavedStudySession
): Promise<void> {
  const path = `users/${userId}/savedSessions/${session.id}`;
  try {
    const docRef = doc(db, 'users', userId, 'savedSessions', session.id);
    const payload = compactSessionForCloud(userId, session);
    await setDoc(docRef, payload, { merge: false });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteSavedSessionFromCloud(
  userId: string,
  sessionId: string
): Promise<void> {
  const path = `users/${userId}/savedSessions/${sessionId}`;
  try {
    const docRef = doc(db, 'users', userId, 'savedSessions', sessionId);
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveSavedSessionsBatchToCloud(
  userId: string,
  sessions: SavedStudySession[]
): Promise<void> {
  if (sessions.length === 0) return;
  const path = `users/${userId}/savedSessions`;
  try {
    const batch = writeBatch(db);
    sessions.forEach((session) => {
      const docRef = doc(db, 'users', userId, 'savedSessions', session.id);
      batch.set(docRef, compactSessionForCloud(userId, session), { merge: false });
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}
