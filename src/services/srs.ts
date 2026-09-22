import { Character, QuizQuestion, QuestionType, SRSData, StudySessionMode } from '../types';
import { detectCompoundWordsFromCharacters, convertCompoundToCharacter, MASTER_COMPOUND_DATABASE } from './compoundWordDetector';
import { INITIAL_CHARACTERS } from './dictionary';

export function calculateSRSUpdate(
  currentSRS: SRSData,
  rating: 0 | 1 | 2 | 3 // 0: Again/Wrong, 1: Hard, 2: Good, 3: Easy
): SRSData {
  const now = Date.now();
  let { easinessFactor, interval, repetitions, totalCorrect, totalIncorrect, consecutiveCorrect, difficultyScore } = currentSRS;

  if (rating < 2) {
    // Answered incorrectly or struggled
    repetitions = 0;
    interval = 1; // review next day
    easinessFactor = Math.max(1.3, easinessFactor - 0.2);
    consecutiveCorrect = 0;
    totalIncorrect += 1;
    difficultyScore = Math.min(10, difficultyScore + 1.5);
  } else {
    // Answered correctly
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easinessFactor);
    }

    repetitions += 1;
    // SM-2 EF adjustment
    const q = rating; // 2 or 3
    easinessFactor = easinessFactor + (0.1 - (3 - q) * (0.08 + (3 - q) * 0.02));
    easinessFactor = Math.max(1.3, easinessFactor);

    consecutiveCorrect += 1;
    totalCorrect += 1;
    difficultyScore = Math.max(0, difficultyScore - 0.5);
  }

  const nextReviewDate = now + interval * 24 * 60 * 60 * 1000;

  // Calculate overall mastery percentage (0 - 100%)
  let mastery = Math.round(
    consecutiveCorrect * 18 + interval * 4 + (easinessFactor - 1.3) * 20 - difficultyScore * 5
  );
  if (totalCorrect === 0) mastery = 0;
  const masteryLevel = Math.max(0, Math.min(100, mastery));

  return {
    easinessFactor: Number(easinessFactor.toFixed(2)),
    interval,
    repetitions,
    nextReviewDate,
    totalCorrect,
    totalIncorrect,
    consecutiveCorrect,
    lastReviewedAt: now,
    masteryLevel,
    difficultyScore: Number(difficultyScore.toFixed(2)),
  };
}

// Select characters based on Study Mode & SRS weights
export function selectCharactersForSession(
  allCharacters: Character[],
  mode: StudySessionMode,
  selectedListId?: string | null,
  targetCount: number = 20
): Character[] {
  const now = Date.now();

  // Special Mode 1: compound_words (Revision of 100% learned compounds)
  if (mode === 'compound_words') {
    const isSpecificList = selectedListId && !['all', 'all_single', 'all_compound'].includes(selectedListId);
    const baseChars = isSpecificList
      ? allCharacters.filter((c) => (c.listIds || []).includes(selectedListId))
      : allCharacters;

    const detectedCompounds = detectCompoundWordsFromCharacters(baseChars);
    const fullMatchCompounds = detectedCompounds.filter((dc) => dc.isFullMatch);
    const convertedChars = fullMatchCompounds.map((dc) =>
      convertCompoundToCharacter(dc, selectedListId ? [selectedListId] : ['hsk1'])
    );

    const userSingleCharSet = new Set<string>();
    allCharacters.forEach((c) => {
      if (c.hanzi.length === 1) {
        userSingleCharSet.add(c.hanzi);
      }
    });

    const savedCompounds = baseChars.filter((c) => {
      if (c.hanzi.length <= 1) return false;
      const chars = Array.from(c.hanzi);
      return chars.every((ch) => userSingleCharSet.has(ch));
    });

    const existingHanziMap = new Map<string, Character>();
    savedCompounds.forEach((c) => existingHanziMap.set(c.hanzi, c));
    convertedChars.forEach((c) => {
      if (!existingHanziMap.has(c.hanzi)) {
        existingHanziMap.set(c.hanzi, c);
      }
    });

    // Fallback if empty
    if (existingHanziMap.size === 0) {
      const globalDetected = detectCompoundWordsFromCharacters(allCharacters);
      globalDetected.forEach((dc) => {
        const c = convertCompoundToCharacter(dc, ['hsk1']);
        existingHanziMap.set(c.hanzi, c);
      });
    }

    const compoundPool = Array.from(existingHanziMap.values());
    compoundPool.sort(() => Math.random() - 0.5);
    return compoundPool.slice(0, targetCount);
  }

  // Special Mode 2: compound_expansion (Expansion learning with new chars)
  if (mode === 'compound_expansion') {
    const isSpecificList = selectedListId && !['all', 'all_single', 'all_compound'].includes(selectedListId);
    const baseChars = isSpecificList
      ? allCharacters.filter((c) => (c.listIds || []).includes(selectedListId))
      : allCharacters;

    const detectedCompounds = detectCompoundWordsFromCharacters(baseChars);
    const expansionCompounds = detectedCompounds.filter((dc) => dc.isExpansionMatch);
    const convertedChars = expansionCompounds.map((dc) =>
      convertCompoundToCharacter(dc, selectedListId ? [selectedListId] : ['hsk1'])
    );

    const userSingleCharSet = new Set<string>();
    allCharacters.forEach((c) => {
      if (c.hanzi.length === 1) {
        userSingleCharSet.add(c.hanzi);
      }
    });

    const savedExpansionCompounds = baseChars.filter((c) => {
      if (c.hanzi.length <= 1) return false;
      const chars = Array.from(c.hanzi);
      const knownCount = chars.filter((ch) => userSingleCharSet.has(ch)).length;
      return knownCount > 0 && knownCount < chars.length;
    });

    const existingHanziMap = new Map<string, Character>();
    savedExpansionCompounds.forEach((c) => existingHanziMap.set(c.hanzi, c));
    convertedChars.forEach((c) => {
      if (!existingHanziMap.has(c.hanzi)) {
        existingHanziMap.set(c.hanzi, c);
      }
    });

    // Fallback if empty
    if (existingHanziMap.size === 0) {
      const globalDetected = detectCompoundWordsFromCharacters(allCharacters);
      globalDetected.forEach((dc) => {
        const c = convertCompoundToCharacter(dc, ['hsk1']);
        existingHanziMap.set(c.hanzi, c);
      });
    }

    const expansionPool = Array.from(existingHanziMap.values());
    expansionPool.sort(() => Math.random() - 0.5);
    return expansionPool.slice(0, targetCount);
  }

  // General Modes (smart_daily, quick_flashcard, weakness, random_test)
  let pool: Character[] = [];

  if (selectedListId === 'all_single') {
    pool = allCharacters.filter((c) => c.hanzi.length === 1);
  } else if (selectedListId === 'all_compound') {
    const saved = allCharacters.filter((c) => c.hanzi.length > 1);
    const detected = detectCompoundWordsFromCharacters(allCharacters);
    const detectedChars = detected.map((dc) => convertCompoundToCharacter(dc, ['hsk1']));

    const map = new Map<string, Character>();
    saved.forEach((c) => map.set(c.hanzi, c));
    detectedChars.forEach((c) => {
      if (!map.has(c.hanzi)) map.set(c.hanzi, c);
    });
    pool = Array.from(map.values());
  } else if (selectedListId && selectedListId !== 'all') {
    const listChars = allCharacters.filter((c) => (c.listIds || []).includes(selectedListId));
    // Also include any 100% full match compounds formed by characters in this list
    const detected = detectCompoundWordsFromCharacters(listChars);
    const fullMatch = detected.filter((dc) => dc.isFullMatch);
    const converted = fullMatch.map((dc) => convertCompoundToCharacter(dc, [selectedListId]));

    const map = new Map<string, Character>();
    listChars.forEach((c) => map.set(c.hanzi, c));
    converted.forEach((c) => {
      if (!map.has(c.hanzi)) {
        map.set(c.hanzi, c);
      }
    });
    pool = Array.from(map.values());
  } else {
    // 'Tất cả từ vựng': All single characters + all saved compounds + all 100% learned review compound words
    const detected = detectCompoundWordsFromCharacters(allCharacters);
    const fullMatch = detected.filter((dc) => dc.isFullMatch);
    const converted = fullMatch.map((dc) => convertCompoundToCharacter(dc, ['all']));

    const map = new Map<string, Character>();
    // First preserve existing characters and their SRS progress
    allCharacters.forEach((c) => map.set(c.hanzi, c));
    // Add all 100% learned compound words
    converted.forEach((c) => {
      if (!map.has(c.hanzi)) {
        map.set(c.hanzi, c);
      }
    });
    pool = Array.from(map.values());
  }

  if (pool.length === 0) {
    // If specific list produced 0, fallback to allCharacters to avoid softlock
    pool = [...allCharacters];
  }

  if (pool.length === 0) {
    return [];
  }

  switch (mode) {
    case 'weakness':
      pool.sort((a, b) => {
        const scoreA = a.srs.totalIncorrect * 2 - a.srs.masteryLevel;
        const scoreB = b.srs.totalIncorrect * 2 - b.srs.masteryLevel;
        return scoreB - scoreA;
      });
      break;

    case 'smart_daily':
      pool.sort((a, b) => {
        const isDueA = a.srs.nextReviewDate <= now ? 50 : 0;
        const isDueB = b.srs.nextReviewDate <= now ? 50 : 0;
        const scoreA = isDueA + (100 - a.srs.masteryLevel) + Math.random() * 20;
        const scoreB = isDueB + (100 - b.srs.masteryLevel) + Math.random() * 20;
        return scoreB - scoreA;
      });
      break;

    case 'sentence_cloze':
    case 'quick_flashcard':
    case 'random_test':
    default:
      pool.sort(() => Math.random() - 0.5);
      break;
  }

  return pool.slice(0, targetCount);
}

// Generate distractor options for multiple choice questions with tricky, matching-structure choices
function generateDistractors(
  target: Character,
  all: Character[],
  field: 'meaning' | 'pinyin' | 'hanzi',
  count: number = 3
): string[] {
  const isCompoundWord = target.hanzi.length > 1;
  const targetLen = target.hanzi.length;

  interface CandidateItem {
    hanzi: string;
    pinyin: string;
    meaning: string;
  }

  const primaryCandidates: CandidateItem[] = [];

  // 1. Gather candidates from user's current character list (`all`)
  all.forEach((c) => {
    if (c.id !== target.id && c[field] !== target[field]) {
      const charLen = c.hanzi.length;
      if (isCompoundWord) {
        // Compound words: ONLY include other compound words (charLen > 1)
        if (charLen > 1) {
          primaryCandidates.push(c);
        }
      } else {
        // Single characters: ONLY include other single characters (charLen === 1)
        if (charLen === 1) {
          primaryCandidates.push(c);
        }
      }
    }
  });

  // 2. Enrich candidate pool from MASTER_COMPOUND_DATABASE or INITIAL_CHARACTERS
  if (isCompoundWord) {
    MASTER_COMPOUND_DATABASE.forEach((item) => {
      if (item.word !== target.hanzi && item[field as keyof typeof item] !== target[field as keyof typeof target]) {
        if (item.word.length > 1) {
          primaryCandidates.push({
            hanzi: item.word,
            pinyin: item.pinyin,
            meaning: item.meaning,
          });
        }
      }
    });
  } else {
    INITIAL_CHARACTERS.forEach((c) => {
      if (c.hanzi.length === 1 && c.hanzi !== target.hanzi && c[field] !== target[field]) {
        primaryCandidates.push(c);
      }
    });
  }

  // 3. Deduplicate candidates by the target field value
  const uniqueCandidateMap = new Map<string, CandidateItem>();
  primaryCandidates.forEach((item) => {
    const val = item[field];
    if (val && val !== target[field] && !uniqueCandidateMap.has(val)) {
      uniqueCandidateMap.set(val, item);
    }
  });

  const candidates = Array.from(uniqueCandidateMap.values());

  // 4. Prioritize "tricky" distractors (e.g., matching exact character length or sharing a constituent character)
  const highPriority: CandidateItem[] = [];
  const normalPriority: CandidateItem[] = [];

  const targetChars = Array.from(target.hanzi);

  candidates.forEach((cand) => {
    let isTricky = false;
    if (isCompoundWord) {
      const candChars = Array.from(cand.hanzi);
      const sharedChar = targetChars.some((ch) => candChars.includes(ch));
      const exactLenMatch = cand.hanzi.length === targetLen;
      if (sharedChar || exactLenMatch) {
        isTricky = true;
      }
    } else {
      if (cand.hanzi.length === 1) {
        isTricky = true;
      }
    }

    if (isTricky) {
      highPriority.push(cand);
    } else {
      normalPriority.push(cand);
    }
  });

  // Shuffle both priority lists
  highPriority.sort(() => Math.random() - 0.5);
  normalPriority.sort(() => Math.random() - 0.5);

  const combinedCandidates = [...highPriority, ...normalPriority];

  const selectedValues: string[] = [];
  for (const cand of combinedCandidates) {
    const val = cand[field];
    if (val && !selectedValues.includes(val) && val !== target[field]) {
      selectedValues.push(val);
      if (selectedValues.length === count) break;
    }
  }

  // Combine correct answer with distractors and shuffle
  const correctVal = target[field];
  const options = Array.from(new Set([correctVal, ...selectedValues]));

  // Fallback in case of rare shortage
  while (options.length < count + 1) {
    if (isCompoundWord) {
      options.push(field === 'hanzi' ? `Từ ghép ${options.length + 1}` : `Đáp án ${options.length + 1}`);
    } else {
      options.push(`Đáp án bổ sung ${options.length + 1}`);
    }
  }

  return options.sort(() => Math.random() - 0.5);
}

// Create a rich quiz question for a character
export function generateQuestionForCharacter(
  character: Character,
  allCharacters: Character[],
  forcedType?: QuestionType
): QuizQuestion {
  const isCompoundWord = character.hanzi.length > 1;

  const availableTypes: QuestionType[] = [
    'flashcard',
    'hanzi_to_meaning',
    'meaning_to_hanzi',
    'pinyin_to_hanzi',
    'hanzi_to_pinyin',
    'audio_to_hanzi',
    'type_pinyin',
    'type_hanzi',
  ];

  // Stroke writing is strictly for single Chinese characters (hanzi.length === 1).
  // Excluded for compound words to prevent errors and optimize learning flow.
  if (!isCompoundWord) {
    availableTypes.push('stroke_writing');
  }

  if (character.examples && character.examples.length > 0) {
    availableTypes.push('fill_sentence');
  }

  let selectedType = forcedType;
  if (selectedType === 'stroke_writing' && isCompoundWord) {
    selectedType = undefined;
  }

  const type = selectedType || availableTypes[Math.floor(Math.random() * availableTypes.length)];
  const qId = `q_${character.id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  switch (type) {
    case 'hanzi_to_meaning': {
      const options = generateDistractors(character, allCharacters, 'meaning');
      return {
        id: qId,
        type,
        character,
        prompt: `Nghĩa của chữ Hán "${character.hanzi}" là gì?`,
        subtitle: `Âm Hán Việt: ${character.hanViet} | Pinyin: ${character.pinyin}`,
        options,
        correctAnswer: character.meaning,
        explanation: `Chữ ${character.hanzi} (${character.pinyin}) có nghĩa là: ${character.meaning}. Bộ thủ: ${character.radical}.`,
      };
    }

    case 'meaning_to_hanzi': {
      const options = generateDistractors(character, allCharacters, 'hanzi');
      return {
        id: qId,
        type,
        character,
        prompt: `Chọn chữ Hán có nghĩa: "${character.meaning}"`,
        subtitle: `Âm Hán Việt: ${character.hanViet}`,
        options,
        correctAnswer: character.hanzi,
        explanation: `Chữ ${character.hanzi} [${character.pinyin}] có nghĩa là ${character.meaning}.`,
      };
    }

    case 'pinyin_to_hanzi': {
      const options = generateDistractors(character, allCharacters, 'hanzi');
      return {
        id: qId,
        type,
        character,
        prompt: `Chữ Hán nào có pinyin là "${character.pinyin}"?`,
        subtitle: `Nghĩa: ${character.meaning}`,
        options,
        correctAnswer: character.hanzi,
        explanation: `Chữ ${character.hanzi} phát âm là ${character.pinyin}.`,
      };
    }

    case 'hanzi_to_pinyin': {
      const options = generateDistractors(character, allCharacters, 'pinyin');
      return {
        id: qId,
        type,
        character,
        prompt: `Pinyin chuẩn của chữ "${character.hanzi}" là gì?`,
        subtitle: `Nghĩa: ${character.meaning}`,
        options,
        correctAnswer: character.pinyin,
        explanation: `Chữ ${character.hanzi} đọc là ${character.pinyin}.`,
      };
    }

    case 'audio_to_hanzi': {
      const options = generateDistractors(character, allCharacters, 'hanzi');
      return {
        id: qId,
        type,
        character,
        prompt: 'Lắng nghe phát âm và chọn chữ Hán chính xác',
        audioText: character.hanzi,
        options,
        correctAnswer: character.hanzi,
        explanation: `Phát âm ${character.pinyin} tương ứng với chữ ${character.hanzi} (${character.meaning}).`,
      };
    }

    case 'type_pinyin': {
      return {
        id: qId,
        type,
        character,
        prompt: `Gõ pinyin cho chữ Hán: "${character.hanzi}"`,
        subtitle: `Gõ phiên âm pinyin (chấp nhận dùng số thanh điệu ví dụ: ni3, xue2 hoặc không dấu ví dụ: ni, xue)`,
        correctAnswer: character.pinyin,
        explanation: `Pinyin chuẩn là "${character.pinyin}" (hệ thống hỗ trợ gõ dạng số như ni3, xue2 hoặc dạng không dấu).`,
      };
    }

    case 'type_hanzi': {
      return {
        id: qId,
        type,
        character,
        prompt: `Nhìn nghĩa gõ chữ Hán`,
        subtitle: `Nghĩa: ${character.meaning} | Pinyin: ${character.pinyin}`,
        correctAnswer: character.hanzi,
        explanation: `Chữ Hán cần gõ là: ${character.hanzi}.`,
      };
    }

    case 'fill_sentence': {
      const example = character.examples?.[0] || {
        sentence: `我喜欢学${character.hanzi}。`,
        pinyin: `Wǒ xǐhuān xué ${character.pinyin}.`,
        meaning: `Tôi thích học...`,
      };

      const blankedSentence = example.sentence.replace(character.hanzi, ' _____ ');
      const options = generateDistractors(character, allCharacters, 'hanzi');

      return {
        id: qId,
        type,
        character,
        prompt: `Điền chữ Hán thích hợp vào câu sau:`,
        subtitle: `"${blankedSentence}"\n(Dịch: ${example.meaning})`,
        options,
        correctAnswer: character.hanzi,
        explanation: `Câu hoàn chỉnh: ${example.sentence} (${example.pinyin}) - ${example.meaning}.`,
      };
    }

    case 'stroke_writing': {
      return {
        id: qId,
        type,
        character,
        prompt: `Luyện tập viết chữ Hán: "${character.hanzi}"`,
        subtitle: `Số nét: ${character.strokeCount} | Bộ thủ: ${character.radical} | Pinyin: ${character.pinyin}`,
        correctAnswer: character.hanzi,
        explanation: `Hãy tập vẽ nét chữ ${character.hanzi} trên ô vuông Mễ tự cách.`,
      };
    }

    default: // flashcard
      return {
        id: qId,
        type: 'flashcard',
        character,
        prompt: `Lật thẻ ghi nhớ`,
        correctAnswer: character.hanzi,
      };
  }
}
