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
  writeBatch,
  query,
  where,
  limit,
  DocumentReference,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  Character,
  WordList,
  UserStats,
  QuizQuestion,
  SavedStudySession,
  SavedSessionResult,
  SharedDictionaryEntry,
  MnemonicVariant,
  DailyAIUsage,
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

const CHARACTER_REQUIRED_KEYS = [
  'id',
  'userId',
  'hanzi',
  'pinyin',
  'hanViet',
  'meaning',
  'radical',
  'strokeCount',
  'listIds',
  'createdAt',
  'updatedAt',
  'srs',
] as const;

const CHARACTER_ALLOWED_KEYS = new Set<string>([
  'id',
  'userId',
  'hanzi',
  'pinyin',
  'hanViet',
  'meaning',
  'radical',
  'strokeCount',
  'components',
  'mnemonic',
  'aiMnemonics',
  'hskLevel',
  'customNotes',
  'examples',
  'compoundWords',
  'listIds',
  'createdAt',
  'updatedAt',
  'srs',
]);

const SRS_REQUIRED_KEYS = [
  'easinessFactor',
  'interval',
  'repetitions',
  'nextReviewDate',
  'totalCorrect',
  'totalIncorrect',
  'consecutiveCorrect',
  'masteryLevel',
  'difficultyScore',
] as const;

const SRS_ALLOWED_KEYS = new Set<string>([
  'easinessFactor',
  'interval',
  'repetitions',
  'nextReviewDate',
  'totalCorrect',
  'totalIncorrect',
  'consecutiveCorrect',
  'lastReviewedAt',
  'masteryLevel',
  'difficultyScore',
]);

export interface CharacterValidationResult {
  isValid: boolean;
  violatedFields: string[];
  reasons: string[];
}

function isPlainObject(val: unknown): val is Record<string, any> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

function isFiniteNum(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val);
}

function isValidCharIdClient(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && !/[/\s]/.test(id);
}

function truncateStringSafe(val: string, maxLen: number): string {
  if (val.length <= maxLen) return val;
  let cut = val.slice(0, maxLen);
  const lastCode = cut.charCodeAt(cut.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    cut = cut.slice(0, -1);
  }
  return cut;
}

function clampNum(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

/**
 * Mirrors firestore.rules `isValidCharId`, `isValidCharacter`, and `isValidSrs` verbatim
 * so client batch/single writes catch violations before hitting Firestore.
 */
export function validateCharacterForCloud(
  data: unknown,
  userId: string,
  characterId?: string
): CharacterValidationResult {
  const violatedSet = new Set<string>();
  const reasons: string[] = [];

  const fail = (field: string, reason: string) => {
    violatedSet.add(field);
    reasons.push(`${field}: ${reason}`);
  };

  if (!isPlainObject(data)) {
    return {
      isValid: false,
      violatedFields: ['root'],
      reasons: ['root: dữ liệu không phải object hợp lệ'],
    };
  }

  const targetId = characterId !== undefined ? characterId : data.id;
  if (!isValidCharIdClient(targetId)) {
    fail('id', 'id phải là chuỗi 1..128 ký tự và không chứa khoảng trắng hoặc dấu "/"');
  }

  for (const reqKey of CHARACTER_REQUIRED_KEYS) {
    if (!(reqKey in data)) {
      fail(reqKey, `thiếu trường bắt buộc '${reqKey}'`);
    }
  }

  for (const key of Object.keys(data)) {
    if (!CHARACTER_ALLOWED_KEYS.has(key)) {
      fail(key, `khóa '${key}' không nằm trong danh sách allowed keys của firestore.rules`);
    }
  }

  if ('id' in data) {
    if (!isValidCharIdClient(data.id)) {
      fail('id', 'id không hợp lệ (rỗng, > 128 ký tự hoặc chứa khoảng trắng / "/")');
    } else if (characterId !== undefined && data.id !== characterId) {
      fail('id', `data.id ('${data.id}') phải khớp với documentId ('${characterId}')`);
    }
  }

  if ('userId' in data && (typeof data.userId !== 'string' || data.userId !== userId)) {
    fail('userId', `userId phải là chuỗi khớp UID '${userId}'`);
  }

  if ('hanzi' in data) {
    if (typeof data.hanzi !== 'string' || data.hanzi.length === 0 || data.hanzi.length > 100) {
      fail('hanzi', 'hanzi phải là chuỗi có độ dài 1..100');
    }
  }

  if ('pinyin' in data && (typeof data.pinyin !== 'string' || data.pinyin.length > 200)) {
    fail('pinyin', 'pinyin phải là chuỗi dài <= 200');
  }

  if ('hanViet' in data && (typeof data.hanViet !== 'string' || data.hanViet.length > 200)) {
    fail('hanViet', 'hanViet phải là chuỗi dài <= 200');
  }

  if ('meaning' in data && (typeof data.meaning !== 'string' || data.meaning.length > 1000)) {
    fail('meaning', 'meaning phải là chuỗi dài <= 1000');
  }

  if ('radical' in data && (typeof data.radical !== 'string' || data.radical.length > 100)) {
    fail('radical', 'radical phải là chuỗi dài <= 100');
  }

  if ('strokeCount' in data) {
    if (!isFiniteNum(data.strokeCount) || data.strokeCount < 0 || data.strokeCount > 200) {
      fail('strokeCount', 'strokeCount phải là số trong khoảng 0..200');
    }
  }

  if ('components' in data && data.components !== null) {
    if (typeof data.components !== 'string' || data.components.length > 500) {
      fail('components', 'components phải là chuỗi dài <= 500 hoặc null');
    }
  }

  if ('mnemonic' in data && data.mnemonic !== null) {
    if (typeof data.mnemonic !== 'string' || data.mnemonic.length > 2000) {
      fail('mnemonic', 'mnemonic phải là chuỗi dài <= 2000 hoặc null');
    }
  }

  if ('aiMnemonics' in data && data.aiMnemonics !== null) {
    if (
      !Array.isArray(data.aiMnemonics) ||
      data.aiMnemonics.length > 10 ||
      !data.aiMnemonics.every((item) => isPlainObject(item))
    ) {
      fail('aiMnemonics', 'aiMnemonics phải là mảng tối đa 10 object hoặc null');
    }
  }

  if ('hskLevel' in data && data.hskLevel !== null) {
    if (!isFiniteNum(data.hskLevel) || data.hskLevel < 0 || data.hskLevel > 9) {
      fail('hskLevel', 'hskLevel phải là số trong khoảng 0..9 hoặc null');
    }
  }

  if ('customNotes' in data && data.customNotes !== null) {
    if (typeof data.customNotes !== 'string' || data.customNotes.length > 2000) {
      fail('customNotes', 'customNotes phải là chuỗi dài <= 2000 hoặc null');
    }
  }

  if ('examples' in data && data.examples !== null) {
    if (
      !Array.isArray(data.examples) ||
      data.examples.length > 20 ||
      !data.examples.every((item) => isPlainObject(item))
    ) {
      fail('examples', 'examples phải là mảng tối đa 20 object hoặc null');
    }
  }

  if ('compoundWords' in data && data.compoundWords !== null) {
    if (
      !Array.isArray(data.compoundWords) ||
      data.compoundWords.length > 30 ||
      !data.compoundWords.every((item) => isPlainObject(item))
    ) {
      fail('compoundWords', 'compoundWords phải là mảng tối đa 30 object hoặc null');
    }
  }

  if ('listIds' in data) {
    if (
      !Array.isArray(data.listIds) ||
      data.listIds.length > 50 ||
      !data.listIds.every((item) => typeof item === 'string')
    ) {
      fail('listIds', 'listIds phải là mảng chuỗi tối đa 50 phần tử');
    }
  }

  if ('createdAt' in data && (!isFiniteNum(data.createdAt) || data.createdAt < 0)) {
    fail('createdAt', 'createdAt phải là số >= 0');
  }

  if ('updatedAt' in data && (!isFiniteNum(data.updatedAt) || data.updatedAt <= 0)) {
    fail('updatedAt', 'updatedAt phải là số > 0');
  }

  if ('srs' in data) {
    const srs = data.srs;
    if (!isPlainObject(srs)) {
      fail('srs', 'srs phải là object hợp lệ');
    } else {
      for (const reqSrsKey of SRS_REQUIRED_KEYS) {
        if (!(reqSrsKey in srs)) {
          fail(`srs.${reqSrsKey}`, `thiếu trường bắt buộc 'srs.${reqSrsKey}'`);
        }
      }
      for (const srsKey of Object.keys(srs)) {
        if (!SRS_ALLOWED_KEYS.has(srsKey)) {
          fail(`srs.${srsKey}`, `khóa 'srs.${srsKey}' không được phép`);
        }
      }
      if ('easinessFactor' in srs && (!isFiniteNum(srs.easinessFactor) || srs.easinessFactor < 1.0 || srs.easinessFactor > 10.0)) {
        fail('srs.easinessFactor', 'easinessFactor phải nằm trong [1.0, 10.0]');
      }
      if ('interval' in srs && (!isFiniteNum(srs.interval) || srs.interval < 0 || srs.interval > 100000)) {
        fail('srs.interval', 'interval phải nằm trong [0, 100000]');
      }
      if ('repetitions' in srs && (!isFiniteNum(srs.repetitions) || srs.repetitions < 0 || srs.repetitions > 100000)) {
        fail('srs.repetitions', 'repetitions phải nằm trong [0, 100000]');
      }
      if ('nextReviewDate' in srs && (!isFiniteNum(srs.nextReviewDate) || srs.nextReviewDate < 0)) {
        fail('srs.nextReviewDate', 'nextReviewDate phải >= 0');
      }
      if ('totalCorrect' in srs && (!isFiniteNum(srs.totalCorrect) || srs.totalCorrect < 0 || srs.totalCorrect > 1000000)) {
        fail('srs.totalCorrect', 'totalCorrect phải nằm trong [0, 1000000]');
      }
      if ('totalIncorrect' in srs && (!isFiniteNum(srs.totalIncorrect) || srs.totalIncorrect < 0 || srs.totalIncorrect > 1000000)) {
        fail('srs.totalIncorrect', 'totalIncorrect phải nằm trong [0, 1000000]');
      }
      if ('consecutiveCorrect' in srs && (!isFiniteNum(srs.consecutiveCorrect) || srs.consecutiveCorrect < 0 || srs.consecutiveCorrect > 100000)) {
        fail('srs.consecutiveCorrect', 'consecutiveCorrect phải nằm trong [0, 100000]');
      }
      if (
        'lastReviewedAt' in srs &&
        srs.lastReviewedAt !== null &&
        (!isFiniteNum(srs.lastReviewedAt) || srs.lastReviewedAt < 0 || srs.lastReviewedAt > 9999999999999)
      ) {
        fail('srs.lastReviewedAt', 'lastReviewedAt phải nằm trong [0, 9999999999999] hoặc null');
      }
      if ('masteryLevel' in srs && (!isFiniteNum(srs.masteryLevel) || srs.masteryLevel < 0 || srs.masteryLevel > 100)) {
        fail('srs.masteryLevel', 'masteryLevel phải nằm trong [0, 100]');
      }
      if ('difficultyScore' in srs && (!isFiniteNum(srs.difficultyScore) || srs.difficultyScore < 0 || srs.difficultyScore > 100)) {
        fail('srs.difficultyScore', 'difficultyScore phải nằm trong [0, 100]');
      }
    }
  }

  return {
    isValid: violatedSet.size === 0,
    violatedFields: Array.from(violatedSet),
    reasons,
  };
}

/**
 * Safely repairs a Character payload to conform to firestore.rules constraints
 * (truncates overlong strings/lists, strips disallowed keys, clamps numeric bounds).
 * Does NOT fabricate missing critical identity fields (empty `hanzi` or empty `id`).
 */
export function repairCharacterForCloud(
  rawChar: Character,
  userId: string
): Record<string, any> {
  const now = Date.now();
  const src: Record<string, any> = isPlainObject(rawChar) ? rawChar : {};

  const repairedId =
    typeof src.id === 'string'
      ? truncateStringSafe(src.id.trim().replace(/[/\s]+/g, '_'), 128)
      : '';

  const repairedHanzi =
    typeof src.hanzi === 'string' ? truncateStringSafe(src.hanzi.trim(), 100) : '';

  const fallbackStroke = Math.min(
    200,
    Math.max(1, repairedHanzi ? Array.from(repairedHanzi).length * 4 : 1)
  );

  const rawSrs = isPlainObject(src.srs) ? src.srs : {};
  const repairedSrs: Record<string, any> = {
    easinessFactor: isFiniteNum(rawSrs.easinessFactor)
      ? clampNum(rawSrs.easinessFactor, 1.0, 10.0)
      : DEFAULT_SRS.easinessFactor,
    interval: isFiniteNum(rawSrs.interval)
      ? clampNum(rawSrs.interval, 0, 100000)
      : DEFAULT_SRS.interval,
    repetitions: isFiniteNum(rawSrs.repetitions)
      ? clampNum(rawSrs.repetitions, 0, 100000)
      : DEFAULT_SRS.repetitions,
    nextReviewDate:
      isFiniteNum(rawSrs.nextReviewDate) && rawSrs.nextReviewDate >= 0
        ? rawSrs.nextReviewDate
        : now,
    totalCorrect: isFiniteNum(rawSrs.totalCorrect)
      ? clampNum(rawSrs.totalCorrect, 0, 1000000)
      : 0,
    totalIncorrect: isFiniteNum(rawSrs.totalIncorrect)
      ? clampNum(rawSrs.totalIncorrect, 0, 1000000)
      : 0,
    consecutiveCorrect: isFiniteNum(rawSrs.consecutiveCorrect)
      ? clampNum(rawSrs.consecutiveCorrect, 0, 100000)
      : 0,
    lastReviewedAt:
      rawSrs.lastReviewedAt === null || rawSrs.lastReviewedAt === undefined
        ? null
        : isFiniteNum(rawSrs.lastReviewedAt)
        ? clampNum(rawSrs.lastReviewedAt, 0, 9999999999999)
        : null,
    masteryLevel: isFiniteNum(rawSrs.masteryLevel)
      ? clampNum(rawSrs.masteryLevel, 0, 100)
      : 0,
    difficultyScore: isFiniteNum(rawSrs.difficultyScore)
      ? clampNum(rawSrs.difficultyScore, 0, 100)
      : 0,
  };

  const repaired: Record<string, any> = {
    id: repairedId,
    userId,
    hanzi: repairedHanzi,
    pinyin: typeof src.pinyin === 'string' ? truncateStringSafe(src.pinyin, 200) : '',
    hanViet: typeof src.hanViet === 'string' ? truncateStringSafe(src.hanViet, 200) : '',
    meaning: typeof src.meaning === 'string' ? truncateStringSafe(src.meaning, 1000) : '',
    radical: typeof src.radical === 'string' ? truncateStringSafe(src.radical, 100) : '',
    strokeCount: isFiniteNum(src.strokeCount) ? clampNum(src.strokeCount, 0, 200) : fallbackStroke,
    listIds: Array.isArray(src.listIds)
      ? src.listIds.filter((item: unknown): item is string => typeof item === 'string').slice(0, 50)
      : [],
    createdAt: isFiniteNum(src.createdAt) && src.createdAt >= 0 ? src.createdAt : now,
    updatedAt: isFiniteNum(src.updatedAt) && src.updatedAt > 0 ? src.updatedAt : now,
    srs: repairedSrs,
  };

  if ('components' in src) {
    repaired.components =
      typeof src.components === 'string' ? truncateStringSafe(src.components, 500) : null;
  }
  if ('mnemonic' in src) {
    repaired.mnemonic =
      typeof src.mnemonic === 'string' ? truncateStringSafe(src.mnemonic, 2000) : null;
  }
  if ('customNotes' in src) {
    repaired.customNotes =
      typeof src.customNotes === 'string' ? truncateStringSafe(src.customNotes, 2000) : null;
  }
  if ('hskLevel' in src) {
    repaired.hskLevel = isFiniteNum(src.hskLevel) ? clampNum(src.hskLevel, 0, 9) : null;
  }
  if ('aiMnemonics' in src) {
    repaired.aiMnemonics = Array.isArray(src.aiMnemonics)
      ? src.aiMnemonics.filter((m: unknown) => isPlainObject(m)).slice(0, 10)
      : null;
  }
  if ('examples' in src) {
    repaired.examples = Array.isArray(src.examples)
      ? src.examples.filter((ex: unknown) => isPlainObject(ex)).slice(0, 20)
      : null;
  }
  if ('compoundWords' in src) {
    repaired.compoundWords = Array.isArray(src.compoundWords)
      ? src.compoundWords.filter((cw: unknown) => isPlainObject(cw)).slice(0, 30)
      : null;
  }

  return sanitizeForFirestore(repaired);
}

function prepareCharacterPayloadForCloud(
  character: Character,
  userId: string
): Record<string, any> | null {
  const rawPayload = sanitizeForFirestore({ ...character, userId, updatedAt: Date.now() });
  const initialValidation = validateCharacterForCloud(rawPayload, userId, rawPayload?.id);

  if (initialValidation.isValid) {
    return rawPayload;
  }

  console.warn(
    `[CloudSync] Character violated firestore.rules before write (id=${String(character?.id)}, hanzi=${String(character?.hanzi)}). Violated fields: [${initialValidation.violatedFields.join(', ')}]. Details: ${initialValidation.reasons.join('; ')}. Attempting safe repair...`
  );

  const repairedPayload = repairCharacterForCloud(character, userId);
  const afterRepairValidation = validateCharacterForCloud(
    repairedPayload,
    userId,
    repairedPayload?.id
  );

  if (!afterRepairValidation.isValid) {
    console.error(
      `[CloudSync] Skipping invalid character after repair failed (id=${String(character?.id)}, hanzi=${String(character?.hanzi)}). Violated fields: [${afterRepairValidation.violatedFields.join(', ')}]. Details: ${afterRepairValidation.reasons.join('; ')}`
    );
    return null;
  }

  return repairedPayload;
}

/**
 * Saves or updates a single character in Cloud Firestore
 */
export async function saveCharacterToCloud(userId: string, character: Character): Promise<void> {
  const cleanData = prepareCharacterPayloadForCloud(character, userId);
  if (!cleanData) return;
  const path = `users/${userId}/characters/${cleanData.id}`;
  try {
    const docRef = doc(db, 'users', userId, 'characters', cleanData.id);
    await setDoc(docRef, cleanData, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Deletes a character (and any duplicate Cloud docs sharing the same hanzi) from Cloud Firestore
 */
export async function deleteCharacterFromCloud(
  userId: string,
  characterId: string,
  hanzi?: string
): Promise<void> {
  const path = `users/${userId}/characters/${characterId}`;
  try {
    const refsToDelete = new Map<string, DocumentReference>();
    if (characterId) {
      refsToDelete.set(characterId, doc(db, 'users', userId, 'characters', characterId));
    }
    const cleanHanzi = hanzi?.trim();
    if (cleanHanzi) {
      const q = query(
        collection(db, 'users', userId, 'characters'),
        where('hanzi', '==', cleanHanzi)
      );
      const snap = await getDocs(q);
      snap.forEach((docSnap) => {
        refsToDelete.set(docSnap.id, docSnap.ref);
      });
    }

    const refs = Array.from(refsToDelete.values());
    if (refs.length === 0) return;

    const chunkSize = 500;
    for (let i = 0; i < refs.length; i += chunkSize) {
      const batch = writeBatch(db);
      refs.slice(i, i + chunkSize).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

/**
 * Batch-deletes pending deleted characters (matching either document ID or hanzi) from Cloud Firestore.
 */
export async function deleteCharactersBatchFromCloud(
  userId: string,
  items: Array<{ id: string; hanzi?: string }>
): Promise<void> {
  if (items.length === 0) return;
  if (items.length === 1) {
    await deleteCharacterFromCloud(userId, items[0].id, items[0].hanzi);
    return;
  }

  const path = `users/${userId}/characters`;
  try {
    const targetIds = new Set(items.map((i) => i.id).filter(Boolean));
    const targetHanzi = new Set(
      items.map((i) => i.hanzi?.trim()).filter((h): h is string => Boolean(h))
    );

    const refsToDelete = new Map<string, DocumentReference>();
    targetIds.forEach((id) => {
      refsToDelete.set(id, doc(db, 'users', userId, 'characters', id));
    });

    if (targetHanzi.size > 0) {
      const snapshot = await getDocs(collection(db, 'users', userId, 'characters'));
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Partial<Character>;
        if (
          targetIds.has(docSnap.id) ||
          (typeof data?.hanzi === 'string' && targetHanzi.has(data.hanzi.trim()))
        ) {
          refsToDelete.set(docSnap.id, docSnap.ref);
        }
      });
    }

    const refs = Array.from(refsToDelete.values());
    const chunkSize = 500;
    for (let i = 0; i < refs.length; i += chunkSize) {
      const batch = writeBatch(db);
      refs.slice(i, i + chunkSize).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

/**
 * Saves a batch of characters to Cloud Firestore (max 400 per batch).
 * Validates and safely repairs each document before writing, and falls back to
 * per-document writes if a batch is rejected so valid records still reach Cloud.
 */
export async function saveCharactersBatchToCloud(userId: string, characters: Character[]): Promise<void> {
  if (characters.length === 0) return;

  const preparedDocs: Array<{ docId: string; hanzi: string; payload: Record<string, any> }> = [];
  for (const c of characters) {
    const payload = prepareCharacterPayloadForCloud(c, userId);
    if (payload) {
      preparedDocs.push({
        docId: payload.id,
        hanzi: payload.hanzi,
        payload,
      });
    }
  }

  if (preparedDocs.length === 0) return;

  const path = `users/${userId}/characters`;
  const chunkSize = 400;
  let totalSucceeded = 0;
  let lastError: unknown = null;
  const failedDocs: Array<{ id: string; hanzi: string; code: string; reason: string }> = [];

  for (let i = 0; i < preparedDocs.length; i += chunkSize) {
    const chunk = preparedDocs.slice(i, i + chunkSize);
    try {
      const batch = writeBatch(db);
      chunk.forEach((item) => {
        const docRef = doc(db, 'users', userId, 'characters', item.docId);
        batch.set(docRef, item.payload, { merge: true });
      });
      await batch.commit();
      totalSucceeded += chunk.length;
    } catch (batchErr: any) {
      lastError = batchErr;
      console.warn(
        `[CloudSync] Batch commit failed (${batchErr?.code || 'unknown'}: ${batchErr?.message || batchErr}). Falling back to per-document writes for ${chunk.length} characters...`
      );

      for (const item of chunk) {
        try {
          const docRef = doc(db, 'users', userId, 'characters', item.docId);
          await setDoc(docRef, item.payload, { merge: true });
          totalSucceeded += 1;
        } catch (docErr: any) {
          lastError = docErr;
          failedDocs.push({
            id: item.docId,
            hanzi: item.hanzi,
            code: String(docErr?.code || ''),
            reason: docErr instanceof Error ? docErr.message : String(docErr),
          });
        }
      }
    }
  }

  if (failedDocs.length > 0) {
    console.error(
      `[CloudSync] ${failedDocs.length} character document(s) failed during per-document fallback under ${path}:`,
      JSON.stringify(failedDocs)
    );
  }

  if (totalSucceeded === 0 && lastError) {
    handleFirestoreError(lastError, OperationType.WRITE, path);
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
    const batch = writeBatch(db);
    batch.delete(docRef);
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

const RESET_CLOUD_SUBCOLLECTIONS = ['characters', 'wordLists', 'stats', 'savedSessions'] as const;
const MAX_WRITE_BATCH_OPS = 500;

async function deleteSubcollectionInBatches(
  userId: string,
  subcollectionName: (typeof RESET_CLOUD_SUBCOLLECTIONS)[number]
): Promise<number> {
  const colRef = collection(db, 'users', userId, subcollectionName);
  let totalDeleted = 0;

  while (true) {
    const snap = await getDocs(query(colRef, limit(MAX_WRITE_BATCH_OPS)));
    if (snap.empty) break;

    const batch = writeBatch(db);
    snap.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
    totalDeleted += snap.docs.length;

    if (snap.docs.length < MAX_WRITE_BATCH_OPS) break;
  }

  return totalDeleted;
}

/**
 * Resets personal Cloud Firestore data for the signed-in user ONLY across:
 * characters, wordLists, stats, savedSessions.
 * Explicitly NEVER deletes `usage` (AI quota) or `sharedDictionary`.
 */
export async function resetUserCloudData(userId: string): Promise<void> {
  if (!userId) {
    throw new Error('Không xác định được UID người dùng để đặt lại dữ liệu Cloud.');
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Không có kết nối mạng. Không thể đặt lại dữ liệu trên Cloud lúc này.');
  }

  let currentSubcollection: string = 'characters';
  try {
    for (const subcollectionName of RESET_CLOUD_SUBCOLLECTIONS) {
      currentSubcollection = subcollectionName;
      await deleteSubcollectionInBatches(userId, subcollectionName);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${userId}/${currentSubcollection}`);
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

// ================= AUTH TOKEN & SHARED DICTIONARY CACHE (TIER 2) =================

export async function getAuthIdToken(): Promise<string | null> {
  try {
    if (!auth.currentUser) return null;
    return await auth.currentUser.getIdToken();
  } catch {
    return null;
  }
}

export function hanziToCacheDocId(hanzi: string): string {
  const clean = hanzi.trim();
  const codes = Array.from(clean).map((ch) => (ch.codePointAt(0) || 0).toString(16));
  return `u_${codes.join('_')}`.slice(0, 128);
}

function isUsableMeaning(meaning?: string): boolean {
  if (!meaning) return false;
  const trimmed = meaning.trim();
  return (
    trimmed.length > 0 &&
    !trimmed.includes('Từ vựng mới') &&
    !trimmed.includes('Cần kết nối AI') &&
    trimmed !== 'Chưa có nghĩa'
  );
}

export async function lookupSharedDictionaryOne(
  hanzi: string
): Promise<SharedDictionaryEntry | null> {
  if (!auth.currentUser) return null;
  const clean = hanzi.trim();
  if (!clean || clean.length > 50) return null;
  const docId = hanziToCacheDocId(clean);
  try {
    const docRef = doc(db, 'sharedDictionary', docId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data() as SharedDictionaryEntry;
    if (!data || data.hanzi !== clean) return null;
    return data;
  } catch (err) {
    console.warn('[SharedDictionary] lookup one failed:', err);
    return null;
  }
}

export async function lookupSharedDictionaryBatch(
  hanziList: string[]
): Promise<Map<string, SharedDictionaryEntry>> {
  const result = new Map<string, SharedDictionaryEntry>();
  if (!auth.currentUser || hanziList.length === 0) return result;

  const unique = Array.from(
    new Set(hanziList.map((h) => h.trim()).filter((h) => h.length > 0 && h.length <= 50))
  );

  // Batch concurrent single-doc reads in groups of 20
  const chunkSize = 20;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const docs = await Promise.all(
      chunk.map(async (word) => {
        try {
          const snap = await getDoc(doc(db, 'sharedDictionary', hanziToCacheDocId(word)));
          if (snap.exists()) {
            const data = snap.data() as SharedDictionaryEntry;
            if (data && data.hanzi === word && isUsableMeaning(data.meaning)) {
              return { word, data };
            }
          }
        } catch {
          // Non-fatal fallback to server/AI
        }
        return null;
      })
    );
    docs.forEach((item) => {
      if (item) result.set(item.word, item.data);
    });
  }

  return result;
}

export async function saveSharedDictionaryBatch(
  _entries: Array<Partial<SharedDictionaryEntry> & { hanzi: string }>
): Promise<void> {
  // No-op: client writes to Firestore `sharedDictionary` are disabled by security rules
  // (read-only for clients). Server-side lookups and caches handle shared persistence.
  return;
}

export async function saveSharedMnemonicToCache(
  _hanzi: string,
  _baseInfo: {
    pinyin?: string;
    hanViet?: string;
    meaning?: string;
    radical?: string;
    strokeCount?: number;
    components?: string;
    mnemonic?: string;
    hskLevel?: number;
  },
  _aiMnemonics: MnemonicVariant[]
): Promise<void> {
  // No-op: client writes to Firestore `sharedDictionary` are disabled by security rules
  // (read-only for clients). Mnemonics still save to server cache and user's own vocabulary doc.
  return;
}

export async function trackDailyAIUsage(
  type: 'enrich' | 'mnemonic',
  count = 1
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || count <= 0) return;
  const today = new Date().toISOString().split('T')[0];
  const docRef = doc(db, 'users', uid, 'usage', today);
  try {
    const snap = await getDoc(docRef);
    const prev = snap.exists() ? (snap.data() as DailyAIUsage) : null;
    const payload: DailyAIUsage = {
      userId: uid,
      date: today,
      enrichCount: (prev?.enrichCount || 0) + (type === 'enrich' ? count : 0),
      mnemonicCount: (prev?.mnemonicCount || 0) + (type === 'mnemonic' ? count : 0),
      limit: prev?.limit || 150,
      updatedAt: Date.now(),
    };
    await setDoc(docRef, sanitizeForFirestore(payload), { merge: true });
  } catch (err) {
    console.warn('[Usage] trackDailyAIUsage failed:', err);
  }
}

