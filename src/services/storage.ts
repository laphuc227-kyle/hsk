import { Character, WordList, ReviewLog, UserStats, SavedStudySession } from '../types';
import { INITIAL_CHARACTERS, INITIAL_WORD_LISTS, DEFAULT_SRS } from './dictionary';
import { lookupBuiltIn } from './builtInDictionary';

const KEYS = {
  CHARACTERS: 'hanzi_tutor_characters_v2',
  WORD_LISTS: 'hanzi_tutor_lists_v2',
  REVIEW_LOGS: 'hanzi_tutor_logs_v2',
  USER_STATS: 'hanzi_tutor_stats_v2',
  SAVED_SESSIONS: 'hanzi_tutor_saved_sessions_v1',
  OWNER_UID: 'hanzi_tutor_owner_uid_v1',
  PENDING_CLOUD_DELETES: 'hanzi_tutor_pending_cloud_deletes_v1',
  PENDING_CLOUD_UPSERTS: 'hanzi_tutor_pending_cloud_upserts_v1',
  PENDING_CLOUD_SESSION_DELETES: 'hanzi_tutor_pending_cloud_session_deletes_v1',
  PENDING_CLOUD_SESSION_UPSERTS: 'hanzi_tutor_pending_cloud_session_upserts_v1',
  CLOUD_SYNC_SNAPSHOT: 'hanzi_tutor_cloud_sync_snapshot_v1',
  DISMISSED_COMPOUNDS: 'hanzi_tutor_dismissed_compounds_v1',
};

export interface PendingCloudDeleteItem {
  id: string;
  hanzi: string;
  deletedAt: number;
}

export interface PendingCloudUpsertItem {
  id: string;
  hanzi: string;
  updatedAt: number;
}

export interface PendingCloudSessionDeleteItem {
  id: string;
  deletedAt: number;
}

export interface PendingCloudSessionUpsertItem {
  id: string;
  updatedAt: number;
}

export interface CloudSyncSnapshot {
  hasSyncedOnce: boolean;
  charHanzi: string[];
  listIds: string[];
  sessionIds: string[];
  syncedAt: number;
}

const INITIAL_CHAR_BY_ID = new Map(INITIAL_CHARACTERS.map((c) => [c.id, c]));
const INITIAL_WORD_LIST_IDS = new Set(INITIAL_WORD_LISTS.map((l) => l.id));

export function isUntouchedStarterCharacter(char: Character): boolean {
  const starter = INITIAL_CHAR_BY_ID.get(char.id);
  if (!starter) return false;
  const reviews = (char.srs?.totalCorrect || 0) + (char.srs?.totalIncorrect || 0);
  return (
    reviews === 0 &&
    !char.srs?.lastReviewedAt &&
    (char.srs?.repetitions || 0) === 0 &&
    (!char.aiMnemonics || char.aiMnemonics.length === 0) &&
    (char.customNotes || '') === (starter.customNotes || '') &&
    char.meaning === starter.meaning &&
    char.pinyin === starter.pinyin
  );
}

export function isPredefinedWordList(list: WordList): boolean {
  return Boolean(list.isPredefined || INITIAL_WORD_LIST_IDS.has(list.id));
}

export function getStorageOwnerUid(): string | null {
  try {
    return localStorage.getItem(KEYS.OWNER_UID);
  } catch {
    return null;
  }
}

export function setStorageOwnerUid(uid: string | null): void {
  try {
    if (uid) {
      localStorage.setItem(KEYS.OWNER_UID, uid);
    } else {
      localStorage.removeItem(KEYS.OWNER_UID);
    }
  } catch (e) {
    console.warn('Error updating storage owner UID:', e);
  }
}

function readPendingDeletesMap(): Record<string, PendingCloudDeleteItem[]> {
  try {
    const raw = localStorage.getItem(KEYS.PENDING_CLOUD_DELETES);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writePendingDeletesMap(map: Record<string, PendingCloudDeleteItem[]>): void {
  try {
    localStorage.setItem(KEYS.PENDING_CLOUD_DELETES, JSON.stringify(map));
  } catch (e) {
    console.warn('Error persisting pending cloud deletes:', e);
  }
}

export function getPendingCloudDeletes(uid: string): PendingCloudDeleteItem[] {
  if (!uid) return [];
  const map = readPendingDeletesMap();
  const list = map[uid];
  return Array.isArray(list) ? list : [];
}

export function addPendingCloudDelete(
  uid: string,
  item: { id: string; hanzi: string }
): PendingCloudDeleteItem[] {
  if (!uid || (!item.id && !item.hanzi)) return [];
  const map = readPendingDeletesMap();
  const existing = Array.isArray(map[uid]) ? map[uid] : [];
  const filtered = existing.filter(
    (entry) => entry.id !== item.id && !(item.hanzi && entry.hanzi === item.hanzi)
  );
  const next: PendingCloudDeleteItem[] = [
    ...filtered,
    { id: item.id, hanzi: item.hanzi, deletedAt: Date.now() },
  ];
  map[uid] = next;
  writePendingDeletesMap(map);
  return next;
}

export function removePendingCloudDeletes(
  uid: string,
  items: Array<{ id?: string; hanzi?: string }>
): void {
  if (!uid || items.length === 0) return;
  const map = readPendingDeletesMap();
  const existing = Array.isArray(map[uid]) ? map[uid] : [];
  if (existing.length === 0) return;

  const ids = new Set(items.map((i) => i.id).filter(Boolean));
  const hanziSet = new Set(items.map((i) => i.hanzi).filter(Boolean));
  const next = existing.filter((entry) => !ids.has(entry.id) && !hanziSet.has(entry.hanzi));
  if (next.length === 0) {
    delete map[uid];
  } else {
    map[uid] = next;
  }
  writePendingDeletesMap(map);
}

export function clearPendingCloudDeletes(uid?: string): void {
  if (!uid) {
    try {
      localStorage.removeItem(KEYS.PENDING_CLOUD_DELETES);
    } catch {}
    return;
  }
  const map = readPendingDeletesMap();
  if (uid in map) {
    delete map[uid];
    writePendingDeletesMap(map);
  }
}

function readPendingUpsertsMap(): Record<string, PendingCloudUpsertItem[]> {
  try {
    const raw = localStorage.getItem(KEYS.PENDING_CLOUD_UPSERTS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writePendingUpsertsMap(map: Record<string, PendingCloudUpsertItem[]>): void {
  try {
    localStorage.setItem(KEYS.PENDING_CLOUD_UPSERTS, JSON.stringify(map));
  } catch (e) {
    console.warn('Error persisting pending cloud upserts:', e);
  }
}

export function getPendingCloudUpserts(uid: string): PendingCloudUpsertItem[] {
  if (!uid) return [];
  const map = readPendingUpsertsMap();
  const list = map[uid];
  return Array.isArray(list) ? list : [];
}

export function addPendingCloudUpserts(
  uid: string,
  items: Array<{ id: string; hanzi: string }>
): PendingCloudUpsertItem[] {
  if (!uid || items.length === 0) return [];
  const map = readPendingUpsertsMap();
  const existing = Array.isArray(map[uid]) ? map[uid] : [];
  const byHanziOrId = new Map<string, PendingCloudUpsertItem>();
  existing.forEach((entry) => {
    const key = entry.hanzi || entry.id;
    if (key) byHanziOrId.set(key, entry);
  });
  const now = Date.now();
  items.forEach((item) => {
    const key = item.hanzi || item.id;
    if (!key) return;
    byHanziOrId.set(key, {
      id: item.id,
      hanzi: item.hanzi,
      updatedAt: now,
    });
  });
  const next = Array.from(byHanziOrId.values());
  map[uid] = next;
  writePendingUpsertsMap(map);
  return next;
}

export function removePendingCloudUpserts(
  uid: string,
  items: Array<{ id?: string; hanzi?: string }>
): void {
  if (!uid || items.length === 0) return;
  const map = readPendingUpsertsMap();
  const existing = Array.isArray(map[uid]) ? map[uid] : [];
  if (existing.length === 0) return;

  const ids = new Set(items.map((i) => i.id).filter(Boolean));
  const hanziSet = new Set(items.map((i) => i.hanzi).filter(Boolean));
  const next = existing.filter((entry) => !ids.has(entry.id) && !hanziSet.has(entry.hanzi));
  if (next.length === 0) {
    delete map[uid];
  } else {
    map[uid] = next;
  }
  writePendingUpsertsMap(map);
}

export function clearPendingCloudUpserts(uid?: string): void {
  if (!uid) {
    try {
      localStorage.removeItem(KEYS.PENDING_CLOUD_UPSERTS);
    } catch {}
    return;
  }
  const map = readPendingUpsertsMap();
  if (uid in map) {
    delete map[uid];
    writePendingUpsertsMap(map);
  }
}

function readCloudSyncSnapshotMap(): Record<string, CloudSyncSnapshot> {
  try {
    const raw = localStorage.getItem(KEYS.CLOUD_SYNC_SNAPSHOT);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeCloudSyncSnapshotMap(map: Record<string, CloudSyncSnapshot>): void {
  try {
    localStorage.setItem(KEYS.CLOUD_SYNC_SNAPSHOT, JSON.stringify(map));
  } catch (e) {
    console.warn('Error saving cloud sync snapshot:', e);
  }
}

export function getCloudSyncSnapshot(uid: string): CloudSyncSnapshot | null {
  if (!uid) return null;
  const map = readCloudSyncSnapshotMap();
  return map[uid] || null;
}

export function saveCloudSyncSnapshot(uid: string, snapshot: CloudSyncSnapshot): void {
  if (!uid) return;
  const map = readCloudSyncSnapshotMap();
  map[uid] = {
    hasSyncedOnce: Boolean(snapshot.hasSyncedOnce),
    charHanzi: Array.from(new Set(snapshot.charHanzi || [])),
    listIds: Array.from(new Set(snapshot.listIds || [])),
    sessionIds: Array.from(new Set(snapshot.sessionIds || [])),
    syncedAt: snapshot.syncedAt || Date.now(),
  };
  writeCloudSyncSnapshotMap(map);
}

export function addHanziToCloudSyncSnapshot(uid: string, hanziList: string[]): void {
  if (!uid || hanziList.length === 0) return;
  const map = readCloudSyncSnapshotMap();
  const prev = map[uid];
  map[uid] = {
    hasSyncedOnce: prev?.hasSyncedOnce ?? true,
    charHanzi: Array.from(new Set([...(prev?.charHanzi || []), ...hanziList.filter(Boolean)])),
    listIds: prev?.listIds || [],
    sessionIds: prev?.sessionIds || [],
    syncedAt: Date.now(),
  };
  writeCloudSyncSnapshotMap(map);
}

export function removeHanziFromCloudSyncSnapshot(uid: string, hanzi: string): void {
  if (!uid || !hanzi) return;
  const map = readCloudSyncSnapshotMap();
  const snap = map[uid];
  if (!snap) return;
  snap.charHanzi = (snap.charHanzi || []).filter((h) => h !== hanzi);
  map[uid] = snap;
  writeCloudSyncSnapshotMap(map);
}

export function clearCloudSyncSnapshot(uid?: string): void {
  if (!uid) {
    try {
      localStorage.removeItem(KEYS.CLOUD_SYNC_SNAPSHOT);
    } catch {}
    return;
  }
  const map = readCloudSyncSnapshotMap();
  if (uid in map) {
    delete map[uid];
    writeCloudSyncSnapshotMap(map);
  }
}

export function addSessionIdsToCloudSyncSnapshot(uid: string, sessionIds: string[]): void {
  if (!uid || sessionIds.length === 0) return;
  const map = readCloudSyncSnapshotMap();
  const prev = map[uid];
  map[uid] = {
    hasSyncedOnce: prev?.hasSyncedOnce ?? true,
    charHanzi: prev?.charHanzi || [],
    listIds: prev?.listIds || [],
    sessionIds: Array.from(new Set([...(prev?.sessionIds || []), ...sessionIds.filter(Boolean)])),
    syncedAt: Date.now(),
  };
  writeCloudSyncSnapshotMap(map);
}

export function removeSessionIdFromCloudSyncSnapshot(uid: string, sessionId: string): void {
  if (!uid || !sessionId) return;
  const map = readCloudSyncSnapshotMap();
  const snap = map[uid];
  if (!snap) return;
  snap.sessionIds = (snap.sessionIds || []).filter((id) => id !== sessionId);
  map[uid] = snap;
  writeCloudSyncSnapshotMap(map);
}

function readPendingSessionDeletesMap(): Record<string, PendingCloudSessionDeleteItem[]> {
  try {
    const raw = localStorage.getItem(KEYS.PENDING_CLOUD_SESSION_DELETES);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writePendingSessionDeletesMap(map: Record<string, PendingCloudSessionDeleteItem[]>): void {
  try {
    localStorage.setItem(KEYS.PENDING_CLOUD_SESSION_DELETES, JSON.stringify(map));
  } catch (e) {
    console.warn('Error persisting pending cloud session deletes:', e);
  }
}

export function getPendingCloudSessionDeletes(uid: string): PendingCloudSessionDeleteItem[] {
  if (!uid) return [];
  const map = readPendingSessionDeletesMap();
  const list = map[uid];
  return Array.isArray(list) ? list : [];
}

export function addPendingCloudSessionDelete(uid: string, sessionId: string): PendingCloudSessionDeleteItem[] {
  if (!uid || !sessionId) return [];
  const map = readPendingSessionDeletesMap();
  const existing = Array.isArray(map[uid]) ? map[uid] : [];
  const next: PendingCloudSessionDeleteItem[] = [
    ...existing.filter((entry) => entry.id !== sessionId),
    { id: sessionId, deletedAt: Date.now() },
  ];
  map[uid] = next;
  writePendingSessionDeletesMap(map);
  return next;
}

export function removePendingCloudSessionDeletes(uid: string, sessionIds: string[]): void {
  if (!uid || sessionIds.length === 0) return;
  const map = readPendingSessionDeletesMap();
  const existing = Array.isArray(map[uid]) ? map[uid] : [];
  if (existing.length === 0) return;
  const idSet = new Set(sessionIds.filter(Boolean));
  const next = existing.filter((entry) => !idSet.has(entry.id));
  if (next.length === 0) {
    delete map[uid];
  } else {
    map[uid] = next;
  }
  writePendingSessionDeletesMap(map);
}

export function clearPendingCloudSessionDeletes(uid?: string): void {
  if (!uid) {
    try {
      localStorage.removeItem(KEYS.PENDING_CLOUD_SESSION_DELETES);
    } catch {}
    return;
  }
  const map = readPendingSessionDeletesMap();
  if (uid in map) {
    delete map[uid];
    writePendingSessionDeletesMap(map);
  }
}

function readPendingSessionUpsertsMap(): Record<string, PendingCloudSessionUpsertItem[]> {
  try {
    const raw = localStorage.getItem(KEYS.PENDING_CLOUD_SESSION_UPSERTS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writePendingSessionUpsertsMap(map: Record<string, PendingCloudSessionUpsertItem[]>): void {
  try {
    localStorage.setItem(KEYS.PENDING_CLOUD_SESSION_UPSERTS, JSON.stringify(map));
  } catch (e) {
    console.warn('Error persisting pending cloud session upserts:', e);
  }
}

export function getPendingCloudSessionUpserts(uid: string): PendingCloudSessionUpsertItem[] {
  if (!uid) return [];
  const map = readPendingSessionUpsertsMap();
  const list = map[uid];
  return Array.isArray(list) ? list : [];
}

export function addPendingCloudSessionUpsert(
  uid: string,
  sessionId: string,
  updatedAt: number = Date.now()
): PendingCloudSessionUpsertItem[] {
  if (!uid || !sessionId) return [];
  const map = readPendingSessionUpsertsMap();
  const existing = Array.isArray(map[uid]) ? map[uid] : [];
  const next: PendingCloudSessionUpsertItem[] = [
    ...existing.filter((entry) => entry.id !== sessionId),
    { id: sessionId, updatedAt },
  ];
  map[uid] = next;
  writePendingSessionUpsertsMap(map);
  return next;
}

export function removePendingCloudSessionUpserts(uid: string, sessionIds: string[]): void {
  if (!uid || sessionIds.length === 0) return;
  const map = readPendingSessionUpsertsMap();
  const existing = Array.isArray(map[uid]) ? map[uid] : [];
  if (existing.length === 0) return;
  const idSet = new Set(sessionIds.filter(Boolean));
  const next = existing.filter((entry) => !idSet.has(entry.id));
  if (next.length === 0) {
    delete map[uid];
  } else {
    map[uid] = next;
  }
  writePendingSessionUpsertsMap(map);
}

export function clearPendingCloudSessionUpserts(uid?: string): void {
  if (!uid) {
    try {
      localStorage.removeItem(KEYS.PENDING_CLOUD_SESSION_UPSERTS);
    } catch {}
    return;
  }
  const map = readPendingSessionUpsertsMap();
  if (uid in map) {
    delete map[uid];
    writePendingSessionUpsertsMap(map);
  }
}

export function getDismissedCompounds(): string[] {
  try {
    const raw = localStorage.getItem(KEYS.DISMISSED_COMPOUNDS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function addDismissedCompound(hanzi: string): void {
  if (!hanzi || hanzi.length <= 1) return;
  try {
    const current = new Set(getDismissedCompounds());
    current.add(hanzi);
    localStorage.setItem(KEYS.DISMISSED_COMPOUNDS, JSON.stringify(Array.from(current)));
  } catch {}
}

export function removeDismissedCompound(hanzi: string): void {
  if (!hanzi) return;
  try {
    const next = getDismissedCompounds().filter((h) => h !== hanzi);
    localStorage.setItem(KEYS.DISMISSED_COMPOUNDS, JSON.stringify(next));
  } catch {}
}

// Initialize default storage if empty
export function initializeStorage(): void {
  if (!localStorage.getItem(KEYS.WORD_LISTS)) {
    localStorage.setItem(KEYS.WORD_LISTS, JSON.stringify(INITIAL_WORD_LISTS));
  }
  if (!localStorage.getItem(KEYS.CHARACTERS)) {
    localStorage.setItem(KEYS.CHARACTERS, JSON.stringify(INITIAL_CHARACTERS));
  }
  if (!localStorage.getItem(KEYS.USER_STATS)) {
    const initialStats: UserStats = {
      totalSaved: INITIAL_CHARACTERS.length,
      totalMastered: 0,
      totalReviews: 0,
      accuracy: 0,
      streakDays: 1,
      lastStudyDate: new Date().toISOString().split('T')[0],
      totalStudyTimeSeconds: 0,
    };
    localStorage.setItem(KEYS.USER_STATS, JSON.stringify(initialStats));
  }
}

function sanitizeExamples(examples?: any[]) {
  if (!Array.isArray(examples) || examples.length === 0) return examples || [];
  return examples.map((ex) => ({
    ...ex,
    sentence: typeof ex.sentence === 'string'
      ? ex.sentence.replace(/[a-zA-Z]+/g, '').replace(/\s+/g, '').trim()
      : ex.sentence,
    pinyin: typeof ex.pinyin === 'string'
      ? ex.pinyin.replace(/\b(association|mnemonic|example|hanzi)\b/gi, '').replace(/\s+/g, ' ').trim()
      : ex.pinyin,
  }));
}

export function getCharacters(): Character[] {
  try {
    const data = localStorage.getItem(KEYS.CHARACTERS);
    const chars: Character[] = data ? JSON.parse(data) : INITIAL_CHARACTERS;
    let wasHealed = false;

    const healedChars = chars.map((c) => {
      let healed = { ...c };
      const isPlaceholder =
        !healed.pinyin ||
        healed.pinyin.toLowerCase() === 'pinyin' ||
        healed.pinyin === 'chưa rõ' ||
        !healed.meaning ||
        healed.meaning === 'Từ vựng mới' ||
        healed.meaning.includes('Từ vựng mới') ||
        healed.meaning.includes('Cần kết nối AI') ||
        healed.meaning.startsWith('(EN)') ||
        healed.meaning === 'Chưa có nghĩa' ||
        healed.hanViet === 'HÁN VIỆT' ||
        healed.hanViet === 'TRA CỨU MỞ RỘNG' ||
        healed.hanViet === 'CHƯA RÕ';

      if (isPlaceholder) {
        const info = lookupBuiltIn(healed.hanzi);
        if (info) {
          wasHealed = true;
          healed = {
            ...healed,
            pinyin: info.pinyin,
            hanViet: info.hanViet,
            meaning: info.meaning,
            radical: info.radical,
            strokeCount: info.strokeCount,
            components: info.components || healed.components,
            mnemonic: info.mnemonic || healed.mnemonic,
            examples: (info.examples && info.examples.length > 0) ? info.examples : healed.examples,
            compoundWords: (info.compoundWords && info.compoundWords.length > 0) ? info.compoundWords : healed.compoundWords,
          };
        }
      }

      return {
        ...healed,
        examples: sanitizeExamples(healed.examples),
      };
    });

    if (wasHealed) {
      try {
        localStorage.setItem(KEYS.CHARACTERS, JSON.stringify(healedChars));
      } catch (saveErr) {
        console.warn('Could not persist healed characters:', saveErr);
      }
    }

    return healedChars;
  } catch (e) {
    console.error('Error reading characters from storage:', e);
    return INITIAL_CHARACTERS;
  }
}

export function saveCharacters(characters: Character[]): void {
  try {
    const sanitized = characters.map((c) => ({
      ...c,
      examples: sanitizeExamples(c.examples),
    }));
    localStorage.setItem(KEYS.CHARACTERS, JSON.stringify(sanitized));
    updateStatsSummary();
  } catch (e) {
    console.error('Error saving characters to storage:', e);
  }
}

export function getWordLists(): WordList[] {
  try {
    const data = localStorage.getItem(KEYS.WORD_LISTS);
    if (!data) return INITIAL_WORD_LISTS;
    const parsed: WordList[] = JSON.parse(data);
    if (!Array.isArray(parsed) || parsed.length === 0) return INITIAL_WORD_LISTS;
    const existingIds = new Set(parsed.map((l) => l.id));
    const missingPredefined = INITIAL_WORD_LISTS.filter((pre) => !existingIds.has(pre.id));
    if (missingPredefined.length > 0) {
      const merged = [...parsed, ...missingPredefined];
      try {
        localStorage.setItem(KEYS.WORD_LISTS, JSON.stringify(merged));
      } catch {}
      return merged;
    }
    return parsed;
  } catch (e) {
    console.error('Error reading word lists:', e);
    return INITIAL_WORD_LISTS;
  }
}

export function saveWordLists(lists: WordList[]): void {
  try {
    localStorage.setItem(KEYS.WORD_LISTS, JSON.stringify(lists));
  } catch (e) {
    console.error('Error saving word lists:', e);
  }
}

export function addCharacter(character: Character): void {
  const chars = getCharacters();
  const now = Date.now();
  const existingIdx = chars.findIndex((c) => c.hanzi === character.hanzi);
  let savedChar: Character;
  if (existingIdx >= 0) {
    // Merge lists and update fields while preserving existing SRS progress
    const existing = chars[existingIdx];
    const combinedLists = Array.from(new Set([...existing.listIds, ...character.listIds]));
    savedChar = {
      ...existing,
      ...character,
      id: existing.id,
      srs: character.srs || existing.srs,
      listIds: combinedLists,
      updatedAt: now,
    };
    chars[existingIdx] = savedChar;
  } else {
    savedChar = {
      ...character,
      updatedAt: character.updatedAt || now,
    };
    chars.unshift(savedChar);
  }
  saveCharacters(chars);
  removeDismissedCompound(savedChar.hanzi);
  const ownerUid = getStorageOwnerUid();
  if (ownerUid) {
    removePendingCloudDeletes(ownerUid, [{ id: savedChar.id, hanzi: savedChar.hanzi }]);
    addPendingCloudUpserts(ownerUid, [{ id: savedChar.id, hanzi: savedChar.hanzi }]);
  }
}

export function removeCharacter(characterId: string, hanzi?: string): void {
  const all = getCharacters();
  const target = all.find((c) => c.id === characterId);
  const targetHanzi = hanzi || target?.hanzi;
  const chars = all.filter((c) => {
    if (c.id === characterId) return false;
    if (targetHanzi && c.hanzi === targetHanzi) return false;
    return true;
  });
  saveCharacters(chars);
  if (targetHanzi) {
    addDismissedCompound(targetHanzi);
  }
  const ownerUid = getStorageOwnerUid();
  if (ownerUid) {
    removePendingCloudUpserts(ownerUid, [{ id: characterId, hanzi: targetHanzi }]);
  }
}

export function getReviewLogs(): ReviewLog[] {
  try {
    const data = localStorage.getItem(KEYS.REVIEW_LOGS);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

export function addReviewLog(log: ReviewLog): void {
  const logs = getReviewLogs();
  logs.unshift(log);
  // Keep last 1000 logs
  if (logs.length > 1000) logs.pop();
  try {
    localStorage.setItem(KEYS.REVIEW_LOGS, JSON.stringify(logs));
  } catch (e) {
    console.error('Error saving review log:', e);
  }
}

export function getUserStats(): UserStats {
  try {
    const data = localStorage.getItem(KEYS.USER_STATS);
    if (data) return JSON.parse(data);
  } catch (e) {}

  return {
    totalSaved: 0,
    totalMastered: 0,
    totalReviews: 0,
    accuracy: 0,
    streakDays: 1,
    lastStudyDate: new Date().toISOString().split('T')[0],
    totalStudyTimeSeconds: 0,
  };
}

export function saveUserStats(stats: UserStats): void {
  try {
    localStorage.setItem(KEYS.USER_STATS, JSON.stringify(stats));
  } catch (e) {
    console.error('Error saving user stats:', e);
  }
}

export function updateStatsSummary(): void {
  const chars = getCharacters();
  const logs = getReviewLogs();
  const stats = getUserStats();

  const mastered = chars.filter((c) => c.srs.masteryLevel >= 80).length;
  const totalReviews = logs.length;
  const correctCount = logs.filter((l) => l.isCorrect).length;
  const accuracy = totalReviews > 0 ? Math.round((correctCount / totalReviews) * 100) : 0;

  const today = new Date().toISOString().split('T')[0];
  let streak = stats.streakDays;
  if (stats.lastStudyDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (stats.lastStudyDate === yesterday) {
      streak += 1;
    } else {
      streak = 1;
    }
  }

  saveUserStats({
    ...stats,
    totalSaved: chars.length,
    totalMastered: mastered,
    totalReviews,
    accuracy,
    streakDays: streak,
    lastStudyDate: today,
  });
}

// Backup & Restore
export function exportBackupData(): string {
  const backup = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    wordLists: getWordLists(),
    characters: getCharacters(),
    reviewLogs: getReviewLogs(),
    userStats: getUserStats(),
  };
  return JSON.stringify(backup, null, 2);
}

export function importBackupData(jsonString: string): { success: boolean; message: string } {
  try {
    const data = JSON.parse(jsonString);
    if (!data.characters || !data.wordLists) {
      return { success: false, message: 'Dữ liệu không hợp lệ. Thiếu trường bắt buộc.' };
    }

    const now = Date.now();
    const stampedChars = Array.isArray(data.characters)
      ? data.characters.map((c: any) => ({ ...c, updatedAt: now }))
      : data.characters;

    localStorage.setItem(KEYS.CHARACTERS, JSON.stringify(stampedChars));
    localStorage.setItem(KEYS.WORD_LISTS, JSON.stringify(data.wordLists));
    if (data.reviewLogs) localStorage.setItem(KEYS.REVIEW_LOGS, JSON.stringify(data.reviewLogs));
    if (data.userStats) localStorage.setItem(KEYS.USER_STATS, JSON.stringify(data.userStats));
    localStorage.removeItem(KEYS.DISMISSED_COMPOUNDS);
    const ownerUid = getStorageOwnerUid();
    if (ownerUid && Array.isArray(stampedChars)) {
      const items = stampedChars
        .filter((c: any) => c && typeof c.id === 'string' && typeof c.hanzi === 'string')
        .map((c: any) => ({ id: c.id, hanzi: c.hanzi }));
      removePendingCloudDeletes(ownerUid, items);
      addPendingCloudUpserts(ownerUid, items);
    }

    return { success: true, message: `Đã khôi phục thành công ${data.characters.length} chữ và ${data.wordLists.length} danh sách!` };
  } catch (e: any) {
    return { success: false, message: `Lỗi đọc file JSON: ${e.message}` };
  }
}

export function resetAllData(): void {
  localStorage.removeItem(KEYS.CHARACTERS);
  localStorage.removeItem(KEYS.WORD_LISTS);
  localStorage.removeItem(KEYS.REVIEW_LOGS);
  localStorage.removeItem(KEYS.USER_STATS);
  localStorage.removeItem(KEYS.SAVED_SESSIONS);
  localStorage.removeItem(KEYS.OWNER_UID);
  localStorage.removeItem(KEYS.PENDING_CLOUD_DELETES);
  localStorage.removeItem(KEYS.PENDING_CLOUD_UPSERTS);
  localStorage.removeItem(KEYS.PENDING_CLOUD_SESSION_DELETES);
  localStorage.removeItem(KEYS.PENDING_CLOUD_SESSION_UPSERTS);
  localStorage.removeItem(KEYS.CLOUD_SYNC_SNAPSHOT);
  localStorage.removeItem(KEYS.DISMISSED_COMPOUNDS);
  initializeStorage();
}

// In-progress Study Session Persistence (Resume unfinished sessions)
const MAX_SAVED_SESSIONS = 5;

export function getSavedStudySessions(): SavedStudySession[] {
  try {
    const raw = localStorage.getItem(KEYS.SAVED_SESSIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s: SavedStudySession) =>
          s &&
          typeof s.id === 'string' &&
          Array.isArray(s.questions) &&
          s.questions.length > 0 &&
          typeof s.currentIndex === 'number' &&
          s.currentIndex >= 0 &&
          s.currentIndex < s.questions.length
      )
      .sort((a: SavedStudySession, b: SavedStudySession) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (e) {
    console.error('Error reading saved study sessions:', e);
    return [];
  }
}

function persistSavedStudySessions(sessions: SavedStudySession[]): void {
  try {
    localStorage.setItem(KEYS.SAVED_SESSIONS, JSON.stringify(sessions));
  } catch (e) {
    // Handle tight storage quota gracefully by keeping only the latest session
    try {
      if (sessions.length > 1) {
        localStorage.setItem(KEYS.SAVED_SESSIONS, JSON.stringify(sessions.slice(0, 1)));
      }
    } catch (innerErr) {
      console.error('Error saving study sessions:', innerErr);
    }
  }
}

export function upsertSavedStudySession(session: SavedStudySession): SavedStudySession[] {
  const existing = getSavedStudySessions().filter((s) => s.id !== session.id);
  const next = [session, ...existing]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, MAX_SAVED_SESSIONS);
  persistSavedStudySessions(next);
  const ownerUid = getStorageOwnerUid();
  if (ownerUid && session.id) {
    removePendingCloudSessionDeletes(ownerUid, [session.id]);
    addPendingCloudSessionUpsert(ownerUid, session.id, session.updatedAt || Date.now());
  }
  return next;
}

export function removeSavedStudySession(sessionId: string): SavedStudySession[] {
  const next = getSavedStudySessions().filter((s) => s.id !== sessionId);
  persistSavedStudySessions(next);
  const ownerUid = getStorageOwnerUid();
  if (ownerUid && sessionId) {
    removePendingCloudSessionUpserts(ownerUid, [sessionId]);
    addPendingCloudSessionDelete(ownerUid, sessionId);
    removeSessionIdFromCloudSyncSnapshot(ownerUid, sessionId);
  }
  return next;
}

export function replaceSavedStudySessions(sessions: SavedStudySession[]): SavedStudySession[] {
  const valid = sessions
    .filter(
      (s) =>
        s &&
        typeof s.id === 'string' &&
        Array.isArray(s.questions) &&
        s.questions.length > 0 &&
        typeof s.currentIndex === 'number' &&
        s.currentIndex >= 0 &&
        s.currentIndex < s.questions.length
    )
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, MAX_SAVED_SESSIONS);
  persistSavedStudySessions(valid);
  return valid;
}
