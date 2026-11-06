import { Character } from '../types';
import { MASTER_COMPOUND_DATABASE } from './compoundWordDetector';
import { lookupBuiltIn } from './builtInDictionary';

/**
 * Strips Vietnamese diacritics and Pinyin tone marks for flexible fuzzy searching.
 * e.g. "học tập" -> "hoc tap", "xuéxí" -> "xuexi", "bạn bè" -> "ban be"
 */
export function stripAccents(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Strip combining diacritical marks
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'))
    .replace(/[üǖǘǚǜ]/g, 'u')
    .toLowerCase()
    .trim();
}

/**
 * Checks whether a single character is a Hanzi (Chinese character)
 */
export function isHanzi(char: string): boolean {
  return /^[\u4e00-\u9fa5]$/.test(char);
}

/**
 * Extracts all unique Hanzi characters from a given string
 */
export function extractHanziChars(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/[\u4e00-\u9fa5]/g);
  if (!matches) return [];
  return Array.from(new Set(matches));
}

export interface MatchedCompoundInfo {
  word: string;
  pinyin: string;
  meaning: string;
  hanViet?: string;
  constituents: string[];
}

export interface SmartSearchConstituent {
  char: string;
  inUserVocabulary: boolean;
  character?: Character;
  fallbackInfo?: {
    hanzi: string;
    pinyin: string;
    hanViet: string;
    meaning: string;
    radical?: string;
    strokeCount?: number;
    components?: string;
    mnemonic?: string;
  };
  sourceCompound: string;
}

export interface SmartSearchAnalysis {
  hasQuery: boolean;
  query: string;
  cleanQuery: string;
  strippedQuery: string;
  matchedCompounds: MatchedCompoundInfo[];
  constituentCharSet: Set<string>;
  constituents: SmartSearchConstituent[];
  charToSourceCompoundMap: Map<string, string>;
  isConstituent: (hanzi: string) => boolean;
  getSourceCompound: (hanzi: string) => string | undefined;
}

/**
 * Analyzes the user's search query to detect if it refers to a compound word,
 * and extracts all constituent single characters (chữ đơn cấu thành).
 */
export function analyzeSmartSearch(query: string, allCharacters: Character[]): SmartSearchAnalysis {
  const trimmed = (query || '').trim();
  if (!trimmed) {
    return {
      hasQuery: false,
      query: '',
      cleanQuery: '',
      strippedQuery: '',
      matchedCompounds: [],
      constituentCharSet: new Set(),
      constituents: [],
      charToSourceCompoundMap: new Map(),
      isConstituent: () => false,
      getSourceCompound: () => undefined,
    };
  }

  const lowerQ = trimmed.toLowerCase();
  const strippedQ = stripAccents(trimmed);
  const hanziInQuery = extractHanziChars(trimmed);

  const matchedCompoundsMap = new Map<string, MatchedCompoundInfo>();

  // 1. If query contains 2+ Hanzi directly (e.g. "学习", "很高兴", "朋友")
  if (hanziInQuery.length >= 2) {
    // Check if whole query or substring matches a known compound
    const queryHanziString = hanziInQuery.join('');
    // Try to find meaning/pinyin from existing characters or database
    const existingComp = allCharacters.find((c) => c.hanzi === queryHanziString);
    const dbComp = MASTER_COMPOUND_DATABASE.find((m) => m.word === queryHanziString);

    matchedCompoundsMap.set(queryHanziString, {
      word: queryHanziString,
      pinyin: existingComp?.pinyin || dbComp?.pinyin || '',
      meaning: existingComp?.meaning || dbComp?.meaning || 'Từ ghép',
      hanViet: existingComp?.hanViet || dbComp?.hanViet || '',
      constituents: hanziInQuery,
    });
  }

  // 2. Search against user's existing multi-character words
  allCharacters.forEach((c) => {
    if (c.hanzi.length > 1) {
      const matchWord = c.hanzi.includes(trimmed);
      const matchPinyin =
        c.pinyin.toLowerCase().includes(lowerQ) ||
        stripAccents(c.pinyin).includes(strippedQ);
      const matchMeaning =
        c.meaning.toLowerCase().includes(lowerQ) ||
        stripAccents(c.meaning).includes(strippedQ);
      const matchHanViet =
        (c.hanViet && c.hanViet.toLowerCase().includes(lowerQ)) ||
        (c.hanViet && stripAccents(c.hanViet).includes(strippedQ));

      if (matchWord || matchPinyin || matchMeaning || matchHanViet) {
        if (!matchedCompoundsMap.has(c.hanzi)) {
          matchedCompoundsMap.set(c.hanzi, {
            word: c.hanzi,
            pinyin: c.pinyin,
            meaning: c.meaning,
            hanViet: c.hanViet,
            constituents: Array.from(c.hanzi).filter(isHanzi),
          });
        }
      }
    }
  });

  // 3. Search against MASTER_COMPOUND_DATABASE
  MASTER_COMPOUND_DATABASE.forEach((item) => {
    const matchWord = item.word.includes(trimmed);
    const matchPinyin =
      item.pinyin.toLowerCase().includes(lowerQ) ||
      stripAccents(item.pinyin).includes(strippedQ);
    const matchMeaning =
      item.meaning.toLowerCase().includes(lowerQ) ||
      stripAccents(item.meaning).includes(strippedQ);
    const matchHanViet =
      (item.hanViet && item.hanViet.toLowerCase().includes(lowerQ)) ||
      (item.hanViet && stripAccents(item.hanViet).includes(strippedQ));

    if (matchWord || matchPinyin || matchMeaning || matchHanViet) {
      if (!matchedCompoundsMap.has(item.word)) {
        matchedCompoundsMap.set(item.word, {
          word: item.word,
          pinyin: item.pinyin,
          meaning: item.meaning,
          hanViet: item.hanViet,
          constituents: Array.from(item.word).filter(isHanzi),
        });
      }
    }
  });

  // Convert map to array and prioritize the exact matching word
  const matchedCompounds = Array.from(matchedCompoundsMap.values()).slice(0, 5);

  const constituentCharSet = new Set<string>();
  const charToSourceCompoundMap = new Map<string, string>();
  const constituentMap = new Map<string, SmartSearchConstituent>();

  // Map user characters by single hanzi for instant lookup
  const userCharMap = new Map<string, Character>();
  allCharacters.forEach((c) => {
    if (c.hanzi.length === 1) {
      userCharMap.set(c.hanzi, c);
    }
  });

  matchedCompounds.forEach((comp) => {
    comp.constituents.forEach((singleChar) => {
      constituentCharSet.add(singleChar);
      if (!charToSourceCompoundMap.has(singleChar)) {
        charToSourceCompoundMap.set(singleChar, comp.word);
      }

      if (!constituentMap.has(singleChar)) {
        const existing = userCharMap.get(singleChar);
        if (existing) {
          constituentMap.set(singleChar, {
            char: singleChar,
            inUserVocabulary: true,
            character: existing,
            sourceCompound: comp.word,
          });
        } else {
          // Look up dictionary details so user can 1-click add
          const builtIn = lookupBuiltIn(singleChar);
          constituentMap.set(singleChar, {
            char: singleChar,
            inUserVocabulary: false,
            fallbackInfo: builtIn
              ? {
                  hanzi: builtIn.hanzi,
                  pinyin: builtIn.pinyin,
                  hanViet: builtIn.hanViet,
                  meaning: builtIn.meaning,
                  radical: builtIn.radical,
                  strokeCount: builtIn.strokeCount,
                  components: builtIn.components,
                  mnemonic: builtIn.mnemonic,
                }
              : {
                  hanzi: singleChar,
                  pinyin: '',
                  hanViet: '',
                  meaning: `Chữ đơn trong "${comp.word}"`,
                },
            sourceCompound: comp.word,
          });
        }
      }
    });
  });

  const constituents = Array.from(constituentMap.values());

  return {
    hasQuery: true,
    query: trimmed,
    cleanQuery: trimmed,
    strippedQuery: strippedQ,
    matchedCompounds,
    constituentCharSet,
    constituents,
    charToSourceCompoundMap,
    isConstituent: (hanzi: string) => constituentCharSet.has(hanzi),
    getSourceCompound: (hanzi: string) => charToSourceCompoundMap.get(hanzi),
  };
}

/**
 * Filter and sort characters using smart search:
 * - Direct matches
 * - Constituent single characters from matched compound words
 * - Smart priority ranking
 */
export function filterAndRankCharacters(
  scopeCharacters: Character[],
  allCharacters: Character[],
  searchTerm: string,
  wordTypeFilter: 'all' | 'single' | 'compound'
): {
  filtered: Character[];
  analysis: SmartSearchAnalysis;
} {
  const analysis = analyzeSmartSearch(searchTerm, allCharacters);

  if (!analysis.hasQuery) {
    const defaultFiltered = scopeCharacters.filter((c) => {
      if (wordTypeFilter === 'all') return true;
      if (wordTypeFilter === 'single') return c.hanzi.length === 1;
      return c.hanzi.length > 1;
    });
    return { filtered: defaultFiltered, analysis };
  }

  const { cleanQuery, strippedQuery, constituentCharSet } = analysis;
  const lowerQ = cleanQuery.toLowerCase();

  // Collect candidate characters:
  // Include scope characters PLUS any constituent characters from allCharacters
  // so the user sees constituent single characters even if they belong to a different list.
  const candidateMap = new Map<string, Character>();
  scopeCharacters.forEach((c) => candidateMap.set(c.id, c));

  allCharacters.forEach((c) => {
    if (constituentCharSet.has(c.hanzi)) {
      candidateMap.set(c.id, c);
    }
  });

  const candidates = Array.from(candidateMap.values());

  const matched = candidates.filter((c) => {
    // 1. Direct match
    const matchHanzi = c.hanzi.includes(cleanQuery);
    const matchPinyin =
      c.pinyin.toLowerCase().includes(lowerQ) ||
      stripAccents(c.pinyin).includes(strippedQuery);
    const matchMeaning =
      c.meaning.toLowerCase().includes(lowerQ) ||
      stripAccents(c.meaning).includes(strippedQuery);
    const matchHanViet =
      (c.hanViet && c.hanViet.toLowerCase().includes(lowerQ)) ||
      (c.hanViet && stripAccents(c.hanViet).includes(strippedQuery));

    const isDirect = matchHanzi || matchPinyin || matchMeaning || matchHanViet;

    // 2. Constituent single character match (from detected compound word)
    const isConstituent = constituentCharSet.has(c.hanzi);

    if (!isDirect && !isConstituent) {
      return false;
    }

    // Filter by word type if specified, but ALWAYS include constituent characters!
    if (isConstituent) {
      return true; // Keep constituent single characters regardless of type filter!
    }

    if (wordTypeFilter === 'single') {
      return c.hanzi.length === 1;
    }
    if (wordTypeFilter === 'compound') {
      return c.hanzi.length > 1;
    }

    return true;
  });

  // Rank matches:
  // 1. Exact Hanzi match (e.g. "学习")
  // 2. Searched compound word match
  // 3. Constituent single characters (e.g. "学", "习")
  // 4. StartsWith / Pinyin / Meaning matches
  matched.sort((a, b) => {
    const aExact = a.hanzi === cleanQuery;
    const bExact = b.hanzi === cleanQuery;
    if (aExact !== bExact) return aExact ? -1 : 1;

    const aIsConstituent = constituentCharSet.has(a.hanzi);
    const bIsConstituent = constituentCharSet.has(b.hanzi);

    // If one is compound and one is constituent, keep target compound first, then constituents
    const aIsTargetCompound = analysis.matchedCompounds.some((mc) => mc.word === a.hanzi);
    const bIsTargetCompound = analysis.matchedCompounds.some((mc) => mc.word === b.hanzi);

    if (aIsTargetCompound !== bIsTargetCompound) {
      return aIsTargetCompound ? -1 : 1;
    }

    if (aIsConstituent !== bIsConstituent) {
      // Both are relevant: if query is a compound word, constituents come right after it
      return aIsConstituent ? -1 : 1;
    }

    return a.hanzi.localeCompare(b.hanzi);
  });

  return { filtered: matched, analysis };
}
