import { Character, WordList, ReviewLog, UserStats } from '../types';
import { INITIAL_CHARACTERS, INITIAL_WORD_LISTS, DEFAULT_SRS } from './dictionary';
import { lookupBuiltIn } from './builtInDictionary';

const KEYS = {
  CHARACTERS: 'hanzi_tutor_characters_v2',
  WORD_LISTS: 'hanzi_tutor_lists_v2',
  REVIEW_LOGS: 'hanzi_tutor_logs_v2',
  USER_STATS: 'hanzi_tutor_stats_v2',
};

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
        healed.meaning === 'Chưa có nghĩa' ||
        healed.hanViet === 'HÁN VIỆT' ||
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
    return data ? JSON.parse(data) : INITIAL_WORD_LISTS;
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
  const existingIdx = chars.findIndex((c) => c.hanzi === character.hanzi);
  if (existingIdx >= 0) {
    // Merge lists
    const existing = chars[existingIdx];
    const combinedLists = Array.from(new Set([...existing.listIds, ...character.listIds]));
    chars[existingIdx] = {
      ...existing,
      ...character,
      listIds: combinedLists,
    };
  } else {
    chars.unshift(character);
  }
  saveCharacters(chars);
}

export function removeCharacter(characterId: string): void {
  const chars = getCharacters().filter((c) => c.id !== characterId);
  saveCharacters(chars);
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

    localStorage.setItem(KEYS.CHARACTERS, JSON.stringify(data.characters));
    localStorage.setItem(KEYS.WORD_LISTS, JSON.stringify(data.wordLists));
    if (data.reviewLogs) localStorage.setItem(KEYS.REVIEW_LOGS, JSON.stringify(data.reviewLogs));
    if (data.userStats) localStorage.setItem(KEYS.USER_STATS, JSON.stringify(data.userStats));

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
  initializeStorage();
}
