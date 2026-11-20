import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Volume2, Sparkles, BookOpen, Layers, Edit3, Check, Loader2, ListPlus, Trash2, RefreshCw, ArrowRight, ArrowLeft } from 'lucide-react';
import { Character } from '../types';
import { StrokeWriterCanvas } from './StrokeWriterCanvas';
import { speakChinese } from '../services/audio';
import { addCharacter, removeCharacter } from '../services/storage';
import { lookupBuiltIn } from '../services/builtInDictionary';
import { authorizedFetch, isStaticHost } from '../services/apiClient';
import {
  lookupSharedDictionaryOne,
  lookupSharedDictionaryBatch,
  saveSharedDictionaryBatch,
  saveSharedMnemonicToCache,
  trackDailyAIUsage,
} from '../services/firebase';
import { findRadicalInfo } from '../services/radicalsDatabase';
import { DEFAULT_SRS } from '../services/dictionary';

interface ConstituentInfo {
  hanzi: string;
  pinyin: string;
  hanViet: string;
  meaning: string;
  radical?: string;
  strokeCount?: number;
  components?: string;
  mnemonic?: string;
  examples?: Array<{ sentence: string; pinyin: string; meaning: string }>;
  compoundWords?: Array<{ word: string; pinyin: string; meaning: string }>;
  isSaved?: boolean;
}

interface CharacterDetailModalProps {
  character: Character | null;
  allCharacters?: Character[];
  isLoggedIn?: boolean;
  onRequireSignIn?: () => void;
  onClose: () => void;
  onUpdateCharacter?: (updated?: Character) => void;
  onDeleteCharacter?: (id: string) => void;
  onOpenRadicalView?: (radicalId: string, sourceCharacter?: Character) => void;
  onSelectCharacter?: (character: Character) => void;
}

export const CharacterDetailModal: React.FC<CharacterDetailModalProps> = ({
  character: propCharacter,
  allCharacters,
  isLoggedIn = false,
  onRequireSignIn,
  onClose,
  onUpdateCharacter,
  onDeleteCharacter,
  onOpenRadicalView,
  onSelectCharacter,
}) => {
  if (!propCharacter) return null;

  // Track active character and history stack for back/forth navigation
  const [activeCharacter, setActiveCharacter] = useState<Character>(propCharacter);
  const [historyStack, setHistoryStack] = useState<Character[]>([]);

  // Keep activeCharacter in sync when propCharacter changes from outside
  useEffect(() => {
    if (propCharacter && propCharacter.id !== activeCharacter.id && historyStack.length === 0) {
      setActiveCharacter(propCharacter);
    }
  }, [propCharacter?.id, propCharacter?.hanzi]);

  const character = activeCharacter;

  const navigateToCharacter = (targetChar: Character) => {
    setHistoryStack((prev) => [...prev, activeCharacter]);
    setActiveCharacter(targetChar);
    if (onSelectCharacter) {
      onSelectCharacter(targetChar);
    }
  };

  const handleGoBack = () => {
    if (historyStack.length === 0) return;
    const previousChar = historyStack[historyStack.length - 1];
    setHistoryStack((prev) => prev.slice(0, prev.length - 1));
    setActiveCharacter(previousChar);
    if (onSelectCharacter) {
      onSelectCharacter(previousChar);
    }
  };

  const [notes, setNotes] = useState(character.customNotes || '');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [loadingMnemonic, setLoadingMnemonic] = useState(false);
  const [aiMnemonics, setAiMnemonics] = useState<any[]>(character.aiMnemonics || []);
  const [mnemonicNotice, setMnemonicNotice] = useState<string>('');
  const [mnemonicNeedsAuth, setMnemonicNeedsAuth] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isRefreshingDetails, setIsRefreshingDetails] = useState(false);
  const [refreshSuccessMessage, setRefreshSuccessMessage] = useState('');
  const [refreshNeedsAuth, setRefreshNeedsAuth] = useState(false);

  // Enriched constituent characters state
  const [enrichedConstituents, setEnrichedConstituents] = useState<Record<string, ConstituentInfo>>({});
  const [enrichingConstituents, setEnrichingConstituents] = useState(false);
  const [savedConstituents, setSavedConstituents] = useState<Record<string, boolean>>({});

  // Detect compact mobile landscape (phone rotated horizontally)
  const [isCompactLandscape, setIsCompactLandscape] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return Math.min(window.innerWidth, window.innerHeight) < 640 && window.innerWidth > window.innerHeight;
  });

  useEffect(() => {
    const updateOrientation = () => {
      setIsCompactLandscape(
        Math.min(window.innerWidth, window.innerHeight) < 640 && window.innerWidth > window.innerHeight
      );
    };
    const handleOrientation = () => {
      updateOrientation();
      setTimeout(updateOrientation, 120);
    };
    window.addEventListener('resize', updateOrientation);
    window.addEventListener('orientationchange', handleOrientation);
    return () => {
      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('orientationchange', handleOrientation);
    };
  }, []);

  // Sync state when active character changes
  useEffect(() => {
    setNotes(character.customNotes || '');
    setAiMnemonics(character.aiMnemonics || []);
    setMnemonicNotice('');
    setMnemonicNeedsAuth(false);
    setRefreshSuccessMessage('');
    setRefreshNeedsAuth(false);
    setConfirmingDelete(false);
    setNotesSaved(false);
  }, [character.id, character.hanzi]);

  // Resolve constituent single character info using multi-tier fallback:
  // 1. User vocabulary (allCharacters)
  // 2. Dynamic cache (enrichedConstituents)
  // 3. BUILT_IN_DICTIONARY
  // 4. Kangxi Radicals Database
  const resolveConstituentInfo = (ch: string): ConstituentInfo => {
    // 1. User vocabulary
    const savedChar = allCharacters?.find((c) => c.hanzi === ch);
    if (savedChar && savedChar.meaning && savedChar.meaning !== 'Chữ đơn cấu thành') {
      return {
        hanzi: ch,
        pinyin: savedChar.pinyin || '',
        hanViet: savedChar.hanViet || '',
        meaning: savedChar.meaning,
        radical: savedChar.radical,
        strokeCount: savedChar.strokeCount,
        components: savedChar.components,
        mnemonic: savedChar.mnemonic,
        examples: savedChar.examples,
        compoundWords: savedChar.compoundWords,
        isSaved: true,
      };
    }

    // 2. Dynamic cache
    const dyn = enrichedConstituents[ch];
    if (dyn && dyn.meaning && dyn.meaning !== 'Chữ đơn cấu thành') {
      return {
        ...dyn,
        isSaved: savedConstituents[ch] || !!allCharacters?.some((c) => c.hanzi === ch),
      };
    }

    // 3. Built-in dictionary
    const dict = lookupBuiltIn(ch);
    if (dict && dict.meaning) {
      return {
        hanzi: ch,
        pinyin: dict.pinyin || '',
        hanViet: dict.hanViet || '',
        meaning: dict.meaning,
        radical: dict.radical,
        strokeCount: dict.strokeCount,
        components: dict.components,
        mnemonic: dict.mnemonic,
        examples: dict.examples,
        compoundWords: dict.compoundWords,
        isSaved: savedConstituents[ch] || !!allCharacters?.some((c) => c.hanzi === ch),
      };
    }

    // 4. Radicals database
    const rad = findRadicalInfo(ch);
    if (rad && rad.meaning) {
      return {
        hanzi: ch,
        pinyin: rad.pinyin || '',
        hanViet: rad.hanViet || '',
        meaning: rad.meaning,
        radical: `${rad.hanzi} (${rad.hanViet})`,
        strokeCount: rad.strokeCount,
        mnemonic: rad.associationTip || rad.description,
        isSaved: savedConstituents[ch] || !!allCharacters?.some((c) => c.hanzi === ch),
      };
    }

    return {
      hanzi: ch,
      pinyin: '',
      hanViet: '',
      meaning: '',
      isSaved: savedConstituents[ch] || !!allCharacters?.some((c) => c.hanzi === ch),
    };
  };

  // Auto-enrich any constituent characters lacking complete data (Tier 2 shared cache -> Tier 3 AI)
  useEffect(() => {
    if (!character || character.hanzi.length <= 1) return;

    const chars = character.hanzi.split('');
    const missing = chars.filter((ch) => {
      const saved = allCharacters?.find((c) => c.hanzi === ch);
      if (saved && saved.meaning && saved.meaning !== 'Chữ đơn cấu thành') return false;
      if (enrichedConstituents[ch]?.meaning && enrichedConstituents[ch].meaning !== 'Chữ đơn cấu thành') return false;
      const dict = lookupBuiltIn(ch);
      if (dict && dict.meaning) return false;
      const rad = findRadicalInfo(ch);
      if (rad && rad.meaning) return false;
      return true;
    });

    if (missing.length === 0) return;

    let isMounted = true;
    setEnrichingConstituents(true);

    (async () => {
      try {
        // 1. Check shared Firestore dictionary cache first (signed-in users only per Firestore rules)
        const firestoreCached = isLoggedIn
          ? await lookupSharedDictionaryBatch(missing)
          : new Map();
        const resolvedMap: Record<string, ConstituentInfo> = {};
        const stillMissing: string[] = [];

        missing.forEach((ch) => {
          const hit = firestoreCached.get(ch);
          if (hit && hit.meaning && !hit.meaning.startsWith('(EN)')) {
            resolvedMap[ch] = {
              hanzi: hit.hanzi,
              pinyin: hit.pinyin || '',
              hanViet: hit.hanViet || '',
              meaning: hit.meaning,
              radical: hit.radical,
              strokeCount: hit.strokeCount,
              components: hit.components,
              mnemonic: hit.mnemonic,
              examples: hit.examples,
              compoundWords: hit.compoundWords,
            };
          } else {
            stillMissing.push(ch);
          }
        });

        // 2. Call server 3-tier enrich (guests only resolve Tier 1/2 cache; logged-in users may invoke Tier 3 AI)
        if (stillMissing.length > 0 && !isStaticHost()) {
          const res = await authorizedFetch('/api/gemini/enrich', {
            method: 'POST',
            body: JSON.stringify({ characters: stillMissing }),
          });
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            const aiCreatedEntries: any[] = [];
            json.data.forEach((item: any) => {
              if (item && item.hanzi && item.meaning && !String(item.meaning).startsWith('(EN)')) {
                resolvedMap[item.hanzi] = {
                  hanzi: item.hanzi,
                  pinyin: item.pinyin || '',
                  hanViet: item.hanViet || '',
                  meaning: item.meaning || '',
                  radical: item.radical,
                  strokeCount: item.strokeCount,
                  components: item.components,
                  mnemonic: item.mnemonic,
                  examples: item.examples,
                  compoundWords: item.compoundWords,
                };
                if (isLoggedIn && json.sources?.[item.hanzi] === 'ai_generated') {
                  aiCreatedEntries.push({ ...item, source: 'ai_cached' });
                }
              }
            });
            if (isLoggedIn && aiCreatedEntries.length > 0) {
              saveSharedDictionaryBatch(aiCreatedEntries).catch(console.warn);
              trackDailyAIUsage('enrich', aiCreatedEntries.length).catch(console.warn);
            }
          }
        }

        if (isMounted && Object.keys(resolvedMap).length > 0) {
          setEnrichedConstituents((prev) => ({ ...prev, ...resolvedMap }));
        }
      } catch (err) {
        console.error('Failed to enrich constituent characters:', err);
      } finally {
        if (isMounted) setEnrichingConstituents(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [character.hanzi, allCharacters, isLoggedIn]);

  const handleSaveConstituent = (info: ConstituentInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    const charToAdd: Character = {
      id: `char-${Date.now()}-${info.hanzi}`,
      hanzi: info.hanzi,
      pinyin: info.pinyin || 'chưa rõ',
      hanViet: info.hanViet || '',
      meaning: info.meaning || 'Từ vựng mới',
      radical: info.radical || 'Chưa rõ',
      strokeCount: info.strokeCount || 1,
      components: info.components,
      mnemonic: info.mnemonic,
      examples: info.examples || [],
      compoundWords: info.compoundWords || [],
      listIds: ['single'],
      createdAt: Date.now(),
      srs: { ...DEFAULT_SRS },
    };
    addCharacter(charToAdd);
    setSavedConstituents((prev) => ({ ...prev, [info.hanzi]: true }));
    if (onUpdateCharacter) onUpdateCharacter();
  };

  const handleSelectConstituent = (info: ConstituentInfo) => {
    const existing = allCharacters?.find((c) => c.hanzi === info.hanzi);
    if (existing) {
      navigateToCharacter(existing);
    } else {
      const tempChar: Character = {
        id: `char-${Date.now()}-${info.hanzi}`,
        hanzi: info.hanzi,
        pinyin: info.pinyin || '',
        hanViet: info.hanViet || '',
        meaning: info.meaning || '',
        radical: info.radical || 'Chưa rõ',
        strokeCount: info.strokeCount || 1,
        components: info.components,
        mnemonic: info.mnemonic,
        examples: info.examples || [],
        compoundWords: info.compoundWords || [],
        listIds: ['single'],
        createdAt: Date.now(),
        srs: { ...DEFAULT_SRS },
      };
      navigateToCharacter(tempChar);
    }
  };

  const handleSelectCompoundWord = (cw: { word: string; pinyin: string; meaning: string }) => {
    const existing = allCharacters?.find((c) => c.hanzi === cw.word);
    if (existing) {
      navigateToCharacter(existing);
    } else {
      const tempChar: Character = {
        id: `char-${Date.now()}-${cw.word}`,
        hanzi: cw.word,
        pinyin: cw.pinyin || '',
        hanViet: '',
        meaning: cw.meaning || '',
        radical: 'Chưa rõ',
        strokeCount: cw.word.length,
        components: cw.word.split('').join(' + '),
        listIds: ['compound_review'],
        createdAt: Date.now(),
        srs: { ...DEFAULT_SRS },
      };
      navigateToCharacter(tempChar);
    }
  };

  const radicalInfo = findRadicalInfo(character.radical) || (character.hanzi.length === 1 ? findRadicalInfo(character.hanzi) : null);

  const isDataIncomplete =
    !character.meaning ||
    character.meaning === 'Từ vựng mới' ||
    character.meaning.includes('Từ vựng mới') ||
    character.meaning === 'Chưa có nghĩa' ||
    !character.pinyin ||
    character.pinyin === 'pinyin' ||
    character.pinyin === 'chưa rõ' ||
    character.pinyin === 'chưa có phiên âm';

  const handleRefreshDetails = async () => {
    setIsRefreshingDetails(true);
    setRefreshSuccessMessage('');
    setRefreshNeedsAuth(false);
    try {
      // Tier 1: Built-in HSK 1-6 dictionary
      let enriched: any = lookupBuiltIn(character.hanzi);
      let resolvedSourceLabel = 'từ điển sẵn có';

      // Tier 2: Firestore shared dictionary cache (signed-in users only)
      if (!enriched && isLoggedIn) {
        const cloudCache = await lookupSharedDictionaryOne(character.hanzi);
        if (
          cloudCache &&
          cloudCache.meaning &&
          !cloudCache.meaning.includes('Từ vựng mới') &&
          !cloudCache.meaning.startsWith('(EN)')
        ) {
          enriched = cloudCache;
          resolvedSourceLabel = 'thư viện chung';
        }
      }

      // Tier 3 (via server 3-tier waterfall: server cache -> Gemini AI for authenticated users)
      if (!enriched && !isStaticHost()) {
        const res = await authorizedFetch('/api/gemini/enrich', {
          method: 'POST',
          body: JSON.stringify({ characters: [character.hanzi] }),
        });
        const json = await res.json();
        const candidate = json.success && Array.isArray(json.data) ? json.data[0] : null;
        if (candidate && candidate.meaning && !String(candidate.meaning).startsWith('(EN)')) {
          enriched = candidate;
          const src = json.sources?.[character.hanzi];
          if (src === 'ai_generated') {
            resolvedSourceLabel = 'AI và đã lưu vào thư viện chung';
            if (isLoggedIn) {
              saveSharedDictionaryBatch([{ ...enriched, source: 'ai_cached' }]).catch(console.warn);
              trackDailyAIUsage('enrich', 1).catch(console.warn);
            }
          } else if (src === 'shared_cache') {
            resolvedSourceLabel = 'thư viện chung';
          } else {
            resolvedSourceLabel = 'từ điển sẵn có';
          }
        } else if (res.status === 401 || json.authRequired) {
          setRefreshNeedsAuth(true);
          setRefreshSuccessMessage(
            json.quotaWarning ||
              'Chữ này chưa có trong từ điển sẵn hoặc cache chung. Vui lòng đăng nhập Google để AI tra nghĩa tiếng Việt.'
          );
          return;
        } else if (json.quotaWarning) {
          setRefreshSuccessMessage(json.quotaWarning);
          return;
        }
      }

      if (enriched) {
        const updated: Character = {
          ...character,
          pinyin: enriched.pinyin && enriched.pinyin !== 'chưa rõ' ? enriched.pinyin : character.pinyin,
          hanViet:
            enriched.hanViet && enriched.hanViet !== 'CHƯA RÕ' && enriched.hanViet !== 'TRA CỨU MỞ RỘNG'
              ? enriched.hanViet
              : character.hanViet,
          meaning:
            enriched.meaning &&
            !enriched.meaning.includes('Từ vựng mới') &&
            !String(enriched.meaning).startsWith('(EN)')
              ? enriched.meaning
              : character.meaning,
          radical: enriched.radical || character.radical,
          strokeCount: enriched.strokeCount || character.strokeCount,
          components: enriched.components || character.components,
          mnemonic: enriched.mnemonic || character.mnemonic,
          hskLevel: enriched.hskLevel || character.hskLevel,
          aiMnemonics:
            Array.isArray(enriched.aiMnemonics) && enriched.aiMnemonics.length > 0
              ? enriched.aiMnemonics
              : character.aiMnemonics,
          examples:
            Array.isArray(enriched.examples) && enriched.examples.length > 0
              ? enriched.examples
              : character.examples,
          compoundWords:
            Array.isArray(enriched.compoundWords) && enriched.compoundWords.length > 0
              ? enriched.compoundWords
              : character.compoundWords,
        };
        if (updated.aiMnemonics && updated.aiMnemonics.length > 0) {
          setAiMnemonics(updated.aiMnemonics);
        }
        setActiveCharacter(updated);
        addCharacter(updated);
        if (onUpdateCharacter) onUpdateCharacter(updated);
        setRefreshSuccessMessage(`Đã cập nhật thông tin từ ${resolvedSourceLabel}!`);
        setTimeout(() => setRefreshSuccessMessage(''), 3000);
      } else if (!isLoggedIn && isStaticHost()) {
        setRefreshNeedsAuth(true);
        setRefreshSuccessMessage('Chữ này chưa có trong từ điển sẵn. Vui lòng đăng nhập Google để sử dụng AI.');
      }
    } catch (e) {
      console.error('Error refreshing character details:', e);
    } finally {
      setIsRefreshingDetails(false);
    }
  };

  const handleSaveNotes = () => {
    setIsSavingNotes(true);
    const updatedChar: Character = {
      ...character,
      customNotes: notes,
    };
    addCharacter(updatedChar);
    if (onUpdateCharacter) onUpdateCharacter(updatedChar);

    setIsSavingNotes(false);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  };

  const handleGenerateMnemonic = async () => {
    setLoadingMnemonic(true);
    setMnemonicNotice('');
    setMnemonicNeedsAuth(false);

    try {
      // 1. Check Tier 2 shared Firestore cache first (signed-in users)
      if (isLoggedIn) {
        const cloudCached = await lookupSharedDictionaryOne(character.hanzi);
        if (cloudCached && Array.isArray(cloudCached.aiMnemonics) && cloudCached.aiMnemonics.length > 0) {
          setAiMnemonics(cloudCached.aiMnemonics);
          const updated: Character = {
            ...character,
            aiMnemonics: cloudCached.aiMnemonics,
          };
          addCharacter(updated);
          if (onUpdateCharacter) onUpdateCharacter(updated);
          setMnemonicNotice('Đã lấy mẹo nhớ từ thư viện cache chung (không tốn lượt AI).');
          return;
        }
      }

      if (isStaticHost()) {
        const dict = lookupBuiltIn(character.hanzi);
        const mText = character.mnemonic || dict?.mnemonic;
        if (mText) {
          setAiMnemonics([
            {
              style: 'Mẹo nhớ ghi nhớ chuẩn',
              story: mText,
              breakdown: character.components || dict?.components || character.radical,
            },
          ]);
        }
        return;
      }

      // 2. Call server endpoint (checks server shared cache first for all users, requires login only to invoke Gemini AI)
      const res = await authorizedFetch('/api/gemini/mnemonic', {
        method: 'POST',
        body: JSON.stringify({
          hanzi: character.hanzi,
          meaning: character.meaning,
          radical: character.radical,
          components: character.components,
        }),
      });
      const json = await res.json();

      if (res.status === 401 || json.requireAuth) {
        setMnemonicNeedsAuth(true);
        setMnemonicNotice(json.error || 'Vui lòng đăng nhập Google để gọi AI tạo mẹo nhớ mới.');
        const dict = lookupBuiltIn(character.hanzi);
        const mText = character.mnemonic || dict?.mnemonic;
        if (mText && aiMnemonics.length === 0) {
          setAiMnemonics([
            {
              style: 'Mẹo nhớ từ điển sẵn có',
              story: mText,
              breakdown: character.components || dict?.components || character.radical,
            },
          ]);
        }
        return;
      }

      if (res.status === 429 || !json.success) {
        setMnemonicNotice(json.error || 'Chưa thể tạo thêm mẹo AI lúc này.');
        const dict = lookupBuiltIn(character.hanzi);
        const mText = character.mnemonic || dict?.mnemonic;
        if (mText && aiMnemonics.length === 0) {
          setAiMnemonics([
            {
              style: 'Mẹo nhớ từ điển sẵn có',
              story: mText,
              breakdown: character.components || dict?.components || character.radical,
            },
          ]);
        }
        return;
      }

      if (Array.isArray(json.data) && json.data.length > 0) {
        setAiMnemonics(json.data);
        const updated: Character = {
          ...character,
          aiMnemonics: json.data,
        };
        addCharacter(updated);
        if (onUpdateCharacter) onUpdateCharacter(updated);

        // Save back into Firestore sharedDictionary so all users can reuse it
        if (isLoggedIn) {
          saveSharedMnemonicToCache(character.hanzi, character, json.data).catch(console.warn);
        }

        if (json.fromCache) {
          setMnemonicNotice('Đã lấy mẹo nhớ từ cache chung của hệ thống.');
        } else {
          if (isLoggedIn) {
            trackDailyAIUsage('mnemonic', 1).catch(console.warn);
          }
          setMnemonicNotice('Đã tạo mẹo AI mới và lưu vào thư viện cache chung!');
        }
      }
    } catch (e) {
      console.error('Error generating AI Mnemonic:', e);
      const dict = lookupBuiltIn(character.hanzi);
      const mText = character.mnemonic || dict?.mnemonic;
      if (mText) {
        setAiMnemonics([
          {
            style: 'Mẹo nhớ ghi nhớ chuẩn',
            story: mText,
            breakdown: character.components || dict?.components || character.radical,
          },
        ]);
      }
    } finally {
      setLoadingMnemonic(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md ${
        isCompactLandscape ? 'p-0' : 'p-2.5 sm:p-4'
      }`}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 20 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className={`relative bg-slate-900 w-full flex flex-col overflow-hidden text-slate-100 ${
          isCompactLandscape
            ? 'h-full max-w-none max-h-none rounded-none border-0 shadow-none'
            : 'max-w-2xl max-h-[92vh] rounded-2xl shadow-2xl border border-slate-800'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact Landscape: Minimal floating corner controls so 100% of vertical screen height shows content */}
        {isCompactLandscape ? (
          <div className="pointer-events-none absolute top-2.5 right-3 left-3 z-20 flex items-center justify-between gap-2">
            <div>
              {historyStack.length > 0 && (
                <button
                  type="button"
                  onClick={handleGoBack}
                  className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-cyan-200 bg-slate-950/85 hover:bg-cyan-950/90 backdrop-blur-md border border-cyan-500/40 rounded-xl shadow-lg transition cursor-pointer active:scale-95"
                  title={`Quay về chữ trước đó: ${historyStack[historyStack.length - 1].hanzi}`}
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Quay về: {historyStack[historyStack.length - 1].hanzi}</span>
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng chi tiết"
              className="pointer-events-auto p-2 text-slate-300 hover:text-white bg-slate-950/85 hover:bg-slate-800 backdrop-blur-md border border-slate-700/70 rounded-xl shadow-lg transition cursor-pointer active:scale-95"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* Desktop / Portrait: Pinned Modal Header */
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800/80 bg-slate-950/60">
            <div className="flex items-center gap-2">
              {historyStack.length > 0 ? (
                <button
                  type="button"
                  onClick={handleGoBack}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:text-cyan-100 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/50 rounded-xl transition cursor-pointer shadow-sm active:scale-95 group"
                  title={`Quay về chữ trước đó: ${historyStack[historyStack.length - 1].hanzi}`}
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-cyan-400 group-hover:-translate-x-0.5 transition-transform" />
                  <span>Quay về: <strong className="text-cyan-200">{historyStack[historyStack.length - 1].hanzi}</strong></span>
                </button>
              ) : (
                <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Chữ Hán Chi Tiết
                </span>
              )}
              <span className="text-xs text-slate-600">•</span>
              <span className="text-xs text-slate-400 font-mono">
                Độ thuộc: <span className="text-cyan-300 font-bold">{character.srs.masteryLevel}%</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefreshDetails}
                disabled={isRefreshingDetails}
                className="px-2.5 py-1 text-xs font-medium text-cyan-300 bg-cyan-950/50 hover:bg-cyan-900/50 border border-cyan-800/60 rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Tra cứu & cập nhật thông tin chuẩn xác từ từ điển/AI"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingDetails ? 'animate-spin text-cyan-400' : ''}`} />
                <span className="hidden sm:inline">{isRefreshingDetails ? 'Đang tải...' : 'Làm mới chi tiết'}</span>
              </button>
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Modal Scroll Body */}
        <div
          className={`flex-1 overflow-y-auto ${
            isCompactLandscape ? 'px-4 py-3 space-y-3.5' : 'p-4 sm:p-6 space-y-5 sm:space-y-6'
          }`}
        >
          {/* In compact landscape, place header metadata & refresh action inline at top of scroll flow so it scrolls away cleanly */}
          {isCompactLandscape && (
            <div className="flex items-center justify-between gap-3 pr-11 pb-2 border-b border-slate-800/70">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="font-semibold text-emerald-300">Chữ Hán Chi Tiết</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  Độ thuộc: <strong className="text-cyan-300">{character.srs.masteryLevel}%</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={handleRefreshDetails}
                disabled={isRefreshingDetails}
                className="px-2.5 py-1 text-xs font-medium text-cyan-300 bg-cyan-950/50 hover:bg-cyan-900/50 border border-cyan-800/60 rounded-lg transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                title="Tra cứu & cập nhật thông tin chuẩn xác từ từ điển/AI"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshingDetails ? 'animate-spin text-cyan-400' : ''}`} />
                <span>{isRefreshingDetails ? 'Đang tải...' : 'Làm mới chi tiết'}</span>
              </button>
            </div>
          )}
          {/* Breadcrumb banner if user navigated from another word (e.g. from a compound word) */}
          {historyStack.length > 0 && (
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-cyan-950/80 via-slate-900/90 to-cyan-950/80 border border-cyan-500/40 rounded-2xl shadow-inner gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 bg-cyan-500/20 text-cyan-300 rounded-xl shrink-0">
                  <ArrowLeft className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] text-slate-400 block">Đang xem chữ đơn từ:</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-serif font-bold text-cyan-300 text-base">
                      {historyStack[historyStack.length - 1].hanzi}
                    </span>
                    {historyStack[historyStack.length - 1].pinyin && (
                      <span className="font-mono text-cyan-400 text-xs">
                        ({historyStack[historyStack.length - 1].pinyin})
                      </span>
                    )}
                    <span className="text-slate-300 text-xs truncate max-w-xs">
                      - {historyStack[historyStack.length - 1].meaning}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleGoBack}
                className="shrink-0 px-3 py-1.5 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition cursor-pointer shadow-md flex items-center gap-1.5 active:scale-95"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Quay về {historyStack[historyStack.length - 1].hanzi}</span>
              </button>
            </div>
          )}
          {/* Notification / Incomplete Banner */}
          {refreshSuccessMessage && (
            <div
              className={`p-3 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2 border ${
                refreshNeedsAuth
                  ? 'bg-amber-950/60 border-amber-500/40 text-amber-200'
                  : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {refreshNeedsAuth ? (
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <span>{refreshSuccessMessage}</span>
              </div>
              {refreshNeedsAuth && !isLoggedIn && onRequireSignIn && (
                <button
                  type="button"
                  onClick={onRequireSignIn}
                  className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg transition cursor-pointer shrink-0"
                >
                  Đăng nhập Google
                </button>
              )}
            </div>
          )}

          {isDataIncomplete && !refreshSuccessMessage && (
            <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Chữ chưa có đầy đủ thông tin chi tiết (nghĩa, ví dụ, câu ghép)
                </div>
                <p className="text-[11px] text-slate-300">
                  Nhấn nút bên cạnh để hệ thống tra từ điển hoặc AI bổ sung phiên âm, nghĩa tiếng Việt chuẩn, câu ví dụ và từ ghép.
                </p>
              </div>
              <button
                onClick={handleRefreshDetails}
                disabled={isRefreshingDetails}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow transition flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingDetails ? 'animate-spin' : ''}`} />
                <span>{isRefreshingDetails ? 'Đang hoàn thiện...' : 'Hoàn thiện thông tin ngay'}</span>
              </button>
            </div>
          )}
          {/* Main Top Section: Hero Hanzi + Stroke Canvas */}
          <div
            className={`grid items-center bg-slate-950/80 rounded-2xl border border-slate-800/80 shadow-inner ${
              isCompactLandscape
                ? 'grid-cols-2 gap-4 p-3.5'
                : 'grid-cols-1 md:grid-cols-2 gap-6 p-4 sm:p-5'
            }`}
          >
            {/* Left Column: Big Hanzi */}
            <div
              className={`flex flex-col ${
                isCompactLandscape
                  ? 'items-start text-left space-y-1.5'
                  : 'items-center md:items-start text-center md:text-left space-y-2'
              }`}
            >
              <div className="flex items-baseline gap-2.5">
                <span
                  className={`font-serif font-bold text-slate-100 tracking-tight ${
                    isCompactLandscape ? 'text-4xl sm:text-5xl' : 'text-5xl sm:text-6xl'
                  }`}
                >
                  {character.hanzi}
                </span>
                <button
                  onClick={() => speakChinese(character.hanzi)}
                  className="p-1.5 text-cyan-300 hover:bg-slate-800 rounded-full transition cursor-pointer"
                  title="Nghe phát âm"
                >
                  <Volume2 className={isCompactLandscape ? 'w-5 h-5' : 'w-6 h-6'} />
                </button>
              </div>

              <div
                className={`flex flex-wrap items-center gap-2 ${
                  isCompactLandscape ? 'justify-start pt-0.5' : 'justify-center md:justify-start pt-1'
                }`}
              >
                <span
                  className={`font-mono font-bold text-cyan-300 bg-cyan-950/60 px-2.5 py-0.5 rounded-lg border border-cyan-500/30 ${
                    isCompactLandscape ? 'text-sm sm:text-base' : 'text-base sm:text-lg'
                  }`}
                >
                  {character.pinyin}
                </span>
                {character.hanViet && (
                  <span className="text-xs font-bold text-teal-300 bg-teal-950/60 px-2 py-0.5 rounded-lg border border-teal-500/30 uppercase">
                    {character.hanViet}
                  </span>
                )}
              </div>

              <p
                className={`text-slate-200 font-medium ${
                  isCompactLandscape ? 'text-sm pt-1 leading-snug' : 'text-sm sm:text-base pt-2'
                }`}
              >
                {character.meaning}
              </p>

              <div className={`grid grid-cols-2 gap-2 text-xs text-slate-400 w-full ${isCompactLandscape ? 'pt-1' : 'pt-2'}`}>
                <div className={`bg-slate-900 rounded-xl border border-slate-800 flex flex-col justify-between ${isCompactLandscape ? 'p-2' : 'p-2.5'}`}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-slate-500 block text-[10px] uppercase font-mono">Bộ thủ</span>
                    {onOpenRadicalView && radicalInfo && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenRadicalView(radicalInfo.id, character);
                        }}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer underline"
                      >
                        Sổ tay →
                      </button>
                    )}
                  </div>
                  <span className="font-semibold text-slate-200 truncate">
                    {radicalInfo
                      ? `${radicalInfo.variants.length > 0 ? radicalInfo.variants[0] : radicalInfo.hanzi} ${radicalInfo.hanViet}`
                      : character.radical}
                  </span>
                </div>
                <div className={`bg-slate-900 rounded-xl border border-slate-800 ${isCompactLandscape ? 'p-2' : 'p-2.5'}`}>
                  <span className="text-slate-500 block text-[10px] uppercase font-mono">Số nét</span>
                  <span className="font-semibold text-slate-200 tabular-nums">{character.strokeCount} nét</span>
                </div>
              </div>
            </div>

            {/* Right Column: Stroke Writing Canvas with touch isolation & compound support */}
            <div className={`flex flex-col items-center justify-center w-full ${isCompactLandscape ? 'pt-0' : 'pt-2 md:pt-0'}`}>
              <StrokeWriterCanvas
                hanzi={character.hanzi}
                pinyin={character.pinyin}
                size={isCompactLandscape ? 175 : 230}
              />
            </div>
          </div>

          {/* Radical Philosophical & Associative Context */}
          {radicalInfo && (
            <div className="p-3.5 bg-gradient-to-r from-slate-950 via-slate-900/90 to-cyan-950/20 border border-cyan-500/30 rounded-2xl space-y-2 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl font-serif font-bold text-cyan-300">
                    {radicalInfo.variants.length > 0 ? `${radicalInfo.variants[0]} (${radicalInfo.hanzi})` : radicalInfo.hanzi}
                  </span>
                  <div>
                    <span className="text-xs font-bold text-slate-100">
                      Bộ {radicalInfo.hanViet}
                    </span>
                    <span className="text-[11px] font-mono text-cyan-400 ml-1.5">
                      ({radicalInfo.pinyin} · {radicalInfo.strokeCount} nét)
                    </span>
                  </div>
                </div>

                {onOpenRadicalView && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenRadicalView(radicalInfo.id, character);
                    }}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer flex items-center gap-1"
                  >
                    <span>Xem chi tiết Bộ {radicalInfo.hanViet}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>

              <p className="text-xs text-slate-300 leading-snug">
                <strong className="text-slate-200">Ý nghĩa biểu tượng: </strong>
                {radicalInfo.meaning}
              </p>

              <div className="text-[11px] text-cyan-200/90 bg-cyan-950/40 p-2.5 rounded-xl border border-cyan-500/20">
                <span className="font-semibold text-cyan-400">💡 Gợi ý liên tưởng: </span>
                {radicalInfo.associationTip}
              </div>
            </div>
          )}

          {/* Composition & Structure */}
          {character.components && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                Cấu tạo & Chiết tự
              </h4>
              <p className="text-sm font-mono text-slate-200 bg-slate-950/80 px-3.5 py-2.5 rounded-xl border border-slate-800">
                {character.components}
              </p>
            </div>
          )}

          {/* Constituent Single Characters for Compound Words */}
          {character.hanzi.length > 1 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  Chữ Đơn Cấu Thành Từ Ghép Này ({character.hanzi.length} chữ)
                </h4>
                {enrichingConstituents && (
                  <span className="text-[11px] text-cyan-400 flex items-center gap-1 font-mono">
                    <Loader2 className="w-3 h-3 animate-spin" /> Tra cứu chi tiết...
                  </span>
                )}
              </div>

              <div className={`grid gap-2.5 ${isCompactLandscape && character.hanzi.length >= 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {character.hanzi.split('').map((ch: string, idx: number) => {
                  const info = resolveConstituentInfo(ch);
                  const isSaved = info.isSaved || savedConstituents[ch];
                  const hasPinyin = !!info.pinyin;
                  const hasHanViet = !!info.hanViet;
                  const hasMeaning = !!info.meaning && info.meaning !== 'Chữ đơn cấu thành';

                  return (
                    <div
                      key={idx}
                      onClick={() => onSelectCharacter && handleSelectConstituent(info)}
                      className={`p-3 bg-gradient-to-r from-slate-950/90 via-slate-900/90 to-slate-950/90 border border-slate-800 hover:border-cyan-500/40 rounded-2xl transition-all shadow-inner group ${
                        onSelectCharacter ? 'cursor-pointer hover:shadow-lg hover:shadow-cyan-950/30' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        {/* Hanzi Box */}
                        <div className="shrink-0 flex flex-col items-center">
                          <div className="w-13 h-13 rounded-xl bg-slate-900 border border-cyan-500/30 flex items-center justify-center text-3xl font-serif font-bold text-cyan-300 shadow-inner group-hover:border-cyan-400 group-hover:scale-105 transition-all">
                            {ch}
                          </div>
                          {info.strokeCount ? (
                            <span className="mt-1 text-[10px] font-mono text-slate-400">
                              {info.strokeCount} nét
                            </span>
                          ) : null}
                        </div>

                        {/* Character Details */}
                        <div className="flex-1 min-w-0 space-y-1">
                          {/* Row 1: Pinyin, Hán Việt, Radical, Status */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {hasPinyin ? (
                              <span className="text-sm font-mono font-bold text-cyan-300">
                                {info.pinyin}
                              </span>
                            ) : (
                              <span className="text-xs font-mono text-slate-500 italic">
                                {enrichingConstituents ? 'Đang tải...' : 'Chưa có pinyin'}
                              </span>
                            )}

                            {hasHanViet && (
                              <span className="text-[10px] font-bold text-teal-300 bg-teal-950/70 px-1.5 py-0.5 rounded border border-teal-500/40 uppercase tracking-wide">
                                {info.hanViet}
                              </span>
                            )}

                            {info.radical && (
                              <span className="text-[10px] font-mono text-slate-400 bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-800">
                                Bộ: {info.radical}
                              </span>
                            )}

                            {isSaved && (
                              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30 flex items-center gap-0.5">
                                <Check className="w-2.5 h-2.5" /> Đã lưu
                              </span>
                            )}
                          </div>

                          {/* Row 2: Vietnamese Meaning */}
                          <div className="text-xs sm:text-sm text-slate-200 font-medium leading-relaxed">
                            {hasMeaning ? (
                              info.meaning
                            ) : enrichingConstituents ? (
                              <span className="text-xs text-slate-400 italic flex items-center gap-1.5">
                                <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                                Đang tra cứu nghĩa và âm Hán Việt...
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Đang cập nhật thông tin nghĩa</span>
                            )}
                          </div>

                          {/* Row 3: Components / Breakdown if available */}
                          {info.components && (
                            <p className="text-[11px] font-mono text-slate-400">
                              <span className="text-slate-500">Chiết tự:</span> {info.components}
                            </p>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="shrink-0 flex items-center gap-1 self-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              speakChinese(ch);
                            }}
                            className="p-2 text-slate-400 hover:text-cyan-300 bg-slate-900 rounded-xl border border-slate-800 transition cursor-pointer"
                            title="Phát âm chữ này"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>

                          {!isSaved ? (
                            <button
                              type="button"
                              onClick={(e) => handleSaveConstituent(info, e)}
                              className="px-2.5 py-1.5 text-xs font-semibold text-cyan-300 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/30 rounded-xl flex items-center gap-1 transition cursor-pointer"
                              title="Lưu chữ đơn này vào danh sách từ vựng cá nhân"
                            >
                              <ListPlus className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Lưu</span>
                            </button>
                          ) : (
                            onSelectCharacter && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectConstituent(info);
                                }}
                                className="px-2.5 py-1.5 text-xs font-semibold text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl flex items-center gap-1 transition cursor-pointer group-hover:text-cyan-300 group-hover:border-cyan-500/30"
                                title="Xem chi tiết chữ này"
                              >
                                <span className="hidden sm:inline">Chi tiết</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Mnemonic Story */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Mẹo Ghi Nhớ (Mnemonic)
              </h4>
              <button
                onClick={handleGenerateMnemonic}
                disabled={loadingMnemonic}
                className="text-xs font-semibold text-cyan-300 hover:text-cyan-200 flex items-center gap-1 disabled:opacity-50 cursor-pointer"
              >
                {loadingMnemonic ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                    <span>Đang suy nghĩ...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    <span>Tạo thêm mẹo AI</span>
                  </>
                )}
              </button>
            </div>

            {character.mnemonic && (
              <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl text-sm text-emerald-200 leading-relaxed">
                {character.mnemonic}
              </div>
            )}

            {mnemonicNotice && (
              <div
                className={`p-2.5 rounded-xl border text-[11px] font-medium flex flex-wrap items-center justify-between gap-2 ${
                  mnemonicNeedsAuth
                    ? 'bg-amber-950/50 border-amber-500/40 text-amber-200'
                    : 'bg-cyan-950/30 border-cyan-500/20 text-cyan-300/90'
                }`}
              >
                <span>{mnemonicNotice}</span>
                {mnemonicNeedsAuth && !isLoggedIn && onRequireSignIn && (
                  <button
                    type="button"
                    onClick={onRequireSignIn}
                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg transition cursor-pointer shrink-0"
                  >
                    Đăng nhập Google
                  </button>
                )}
              </div>
            )}

            {aiMnemonics.length > 0 && (
              <div className="space-y-2 pt-1">
                {aiMnemonics.map((m, idx) => (
                  <div key={idx} className="p-3 bg-cyan-950/40 border border-cyan-500/30 rounded-xl text-xs space-y-1">
                    <span className="font-bold text-cyan-300 block">✨ {m.style}</span>
                    <p className="text-slate-200 leading-normal">{m.story}</p>
                    {m.breakdown && <p className="text-slate-400 italic text-[11px]">{m.breakdown}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Example Sentences */}
          {character.examples && character.examples.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                Ví Dụ Thực Tế
              </h4>
              <div className="space-y-2">
                {character.examples.map((ex, i) => (
                  <div key={i} className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-base font-serif font-medium text-slate-100">{ex.sentence}</p>
                      <button
                        onClick={() => speakChinese(ex.sentence)}
                        className="p-1 text-slate-400 hover:text-cyan-300 transition cursor-pointer"
                        title="Nghe câu"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs font-mono text-cyan-400">{ex.pinyin}</p>
                    <p className="text-xs text-slate-300">{ex.meaning}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compound Words */}
          {character.compoundWords && character.compoundWords.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
                Từ Ghép Thường Gặp
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {character.compoundWords.map((cw, i) => (
                  <div
                    key={i}
                    onClick={() => handleSelectCompoundWord(cw)}
                    className="p-2.5 bg-slate-950/80 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/40 rounded-xl flex items-center justify-between cursor-pointer group transition shadow-inner"
                    title="Bấm để xem chi tiết từ ghép này"
                  >
                    <div>
                      <span className="text-lg font-serif font-semibold text-slate-100 group-hover:text-cyan-300 pr-2 transition-colors">
                        {cw.word}
                      </span>
                      <span className="text-xs font-mono text-cyan-400">{cw.pinyin}</span>
                      <p className="text-xs text-slate-300 line-clamp-1">{cw.meaning}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          speakChinese(cw.word);
                        }}
                        className="p-1.5 text-slate-400 hover:text-cyan-300 bg-slate-900 rounded-lg border border-slate-800 transition cursor-pointer"
                        title="Nghe phát âm"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Personal Note Editor */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                Ghi Chú Cá Nhân
              </h4>
              {notesSaved && (
                <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                  <Check className="w-3 h-3" /> Đã lưu
                </span>
              )}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Nhập ghi chú cá nhân, ngữ cảnh cần nhớ..."
              rows={2}
              className="w-full text-xs p-3 bg-slate-950 text-slate-100 border border-slate-800 rounded-xl focus:outline-hidden focus:border-cyan-500"
            />
            <div className="flex justify-end">
              <button
                onClick={handleSaveNotes}
                disabled={isSavingNotes}
                className="px-3.5 py-1.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition cursor-pointer"
              >
                {isSavingNotes ? 'Đang lưu...' : 'Lưu ghi chú'}
              </button>
            </div>
          </div>
          {/* Compact Landscape: Action footer lives inside scroll flow so it never pins over content */}
          {isCompactLandscape && (
            <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 pb-1">
              <div className="flex items-center gap-2">

                {!confirmingDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 px-3 py-2 rounded-xl border border-rose-500/30 transition cursor-pointer"
                    title="Xóa chữ này"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa chữ</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 bg-rose-950/60 p-1 rounded-xl border border-rose-500/40">
                    <span className="text-[11px] font-bold text-rose-300 px-1.5">Xác nhận xóa?</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (onDeleteCharacter) {
                          onDeleteCharacter(character.id);
                        } else {
                          removeCharacter(character.id);
                          if (onUpdateCharacter) onUpdateCharacter();
                        }
                        onClose();
                      }}
                      className="px-2.5 py-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition cursor-pointer"
                    >
                      Xóa ngay
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200 transition cursor-pointer"
                    >
                      Hủy
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/70 hover:bg-slate-800 rounded-xl transition ml-auto cursor-pointer"
              >
                Đóng
              </button>
            </div>
          )}
        </div>

        {/* Desktop / Portrait: Pinned Modal Footer Actions */}
        {!isCompactLandscape && (
          <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">

              {!confirmingDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 px-3 py-2 rounded-xl border border-rose-500/30 transition cursor-pointer"
                  title="Xóa chữ này"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa chữ</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 bg-rose-950/60 p-1 rounded-xl border border-rose-500/40">
                  <span className="text-[11px] font-bold text-rose-300 px-1.5">Xác nhận xóa?</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (onDeleteCharacter) {
                        onDeleteCharacter(character.id);
                      } else {
                        removeCharacter(character.id);
                        if (onUpdateCharacter) onUpdateCharacter();
                      }
                      onClose();
                    }}
                    className="px-2.5 py-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition cursor-pointer"
                  >
                    Xóa ngay
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200 transition cursor-pointer"
                  >
                    Hủy
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-100 rounded-xl transition ml-auto cursor-pointer"
            >
              Đóng
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};
