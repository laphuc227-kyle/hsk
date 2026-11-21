/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sidebar } from './components/Sidebar';
import { WordListManager } from './components/WordListManager';
import { StudySession } from './components/StudySession';
import { CharacterDetailModal } from './components/CharacterDetailModal';
import { AnalyticsView } from './components/AnalyticsView';
import { GrammarView } from './components/GrammarView';
import { RadicalsView } from './components/RadicalsView';
import { SettingsModal } from './components/SettingsModal';
import { StudySetupModal } from './components/StudySetupModal';
import {
  Sparkles,
  Menu,
  Settings,
  Cloud,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  X,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { Character, WordList, UserStats, StudySessionMode, SavedStudySession } from './types';
import {
  initializeStorage,
  getCharacters,
  saveCharacters,
  getWordLists,
  saveWordLists,
  getUserStats,
  saveUserStats,
  removeCharacter,
  getSavedStudySessions,
  removeSavedStudySession,
  replaceSavedStudySessions,
  resetAllData,
  getStorageOwnerUid,
  setStorageOwnerUid,
  getPendingCloudDeletes,
  addPendingCloudDelete,
  removePendingCloudDeletes,
  getCloudSyncSnapshot,
  saveCloudSyncSnapshot,
  removeHanziFromCloudSyncSnapshot,
  getDismissedCompounds,
  isUntouchedStarterCharacter,
  isPredefinedWordList,
} from './services/storage';
import { autoCategorizeCharacters } from './services/hskClassifier';
import { syncLearnedCompoundWords } from './services/compoundWordDetector';
import {
  testFirestoreConnection,
  signInWithGoogle,
  signOutUser,
  subscribeToAuth,
  loadCharactersFromCloud,
  saveCharacterToCloud,
  deleteCharacterFromCloud,
  deleteCharactersBatchFromCloud,
  saveCharactersBatchToCloud,
  loadWordListsFromCloud,
  saveWordListsToCloud,
  loadUserStatsFromCloud,
  saveUserStatsToCloud,
  loadSavedSessionsFromCloud,
  saveSavedSessionToCloud,
  deleteSavedSessionFromCloud,
  saveSavedSessionsBatchToCloud,
  resetUserCloudData,
} from './services/firebase';

export default function App() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [wordLists, setWordLists] = useState<WordList[]>([]);
  const [stats, setStats] = useState<UserStats>({
    totalSaved: 0,
    totalMastered: 0,
    totalReviews: 0,
    accuracy: 0,
    streakDays: 1,
    lastStudyDate: new Date().toISOString().split('T')[0],
    totalStudyTimeSeconds: 0,
  });

  // Cloud Sync & Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // UI State
  const [activeView, setActiveView] = useState<'lists' | 'study' | 'analytics' | 'grammar' | 'radicals'>('lists');
  const [studyMode, setStudyMode] = useState<StudySessionMode>('smart_daily');
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Modals / Drawers
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [focusedRadicalId, setFocusedRadicalId] = useState<string | null>(null);
  const [sourceCharacterForRadical, setSourceCharacterForRadical] = useState<Character | null>(null);
  const [previousViewBeforeRadical, setPreviousViewBeforeRadical] = useState<'lists' | 'study' | 'analytics' | 'grammar' | 'radicals'>('lists');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleReturnFromRadicalToCharacter = (char: Character) => {
    setActiveView(previousViewBeforeRadical || 'lists');
    setSelectedCharacter(char);
    setFocusedRadicalId(null);
    setSourceCharacterForRadical(null);
  };

  // Study Setup Modal & Resume Session State
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [pendingStudyMode, setPendingStudyMode] = useState<StudySessionMode>('smart_daily');
  const [pendingListId, setPendingListId] = useState<string | null>(null);
  const [sessionQuestionLimit, setSessionQuestionLimit] = useState<number | 'all'>(20);
  const [savedSessions, setSavedSessions] = useState<SavedStudySession[]>([]);
  const [resumedStudySession, setResumedStudySession] = useState<SavedStudySession | null>(null);
  const [sessionInstanceKey, setSessionInstanceKey] = useState<number>(0);

  const currentUserRef = useRef<User | null>(null);
  currentUserRef.current = currentUser;
  const activeViewRef = useRef(activeView);
  activeViewRef.current = activeView;
  const lastAutoSyncAtRef = useRef<number>(0);
  const cloudSessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCloudSessionRef = useRef<SavedStudySession | null>(null);
  const cloudStatsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (
    message: string,
    type: 'success' | 'error' | 'info',
    durationMs: number = 4000
  ) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setSyncToast({ message, type });
    if (durationMs > 0) {
      toastTimerRef.current = setTimeout(() => {
        setSyncToast(null);
        toastTimerRef.current = null;
      }, durationMs);
    }
  };

  const refreshSavedSessions = () => {
    setSavedSessions(getSavedStudySessions());
  };

  const flushPendingCloudDeletes = async (userId: string): Promise<boolean> => {
    const pending = getPendingCloudDeletes(userId);
    if (pending.length === 0) return true;
    try {
      await deleteCharactersBatchFromCloud(userId, pending);
      removePendingCloudDeletes(userId, pending);
      saveUserStatsToCloud(userId, getUserStats()).catch(console.warn);
      return true;
    } catch (err) {
      console.warn('Could not flush pending cloud deletes yet:', err);
      return false;
    }
  };

  // Initialize and load data on mount, plus subscribe to Firebase Auth
  useEffect(() => {
    initializeStorage();
    const loadedChars = getCharacters();
    // Auto-sync 100% learned review compound words into all vocabulary (skipping explicitly deleted words)
    const dismissed = new Set(getDismissedCompounds());
    const { updatedCharacters } = syncLearnedCompoundWords(loadedChars, dismissed);
    const categorized = autoCategorizeCharacters(updatedCharacters);
    saveCharacters(categorized);
    setCharacters(categorized);
    setWordLists(getWordLists());
    setStats(getUserStats());
    setSavedSessions(getSavedStudySessions());

    // Verify Firestore connection non-blocking
    testFirestoreConnection();

    // Subscribe to Firebase Auth
    const unsubscribe = subscribeToAuth((user) => {
      setCurrentUser(user);
      currentUserRef.current = user;
      if (user) {
        const prevOwner = getStorageOwnerUid();
        if (prevOwner && prevOwner !== user.uid) {
          resetAllData();
          setCharacters(getCharacters());
          setWordLists(getWordLists());
          setStats(getUserStats());
          setSavedSessions([]);
          setResumedStudySession(null);
          setSelectedCharacter(null);
        }
        syncCloudData(user.uid);
      } else {
        // If browser previously held a signed-in user's data, wipe it cleanly on sign-out
        const prevOwner = getStorageOwnerUid();
        if (prevOwner) {
          if (cloudSessionTimerRef.current) clearTimeout(cloudSessionTimerRef.current);
          if (cloudStatsTimerRef.current) clearTimeout(cloudStatsTimerRef.current);
          pendingCloudSessionRef.current = null;
          resetAllData();
          setCharacters(getCharacters());
          setWordLists(getWordLists());
          setStats(getUserStats());
          setSavedSessions([]);
          setResumedStudySession(null);
          setSelectedCharacter(null);
          setSelectedListId(null);
          setActiveView('lists');
        }
      }
    });

    const handleVisibilityRefresh = () => {
      if (
        document.visibilityState === 'visible' &&
        currentUserRef.current &&
        activeViewRef.current !== 'study' &&
        Date.now() - lastAutoSyncAtRef.current > 30000
      ) {
        syncCloudData(currentUserRef.current.uid, true);
      }
    };

    const handleOnlineSync = () => {
      const uid = currentUserRef.current?.uid;
      if (!uid) return;
      const hadPending = getPendingCloudDeletes(uid).length > 0;
      flushPendingCloudDeletes(uid).then((flushed) => {
        if (hadPending && flushed) {
          showToast('Đã đồng bộ xóa từ vựng lên Cloud.', 'success', 3000);
        }
        if (activeViewRef.current !== 'study') {
          syncCloudData(uid, true);
        }
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityRefresh);
    window.addEventListener('online', handleOnlineSync);

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
      window.removeEventListener('online', handleOnlineSync);
      if (cloudSessionTimerRef.current) clearTimeout(cloudSessionTimerRef.current);
      if (cloudStatsTimerRef.current) clearTimeout(cloudStatsTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const pickFresherCharacter = (cloudChar: Character, localChar: Character) => {
    const cloudReviews = (cloudChar.srs?.totalCorrect || 0) + (cloudChar.srs?.totalIncorrect || 0);
    const localReviews = (localChar.srs?.totalCorrect || 0) + (localChar.srs?.totalIncorrect || 0);
    const cloudTime = cloudChar.srs?.lastReviewedAt || cloudChar.updatedAt || 0;
    const localTime = localChar.srs?.lastReviewedAt || localChar.updatedAt || 0;

    const mergedListIds = Array.from(
      new Set([...(cloudChar.listIds || []), ...(localChar.listIds || [])])
    );

    const localIsAhead =
      localReviews > cloudReviews || (localReviews === cloudReviews && localTime > cloudTime);

    const base = localIsAhead ? localChar : cloudChar;
    const listUpdated = mergedListIds.length > (cloudChar.listIds?.length || 0);

    return {
      winner: {
        ...base,
        id: cloudChar.id || localChar.id,
        listIds: mergedListIds,
      },
      shouldUpload: localIsAhead || listUpdated,
    };
  };

  const syncCloudData = async (userId: string, silent: boolean = false) => {
    lastAutoSyncAtRef.current = Date.now();
    setStorageOwnerUid(userId);
    setIsSyncing(true);
    if (!silent) {
      showToast('Đang kết nối và đồng bộ dữ liệu đám mây...', 'info', 0);
    }

    try {
      // Flush any offline/queued deletions before fetching Cloud state so deleted words never resurrect
      await flushPendingCloudDeletes(userId);

      const remainingPending = getPendingCloudDeletes(userId);
      const pendingDeleteIds = new Set(remainingPending.map((p) => p.id).filter(Boolean));
      const pendingDeleteHanzi = new Set(remainingPending.map((p) => p.hanzi).filter(Boolean));
      const isPendingDeleted = (c: Character) =>
        pendingDeleteIds.has(c.id) || pendingDeleteHanzi.has(c.hanzi);

      const [rawCloudChars, cloudLists, cloudStats] = await Promise.all([
        loadCharactersFromCloud(userId),
        loadWordListsFromCloud(userId),
        loadUserStatsFromCloud(userId),
      ]);

      const cloudChars = rawCloudChars.filter((c) => !isPendingDeleted(c));
      const localChars = getCharacters().filter((c) => !isPendingDeleted(c));
      const localLists = getWordLists();
      const localStats = getUserStats();
      const localSessions = getSavedStudySessions();
      const snapshot = getCloudSyncSnapshot(userId);

      const isCloudCharsListsStatsEmpty =
        cloudChars.length === 0 && cloudLists.length === 0 && cloudStats === null;

      let handledEmptyCloud = false;

      // Case 1: Cloud has no characters, wordLists, or stats
      if (isCloudCharsListsStatsEmpty) {
        const cloudSessions = await loadSavedSessionsFromCloud(userId, localChars);
        if (cloudSessions.length === 0) {
          handledEmptyCloud = true;

          if (snapshot?.hasSyncedOnce) {
            // Cloud was reset on another device/browser -> wipe stale local state instead of re-uploading
            resetAllData();
            setStorageOwnerUid(userId);
            saveCloudSyncSnapshot(userId, {
              hasSyncedOnce: true,
              charHanzi: [],
              listIds: [],
              sessionIds: [],
              syncedAt: Date.now(),
            });

            setCharacters(getCharacters());
            setWordLists(getWordLists());
            setStats(getUserStats());
            setSavedSessions([]);
            setResumedStudySession(null);
            setSelectedCharacter(null);

            if (!silent) {
              showToast('Dữ liệu Cloud đã được đặt lại. Đã cập nhật thiết bị về mặc định!', 'info', 4000);
            }
          } else {
            // First-time Cloud backup for a new account
            const sessionMap = new Map<string, SavedStudySession>();
            localSessions.forEach((ls) => {
              const existing = sessionMap.get(ls.id);
              if (!existing || (ls.updatedAt || 0) > (existing.updatedAt || 0)) {
                sessionMap.set(ls.id, ls);
              }
            });
            const mergedSessions = replaceSavedStudySessions(Array.from(sessionMap.values()));
            setSavedSessions(mergedSessions);

            await Promise.all([
              localChars.length > 0 ? saveCharactersBatchToCloud(userId, localChars) : Promise.resolve(),
              localLists.length > 0 ? saveWordListsToCloud(userId, localLists) : Promise.resolve(),
              saveUserStatsToCloud(userId, localStats),
              mergedSessions.length > 0
                ? saveSavedSessionsBatchToCloud(userId, mergedSessions)
                : Promise.resolve(),
            ]);

            saveCloudSyncSnapshot(userId, {
              hasSyncedOnce: true,
              charHanzi: localChars.map((c) => c.hanzi),
              listIds: localLists.map((l) => l.id),
              sessionIds: mergedSessions.map((s) => s.id),
              syncedAt: Date.now(),
            });

            if (!silent) {
              showToast(
                `Đã sao lưu ${localChars.length} từ vựng & tiến độ lên tài khoản Google!`,
                'success',
                4000
              );
            }
          }
        }
      }

      // Case 2: Cloud already has data -> Smart two-way merge respecting Cloud deletions & resets
      if (!handledEmptyCloud) {
        const syncedHanziSet = new Set(snapshot?.charHanzi || []);
        const syncedListIdSet = new Set(snapshot?.listIds || []);
        const syncedSessionIdSet = new Set(snapshot?.sessionIds || []);

        const cloudByHanzi = new Map<string, Character>();
        cloudChars.forEach((c) => cloudByHanzi.set(c.hanzi, c));

        const mergedByHanzi = new Map<string, Character>(cloudByHanzi);
        const toUploadChars: Character[] = [];

        localChars.forEach((lc) => {
          const existingCloud = cloudByHanzi.get(lc.hanzi);
          if (!existingCloud) {
            // Do NOT resurrect words that were previously synced and then deleted on Cloud
            if (syncedHanziSet.has(lc.hanzi)) {
              return;
            }
            // Do NOT re-upload untouched starter words from a fresh/Incognito browser onto an existing Cloud account
            if (isUntouchedStarterCharacter(lc)) {
              return;
            }
            mergedByHanzi.set(lc.hanzi, lc);
            toUploadChars.push(lc);
          } else {
            const { winner, shouldUpload } = pickFresherCharacter(existingCloud, lc);
            mergedByHanzi.set(lc.hanzi, winner);
            if (shouldUpload) {
              toUploadChars.push(winner);
            }
          }
        });

        const mergedChars = autoCategorizeCharacters(Array.from(mergedByHanzi.values()));
        saveCharacters(mergedChars);
        setCharacters(mergedChars);
        setSelectedCharacter((prev) => {
          if (!prev) return null;
          return mergedChars.find((c) => c.id === prev.id || c.hanzi === prev.hanzi) || null;
        });

        // Merge Word Lists
        const listMap = new Map<string, WordList>();
        cloudLists.forEach((l) => listMap.set(l.id, l));
        const toUploadLists: WordList[] = [];
        localLists.forEach((ll) => {
          if (!listMap.has(ll.id)) {
            if (syncedListIdSet.has(ll.id) && !isPredefinedWordList(ll)) {
              return;
            }
            listMap.set(ll.id, ll);
            if (!isPredefinedWordList(ll) || (cloudLists.length === 0 && !snapshot?.hasSyncedOnce)) {
              toUploadLists.push(ll);
            }
          }
        });
        const mergedLists = Array.from(listMap.values());
        saveWordLists(mergedLists);
        setWordLists(mergedLists);

        // Merge UserStats (recompute saved/mastered from mergedChars so deletions propagate accurately)
        const cloudReviews = cloudStats?.totalReviews || 0;
        const localReviews = localStats.totalReviews || 0;
        const mergedMastered = mergedChars.filter((c) => c.srs.masteryLevel >= 80).length;
        const mergedStats: UserStats = {
          totalSaved: mergedChars.length,
          totalMastered: mergedMastered,
          totalReviews: Math.max(cloudReviews, localReviews),
          accuracy:
            cloudReviews >= localReviews
              ? (cloudStats?.accuracy ?? localStats.accuracy)
              : localStats.accuracy,
          streakDays:
            cloudReviews >= localReviews
              ? (cloudStats?.streakDays ?? localStats.streakDays)
              : localStats.streakDays,
          lastStudyDate:
            (cloudStats?.lastStudyDate || '') >= (localStats.lastStudyDate || '')
              ? (cloudStats?.lastStudyDate || localStats.lastStudyDate)
              : localStats.lastStudyDate,
          totalStudyTimeSeconds: Math.max(
            cloudStats?.totalStudyTimeSeconds || 0,
            localStats.totalStudyTimeSeconds || 0
          ),
        };
        saveUserStats(mergedStats);
        setStats(mergedStats);

        // Load & merge in-progress SavedStudySessions using mergedChars
        const cloudSessions = await loadSavedSessionsFromCloud(userId, mergedChars);
        const sessionMap = new Map<string, SavedStudySession>();
        cloudSessions.forEach((cs) => sessionMap.set(cs.id, cs));

        const sessionsToUpload: SavedStudySession[] = [];
        localSessions.forEach((ls) => {
          const existingCloud = sessionMap.get(ls.id);
          if (!existingCloud) {
            if (syncedSessionIdSet.has(ls.id)) {
              return;
            }
            sessionMap.set(ls.id, ls);
            sessionsToUpload.push(ls);
          } else {
            const localNewer =
              (ls.updatedAt || 0) > (existingCloud.updatedAt || 0) ||
              ((ls.updatedAt || 0) === (existingCloud.updatedAt || 0) &&
                ls.currentIndex > existingCloud.currentIndex);
            if (localNewer) {
              sessionMap.set(ls.id, ls);
              sessionsToUpload.push(ls);
            }
          }
        });

        const mergedSessions = replaceSavedStudySessions(Array.from(sessionMap.values()));
        setSavedSessions(mergedSessions);

        const shouldUploadStats =
          !cloudStats ||
          localReviews > cloudReviews ||
          cloudStats.totalSaved !== mergedStats.totalSaved ||
          cloudStats.totalMastered !== mergedStats.totalMastered;

        // Push any genuine local-newer updates back up to Cloud
        await Promise.all([
          toUploadChars.length > 0 ? saveCharactersBatchToCloud(userId, toUploadChars) : Promise.resolve(),
          toUploadLists.length > 0 ? saveWordListsToCloud(userId, toUploadLists) : Promise.resolve(),
          shouldUploadStats ? saveUserStatsToCloud(userId, mergedStats) : Promise.resolve(),
          sessionsToUpload.length > 0
            ? saveSavedSessionsBatchToCloud(userId, sessionsToUpload)
            : Promise.resolve(),
        ]);

        saveCloudSyncSnapshot(userId, {
          hasSyncedOnce: true,
          charHanzi: mergedChars.map((c) => c.hanzi),
          listIds: mergedLists.map((l) => l.id),
          sessionIds: mergedSessions.map((s) => s.id),
          syncedAt: Date.now(),
        });

        if (!silent) {
          const draftNote =
            mergedSessions.length > 0
              ? ` • ${mergedSessions.length} bài đang làm dở`
              : '';
          showToast(
            `Đồng bộ hoàn tất! (${mergedChars.length} từ vựng${draftNote})`,
            'success',
            4000
          );
        }
      }
    } catch (err: any) {
      console.error('Cloud Sync failed:', err);
      if (!silent) {
        showToast('Đồng bộ đám mây thất bại. Vui lòng kiểm tra lại mạng!', 'error', 4000);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const [authHelpModal, setAuthHelpModal] = useState<{
    title: string;
    description: string;
    code?: string;
    steps?: string[];
    actionUrl?: string;
    actionLabel?: string;
  } | null>(null);

  const handleSignInGoogle = async () => {
    try {
      setSyncToast({ message: 'Đang mở cửa sổ đăng nhập Google...', type: 'info' });
      const user = await signInWithGoogle();
      if (user) {
        setSyncToast({ message: `Xin chào ${user.displayName || user.email}!`, type: 'success' });
      }
    } catch (err: any) {
      console.error('Google Sign-in failed:', err);
      const errCode = err?.code || '';
      
      if (errCode === 'auth/unauthorized-domain') {
        setSyncToast({
          message: 'Tên miền chưa được cấp phép trong Firebase! Đang mở hướng dẫn...',
          type: 'error',
        });
        setAuthHelpModal({
          title: 'Tên miền chưa được cấp phép (Authorized Domain)',
          description:
            'Firebase Authentication có tính năng bảo mật chỉ cho phép đăng nhập từ các tên miền đã đăng ký. Tên miền GitHub Pages của bạn chưa nằm trong danh sách này.',
          code: window.location.hostname || 'laphuc227-kyle.github.io',
          steps: [
            'Bước 1: Mở Firebase Console -> Authentication -> mục "Settings".',
            'Bước 2: Tìm phần "Authorized domains" và bấm nút "Add domain".',
            'Bước 3: Nhập đúng tên miền: ' + (window.location.hostname || 'laphuc227-kyle.github.io') + ' rồi bấm "Save".',
            'Bước 4: Tải lại trang web và bấm "Đăng nhập Google" lại là hoàn tất!',
          ],
          actionUrl: 'https://console.firebase.google.com/project/platinum-elixir-3bcxw/authentication/settings',
          actionLabel: 'Mở Cài đặt Firebase Console',
        });
      } else if (errCode === 'auth/popup-blocked') {
        setSyncToast({
          message: 'Cửa sổ đăng nhập bị trình duyệt chặn (Pop-up blocked).',
          type: 'error',
        });
        setAuthHelpModal({
          title: 'Cửa sổ đăng nhập bị chặn (Pop-up Blocked)',
          description:
            'Trình duyệt trên iPhone (Safari) hoặc chế độ duyệt web riêng tư đã tự động chặn cửa sổ đăng nhập pop-up của Google.',
          steps: [
            'Vào Cài đặt (Settings) trên iPhone -> cuộn xuống chọn Safari.',
            'Tìm mục "Chặn cửa sổ bật lên" (Block Pop-ups) và TẮT tính năng này.',
            'Nếu bạn mở web trong ứng dụng (Zalo, Facebook, Messenger), hãy chọn "Mở bằng trình duyệt Safari" bên góc trên bên phải.',
            'Quay lại ứng dụng và bấm lại nút Đăng nhập Google.',
          ],
        });
      } else if (errCode === 'auth/popup-closed-by-user') {
        setSyncToast({
          message: 'Cửa sổ đăng nhập đã bị đóng trước khi hoàn tất.',
          type: 'info',
        });
      } else {
        setSyncToast({
          message: `Lỗi đăng nhập: ${err?.message || 'Không thể đăng nhập Google.'}`,
          type: 'error',
        });
      }
      setTimeout(() => setSyncToast(null), 4000);
    }
  };

  const handleSignOut = async () => {
    try {
      if (cloudSessionTimerRef.current) {
        clearTimeout(cloudSessionTimerRef.current);
        cloudSessionTimerRef.current = null;
      }
      if (cloudStatsTimerRef.current) {
        clearTimeout(cloudStatsTimerRef.current);
        cloudStatsTimerRef.current = null;
      }
      pendingCloudSessionRef.current = null;
      lastAutoSyncAtRef.current = 0;

      const uid = currentUserRef.current?.uid;
      if (uid && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
        await flushPendingCloudDeletes(uid);
      }

      await signOutUser();
      resetAllData();

      setCurrentUser(null);
      currentUserRef.current = null;
      setCharacters(getCharacters());
      setWordLists(getWordLists());
      setStats(getUserStats());
      setSavedSessions([]);
      setResumedStudySession(null);
      setSelectedCharacter(null);
      setSelectedListId(null);
      setActiveView('lists');

      showToast('Đã đăng xuất và xóa dữ liệu tài khoản khỏi trình duyệt.', 'info', 3500);
    } catch (err) {
      console.error('Sign-out error:', err);
    }
  };

  const refreshAllData = () => {
    const uid = currentUserRef.current?.uid;
    const loadedChars = getCharacters();
    // Auto-sync 100% learned review compound words into all vocabulary (skipping deleted compounds)
    const dismissed = new Set(getDismissedCompounds());
    const { updatedCharacters } = syncLearnedCompoundWords(loadedChars, dismissed);
    let categorized = autoCategorizeCharacters(updatedCharacters);
    if (uid) {
      const pending = getPendingCloudDeletes(uid);
      const pendingIds = new Set(pending.map((p) => p.id).filter(Boolean));
      const pendingHanzi = new Set(pending.map((p) => p.hanzi).filter(Boolean));
      categorized = categorized.filter((c) => !pendingIds.has(c.id) && !pendingHanzi.has(c.hanzi));
    }
    saveCharacters(categorized);
    setCharacters(categorized);
    const lists = getWordLists();
    setWordLists(lists);
    const latestStats = getUserStats();
    setStats(latestStats);
    const latestSessions = getSavedStudySessions();
    setSavedSessions(latestSessions);

    // If logged in, automatically push updates to Cloud
    if (uid) {
      saveCharactersBatchToCloud(uid, categorized).catch(console.warn);
      saveWordListsToCloud(uid, lists).catch(console.warn);
      saveUserStatsToCloud(uid, latestStats).catch(console.warn);
      if (latestSessions.length > 0) {
        saveSavedSessionsBatchToCloud(uid, latestSessions).catch(console.warn);
      }
      const existingSnap = getCloudSyncSnapshot(uid);
      saveCloudSyncSnapshot(uid, {
        hasSyncedOnce: existingSnap?.hasSyncedOnce ?? true,
        charHanzi: categorized.map((c) => c.hanzi),
        listIds: lists.map((l) => l.id),
        sessionIds: latestSessions.map((s) => s.id),
        syncedAt: Date.now(),
      });
    }
  };

  const handleDeleteCharacter = async (target: Character | string) => {
    const targetId = typeof target === 'string' ? target : target.id;
    const resolvedChar =
      typeof target === 'string'
        ? characters.find((c) => c.id === target) || getCharacters().find((c) => c.id === target)
        : target;
    const targetHanzi = resolvedChar?.hanzi || '';

    // 1. Delete immediately from Local Storage and update React UI state
    removeCharacter(targetId, targetHanzi || undefined);
    const remainingChars = getCharacters();
    const latestStats = getUserStats();
    setCharacters(remainingChars);
    setStats(latestStats);
    if (
      selectedCharacter &&
      (selectedCharacter.id === targetId || (targetHanzi && selectedCharacter.hanzi === targetHanzi))
    ) {
      setSelectedCharacter(null);
    }

    // 2. If signed in, record pending delete queue & delete from Cloud Firestore
    const uid = currentUserRef.current?.uid;
    if (!uid) return;

    if (targetHanzi) {
      removeHanziFromCloudSyncSnapshot(uid, targetHanzi);
    }
    addPendingCloudDelete(uid, { id: targetId, hanzi: targetHanzi });

    try {
      await deleteCharacterFromCloud(uid, targetId, targetHanzi || undefined);
      removePendingCloudDeletes(uid, [{ id: targetId, hanzi: targetHanzi }]);
      saveUserStatsToCloud(uid, latestStats).catch(console.warn);
    } catch (err) {
      console.warn('Cloud delete failed (queued for retry):', err);
      showToast(
        'Đã xóa trên máy. Hệ thống sẽ tự động xóa trên Cloud khi có kết nối mạng.',
        'info',
        4500
      );
    }
  };

  const handleResetAllData = async () => {
    if (cloudSessionTimerRef.current) {
      clearTimeout(cloudSessionTimerRef.current);
      cloudSessionTimerRef.current = null;
    }
    if (cloudStatsTimerRef.current) {
      clearTimeout(cloudStatsTimerRef.current);
      cloudStatsTimerRef.current = null;
    }
    pendingCloudSessionRef.current = null;

    const uid = currentUserRef.current?.uid;
    if (uid) {
      // Must wipe Cloud subcollections BEFORE touching local state so mid-way failures never report success
      await resetUserCloudData(uid);
      resetAllData();
      setStorageOwnerUid(uid);
      saveCloudSyncSnapshot(uid, {
        hasSyncedOnce: true,
        charHanzi: [],
        listIds: [],
        sessionIds: [],
        syncedAt: Date.now(),
      });
    } else {
      resetAllData();
    }

    setCharacters(getCharacters());
    setWordLists(getWordLists());
    setStats(getUserStats());
    setSavedSessions([]);
    setResumedStudySession(null);
    setSelectedCharacter(null);
    setSelectedListId(null);
    setActiveView('lists');

    showToast(
      uid
        ? 'Đã xóa dữ liệu cá nhân trên thiết bị và Cloud!'
        : 'Đã đặt lại toàn bộ dữ liệu trên thiết bị!',
      'success',
      4000
    );
  };

  // Real-time / debounced Cloud sync handlers during study sessions
  const handleCharacterReviewedCloud = (updatedChar: Character) => {
    const uid = currentUserRef.current?.uid;
    if (!uid) return;
    saveCharacterToCloud(uid, updatedChar).catch(console.warn);

    if (cloudStatsTimerRef.current) clearTimeout(cloudStatsTimerRef.current);
    cloudStatsTimerRef.current = setTimeout(() => {
      const latestUid = currentUserRef.current?.uid;
      if (latestUid) {
        saveUserStatsToCloud(latestUid, getUserStats()).catch(console.warn);
      }
    }, 1500);
  };

  const handleSavedSessionUpsertedCloud = (session: SavedStudySession, immediate: boolean = false) => {
    const uid = currentUserRef.current?.uid;
    if (!uid) return;
    pendingCloudSessionRef.current = session;

    if (immediate) {
      if (cloudSessionTimerRef.current) {
        clearTimeout(cloudSessionTimerRef.current);
        cloudSessionTimerRef.current = null;
      }
      const toSave = pendingCloudSessionRef.current;
      pendingCloudSessionRef.current = null;
      if (toSave) {
        saveSavedSessionToCloud(uid, toSave).catch(console.warn);
      }
      saveUserStatsToCloud(uid, getUserStats()).catch(console.warn);
      return;
    }

    if (cloudSessionTimerRef.current) clearTimeout(cloudSessionTimerRef.current);
    cloudSessionTimerRef.current = setTimeout(() => {
      const latestUid = currentUserRef.current?.uid;
      const toSave = pendingCloudSessionRef.current;
      pendingCloudSessionRef.current = null;
      if (latestUid && toSave) {
        saveSavedSessionToCloud(latestUid, toSave).catch(console.warn);
      }
    }, 1200);
  };

  const handleSavedSessionDeletedCloud = (sessionId: string) => {
    if (pendingCloudSessionRef.current?.id === sessionId) {
      pendingCloudSessionRef.current = null;
    }
    if (cloudSessionTimerRef.current) {
      clearTimeout(cloudSessionTimerRef.current);
      cloudSessionTimerRef.current = null;
    }
    const uid = currentUserRef.current?.uid;
    if (!uid) return;
    deleteSavedSessionFromCloud(uid, sessionId).catch(console.warn);
  };

  // Due count calculation for SRS badge
  const now = Date.now();
  const dueCount = characters.filter((c) => c.srs.nextReviewDate <= now).length;

  const handleStartSession = (mode: StudySessionMode, listId?: string) => {
    setPendingStudyMode(mode);
    setPendingListId(listId !== undefined ? listId : selectedListId);
    setIsSetupModalOpen(true);
  };

  const handleConfirmStartStudy = (
    mode: StudySessionMode,
    listId: string | null,
    questionLimit?: number | 'all'
  ) => {
    setResumedStudySession(null);
    setStudyMode(mode);
    setSelectedListId(listId);
    if (questionLimit !== undefined) {
      setSessionQuestionLimit(questionLimit);
    }
    setSessionInstanceKey((prev) => prev + 1);
    setIsSetupModalOpen(false);
    setActiveView('study');
  };

  const handleResumeStudySession = (session: SavedStudySession) => {
    setResumedStudySession(session);
    setStudyMode(session.mode);
    setSelectedListId(session.selectedListId);
    setSessionQuestionLimit(session.questionLimit);
    setSessionInstanceKey((prev) => prev + 1);
    setIsSetupModalOpen(false);
    setIsMobileMenuOpen(false);
    setActiveView('study');
  };

  const handleDeleteSavedSession = (sessionId: string) => {
    const updated = removeSavedStudySession(sessionId);
    setSavedSessions(updated);
    if (resumedStudySession?.id === sessionId) {
      setResumedStudySession(null);
    }
    handleSavedSessionDeletedCloud(sessionId);
  };

  const handleSelectList = (listId: string | null) => {
    setSelectedListId(listId);
    setActiveView('lists');
  };

  // Canva-style slide/scale page transition variants
  const pageVariants = {
    initial: { opacity: 0, scale: 0.98, y: 14 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.98, y: -14 },
  };

  const pageTransition = {
    duration: 0.35,
    ease: [0.22, 1, 0.36, 1],
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#090D16] font-sans text-slate-100 antialiased overflow-hidden selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Background Subtle Mint & Ocean Blue Ambient Glow */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl" />
      </div>

      {/* Mobile Top Header (< 768px) */}
      <header className="md:hidden flex items-center justify-between px-3.5 py-2.5 bg-slate-900/95 backdrop-blur-xl border-b border-slate-800/80 shrink-0 z-30">
        <div
          onClick={() => {
            setActiveView('lists');
            setSelectedListId(null);
          }}
          className="flex items-center gap-2.5 cursor-pointer"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-400 text-slate-950 flex items-center justify-center font-serif font-black text-lg shadow-md shadow-emerald-500/20">
            字
          </div>
          <div>
            <h1 className="text-sm font-bold bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent leading-none">
              Hanzi Tutor
            </h1>
            <span className="text-[10px] text-cyan-400/80 font-mono">Luyện Viết &amp; HSK 1–6</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Cloud Sync Status / Button on Mobile */}
          {currentUser ? (
            <button
              onClick={() => syncCloudData(currentUser.uid)}
              disabled={isSyncing}
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold cursor-pointer active:scale-95 transition"
              title="Đang kết nối Cloud - Bấm để đồng bộ ngay"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <Cloud className={`w-3.5 h-3.5 text-emerald-400 ${isSyncing ? 'animate-pulse' : ''}`} />
            </button>
          ) : (
            <button
              onClick={handleSignInGoogle}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-semibold cursor-pointer active:scale-95 transition"
              title="Đăng nhập Google để đồng bộ Cloud"
            >
              <Cloud className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[10px]">Đồng bộ</span>
            </button>
          )}

          {dueCount > 0 && (
            <button
              onClick={() => handleStartSession('smart_daily')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold cursor-pointer active:scale-95 transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>{dueCount}</span>
            </button>
          )}

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer active:scale-95"
            title="Cài đặt & Sao lưu"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 rounded-xl text-slate-300 hover:text-emerald-300 hover:bg-slate-800 transition cursor-pointer active:scale-95"
            title="Mở danh mục HSK & Chế độ học"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Cloud Sync Toast Notification */}
      <AnimatePresence>
        {syncToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-2xl border text-xs font-medium flex items-center gap-2 backdrop-blur-xl ${
              syncToast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200 shadow-emerald-500/10'
                : syncToast.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/50 text-rose-200 shadow-rose-500/10'
                : 'bg-slate-900/90 border-cyan-500/50 text-cyan-200 shadow-cyan-500/10'
            }`}
          >
            {syncToast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : syncToast.type === 'error' ? (
              <span className="text-rose-400 font-bold shrink-0">✕</span>
            ) : (
              <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
            )}
            <span>{syncToast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notion-style Dark Glass Sidebar (Desktop permanent, Mobile slide-in drawer) */}
      <Sidebar
        wordLists={wordLists}
        selectedListId={selectedListId}
        activeView={activeView}
        dueCount={dueCount}
        onStartSession={handleStartSession}
        onOpenAnalytics={() => setActiveView('analytics')}
        onOpenGrammar={() => setActiveView('grammar')}
        onOpenRadicals={() => {
          setFocusedRadicalId(null);
          setActiveView('radicals');
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSelectList={handleSelectList}
        isOpenOnMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        currentUser={currentUser}
        isSyncing={isSyncing}
        onSignInGoogle={handleSignInGoogle}
        onSignOut={handleSignOut}
        onSyncNow={() => currentUser && syncCloudData(currentUser.uid)}
        savedSessions={savedSessions}
        onResumeSession={handleResumeStudySession}
      />

      {/* Main Content Area with Canva Slide Transition */}
      <main
        className={`relative z-10 flex-1 overflow-y-auto px-3.5 py-3 sm:p-6 md:p-8 max-w-6xl mx-auto w-full ${
          activeView === 'study' && studyMode === 'stroke_writing' ? 'pb-20 md:pb-8' : 'pb-6 md:pb-8'
        }`}
      >
        <AnimatePresence mode="wait">
          {activeView === 'lists' && (
            <motion.div
              key="lists"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageTransition}
              className="w-full"
            >
              <WordListManager
                characters={characters}
                wordLists={wordLists}
                selectedListId={selectedListId}
                onSelectList={handleSelectList}
                onRefreshData={refreshAllData}
                onDeleteCharacter={handleDeleteCharacter}
                onSelectCharacter={(char) => setSelectedCharacter(char)}
                onStartSession={handleStartSession}
                savedSessions={savedSessions}
                onResumeSession={handleResumeStudySession}
                onDeleteSavedSession={handleDeleteSavedSession}
                isLoggedIn={Boolean(currentUser)}
                onRequireSignIn={handleSignInGoogle}
              />
            </motion.div>
          )}

          {activeView === 'study' && (
            <motion.div
              key={`study_${studyMode}_${selectedListId || 'all'}_${sessionInstanceKey}`}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageTransition}
              className="w-full"
            >
              <StudySession
                key={`session_${studyMode}_${selectedListId || 'all'}_${sessionInstanceKey}`}
                mode={studyMode}
                allCharacters={characters}
                selectedListId={selectedListId || undefined}
                wordLists={wordLists}
                initialQuestionLimit={sessionQuestionLimit}
                resumedSession={resumedStudySession}
                onSavedSessionsChange={refreshSavedSessions}
                onSavedSessionUpserted={handleSavedSessionUpsertedCloud}
                onSavedSessionDeleted={handleSavedSessionDeletedCloud}
                onCharacterReviewed={handleCharacterReviewedCloud}
                onFinishSession={() => {
                  refreshSavedSessions();
                  setResumedStudySession(null);
                  refreshAllData();
                  setActiveView('lists');
                }}
                onOpenCharacterDetail={(char) => setSelectedCharacter(char)}
                onChangeList={(listId) => setSelectedListId(listId)}
              />
            </motion.div>
          )}

          {activeView === 'analytics' && (
            <motion.div
              key="analytics"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageTransition}
              className="w-full"
            >
              <AnalyticsView
                characters={characters}
                stats={stats}
                onPracticeCharacter={(char) => setSelectedCharacter(char)}
              />
            </motion.div>
          )}

          {activeView === 'grammar' && (
            <motion.div
              key="grammar"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageTransition}
              className="w-full"
            >
              <GrammarView />
            </motion.div>
          )}

          {activeView === 'radicals' && (
            <motion.div
              key="radicals"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageTransition}
              className="w-full"
            >
              <RadicalsView
                characters={characters}
                initialRadicalId={focusedRadicalId}
                sourceCharacter={sourceCharacterForRadical}
                onReturnToCharacter={handleReturnFromRadicalToCharacter}
                onClearInitialRadical={() => setFocusedRadicalId(null)}
                onSelectCharacter={(char) => setSelectedCharacter(char)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals & Drawers */}
      <AnimatePresence>
        {selectedCharacter && (
          <CharacterDetailModal
            key="char-modal"
            character={selectedCharacter}
            allCharacters={characters}
            onSelectCharacter={(char) => setSelectedCharacter(char)}
            onClose={() => setSelectedCharacter(null)}
            isLoggedIn={Boolean(currentUser)}
            onRequireSignIn={handleSignInGoogle}
            onUpdateCharacter={(updated) => {
              if (updated && selectedCharacter && updated.id === selectedCharacter.id) {
                setSelectedCharacter(updated);
              }
              refreshAllData();
            }}
            onDeleteCharacter={(id) => {
              handleDeleteCharacter(id);
            }}
            onOpenRadicalView={(radId, sourceChar) => {
              setFocusedRadicalId(radId);
              setSourceCharacterForRadical(sourceChar || selectedCharacter);
              setPreviousViewBeforeRadical(activeView);
              setActiveView('radicals');
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSettingsOpen && (
          <SettingsModal
            key="settings-modal"
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            onRefreshData={refreshAllData}
            onResetAllData={handleResetAllData}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSetupModalOpen && (
          <StudySetupModal
            key="study-setup-modal"
            isOpen={isSetupModalOpen}
            initialMode={pendingStudyMode}
            initialListId={pendingListId}
            wordLists={wordLists}
            allCharacters={characters}
            savedSessions={savedSessions}
            onResumeSession={handleResumeStudySession}
            onDeleteSavedSession={handleDeleteSavedSession}
            onClose={() => setIsSetupModalOpen(false)}
            onConfirmStart={handleConfirmStartStudy}
          />
        )}
      </AnimatePresence>

      {/* Firebase Auth Help / Domain Authorization Guidance Modal */}
      <AnimatePresence>
        {authHelpModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              className="relative w-full max-w-lg bg-slate-900 border border-amber-500/30 rounded-2xl p-6 shadow-2xl text-left overflow-hidden"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100">{authHelpModal.title}</h3>
                    <p className="text-xs text-amber-400/90 font-medium">Bảo mật Firebase Authentication</p>
                  </div>
                </div>
                <button
                  onClick={() => setAuthHelpModal(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                {authHelpModal.description}
              </p>

              {authHelpModal.code && (
                <div className="mb-4 p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">Tên miền cần thêm</p>
                    <code className="text-xs font-mono font-bold text-emerald-400 break-all">{authHelpModal.code}</code>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(authHelpModal.code || '');
                      setSyncToast({ message: 'Đã sao chép tên miền vào bộ nhớ tạm!', type: 'success' });
                    }}
                    className="shrink-0 ml-3 px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg border border-slate-700 transition cursor-pointer active:scale-95"
                  >
                    Sao chép
                  </button>
                </div>
              )}

              {authHelpModal.steps && (
                <div className="mb-5 space-y-2 bg-slate-800/40 p-3.5 rounded-xl border border-slate-800">
                  <p className="text-[11px] font-bold text-slate-200 uppercase tracking-wide">Các bước thực hiện nhanh:</p>
                  <ul className="space-y-1.5">
                    {authHelpModal.steps.map((step, idx) => (
                      <li key={idx} className="text-xs text-slate-300 leading-snug flex items-start gap-2">
                        <span className="text-emerald-400 font-bold mt-0.5">•</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
                {authHelpModal.actionUrl && (
                  <a
                    href={authHelpModal.actionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20 transition cursor-pointer active:scale-95"
                  >
                    <span>{authHelpModal.actionLabel || 'Mở trang cài đặt'}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <button
                  onClick={() => setAuthHelpModal(null)}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition cursor-pointer active:scale-95"
                >
                  Đóng
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
