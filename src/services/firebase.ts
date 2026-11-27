import { initializeApp, getApps, getApp, onLog } from 'firebase/app';
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
  initializeFirestore,
  doc,
  collection,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  deleteDoc,
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
export const db = (() => {
  try {
    const settings =
      typeof window !== 'undefined'
        ? { experimentalAutoDetectLongPolling: true, ignoreUndefinedProperties: true }
        : { ignoreUndefinedProperties: true };
    return initializeFirestore(app, settings, firebaseConfig.firestoreDatabaseId);
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
})();
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

const FIRESTORE_READ_TIMEOUT_MS = 20000;
const FIRESTORE_WRITE_TIMEOUT_MS = 18000;
const FIRESTORE_FALLBACK_CONCURRENCY = 12;
const FIRESTORE_QUOTA_STORAGE_KEY = 'hanzi_tutor_firestore_write_quota_v1';
const FIRESTORE_QUOTA_COOLDOWN_MS = 10 * 60 * 1000;

export interface FirestoreWriteStats {
  totalWrites: number;
  byCategory: Record<string, number>;
  lastUpdatedAt: number | null;
}

const IS_DEV_MODE = (() => {
  try {
    return Boolean((import.meta as any)?.env?.DEV);
  } catch {
    return false;
  }
})();

const sessionWriteStats: FirestoreWriteStats = {
  totalWrites: 0,
  byCategory: {},
  lastUpdatedAt: null,
};

function recordFirestoreWrite(category: string, docCount: number = 1): void {
  if (!IS_DEV_MODE || docCount <= 0) return;
  sessionWriteStats.totalWrites += docCount;
  sessionWriteStats.byCategory[category] = (sessionWriteStats.byCategory[category] || 0) + docCount;
  sessionWriteStats.lastUpdatedAt = Date.now();
  if (typeof window !== 'undefined') {
    (window as any).__HANZI_FIRESTORE_WRITES__ = {
      totalWrites: sessionWriteStats.totalWrites,
      byCategory: { ...sessionWriteStats.byCategory },
      lastUpdatedAt: sessionWriteStats.lastUpdatedAt,
    };
  }
  console.info(
    `[FirestoreWriteCounter][DEV] +${docCount} lượt ghi (${category}) | Tổng phiên: ${sessionWriteStats.totalWrites}`,
    { ...sessionWriteStats.byCategory }
  );
}

export function getFirestoreSessionWriteStats(): FirestoreWriteStats {
  return {
    totalWrites: sessionWriteStats.totalWrites,
    byCategory: { ...sessionWriteStats.byCategory },
    lastUpdatedAt: sessionWriteStats.lastUpdatedAt,
  };
}

export function resetFirestoreSessionWriteStats(): void {
  sessionWriteStats.totalWrites = 0;
  sessionWriteStats.byCategory = {};
  sessionWriteStats.lastUpdatedAt = null;
  if (IS_DEV_MODE && typeof window !== 'undefined') {
    (window as any).__HANZI_FIRESTORE_WRITES__ = {
      totalWrites: 0,
      byCategory: {},
      lastUpdatedAt: null,
    };
  }
}

let writeQuotaPausedUntil = 0;
let writeQuotaDayUtc = '';
const activeWriteAbortListeners = new Set<(err: Error) => void>();

function getCurrentUtcDay(): string {
  return new Date().toISOString().split('T')[0];
}

function hydrateQuotaPauseFromStorage(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(FIRESTORE_QUOTA_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const today = getCurrentUtcDay();
    if (
      parsed &&
      parsed.dayUtc === today &&
      typeof parsed.pausedUntil === 'number' &&
      parsed.pausedUntil > Date.now()
    ) {
      writeQuotaDayUtc = parsed.dayUtc;
      writeQuotaPausedUntil = parsed.pausedUntil;
    } else {
      localStorage.removeItem(FIRESTORE_QUOTA_STORAGE_KEY);
    }
  } catch {}
}

hydrateQuotaPauseFromStorage();

export function createQuotaExceededError(label?: string): Error & { code: string } {
  const suffix = label ? ` [${label}]` : '';
  const err: any = new Error(
    `Firestore đã hết hạn mức ghi miễn phí trong ngày (resource-exhausted)${suffix}. Dữ liệu vẫn được lưu an toàn trên thiết bị và sẽ tự đồng bộ khi hạn mức được đặt lại vào ngày mai.`
  );
  err.code = 'resource-exhausted';
  return err;
}

export function isFirestoreWriteQuotaPaused(): boolean {
  const today = getCurrentUtcDay();
  if (writeQuotaDayUtc && writeQuotaDayUtc !== today) {
    writeQuotaPausedUntil = 0;
    writeQuotaDayUtc = '';
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(FIRESTORE_QUOTA_STORAGE_KEY);
      }
    } catch {}
    return false;
  }
  return writeQuotaPausedUntil > Date.now();
}

export function clearFirestoreWriteQuotaPause(): void {
  writeQuotaPausedUntil = 0;
  writeQuotaDayUtc = '';
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(FIRESTORE_QUOTA_STORAGE_KEY);
    }
  } catch {}
}

function markFirestoreWriteQuotaExceeded(reason?: string): void {
  const today = getCurrentUtcDay();
  writeQuotaDayUtc = today;
  writeQuotaPausedUntil = Date.now() + FIRESTORE_QUOTA_COOLDOWN_MS;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(
        FIRESTORE_QUOTA_STORAGE_KEY,
        JSON.stringify({ dayUtc: today, pausedUntil: writeQuotaPausedUntil, reason: reason || '' })
      );
    }
  } catch {}
  const quotaErr = createQuotaExceededError();
  activeWriteAbortListeners.forEach((abortFn) => {
    try {
      abortFn(quotaErr);
    } catch {}
  });
}

function isQuotaExceededErrorOrMessage(input: unknown): boolean {
  const code = String((input as any)?.code || '').toLowerCase();
  const msg = String(
    input instanceof Error ? input.message : (input as any)?.message || input || ''
  ).toLowerCase();
  return (
    code === 'resource-exhausted' ||
    msg.includes('resource-exhausted') ||
    msg.includes('quota limit exceeded') ||
    msg.includes('free daily write units')
  );
}

try {
  onLog(
    (params) => {
      if (params.level === 'error' || params.level === 'warn') {
        if (
          isQuotaExceededErrorOrMessage(params.message) ||
          params.args.some((arg) => isQuotaExceededErrorOrMessage(arg))
        ) {
          markFirestoreWriteQuotaExceeded(params.message);
        }
      }
    },
    { level: 'warn' }
  );
} catch {}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const err: any = new Error(`Thao tác đồng bộ "${label}" quá thời gian chờ (${Math.round(timeoutMs / 1000)}s).`);
      err.code = 'deadline-exceeded';
      reject(err);
    }, timeoutMs);

    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function withWriteTimeout<T>(
  opFactory: () => Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  if (isFirestoreWriteQuotaPaused()) {
    return Promise.reject(createQuotaExceededError(label));
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      activeWriteAbortListeners.delete(abortOnQuota);
    };

    const abortOnQuota = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(createQuotaExceededError(label));
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      const err: any = new Error(
        `Thao tác đồng bộ "${label}" quá thời gian chờ (${Math.round(timeoutMs / 1000)}s).`
      );
      err.code = 'deadline-exceeded';
      reject(err);
    }, timeoutMs);

    activeWriteAbortListeners.add(abortOnQuota);

    let promise: Promise<T>;
    try {
      promise = opFactory();
    } catch (syncErr) {
      if (!settled) {
        settled = true;
        cleanup();
        if (isQuotaExceededErrorOrMessage(syncErr)) {
          markFirestoreWriteQuotaExceeded(syncErr instanceof Error ? syncErr.message : String(syncErr));
          reject(createQuotaExceededError(label));
        } else {
          reject(syncErr);
        }
      }
      return;
    }

    promise.then(
      (val) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(val);
      },
      (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (isQuotaExceededErrorOrMessage(err)) {
          markFirestoreWriteQuotaExceeded(err instanceof Error ? err.message : String(err));
          reject(createQuotaExceededError(label));
        } else {
          reject(err);
        }
      }
    );
  });
}

function isTransientFirestoreError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const code = String((error as any)?.code || '').toLowerCase();
  return (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'aborted' ||
    code === 'resource-exhausted' ||
    code === 'internal' ||
    code === 'unknown' ||
    code.includes('network')
  );
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  let index = 0;
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (index < items.length) {
        const current = items[index++];
        await worker(current);
      }
    })
  );
}

export async function testFirestoreConnection(): Promise<void> {
  try {
    await withTimeout(
      getDocFromServer(doc(db, 'test', 'connection')),
      10000,
      'testConnection'
    );
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
      // Save user profile info in Firestore (non-blocking if quota exceeded)
      const userDocRef = doc(db, 'users', result.user.uid);
      await withWriteTimeout(
        () => {
          recordFirestoreWrite('users', 1);
          return setDoc(
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
        },
        8000,
        'saveUserProfile'
      ).catch((profileErr) => {
        console.warn('[Auth] Could not update user profile doc:', profileErr);
      });
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
    const snapshot = await withTimeout(getDocs(colRef), FIRESTORE_READ_TIMEOUT_MS, 'loadCharacters');
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
    await withWriteTimeout(
      () => {
        recordFirestoreWrite('characters', 1);
        return setDoc(docRef, cleanData, { merge: true });
      },
      FIRESTORE_WRITE_TIMEOUT_MS,
      'saveCharacter'
    );
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
      const snap = await withTimeout(getDocs(q), FIRESTORE_READ_TIMEOUT_MS, 'findDuplicateChar');
      snap.forEach((docSnap) => {
        refsToDelete.set(docSnap.id, docSnap.ref);
      });
    }

    const refs = Array.from(refsToDelete.values());
    if (refs.length === 0) return;

    const chunkSize = 500;
    for (let i = 0; i < refs.length; i += chunkSize) {
      const chunkRefs = refs.slice(i, i + chunkSize);
      await withWriteTimeout(
        () => {
          const batch = writeBatch(db);
          chunkRefs.forEach((ref) => batch.delete(ref));
          recordFirestoreWrite('characters:delete', chunkRefs.length);
          return batch.commit();
        },
        FIRESTORE_WRITE_TIMEOUT_MS,
        'deleteCharacterBatch'
      );
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
      const snapshot = await withTimeout(
        getDocs(collection(db, 'users', userId, 'characters')),
        FIRESTORE_READ_TIMEOUT_MS,
        'listCharsForBatchDelete'
      );
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
      const chunkRefs = refs.slice(i, i + chunkSize);
      await withWriteTimeout(
        () => {
          const batch = writeBatch(db);
          chunkRefs.forEach((ref) => batch.delete(ref));
          recordFirestoreWrite('characters:deleteBatch', chunkRefs.length);
          return batch.commit();
        },
        FIRESTORE_WRITE_TIMEOUT_MS,
        'deleteCharsBatch'
      );
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export interface CharacterBatchSaveResult {
  attempted: number;
  succeededIds: string[];
  succeededHanzi: string[];
  failedDocs: Array<{ id: string; hanzi: string; code: string; reason: string }>;
  skippedInvalid: Array<{ id: string; hanzi: string }>;
}

/**
 * Saves a batch of characters to Cloud Firestore (max 400 per batch).
 * Validates and safely repairs each document before writing, and falls back to
 * per-document writes if a batch is rejected so valid records still reach Cloud.
 */
export async function saveCharactersBatchToCloud(
  userId: string,
  characters: Character[]
): Promise<CharacterBatchSaveResult> {
  const result: CharacterBatchSaveResult = {
    attempted: characters.length,
    succeededIds: [],
    succeededHanzi: [],
    failedDocs: [],
    skippedInvalid: [],
  };
  if (characters.length === 0) return result;

  const preparedDocs: Array<{ docId: string; hanzi: string; payload: Record<string, any> }> = [];
  for (const c of characters) {
    const payload = prepareCharacterPayloadForCloud(c, userId);
    if (payload) {
      preparedDocs.push({
        docId: payload.id,
        hanzi: payload.hanzi,
        payload,
      });
    } else {
      result.skippedInvalid.push({
        id: String(c?.id || ''),
        hanzi: String(c?.hanzi || ''),
      });
    }
  }

  if (preparedDocs.length === 0) return result;

  const path = `users/${userId}/characters`;
  const chunkSize = 400;
  let lastError: unknown = null;

  for (let i = 0; i < preparedDocs.length; i += chunkSize) {
    const chunk = preparedDocs.slice(i, i + chunkSize);
    try {
      await withWriteTimeout(
        () => {
          const batch = writeBatch(db);
          chunk.forEach((item) => {
            const docRef = doc(db, 'users', userId, 'characters', item.docId);
            batch.set(docRef, item.payload, { merge: true });
          });
          recordFirestoreWrite('characters:batch', chunk.length);
          return batch.commit();
        },
        FIRESTORE_WRITE_TIMEOUT_MS,
        'saveCharactersBatch'
      );
      chunk.forEach((item) => {
        result.succeededIds.push(item.docId);
        result.succeededHanzi.push(item.hanzi);
      });
    } catch (batchErr: any) {
      lastError = batchErr;
      if (isTransientFirestoreError(batchErr)) {
        console.warn(
          `[CloudSync] Batch commit skipped per-doc fallback due to transient/network error (${batchErr?.code || 'unknown'}):`,
          batchErr?.message || batchErr
        );
        chunk.forEach((item) => {
          result.failedDocs.push({
            id: item.docId,
            hanzi: item.hanzi,
            code: String(batchErr?.code || 'unavailable'),
            reason: batchErr instanceof Error ? batchErr.message : String(batchErr),
          });
        });
        break;
      }

      console.warn(
        `[CloudSync] Batch commit failed (${batchErr?.code || 'unknown'}: ${batchErr?.message || batchErr}). Falling back to concurrent per-document writes for ${chunk.length} characters...`
      );

      await runWithConcurrency(chunk, FIRESTORE_FALLBACK_CONCURRENCY, async (item) => {
        try {
          const docRef = doc(db, 'users', userId, 'characters', item.docId);
          await withWriteTimeout(
            () => {
              recordFirestoreWrite('characters:fallbackDoc', 1);
              return setDoc(docRef, item.payload, { merge: true });
            },
            FIRESTORE_WRITE_TIMEOUT_MS,
            `saveChar:${item.hanzi}`
          );
          result.succeededIds.push(item.docId);
          result.succeededHanzi.push(item.hanzi);
        } catch (docErr: any) {
          lastError = docErr;
          result.failedDocs.push({
            id: item.docId,
            hanzi: item.hanzi,
            code: String(docErr?.code || ''),
            reason: docErr instanceof Error ? docErr.message : String(docErr),
          });
        }
      });
    }
  }

  if (result.failedDocs.length > 0) {
    console.error(
      `[CloudSync] ${result.failedDocs.length} character document(s) failed during write under ${path}:`,
      JSON.stringify(result.failedDocs)
    );
  }

  if (result.succeededIds.length === 0 && lastError) {
    handleFirestoreError(lastError, OperationType.WRITE, path);
  }

  return result;
}

/**
 * Loads custom word lists from Cloud Firestore
 */
export async function loadWordListsFromCloud(userId: string): Promise<WordList[]> {
  const path = `users/${userId}/wordLists`;
  try {
    const colRef = collection(db, 'users', userId, 'wordLists');
    const snapshot = await withTimeout(getDocs(colRef), FIRESTORE_READ_TIMEOUT_MS, 'loadWordLists');
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

function isValidAsciiIdClient(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id);
}

function prepareWordListPayloadForCloud(list: WordList, userId: string): Record<string, any> | null {
  if (!list || typeof list !== 'object') return null;
  const id = typeof list.id === 'string' ? list.id.trim() : '';
  if (!isValidAsciiIdClient(id)) return null;
  const name = typeof list.name === 'string' ? truncateStringSafe(list.name.trim(), 100) : '';
  if (!name) return null;

  const now = Date.now();
  const payload: Record<string, any> = {
    id,
    userId,
    name,
    createdAt: isFiniteNum(list.createdAt) && list.createdAt >= 0 ? list.createdAt : now,
    updatedAt: now,
  };

  if (typeof list.description === 'string') {
    payload.description = truncateStringSafe(list.description, 500);
  }
  if (typeof list.icon === 'string') {
    payload.icon = truncateStringSafe(list.icon, 64);
  }
  if (typeof list.color === 'string') {
    payload.color = truncateStringSafe(list.color, 64);
  }
  if (typeof list.isPredefined === 'boolean') {
    payload.isPredefined = list.isPredefined;
  }

  return sanitizeForFirestore(payload);
}

/**
 * Saves custom word lists to Cloud Firestore
 */
export async function saveWordListsToCloud(userId: string, wordLists: WordList[]): Promise<void> {
  if (wordLists.length === 0) return;
  const prepared = wordLists
    .map((list) => ({ id: list.id, payload: prepareWordListPayloadForCloud(list, userId) }))
    .filter((item): item is { id: string; payload: Record<string, any> } => Boolean(item.payload));

  if (prepared.length === 0) return;

  const path = `users/${userId}/wordLists`;
  try {
    await withWriteTimeout(
      () => {
        const batch = writeBatch(db);
        prepared.forEach((item) => {
          const docRef = doc(db, 'users', userId, 'wordLists', item.id);
          batch.set(docRef, item.payload, { merge: true });
        });
        recordFirestoreWrite('wordLists:batch', prepared.length);
        return batch.commit();
      },
      FIRESTORE_WRITE_TIMEOUT_MS,
      'saveWordListsBatch'
    );
  } catch (batchErr) {
    if (isTransientFirestoreError(batchErr)) {
      handleFirestoreError(batchErr, OperationType.WRITE, path);
      return;
    }
    console.warn('[CloudSync] WordLists batch failed, falling back to concurrent per-doc:', batchErr);
    let succeeded = 0;
    let lastError: unknown = batchErr;
    await runWithConcurrency(prepared, FIRESTORE_FALLBACK_CONCURRENCY, async (item) => {
      try {
        const docRef = doc(db, 'users', userId, 'wordLists', item.id);
        await withWriteTimeout(
          () => {
            recordFirestoreWrite('wordLists:fallbackDoc', 1);
            return setDoc(docRef, item.payload, { merge: true });
          },
          FIRESTORE_WRITE_TIMEOUT_MS,
          `saveWordList:${item.id}`
        );
        succeeded++;
      } catch (docErr) {
        lastError = docErr;
        console.warn(`[CloudSync] Failed saving wordList ${item.id}:`, docErr);
      }
    });
    if (succeeded === 0 && lastError) {
      handleFirestoreError(lastError, OperationType.WRITE, path);
    }
  }
}

/**
 * Loads user stats from Cloud Firestore
 */
export async function loadUserStatsFromCloud(userId: string): Promise<UserStats | null> {
  const path = `users/${userId}/stats/main`;
  try {
    const docRef = doc(db, 'users', userId, 'stats', 'main');
    const snap = await withTimeout(getDoc(docRef), FIRESTORE_READ_TIMEOUT_MS, 'loadUserStats');
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
  const todayStr = new Date().toISOString().split('T')[0];
  const rawDate = typeof stats?.lastStudyDate === 'string' ? stats.lastStudyDate.trim() : '';
  const validDate = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(rawDate) ? rawDate : todayStr;

  const cleanStats = sanitizeForFirestore({
    userId,
    totalSaved: isFiniteNum(stats?.totalSaved) ? clampNum(Math.round(stats.totalSaved), 0, 1000000) : 0,
    totalMastered: isFiniteNum(stats?.totalMastered) ? clampNum(Math.round(stats.totalMastered), 0, 1000000) : 0,
    totalReviews: isFiniteNum(stats?.totalReviews) ? clampNum(Math.round(stats.totalReviews), 0, 10000000) : 0,
    accuracy: isFiniteNum(stats?.accuracy) ? clampNum(stats.accuracy, 0, 100) : 0,
    streakDays: isFiniteNum(stats?.streakDays) ? clampNum(Math.round(stats.streakDays), 0, 100000) : 0,
    lastStudyDate: validDate,
    totalStudyTimeSeconds: isFiniteNum(stats?.totalStudyTimeSeconds)
      ? clampNum(Math.round(stats.totalStudyTimeSeconds), 0, 1000000000)
      : 0,
    updatedAt: Date.now(),
  });

  try {
    const docRef = doc(db, 'users', userId, 'stats', 'main');
    await withWriteTimeout(
      () => {
        recordFirestoreWrite('stats', 1);
        return setDoc(docRef, cleanStats, { merge: true });
      },
      FIRESTORE_WRITE_TIMEOUT_MS,
      'saveUserStats'
    );
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

const VALID_STUDY_MODES = new Set<string>([
  'smart_daily',
  'quick_flashcard',
  'stroke_writing',
  'weakness',
  'random_test',
  'sentence_cloze',
  'compound_words',
  'compound_expansion',
  'custom_list',
]);

function compactSessionForCloud(userId: string, session: SavedStudySession): Record<string, any> | null {
  if (!session || !isValidAsciiIdClient(session.id) || !VALID_STUDY_MODES.has(session.mode)) {
    return null;
  }
  const questions = Array.isArray(session.questions)
    ? session.questions.slice(0, 2000).map(compactQuestionForCloud)
    : [];
  if (questions.length === 0) return null;

  const now = Date.now();
  const safeLimit =
    session.questionLimit === 'all'
      ? 'all'
      : isFiniteNum(session.questionLimit)
      ? clampNum(Math.round(session.questionLimit), 1, 5000)
      : 'all';

  return sanitizeForFirestore({
    id: session.id,
    userId,
    mode: session.mode,
    selectedListId:
      typeof session.selectedListId === 'string'
        ? truncateStringSafe(session.selectedListId, 128)
        : null,
    questionLimit: safeLimit,
    questions,
    currentIndex: isFiniteNum(session.currentIndex)
      ? clampNum(Math.round(session.currentIndex), 0, questions.length)
      : 0,
    correctCount: isFiniteNum(session.correctCount)
      ? clampNum(Math.round(session.correctCount), 0, 5000)
      : 0,
    incorrectCount: isFiniteNum(session.incorrectCount)
      ? clampNum(Math.round(session.incorrectCount), 0, 5000)
      : 0,
    sessionResults: Array.isArray(session.sessionResults)
      ? session.sessionResults.slice(0, 5000).map(compactResultForCloud)
      : [],
    elapsedMs: isFiniteNum(session.elapsedMs) ? clampNum(session.elapsedMs, 0, 864000000) : 0,
    createdAt: isFiniteNum(session.createdAt) && session.createdAt > 0 ? session.createdAt : now,
    updatedAt: isFiniteNum(session.updatedAt) && session.updatedAt > 0 ? session.updatedAt : now,
  });
}

export async function loadSavedSessionsFromCloud(
  userId: string,
  allCharacters: Character[]
): Promise<SavedStudySession[]> {
  const path = `users/${userId}/savedSessions`;
  try {
    const colRef = collection(db, 'users', userId, 'savedSessions');
    const snapshot = await withTimeout(getDocs(colRef), FIRESTORE_READ_TIMEOUT_MS, 'loadSavedSessions');
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
  const payload = compactSessionForCloud(userId, session);
  if (!payload) return;
  const path = `users/${userId}/savedSessions/${session.id}`;
  try {
    const docRef = doc(db, 'users', userId, 'savedSessions', session.id);
    await withWriteTimeout(
      () => {
        recordFirestoreWrite('savedSessions', 1);
        return setDoc(docRef, payload, { merge: false });
      },
      FIRESTORE_WRITE_TIMEOUT_MS,
      `saveSession:${session.id}`
    );
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
    await withWriteTimeout(
      () => {
        recordFirestoreWrite('savedSessions:delete', 1);
        return deleteDoc(docRef);
      },
      FIRESTORE_WRITE_TIMEOUT_MS,
      `deleteSession:${sessionId}`
    );
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
    const snap = await withTimeout(
      getDocs(query(colRef, limit(MAX_WRITE_BATCH_OPS))),
      FIRESTORE_READ_TIMEOUT_MS,
      `listReset:${subcollectionName}`
    );
    if (snap.empty) break;

    await withWriteTimeout(
      () => {
        const batch = writeBatch(db);
        snap.docs.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        recordFirestoreWrite(`reset:${subcollectionName}`, snap.docs.length);
        return batch.commit();
      },
      FIRESTORE_WRITE_TIMEOUT_MS,
      `resetDelete:${subcollectionName}`
    );
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
  const prepared = sessions
    .map((s) => ({ id: s.id, payload: compactSessionForCloud(userId, s) }))
    .filter((item): item is { id: string; payload: Record<string, any> } => Boolean(item.payload));

  if (prepared.length === 0) return;

  const path = `users/${userId}/savedSessions`;
  try {
    await withWriteTimeout(
      () => {
        const batch = writeBatch(db);
        prepared.forEach((item) => {
          const docRef = doc(db, 'users', userId, 'savedSessions', item.id);
          batch.set(docRef, item.payload, { merge: false });
        });
        recordFirestoreWrite('savedSessions:batch', prepared.length);
        return batch.commit();
      },
      FIRESTORE_WRITE_TIMEOUT_MS,
      'saveSavedSessionsBatch'
    );
  } catch (batchErr) {
    if (isTransientFirestoreError(batchErr)) {
      handleFirestoreError(batchErr, OperationType.WRITE, path);
      return;
    }
    console.warn('[CloudSync] SavedSessions batch failed, falling back to concurrent per-doc:', batchErr);
    let succeeded = 0;
    let lastError: unknown = batchErr;
    await runWithConcurrency(prepared, FIRESTORE_FALLBACK_CONCURRENCY, async (item) => {
      try {
        const docRef = doc(db, 'users', userId, 'savedSessions', item.id);
        await withWriteTimeout(
          () => {
            recordFirestoreWrite('savedSessions:fallbackDoc', 1);
            return setDoc(docRef, item.payload, { merge: false });
          },
          FIRESTORE_WRITE_TIMEOUT_MS,
          `saveSession:${item.id}`
        );
        succeeded++;
      } catch (docErr) {
        lastError = docErr;
        console.warn(`[CloudSync] Failed saving session ${item.id}:`, docErr);
      }
    });
    if (succeeded === 0 && lastError) {
      handleFirestoreError(lastError, OperationType.WRITE, path);
    }
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
  if (!uid || count <= 0 || isFirestoreWriteQuotaPaused()) return;
  const today = new Date().toISOString().split('T')[0];
  const docRef = doc(db, 'users', uid, 'usage', today);
  try {
    const snap = await withTimeout(getDoc(docRef), FIRESTORE_READ_TIMEOUT_MS, 'readDailyAIUsage');
    const prev = snap.exists() ? (snap.data() as DailyAIUsage) : null;
    const payload: DailyAIUsage = {
      userId: uid,
      date: today,
      enrichCount: (prev?.enrichCount || 0) + (type === 'enrich' ? count : 0),
      mnemonicCount: (prev?.mnemonicCount || 0) + (type === 'mnemonic' ? count : 0),
      limit: prev?.limit || 150,
      updatedAt: Date.now(),
    };
    await withWriteTimeout(
      () => {
        recordFirestoreWrite('usage', 1);
        return setDoc(docRef, sanitizeForFirestore(payload), { merge: true });
      },
      8000,
      'trackDailyAIUsage'
    );
  } catch (err) {
    console.warn('[Usage] trackDailyAIUsage failed:', err);
  }
}

