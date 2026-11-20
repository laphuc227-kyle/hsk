import fs from 'fs';
import path from 'path';
import hanziPkg from 'hanzi';
import { pinyin as pinyinPro } from 'pinyin-pro';
import { lookupBuiltIn } from '../src/services/builtInDictionary.ts';
import { getHskLevelNumber } from '../src/services/hskClassifier.ts';
import { findRadicalInfo } from '../src/services/radicalsDatabase.ts';
import type { MnemonicVariant, SharedDictionaryEntry } from '../src/types/index.ts';

const hanziLib: any = (hanziPkg as any)?.default || hanziPkg;

let hanziInitialized = false;

export function ensureHanziStarted(): void {
  if (hanziInitialized) return;
  try {
    if (typeof hanziLib?.start === 'function') {
      hanziLib.start();
    }
    hanziInitialized = true;
  } catch (err) {
    console.warn('[DictionaryService] hanzi.start() warning:', err);
  }
}

export interface ExtendedLookupResult {
  hanzi: string;
  pinyin: string;
  hanViet?: string;
  meaning?: string;
  englishGloss?: string;
  radical: string;
  strokeCount: number;
  components: string;
  mnemonic?: string;
  hskLevel: number;
  examples: Array<{ sentence: string; pinyin: string; meaning: string }>;
  compoundWords: Array<{ word: string; pinyin: string; meaning: string }>;
  aiMnemonics?: MnemonicVariant[];
  source: 'builtin_hsk' | 'extended_dict' | 'ai_cached';
}

function hanziToCacheKey(hanzi: string): string {
  const trimmed = hanzi.trim();
  const codes = Array.from(trimmed).map((ch) => (ch.codePointAt(0) || 0).toString(16));
  return `u_${codes.join('_')}`.slice(0, 128);
}

/**
 * Look up extended metadata (CC-CEDICT + pinyin-pro + Kangxi radicals + decomposition)
 * without spending any AI tokens.
 */
export function lookupExtendedDictionary(word: string): ExtendedLookupResult | null {
  const clean = word.trim();
  if (!clean) return null;

  ensureHanziStarted();

  let pinyinText = '';
  try {
    const py = pinyinPro(clean, { toneType: 'symbol', type: 'string' });
    if (py && typeof py === 'string') {
      pinyinText = clean.length > 1 ? py.replace(/\s+/g, ' ').trim() : py.trim();
    }
  } catch {
    pinyinText = '';
  }

  let englishGloss = '';
  try {
    const defs = hanziLib?.definitionLookup?.(clean);
    if (Array.isArray(defs) && defs.length > 0) {
      const topDefs = defs
        .slice(0, 2)
        .map((d: any) => (typeof d?.definition === 'string' ? d.definition.split('/').filter(Boolean).slice(0, 3).join('; ') : ''))
        .filter(Boolean);
      englishGloss = topDefs.join(' | ');
    }
  } catch {
    englishGloss = '';
  }

  // Decomposition & radical extraction for first character (or single character)
  const firstChar = Array.from(clean)[0] || clean;
  const radInfo = findRadicalInfo(firstChar);
  let components = '';
  let radical = radInfo
    ? `${radInfo.variants.length > 0 ? radInfo.variants[0] : radInfo.hanzi} (${radInfo.hanViet})`
    : 'Bộ thủ';
  let strokeCount = radInfo ? radInfo.strokeCount : Math.max(1, Array.from(clean).length * 4);

  try {
    const decomp = hanziLib?.decompose?.(firstChar);
    if (decomp) {
      const parts = Array.isArray(decomp.components1)
        ? decomp.components1.filter((c: string) => c && c !== 'No glyph available')
        : [];
      if (parts.length > 0 && clean.length === 1) {
        components = parts.join(' + ');
      }
      if (!radInfo && decomp.radical) {
        const decompRad = findRadicalInfo(decomp.radical);
        if (decompRad) {
          radical = `${decompRad.variants.length > 0 ? decompRad.variants[0] : decompRad.hanzi} (${decompRad.hanViet})`;
        } else {
          radical = decomp.radical;
        }
      }
    }
  } catch {
    // ignore decomposition miss
  }

  if (clean.length > 1 && !components) {
    components = Array.from(clean).join(' + ');
  }

  // Compound word suggestions via hanzi.getExamples
  const compoundWords: Array<{ word: string; pinyin: string; meaning: string }> = [];
  if (clean.length === 1) {
    try {
      const examples = hanziLib?.getExamples?.(clean);
      const flat: any[] = Array.isArray(examples)
        ? examples.flat().filter((item) => item && typeof item.simplified === 'string')
        : [];
      const seenWords = new Set<string>();
      for (const item of flat) {
        const w = item.simplified.trim();
        if (w.length > 1 && w !== clean && !seenWords.has(w)) {
          seenWords.add(w);
          const builtInSub = lookupBuiltIn(w);
          const cachedSub = builtInSub ? null : getCachedEntry(w);
          const pySub =
            builtInSub?.pinyin ||
            cachedSub?.pinyin ||
            (() => {
              try {
                return pinyinPro(w, { toneType: 'symbol', type: 'string' }).trim();
              } catch {
                return '';
              }
            })();
          const glossSub =
            builtInSub?.meaning ||
            (cachedSub?.meaning && !cachedSub.meaning.startsWith('(EN)') && !cachedSub.meaning.includes('Từ vựng mới')
              ? cachedSub.meaning
              : '');
          if (glossSub) {
            compoundWords.push({ word: w, pinyin: pySub, meaning: glossSub });
          }
          if (compoundWords.length >= 3) break;
        }
      }
    } catch {
      // ignore example lookup failure
    }
  }

  // If neither pinyin nor gloss was found, return null
  if (!pinyinText && !englishGloss) return null;

  return {
    hanzi: clean,
    pinyin: pinyinText || 'chưa rõ',
    englishGloss: englishGloss || undefined,
    radical,
    strokeCount,
    components,
    hskLevel: getHskLevelNumber(clean),
    examples: [],
    compoundWords,
    source: 'extended_dict',
  };
}

// ================= PERSISTENT SERVER CACHE (TIER 2) =================

const CACHE_DIR = path.join(process.cwd(), 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'shared_dictionary_cache.json');

const serverCache = new Map<string, SharedDictionaryEntry>();
let cacheLoaded = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

export function loadSharedCacheFromDisk(): void {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    if (!fs.existsSync(CACHE_FILE)) {
      return;
    }
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      for (const [key, val] of Object.entries(parsed)) {
        if (val && typeof val === 'object' && typeof (val as any).hanzi === 'string') {
          serverCache.set(key, val as SharedDictionaryEntry);
        }
      }
    }
    console.log(`[DictionaryService] Loaded ${serverCache.size} shared cache entries from disk.`);
  } catch (err) {
    console.warn('[DictionaryService] Failed loading cache file:', err);
  }
}

function schedulePersistCache(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
      }
      const obj: Record<string, SharedDictionaryEntry> = {};
      for (const [k, v] of serverCache.entries()) {
        obj[k] = v;
      }
      const tmpPath = `${CACHE_FILE}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(obj), 'utf-8');
      fs.renameSync(tmpPath, CACHE_FILE);
    } catch (err) {
      console.warn('[DictionaryService] Failed persisting cache file:', err);
    }
  }, 300);
}

export function getCachedEntry(hanzi: string): SharedDictionaryEntry | null {
  loadSharedCacheFromDisk();
  const clean = hanzi.trim();
  if (!clean) return null;
  return serverCache.get(clean) || null;
}

export function upsertCachedEntry(
  partial: Partial<SharedDictionaryEntry> & { hanzi: string }
): SharedDictionaryEntry {
  loadSharedCacheFromDisk();
  const clean = partial.hanzi.trim();
  const existing = serverCache.get(clean);
  const now = Date.now();

  const next: SharedDictionaryEntry = {
    id: existing?.id || partial.id || hanziToCacheKey(clean),
    hanzi: clean,
    pinyin:
      partial.pinyin && partial.pinyin !== 'chưa rõ'
        ? partial.pinyin
        : existing?.pinyin || 'chưa rõ',
    hanViet:
      partial.hanViet && partial.hanViet !== 'CHƯA RÕ'
        ? partial.hanViet
        : existing?.hanViet || 'CHƯA RÕ',
    meaning:
      partial.meaning && !partial.meaning.includes('Từ vựng mới') && !partial.meaning.startsWith('(EN)')
        ? partial.meaning
        : existing?.meaning || partial.meaning || '',
    radical: partial.radical || existing?.radical || 'Bộ thủ',
    strokeCount: Number(partial.strokeCount) || existing?.strokeCount || 1,
    components: partial.components || existing?.components || '',
    mnemonic: partial.mnemonic || existing?.mnemonic || '',
    hskLevel: partial.hskLevel || existing?.hskLevel || getHskLevelNumber(clean),
    examples:
      Array.isArray(partial.examples) && partial.examples.length > 0
        ? partial.examples
        : existing?.examples || [],
    compoundWords:
      Array.isArray(partial.compoundWords) && partial.compoundWords.length > 0
        ? partial.compoundWords
        : existing?.compoundWords || [],
    aiMnemonics:
      Array.isArray(partial.aiMnemonics) && partial.aiMnemonics.length > 0
        ? partial.aiMnemonics
        : existing?.aiMnemonics,
    source: partial.source || existing?.source || 'ai_cached',
    createdBy: existing?.createdBy || partial.createdBy || 'system',
    updatedAt: now,
  };

  serverCache.set(clean, next);
  schedulePersistCache();
  return next;
}

export function upsertCachedMnemonics(
  hanzi: string,
  baseInfo: {
    pinyin?: string;
    hanViet?: string;
    meaning?: string;
    radical?: string;
    strokeCount?: number;
    components?: string;
    mnemonic?: string;
  },
  aiMnemonics: MnemonicVariant[],
  updatedBy = 'system'
): SharedDictionaryEntry {
  const builtIn = lookupBuiltIn(hanzi);
  const ext = builtIn ? null : lookupExtendedDictionary(hanzi);
  return upsertCachedEntry({
    hanzi,
    pinyin: baseInfo.pinyin || builtIn?.pinyin || ext?.pinyin || 'chưa rõ',
    hanViet: baseInfo.hanViet || builtIn?.hanViet || 'CHƯA RÕ',
    meaning: baseInfo.meaning || builtIn?.meaning || ext?.englishGloss || hanzi,
    radical: baseInfo.radical || builtIn?.radical || ext?.radical || 'Bộ thủ',
    strokeCount: baseInfo.strokeCount || builtIn?.strokeCount || ext?.strokeCount || 1,
    components: baseInfo.components || builtIn?.components || ext?.components || '',
    mnemonic: baseInfo.mnemonic || builtIn?.mnemonic || '',
    examples: builtIn?.examples || ext?.examples || [],
    compoundWords: builtIn?.compoundWords || ext?.compoundWords || [],
    aiMnemonics,
    source: builtIn ? 'builtin_hsk' : 'ai_cached',
    createdBy: updatedBy,
  });
}

/**
 * Pure cache/dictionary waterfall (0 AI calls):
 * Tier 1A (Vietnamese built-in HSK 1-6) -> Tier 2 (Server shared cache) -> Tier 1B (CC-CEDICT + pinyin-pro)
 */
export function lookupDictionaryNoAI(hanzi: string): ExtendedLookupResult | null {
  const clean = hanzi.trim();
  if (!clean) return null;

  const builtIn = lookupBuiltIn(clean);
  const cached = getCachedEntry(clean);

  if (builtIn) {
    return {
      ...builtIn,
      components: builtIn.components || '',
      hskLevel: builtIn.hskLevel || getHskLevelNumber(clean),
      aiMnemonics: cached?.aiMnemonics,
      source: 'builtin_hsk',
    };
  }

  if (
    cached &&
    cached.meaning &&
    !cached.meaning.includes('Từ vựng mới') &&
    !cached.meaning.startsWith('(EN)')
  ) {
    return {
      hanzi: cached.hanzi,
      pinyin: cached.pinyin,
      hanViet: cached.hanViet,
      meaning: cached.meaning,
      radical: cached.radical,
      strokeCount: cached.strokeCount,
      components: cached.components || '',
      mnemonic: cached.mnemonic,
      hskLevel: cached.hskLevel || getHskLevelNumber(clean),
      examples: cached.examples || [],
      compoundWords: cached.compoundWords || [],
      aiMnemonics: cached.aiMnemonics,
      source: 'ai_cached',
    };
  }

  return lookupExtendedDictionary(clean);
}
