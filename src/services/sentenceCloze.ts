import { Character, QuizQuestion, ExampleSentence } from '../types';
import {
  detectCompoundWordsFromCharacters,
  MASTER_COMPOUND_DATABASE,
  convertCompoundToCharacter,
} from './compoundWordDetector';

export interface LearnedWordInfo {
  word: string;
  pinyin: string;
  meaning: string;
  hanViet?: string;
  isCompound: boolean;
  length: number;
}

export interface SentenceCandidate {
  sentence: string;
  pinyin: string;
  meaning: string;
  targetWord: string;
  targetPinyin: string;
  targetMeaning: string;
  source: 'user_example' | 'compound_db' | 'curated_bank' | 'template';
}

// Confusable single character pairs / sets (形近字, 音近字, 易混字)
const CONFUSABLE_SINGLE_MAP: Record<string, string[]> = {
  学: ['字', '孝', '觉', '季'],
  喜: ['善', '嘉', '吉', '欢'],
  电: ['申', '田', '甲', '由'],
  老: ['考', '孝', '者', '耆'],
  工: ['土', '士', '干', '王'],
  人: ['入', '八', '从', '大'],
  说: ['话', '语', '讲', '读'],
  帅: ['师', '布', '希', '币'],
  拔: ['拨', '发', '技', '拔'],
  拨: ['拔', '波', '破', '发'],
  大: ['太', '天', '犬', '小'],
  小: ['少', '水', '不', '大'],
  天: ['大', '夫', '无', '太'],
  日: ['目', '白', '百', '田'],
  月: ['用', '同', '肉', '日'],
  好: ['如', '妈', '妹', '坏'],
  看: ['着', '眼', '见', '视'],
  听: ['叫', '吃', '叶', '吹'],
  写: ['与', '马', '考', '字'],
  读: ['续', '买', '卖', '说'],
  买: ['卖', '实', '头', '买'],
  卖: ['买', '读', '续', '实'],
  哪: ['那', '哈', '啊', '吗'],
  那: ['哪', '都', '部', '这'],
  这: ['还', '进', '迎', '过'],
  他: ['她', '它', '地', '住'],
  她: ['他', '它', '妹', '妈'],
  很: ['得', '行', '狠', '银'],
  快: ['块', '决', '慢', '乐'],
  慢: ['漫', '快', '曼', '忙'],
  多: ['少', '夕', '夜', '名'],
  少: ['多', '小', '不', '步'],
  住: ['往', '位', '佳', '仕'],
  在: ['存', '再', '有', '左'],
  再: ['在', '冉', '见', '又'],
  去: ['来', '丢', '法', '云'],
  来: ['去', '米', '木', '本'],
  上: ['下', '卡', '止', '正'],
  下: ['上', '不', '卞', '正'],
  前: ['后', '剪', '煎', '先'],
  后: ['前', '右', '石', '司'],
  左: ['右', '在', '友', '工'],
  右: ['左', '后', '石', '口'],
  做: ['作', '故', '仿', '使'],
  作: ['做', '昨', '炸', '佐'],
};

// Curated bank of natural, everyday sentences using core HSK vocabulary
// Each sentence will be verified against the learner's vocabulary before use
const CURATED_SENTENCE_BANK: Array<{
  sentence: string;
  pinyin: string;
  meaning: string;
  targets: string[]; // potential target words in this sentence
}> = [
  {
    sentence: '我喜欢学习汉语。',
    pinyin: 'Wǒ xǐhuān xuéxí hànyǔ.',
    meaning: 'Tôi thích học tiếng Trung.',
    targets: ['喜欢', '学习', '汉语', '我'],
  },
  {
    sentence: '他是我们的老师。',
    pinyin: 'Tā shì wǒmen de lǎoshī.',
    meaning: 'Thầy ấy là giáo viên của chúng tôi.',
    targets: ['老师', '他', '我们', '是'],
  },
  {
    sentence: '我们是好朋友。',
    pinyin: 'Wǒmen shì hǎo péngyou.',
    meaning: 'Chúng tôi là bạn bè tốt.',
    targets: ['朋友', '我们', '好', '是'],
  },
  {
    sentence: '我用电脑工作。',
    pinyin: 'Wǒ yòng diànnǎo gōngzuò.',
    meaning: 'Tôi dùng máy tính để làm việc.',
    targets: ['电脑', '工作', '我', '用'],
  },
  {
    sentence: '这个汉字怎么写？',
    pinyin: 'Zhège hànzì zěnme xiě?',
    meaning: 'Chữ Hán này viết như thế nào?',
    targets: ['汉字', '写', '这个', '怎么'],
  },
  {
    sentence: '今天天气很好。',
    pinyin: 'Jīntiān tiānqì hěn hǎo.',
    meaning: 'Hôm nay thời tiết rất tốt.',
    targets: ['今天', '天气', '好', '很'],
  },
  {
    sentence: '请给我打电话。',
    pinyin: 'Qǐng gěi wǒ dǎ diànhuà.',
    meaning: 'Xin hãy gọi điện thoại cho tôi.',
    targets: ['电话', '请', '我', '给'],
  },
  {
    sentence: '晚上我们去看电影。',
    pinyin: 'Wǎnshàng wǒmen qù kàn diànyǐng.',
    meaning: 'Buổi tối chúng tôi đi xem phim.',
    targets: ['电影', '看', '晚上', '去'],
  },
  {
    sentence: '爸爸在家里看电视。',
    pinyin: 'Bàba zài jiālǐ kàn diànshì.',
    meaning: 'Bố đang xem tivi ở nhà.',
    targets: ['电视', '爸爸', '在', '看'],
  },
  {
    sentence: '他去中国旅游了。',
    pinyin: 'Tā qù zhōngguó lǚyóu le.',
    meaning: 'Anh ấy đã đi du lịch Trung Quốc rồi.',
    targets: ['中国', '旅游', '去', '他'],
  },
  {
    sentence: '王老师教我们说汉语。',
    pinyin: 'Wáng lǎoshī jiāo wǒmen shuō hànyǔ.',
    meaning: 'Thầy Vương dạy chúng tôi nói tiếng Hán.',
    targets: ['老师', '说', '汉语', '教'],
  },
  {
    sentence: '学生们在学校里。',
    pinyin: 'Xuéshengmen zài xuéxiào lǐ.',
    meaning: 'Các học sinh đang ở trong trường học.',
    targets: ['学生', '学校', '在', '里'],
  },
  {
    sentence: '非常谢谢你的帮助。',
    pinyin: 'Fēicháng xièxie nǐ de bāngzhù.',
    meaning: 'Vô cùng cảm ơn sự giúp đỡ của bạn.',
    targets: ['谢谢', '帮助', '非常', '你'],
  },
  {
    sentence: '大家都很高兴认识你。',
    pinyin: 'Dàjiā dōu hěn gāoxìng rènshi nǐ.',
    meaning: 'Mọi người đều rất vui mừng được quen biết bạn.',
    targets: ['高兴', '认识', '大家', '很'],
  },
  {
    sentence: '你在做什么工作？',
    pinyin: 'Nǐ zài zuò shénme gōngzuò?',
    meaning: 'Bạn đang làm công việc gì thế?',
    targets: ['工作', '做', '什么', '在'],
  },
  {
    sentence: '他不认识那个人。',
    pinyin: 'Tā bù rènshi nà ge rén.',
    meaning: 'Anh ấy không quen biết người đó.',
    targets: ['认识', '人', '不', '那'],
  },
  {
    sentence: '明天我想去商店买东西。',
    pinyin: 'Míngtiān wǒ xiǎng qù shāngdiàn mǎi dōngxi.',
    meaning: 'Ngày mai tôi muốn đi cửa hàng mua đồ.',
    targets: ['商店', '东西', '买', '明天', '想', '去'],
  },
  {
    sentence: '桌子上有一本书。',
    pinyin: 'Zhuōzi shàng yǒu yì běn shū.',
    meaning: 'Trên bàn có một quyển sách.',
    targets: ['桌子', '书', '上', '有'],
  },
  {
    sentence: '我的朋友是医生。',
    pinyin: 'Wǒ de péngyou shì yīshēng.',
    meaning: 'Bạn của tôi là bác sĩ.',
    targets: ['朋友', '医生', '我', '是'],
  },
  {
    sentence: '现在几点了？',
    pinyin: 'Xiànzài jǐ diǎn le?',
    meaning: 'Bây giờ là mấy giờ rồi?',
    targets: ['现在', '点', '几'],
  },
  {
    sentence: '他在喝热茶。',
    pinyin: 'Tā zài hē rè chá.',
    meaning: 'Anh ấy đang uống trà nóng.',
    targets: ['喝', '茶', '热', '在'],
  },
  {
    sentence: '我听懂了你说的话。',
    pinyin: 'Wǒ tīngdǒng le nǐ shuō de huà.',
    meaning: 'Tôi đã nghe hiểu lời bạn nói.',
    targets: ['说', '话', '听', '懂'],
  },
  {
    sentence: '那个小猫真可爱。',
    pinyin: 'Nà ge xiǎomāo zhēn kě’ài.',
    meaning: 'Con mèo nhỏ đó thật đáng yêu.',
    targets: ['猫', '小', '可爱', '真'],
  },
  {
    sentence: '请进，请坐！',
    pinyin: 'Qǐng jìn, qǐng zuò!',
    meaning: 'Mời vào, mời ngồi!',
    targets: ['请', '进', '坐'],
  },
  {
    sentence: '我们一起走吧。',
    pinyin: 'Wǒmen yìqǐ zǒu ba.',
    meaning: 'Chúng ta cùng đi thôi nào.',
    targets: ['我们', '一起', '走'],
  },
];

/**
 * Sanitize a Chinese sentence:
 * - Strips any HTML tags
 * - Strips any rogue Latin/English letters (e.g. 'association', 'mnemonic', random English artifacts)
 * - Strips stray symbols like _, ~, `, |, etc.
 * - Collapses spaces between Chinese characters and punctuation
 */
export function sanitizeChineseSentence(raw: string): string {
  if (!raw) return '';
  let s = raw.replace(/<[^>]+>/g, '');
  s = s.replace(/[a-zA-Z]+/g, '');
  s = s.replace(/[_~`|\\^]+/g, '');
  s = s.replace(/\s+/g, '').trim();
  return s;
}

/**
 * Sanitize Pinyin string: remove rogue English labels and extra spaces
 */
export function sanitizePinyin(raw: string): string {
  if (!raw) return '';
  let p = raw.replace(/<[^>]+>/g, '');
  p = p.replace(/\b(association|mnemonic|example|hanzi)\b/gi, '');
  return p.replace(/\s+/g, ' ').trim();
}

/**
 * Check if a Chinese sentence is strictly composed ONLY of characters from the user's learned set.
 * Any non-Chinese punctuation or symbols (e.g. ，。？！、“”、《》：； ) are allowed.
 * Strictly rejects any sentence that contains Latin/English letters.
 */
export function isSentenceComposedOnlyOfLearnedChars(
  sentence: string,
  learnedCharSet: Set<string>
): boolean {
  if (!sentence) return false;
  // If sentence contains any Latin alphabet characters, it is not a clean Chinese sentence
  if (/[a-zA-Z]/.test(sentence)) {
    return false;
  }
  const clean = sentence.replace(/[^\u4e00-\u9fa5]/g, '');
  if (clean.length === 0) return false;
  return Array.from(clean).every((char) => learnedCharSet.has(char));
}

/**
 * Collect all learned words:
 * - Single characters
 * - 100% full-match compound words
 * Excludes any expansion words with unlearned characters!
 */
export function getLearnedVocabularyPool(
  allCharacters: Character[],
  selectedListId?: string
): {
  learnedWords: LearnedWordInfo[];
  learnedCharSet: Set<string>;
  charMap: Map<string, Character>;
} {
  // Base characters
  let baseChars = allCharacters;
  if (selectedListId && selectedListId !== 'all' && selectedListId !== 'all_compound' && selectedListId !== 'all_single') {
    const filtered = allCharacters.filter((c) => (c.listIds || []).includes(selectedListId));
    if (filtered.length > 0) {
      baseChars = filtered;
    }
  }

  // 1. Build learnedCharSet from single characters
  const learnedCharSet = new Set<string>();
  const charMap = new Map<string, Character>();

  baseChars.forEach((c) => {
    charMap.set(c.hanzi, c);
    Array.from(c.hanzi).forEach((ch) => {
      learnedCharSet.add(ch);
    });
  });

  // 2. Extract full-match compound words (100% learned characters)
  const detected = detectCompoundWordsFromCharacters(baseChars);
  const fullMatchCompounds = detected.filter((d) => d.isFullMatch);

  // 3. Build vocabulary list
  const learnedWords: LearnedWordInfo[] = [];
  const seenWords = new Set<string>();

  // Single characters first
  baseChars
    .filter((c) => c.hanzi.length === 1)
    .forEach((c) => {
      seenWords.add(c.hanzi);
      learnedWords.push({
        word: c.hanzi,
        pinyin: c.pinyin,
        meaning: c.meaning,
        hanViet: c.hanViet,
        isCompound: false,
        length: 1,
      });
    });

  // Multi-char words already saved in characters
  baseChars
    .filter((c) => c.hanzi.length > 1)
    .forEach((c) => {
      // Must be 100% composed of learned characters
      const chars = Array.from(c.hanzi);
      if (chars.every((ch) => learnedCharSet.has(ch))) {
        if (!seenWords.has(c.hanzi)) {
          seenWords.add(c.hanzi);
          learnedWords.push({
            word: c.hanzi,
            pinyin: c.pinyin,
            meaning: c.meaning,
            hanViet: c.hanViet,
            isCompound: true,
            length: c.hanzi.length,
          });
        }
      }
    });

  // 100% Full match review compounds
  fullMatchCompounds.forEach((fc) => {
    if (!seenWords.has(fc.word)) {
      seenWords.add(fc.word);
      learnedWords.push({
        word: fc.word,
        pinyin: fc.pinyin,
        meaning: fc.meaning,
        hanViet: fc.hanViet,
        isCompound: true,
        length: fc.word.length,
      });
    }
  });

  return { learnedWords, learnedCharSet, charMap };
}

/**
 * Generate 3 challenging, tricky distractor options that:
 * 1. Have the EXACT same character length as the target word (kills length guessing trick)
 * 2. Prioritize high confusability:
 *    - For compound words: words that share constituent characters (e.g. 学习 -> 学校, 学生, 练习)
 *    - For single characters: visually similar (形近字), same radical, or related grammatical words
 * 3. Sourced from learned words pool (or carefully matched standard words if pool is tight)
 */
export function generateChallengingDistractors(
  targetWord: string,
  learnedWords: LearnedWordInfo[],
  allAvailableWords: Array<{ word: string; pinyin: string; meaning: string }>
): Array<{ word: string; pinyin: string; meaning: string }> {
  const targetLen = targetWord.length;
  const targetChars = new Set(Array.from(targetWord));

  // Filter candidates with EXACT same length and not equal to target
  const poolSameLength = learnedWords.filter(
    (w) => w.length === targetLen && w.word !== targetWord
  );

  const scoredCandidates: Array<{
    word: string;
    pinyin: string;
    meaning: string;
    score: number;
  }> = [];

  const seen = new Set<string>([targetWord]);

  // First score candidates from the user's learned words
  poolSameLength.forEach((w) => {
    let score = 10;
    const wChars = Array.from(w.word);

    // Rule A: Shares a character with target word (High confusion!)
    const sharedChars = wChars.filter((ch) => targetChars.has(ch));
    if (sharedChars.length > 0) {
      score += 50 * sharedChars.length;
    }

    // Rule B: Single character confusion
    if (targetLen === 1 && CONFUSABLE_SINGLE_MAP[targetWord]) {
      if (CONFUSABLE_SINGLE_MAP[targetWord].includes(w.word)) {
        score += 80;
      }
    }

    scoredCandidates.push({
      word: w.word,
      pinyin: w.pinyin,
      meaning: w.meaning,
      score: score + Math.random() * 5, // small jitter
    });
    seen.add(w.word);
  });

  // If we have fewer than 3 candidates, supplement from MASTER_COMPOUND_DATABASE / standard pool
  if (scoredCandidates.length < 3) {
    // 1. Try to find compounds sharing constituent characters from MASTER_COMPOUND_DATABASE
    MASTER_COMPOUND_DATABASE.forEach((mc) => {
      if (mc.word.length === targetLen && !seen.has(mc.word)) {
        let score = 5;
        const mcChars = Array.from(mc.word);
        const shared = mcChars.filter((ch) => targetChars.has(ch));
        if (shared.length > 0) {
          score += 40 * shared.length;
        }
        if (targetLen === 1 && CONFUSABLE_SINGLE_MAP[targetWord]?.includes(mc.word)) {
          score += 60;
        }

        scoredCandidates.push({
          word: mc.word,
          pinyin: mc.pinyin,
          meaning: mc.meaning,
          score: score + Math.random() * 3,
        });
        seen.add(mc.word);
      }
    });
  }

  // If still fewer than 3, add confusable singles if target is length 1
  if (targetLen === 1 && scoredCandidates.length < 3 && CONFUSABLE_SINGLE_MAP[targetWord]) {
    CONFUSABLE_SINGLE_MAP[targetWord].forEach((cw) => {
      if (!seen.has(cw)) {
        scoredCandidates.push({
          word: cw,
          pinyin: 'pinyin',
          meaning: `Chữ tương tự "${cw}"`,
          score: 50,
        });
        seen.add(cw);
      }
    });
  }

  // Sort by highest confusability score
  scoredCandidates.sort((a, b) => b.score - a.score);

  return scoredCandidates.slice(0, 3).map((c) => ({
    word: c.word,
    pinyin: c.pinyin,
    meaning: c.meaning,
  }));
}

/**
 * Main function to generate sentence cloze questions
 */
export function generateSentenceClozeQuestions(
  allCharacters: Character[],
  limit: number = 20,
  selectedListId?: string
): QuizQuestion[] {
  const { learnedWords, learnedCharSet, charMap } = getLearnedVocabularyPool(
    allCharacters,
    selectedListId
  );

  if (learnedWords.length === 0) {
    return [];
  }

  const learnedWordMap = new Map<string, LearnedWordInfo>();
  learnedWords.forEach((lw) => learnedWordMap.set(lw.word, lw));

  // Collect candidate sentences:
  const candidateSentences: SentenceCandidate[] = [];
  const seenSentences = new Set<string>();

  // 1. From user character examples
  allCharacters.forEach((c) => {
    (c.examples || []).forEach((ex) => {
      if (!ex.sentence) return;
      const cleanSentence = sanitizeChineseSentence(ex.sentence);
      if (!cleanSentence || seenSentences.has(cleanSentence)) return;

      if (isSentenceComposedOnlyOfLearnedChars(cleanSentence, learnedCharSet)) {
        // Find which learned words exist in this sentence
        const matchedWords = learnedWords.filter(
          (lw) => cleanSentence.includes(lw.word) && lw.word.length >= 1
        );
        if (matchedWords.length > 0) {
          // Identify any compound words present in the sentence
          const matchedCompounds = matchedWords.filter((w) => w.length >= 2);

          // Rule: A single-character word is ONLY valid if it is NOT part of any compound word in this sentence!
          // This prevents splitting compound words like "邻居" into dangling "邻" + "（居）"
          const validWords = matchedWords.filter((w) => {
            if (w.length >= 2) return true;
            return !matchedCompounds.some((cw) => cw.word.includes(w.word));
          });

          if (validWords.length > 0) {
            // Sort:
            // 1. Prioritize compound words that contain c.hanzi
            // 2. Prioritize longer words (compound words >= 2 first)
            // 3. Fallback to standalone single characters
            validWords.sort((a, b) => {
              const aIsCompoundWithChar = a.length >= 2 && a.word.includes(c.hanzi);
              const bIsCompoundWithChar = b.length >= 2 && b.word.includes(c.hanzi);
              if (aIsCompoundWithChar && !bIsCompoundWithChar) return -1;
              if (!aIsCompoundWithChar && bIsCompoundWithChar) return 1;

              const aContainsChar = a.word.includes(c.hanzi);
              const bContainsChar = b.word.includes(c.hanzi);
              if (aContainsChar && !bContainsChar) return -1;
              if (!aContainsChar && bContainsChar) return 1;

              return b.length - a.length;
            });

            const chosen = validWords[0];
            seenSentences.add(cleanSentence);
            candidateSentences.push({
              sentence: cleanSentence,
              pinyin: sanitizePinyin(ex.pinyin),
              meaning: ex.meaning,
              targetWord: chosen.word,
              targetPinyin: chosen.pinyin,
              targetMeaning: chosen.meaning,
              source: 'user_example',
            });
          }
        }
      }
    });
  });

  // 2. From MASTER_COMPOUND_DATABASE exampleSentence (for full-match compounds)
  MASTER_COMPOUND_DATABASE.forEach((item) => {
    if (!item.exampleSentence) return;
    const cleanSentence = sanitizeChineseSentence(item.exampleSentence.sentence);
    if (!cleanSentence || seenSentences.has(cleanSentence)) return;

    if (isSentenceComposedOnlyOfLearnedChars(cleanSentence, learnedCharSet)) {
      if (learnedWordMap.has(item.word)) {
        const lw = learnedWordMap.get(item.word)!;
        seenSentences.add(cleanSentence);
        candidateSentences.push({
          sentence: cleanSentence,
          pinyin: sanitizePinyin(item.exampleSentence.pinyin),
          meaning: item.exampleSentence.meaning,
          targetWord: lw.word,
          targetPinyin: lw.pinyin,
          targetMeaning: lw.meaning,
          source: 'compound_db',
        });
      }
    }
  });

  // 3. From CURATED_SENTENCE_BANK
  CURATED_SENTENCE_BANK.forEach((cur) => {
    const cleanSentence = sanitizeChineseSentence(cur.sentence);
    if (!cleanSentence || seenSentences.has(cleanSentence)) return;

    if (isSentenceComposedOnlyOfLearnedChars(cleanSentence, learnedCharSet)) {
      // Find candidate targets in this sentence that exist in learnedWords
      const validTargets = cur.targets
        .filter((t) => learnedWordMap.has(t))
        .map((t) => learnedWordMap.get(t)!);

      if (validTargets.length > 0) {
        // Pick one target, prefer compound words or random
        validTargets.sort((a, b) => b.length - a.length);
        const chosen = validTargets[0];
        seenSentences.add(cleanSentence);
        candidateSentences.push({
          sentence: cleanSentence,
          pinyin: sanitizePinyin(cur.pinyin),
          meaning: cur.meaning,
          targetWord: chosen.word,
          targetPinyin: chosen.pinyin,
          targetMeaning: chosen.meaning,
          source: 'curated_bank',
        });
      }
    }
  });

  // 4. Dynamic synthetic templates if candidate count is low (< 5)
  if (candidateSentences.length < 5) {
    const knownSubjects = learnedWords.filter((w) =>
      ['我', '你', '他', '她', '我们', '学生', '老师', '朋友', '大家'].includes(w.word)
    );
    const knownVerbs = learnedWords.filter((w) =>
      ['喜欢', '学习', '看', '听', '说', '做', '去', '买', '是', '有', '在'].includes(w.word)
    );
    const knownObjects = learnedWords.filter((w) =>
      ['汉语', '汉字', '书', '电影', '电脑', '工作', '电视', '中国'].includes(w.word)
    );

    for (const subj of knownSubjects) {
      for (const verb of knownVerbs) {
        for (const obj of knownObjects) {
          if (subj.word === obj.word) continue;
          const sent = `${subj.word}${verb.word}${obj.word}。`;
          if (
            !seenSentences.has(sent) &&
            isSentenceComposedOnlyOfLearnedChars(sent, learnedCharSet)
          ) {
            seenSentences.add(sent);
            candidateSentences.push({
              sentence: sent,
              pinyin: `${subj.pinyin} ${verb.pinyin} ${obj.pinyin}.`,
              meaning: `${subj.meaning} ${verb.meaning.toLowerCase()} ${obj.meaning.toLowerCase()}.`,
              targetWord: verb.word,
              targetPinyin: verb.pinyin,
              targetMeaning: verb.meaning,
              source: 'template',
            });
            if (candidateSentences.length >= 30) break;
          }
        }
        if (candidateSentences.length >= 30) break;
      }
      if (candidateSentences.length >= 30) break;
    }
  }

  // Shuffle candidate sentences
  candidateSentences.sort(() => Math.random() - 0.5);

  const finalQuestions: QuizQuestion[] = [];
  const targetCount = limit === 9999 ? candidateSentences.length : Math.min(limit, candidateSentences.length);

  for (let i = 0; i < Math.min(candidateSentences.length, targetCount * 2); i++) {
    if (finalQuestions.length >= targetCount) break;

    const cand = candidateSentences[i];
    const target = cand.targetWord;

    // Generate 3 tricky distractors of EXACT same length
    const distractors = generateChallengingDistractors(
      target,
      learnedWords,
      MASTER_COMPOUND_DATABASE
    );

    if (distractors.length < 3) {
      // Need at least 3 distractors for 4 options
      continue;
    }

    // Assemble options & shuffle
    const optionsDetail = [
      {
        word: target,
        pinyin: cand.targetPinyin,
        meaning: cand.targetMeaning,
      },
      ...distractors,
    ];

    // Shuffle options
    const shuffledOptions = [...optionsDetail].sort(() => Math.random() - 0.5);
    const optionsWords = shuffledOptions.map((o) => o.word);

    // Ensure clean sentence and target
    const cleanSentence = sanitizeChineseSentence(cand.sentence);
    const cleanTarget = sanitizeChineseSentence(target);

    // Create sentence with blank: replace first occurrence of target with （ _____ ）
    const blankSentence = cleanSentence.replace(cleanTarget, '（ _____ ）');
    const blankPosition = cleanSentence.indexOf(cleanTarget);

    // Create prompt and subtitle
    const prompt = `Điền từ thích hợp vào chỗ trống để hoàn thành câu:`;
    const subtitle = `Dịch nghĩa câu: "${cand.meaning.replace(cand.targetMeaning, `[ ... ]`)}"`;

    // Corresponding character object for SRS progress
    let charObj = charMap.get(cleanTarget);
    if (!charObj) {
      // Convert compound if needed
      const foundDetected = detectCompoundWordsFromCharacters(allCharacters).find(
        (d) => d.word === cleanTarget
      );
      if (foundDetected) {
        charObj = convertCompoundToCharacter(foundDetected, ['all']);
      } else {
        charObj = {
          id: `cloze_${cleanTarget}`,
          hanzi: cleanTarget,
          pinyin: cand.targetPinyin,
          hanViet: '',
          meaning: cand.targetMeaning,
          radical: '',
          strokeCount: cleanTarget.length * 4,
          listIds: ['all'],
          createdAt: Date.now(),
          srs: {
            easinessFactor: 2.5,
            interval: 1,
            repetitions: 0,
            nextReviewDate: Date.now(),
            totalCorrect: 0,
            totalIncorrect: 0,
            consecutiveCorrect: 0,
            lastReviewedAt: null,
            masteryLevel: 0,
            difficultyScore: 0,
          },
        };
      }
    }

    const explanation = `Câu hoàn chỉnh: ${cleanSentence} (${cand.pinyin})\nNghĩa: ${cand.meaning}\n\nĐáp án đúng: 【${cleanTarget}】 (${cand.targetPinyin}) - ${cand.targetMeaning}.\n\nPhân biệt các đáp án khác:\n${distractors
      .map((d) => `• 【${d.word}】 (${d.pinyin}): ${d.meaning}`)
      .join('\n')}`;

    finalQuestions.push({
      id: `cloze_q_${Date.now()}_${i}_${cleanTarget}`,
      type: 'fill_sentence',
      character: charObj,
      prompt,
      subtitle,
      audioText: cleanSentence,
      options: optionsWords,
      correctAnswer: cleanTarget,
      explanation,
      clozeSentence: {
        fullSentence: cleanSentence,
        blankSentence,
        targetWord: cleanTarget,
        pinyin: cand.pinyin,
        meaning: cand.meaning,
        blankPosition,
        optionsDetail: shuffledOptions,
      },
    });
  }

  return finalQuestions;
}
