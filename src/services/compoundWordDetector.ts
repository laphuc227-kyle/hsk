import { Character, SRSData } from '../types';
import { DEFAULT_SRS } from './dictionary';

export interface ConstituentCharInfo {
  char: string;
  inVocabulary: boolean;
  pinyin?: string;
  hanViet?: string;
  meaning?: string;
  isNew?: boolean;
}

export interface DetectedCompoundWord {
  id: string;
  word: string; // e.g. "学生"
  pinyin: string; // e.g. "xuéshēng"
  meaning: string; // e.g. "Học sinh, sinh viên"
  hanViet?: string; // e.g. "HỌC SINH"
  constituents: ConstituentCharInfo[];
  matchPercentage: number; // 100 = all single chars are in user vocabulary
  isFullMatch: boolean; // true if ALL single characters exist in user list (Strictly for Revision)
  isExpansionMatch: boolean; // true if 1+ single char is known and 1+ is NEW (For Learning Expansion Words)
  isInUserList: boolean; // true if this compound word is already saved directly in character list
  sourceNote?: string;
  exampleSentence?: {
    sentence: string;
    pinyin: string;
    meaning: string;
  };
}

// Comprehensive database of common Chinese compound words for auto-detection
export const MASTER_COMPOUND_DATABASE: Array<{
  word: string;
  pinyin: string;
  meaning: string;
  hanViet?: string;
  exampleSentence?: {
    sentence: string;
    pinyin: string;
    meaning: string;
  };
}> = [
  { word: '你好', pinyin: 'nǐ hǎo', meaning: 'Xin chào', hanViet: 'NHỈ HẢO', exampleSentence: { sentence: '你好！很高兴认识你。', pinyin: 'Nǐ hǎo! Hěn gāoxìng rènshi nǐ.', meaning: 'Xin chào! Rất vui được quen biết bạn.' } },
  { word: '学生', pinyin: 'xuéshēng', meaning: 'Học sinh, sinh viên', hanViet: 'HỌC SINH', exampleSentence: { sentence: '我是这所学校的学生。', pinyin: 'Wǒ shì zhè suǒ xuéxiào de xuéshēng.', meaning: 'Tôi là học sinh trường này.' } },
  { word: '学习', pinyin: 'xuéxí', meaning: 'Học tập, học hỏi', hanViet: 'HỌC TẬP', exampleSentence: { sentence: '我们每天都在学习汉语。', pinyin: 'Wǒmen měitiān dōu zài xuéxí hànyǔ.', meaning: 'Chúng tôi mỗi ngày đều học tiếng Trung.' } },
  { word: '学校', pinyin: 'xuéxiào', meaning: 'Trường học', hanViet: 'HỌC HIỆU', exampleSentence: { sentence: '我们的学校很大。', pinyin: 'Wǒmen de xuéxiào hěn dà.', meaning: 'Trường học của chúng tôi rất lớn.' } },
  { word: '老师', pinyin: 'lǎoshī', meaning: 'Thầy cô giáo', hanViet: 'LÃO SƯ', exampleSentence: { sentence: '王老师教我们汉语。', pinyin: 'Wáng lǎoshī jiāo wǒmen hànyǔ.', meaning: 'Thầy Vương dạy chúng tôi tiếng Trung.' } },
  { word: '电脑', pinyin: 'diànnǎo', meaning: 'Máy tính, vi tính', hanViet: 'ĐIỆN NÃO', exampleSentence: { sentence: '我用电脑工作。', pinyin: 'Wǒ yòng diànnǎo gōngzuò.', meaning: 'Tôi dùng máy tính để làm việc.' } },
  { word: '电话', pinyin: 'diànhuà', meaning: 'Điện thoại, cuộc gọi', hanViet: 'ĐIỆN THOẠI', exampleSentence: { sentence: '请给我打电话。', pinyin: 'Qǐng gěi wǒ dǎ diànhuà.', meaning: 'Xin hãy gọi điện cho tôi.' } },
  { word: '电影', pinyin: 'diànyǐng', meaning: 'Phim điện ảnh', hanViet: 'ĐIỆN ẢNH', exampleSentence: { sentence: '晚上我们去看电影。', pinyin: 'Wǎnshàng wǒmen qù kàn diànyǐng.', meaning: 'Buổi tối chúng tôi đi xem phim.' } },
  { word: '电视', pinyin: 'diànshì', meaning: 'Tivi, truyền hình', hanViet: 'ĐIỆN THỊ', exampleSentence: { sentence: '爸爸在看电视。', pinyin: 'Bàba zài kàn diànshì.', meaning: 'Bố đang xem tivi.' } },
  { word: '中国', pinyin: 'zhōngguó', meaning: 'Trung Quốc', hanViet: 'TRUNG QUỐC', exampleSentence: { sentence: '他去中国旅游了。', pinyin: 'Tā qù zhōngguó lǚyóu le.', meaning: 'Anh ấy đi du lịch Trung Quốc rồi.' } },
  { word: '汉语', pinyin: 'hànyǔ', meaning: 'Tiếng Trung (Hán ngữ)', hanViet: 'HÁN NGỮ', exampleSentence: { sentence: '汉语很精彩。', pinyin: 'Hànyǔ hěn jīngcǎi.', meaning: 'Tiếng Trung rất tuyệt vời.' } },
  { word: '汉字', pinyin: 'hànzì', meaning: 'Chữ Hán', hanViet: 'HÁN TỰ', exampleSentence: { sentence: '这个汉字怎么写？', pinyin: 'Zhège hànzì zěnme xiě?', meaning: 'Chữ Hán này viết thế nào?' } },
  { word: '喜欢', pinyin: 'xǐhuān', meaning: 'Thích, yêu thích', hanViet: 'HỶ HOAN', exampleSentence: { sentence: '我喜欢吃水果。', pinyin: 'Wǒ xǐhuān chī shuǐguǒ.', meaning: 'Tôi thích ăn hoa quả.' } },
  { word: '欢喜', pinyin: 'huānxǐ', meaning: 'Vui mừng, hân hoan', hanViet: 'HOAN HỶ' },
  { word: '朋友', pinyin: 'péngyou', meaning: 'Bạn bè, bạn thân', hanViet: 'BẰNG HỮU', exampleSentence: { sentence: '我们是好朋友。', pinyin: 'Wǒmen shì hǎo péngyou.', meaning: 'Chúng ta là bạn tốt.' } },
  { word: '工作', pinyin: 'gōngzuò', meaning: 'Công việc, làm việc', hanViet: 'CÔNG TÁC', exampleSentence: { sentence: '我的工作很繁忙。', pinyin: 'Wǒ de gōngzuò hěn fánmáng.', meaning: 'Công việc của tôi rất bận rộn.' } },
  { word: '谢谢', pinyin: 'xièxie', meaning: 'Cảm ơn, cám ơn', hanViet: 'TẠ TẠ', exampleSentence: { sentence: '非常谢谢你的帮忙。', pinyin: 'Fēicháng xièxie nǐ de bāngmáng.', meaning: 'Rất cảm ơn sự giúp đỡ của bạn.' } },
  { word: '再见', pinyin: 'zàijiàn', meaning: 'Tạm biệt, hẹn gặp lại', hanViet: 'TÁI KIẾN', exampleSentence: { sentence: '明天见，再见！', pinyin: 'Míngtiān jiàn, zàijiàn!', meaning: 'Mảnh hẹn ngày mai gặp lại, tạm biệt!' } },
  { word: '大家', pinyin: 'dàjiā', meaning: 'Mọi người, tất cả', hanViet: 'ĐẠI GIA', exampleSentence: { sentence: '大家好！', pinyin: 'Dàjiā hǎo!', meaning: 'Chào mọi người!' } },
  { word: '大学', pinyin: 'dàxué', meaning: 'Trường đại học', hanViet: 'ĐẠI HỌC', exampleSentence: { sentence: '他在北京大学读书。', pinyin: 'Tā zài Běijīng dàxué dúshū.', meaning: 'Anh ấy học tại Đại học Bắc Kinh.' } },
  { word: '天气', pinyin: 'tiānqì', meaning: 'Thời tiết', hanViet: 'THIÊN KHÍ', exampleSentence: { sentence: '今天天气很好。', pinyin: 'Jīntiān tiānqì hěn hǎo.', meaning: 'Hôm nay thời tiết rất tốt.' } },
  { word: '水果', pinyin: 'shuǐguǒ', meaning: 'Hoa quả, trái cây', hanViet: 'THỦY QUẢ', exampleSentence: { sentence: '多吃水果对身体好。', pinyin: 'Duō chī shuǐguǒ duì shēntǐ hǎo.', meaning: 'Ăn nhiều hoa quả tốt cho sức khỏe.' } },
  { word: '苹果', pinyin: 'píngguǒ', meaning: 'Quả táo', hanViet: 'BÌNH QUẢ', exampleSentence: { sentence: '这个苹果很甜。', pinyin: 'Zhège píngguǒ hěn tián.', meaning: 'Quả táo này rất ngọt.' } },
  { word: '东西', pinyin: 'dōngxi', meaning: 'Đồ đạc, vật dụng', hanViet: 'ĐÔNG TÂY' },
  { word: '买东西', pinyin: 'mǎi dōngxi', meaning: 'Đi sắm đồ, mua sắm', hanViet: 'MÃI ĐÔNG TÂY' },
  { word: '说话', pinyin: 'shuōhuà', meaning: 'Nói chuyện, phát biểu', hanViet: 'THUYẾT THOẠI' },
  { word: '认识', pinyin: 'rènshi', meaning: 'Quen biết, nhận biết', hanViet: 'NHẬN THỨC' },
  { word: '高兴', pinyin: 'gāoxìng', meaning: 'Vui vẻ, hân hoan', hanViet: 'CAO HỨNG' },
  { word: '看见', pinyin: 'kànjiàn', meaning: 'Nhìn thấy, trông thấy', hanViet: 'KHÁN KIẾN' },
  { word: '医生', pinyin: 'yīshēng', meaning: 'Bác sĩ, thầy thuốc', hanViet: 'Y SINH' },
  { word: '医院', pinyin: 'yīyuàn', meaning: 'Bệnh viện', hanViet: 'Y VIỆN' },
  { word: '衣服', pinyin: 'yīfu', meaning: 'Quần áo', hanViet: 'Y PHỤC' },
  { word: '飞机', pinyin: 'fēijī', meaning: 'Máy bay', hanViet: 'PHI CƠ' },
  { word: '出租车', pinyin: 'chūzūchē', meaning: 'Xe taxi', hanViet: 'XUẤT TÔ XA' },
  { word: '火车站', pinyin: 'huǒchēzhàn', meaning: 'Ga tàu hỏa', hanViet: 'HỎA XA TRẠM' },
  { word: '国家', pinyin: 'guójiā', meaning: 'Quốc gia, đất nước', hanViet: 'QUỐC GIA' },
  { word: '今天', pinyin: 'jīntiān', meaning: 'Hôm nay', hanViet: 'KIM THIÊN' },
  { word: '明天', pinyin: 'míngtiān', meaning: 'Ngày mai', hanViet: 'MINH THIÊN' },
  { word: '昨天', pinyin: 'zuótiān', meaning: 'Hôm qua', hanViet: 'TÁC THIÊN' },
  { word: '早上', pinyin: 'zǎoshang', meaning: 'Buổi sáng', hanViet: 'TẢO THƯỢNG' },
  { word: '晚上', pinyin: 'wǎnshang', meaning: 'Buổi tối', hanViet: 'VÃN THƯỢNG' },
  { word: '吃饭', pinyin: 'chīfàn', meaning: 'Ăn cơm, ăn uống', hanViet: 'CẬT PHẠN' },
  { word: '喝水', pinyin: 'hēshuǐ', meaning: 'Uống nước', hanViet: 'HÁT THỦY' },
  { word: '睡觉', pinyin: 'shuìjiào', meaning: 'Đi ngủ', hanViet: 'THỤY GIÁC' },
  { word: '看书', pinyin: 'kànshū', meaning: 'Đọc sách', hanViet: 'KHÁN THƯ' },
  { word: '身体', pinyin: 'shēntǐ', meaning: 'Thân thể, sức khỏe', hanViet: 'THÂN THỂ' },
  { word: '时间', pinyin: 'shíjiān', meaning: 'Thời gian', hanViet: 'THỜI GIAN' },
  { word: '地方', pinyin: 'dìfang', meaning: 'Địa phương, nơi chốn', hanViet: 'ĐỊA PHƯƠNG' },
  { word: '事情', pinyin: 'shìqing', meaning: 'Sự việc, công chuyện', hanViet: 'SỰ TÌNH' },
  { word: '觉得', pinyin: 'juéde', meaning: 'Cảm thấy, cho rằng', hanViet: 'GIÁC ĐẮC' },
  { word: '希望', pinyin: 'xīwàng', meaning: 'Hy vọng, mong muốn', hanViet: 'HI VỌNG' },
  { word: '准备', pinyin: 'zhǔnbèi', meaning: 'Chuẩn bị', hanViet: 'CHUẨN BỊ' },
  { word: '帮助', pinyin: 'bāngzhù', meaning: 'Giúp đỡ, trợ giúp', hanViet: 'BANG TRỢ' },
  { word: '介绍', pinyin: 'jièshào', meaning: 'Giới thiệu', hanViet: 'GIỚI THIỆU' },
  { word: '开始', pinyin: 'kāishǐ', meaning: 'Bắt đầu', hanViet: 'KHAI THỦY' },
  { word: '手机', pinyin: 'shǒujī', meaning: 'Điện thoại di động', hanViet: 'THỦ CƠ' },
  { word: '一起', pinyin: 'yìqǐ', meaning: 'Cùng nhau, một chỗ', hanViet: 'NHẤT KHỞI' },
  { word: '意思', pinyin: 'yìsi', meaning: 'Ý nghĩa, ý tứ', hanViet: 'Ý TƯ' },
  { word: '运动', pinyin: 'yùndòng', meaning: 'Vận động, thể thao', hanViet: 'VẬN ĐỘNG' },
  { word: '经常', pinyin: 'jīngcháng', meaning: 'Thường xuyên', hanViet: 'KINH THƯỜNG' },
  { word: '简单', pinyin: 'jiǎndān', meaning: 'Đơn giản', hanViet: 'GIẢN ĐƠN' },
  { word: '清楚', pinyin: 'qīngchu', meaning: 'Rõ ràng, minh bạch', hanViet: 'THANH SỞ' },
  { word: '方便', pinyin: 'fāngbiàn', meaning: 'Thuận tiện, tiện lợi', hanViet: 'PHƯƠNG TIỆN' },
  { word: '解决', pinyin: 'jiějué', meaning: 'Giải quyết', hanViet: 'GIẢI QUYẾT' },
  { word: '影响', pinyin: 'yǐngxiǎng', meaning: 'Ảnh hưởng', hanViet: 'ẢNH HƯỞNG' },
  { word: '关系', pinyin: 'guānxi', meaning: 'Quan hệ, mối quan hệ', hanViet: 'QUAN HỆ' },
  { word: '照顾', pinyin: 'zhàogu', meaning: 'Chăm sóc, chiếu cố', hanViet: 'CHIẾU CỐ' },
  { word: '认真', pinyin: 'rènzhēn', meaning: 'Nghiêm túc, chăm chỉ', hanViet: 'NHẬN CHÂN' },
];

/**
 * Automatically detects compound words formed by combining single characters present in the user's vocabulary.
 */
export function detectCompoundWordsFromCharacters(
  userCharacters: Character[]
): DetectedCompoundWord[] {
  // Map of single characters saved in user's list
  const userSingleCharMap = new Map<string, Character>();
  const userFullWordSet = new Set<string>();

  userCharacters.forEach((c) => {
    userFullWordSet.add(c.hanzi);
    if (c.hanzi.length === 1) {
      userSingleCharMap.set(c.hanzi, c);
    }
  });

  const detectedMap = new Map<string, DetectedCompoundWord>();

  // Helper to add or update candidate compound word
  const addCandidateWord = (
    word: string,
    pinyin: string,
    meaning: string,
    hanViet?: string,
    example?: { sentence: string; pinyin: string; meaning: string },
    sourceNote?: string
  ) => {
    if (!word || word.length <= 1) return;

    // Break down into individual characters
    const chars = Array.from(word);
    let matchedCount = 0;
    const constituents: ConstituentCharInfo[] = chars.map((char) => {
      const foundInUser = userSingleCharMap.get(char);
      if (foundInUser) {
        matchedCount++;
        return {
          char,
          inVocabulary: true,
          pinyin: foundInUser.pinyin,
          hanViet: foundInUser.hanViet,
          meaning: foundInUser.meaning,
        };
      }
      return {
        char,
        inVocabulary: false,
      };
    });

    const matchPercentage = Math.round((matchedCount / chars.length) * 100);
    const isFullMatch = matchedCount === chars.length;
    const isExpansionMatch = matchedCount > 0 && matchedCount < chars.length;
    const isInUserList = userFullWordSet.has(word);

    // We keep compound words if at least 1 constituent character exists in user vocabulary OR it is explicitly in list
    if (matchedCount > 0 || isInUserList) {
      detectedMap.set(word, {
        id: `detected_${word}`,
        word,
        pinyin,
        meaning,
        hanViet: hanViet || '',
        constituents,
        matchPercentage,
        isFullMatch,
        isExpansionMatch,
        isInUserList,
        sourceNote: sourceNote || (isFullMatch ? 'Ghép 100% từ các chữ đơn đã học (Dùng để ôn tập)' : 'Từ ghép mở rộng chứa chữ mới (Dùng để học thêm)'),
        exampleSentence: example,
      });
    }
  };

  // 1. Scan embedded compoundWords inside user's single characters
  userCharacters.forEach((c) => {
    if (c.compoundWords) {
      c.compoundWords.forEach((cw) => {
        addCandidateWord(
          cw.word,
          cw.pinyin,
          cw.meaning,
          '',
          undefined,
          `Được gợi ý từ chữ đơn [${c.hanzi}]`
        );
      });
    }
    // If the user's character itself is multi-character (e.g. "学生")
    if (c.hanzi.length > 1) {
      addCandidateWord(
        c.hanzi,
        c.pinyin,
        c.meaning,
        c.hanViet,
        c.examples && c.examples[0] ? c.examples[0] : undefined,
        'Đã có sẵn trong danh sách từ vựng'
      );
    }
  });

  // 2. Scan Master Compound Database
  MASTER_COMPOUND_DATABASE.forEach((item) => {
    addCandidateWord(
      item.word,
      item.pinyin,
      item.meaning,
      item.hanViet,
      item.exampleSentence,
      'Phát hiện tự động từ từ điển HSK'
    );
  });

  // Convert map to sorted array
  const result = Array.from(detectedMap.values());

  // Sort priority:
  // 1. Full Match (100% constituent characters exist in user's list)
  // 2. Highest match percentage
  // 3. Words in user list
  result.sort((a, b) => {
    if (a.isFullMatch !== b.isFullMatch) return a.isFullMatch ? -1 : 1;
    if (a.matchPercentage !== b.matchPercentage) return b.matchPercentage - a.matchPercentage;
    return a.word.localeCompare(b.word);
  });

  return result;
}

/**
 * Converts a DetectedCompoundWord into a standard Character object for study sessions
 */
export function convertCompoundToCharacter(detected: DetectedCompoundWord, listIds: string[] = ['hsk1']): Character {
  const componentString = detected.constituents
    .map((c) => (c.inVocabulary ? `[Đã học] ${c.char} (${c.meaning || c.pinyin})` : `[Chữ mới] ${c.char}`))
    .join(' + ');

  const knownChars = detected.constituents
    .filter((c) => c.inVocabulary)
    .map((c) => `${c.char}${c.meaning ? ` (${c.meaning})` : ''}`)
    .join(', ');

  const newChars = detected.constituents
    .filter((c) => !c.inVocabulary)
    .map((c) => c.char)
    .join(', ');

  let customNotes = '';
  if (detected.isFullMatch) {
    customNotes = `✨ [ÔN TẬP TỪ GHÉP] 100% chữ đơn trong từ này (${knownChars}) đã có trong từ vựng của bạn.`;
  } else {
    customNotes = `💡 [MỞ RỘNG TỪ MỚI] Chữ đã học: ${knownChars} | Chữ mới cần ghi nhớ: ${newChars}.`;
  }

  return {
    id: detected.id,
    hanzi: detected.word,
    pinyin: detected.pinyin,
    hanViet: detected.hanViet || '',
    meaning: detected.meaning,
    radical: detected.isFullMatch ? 'Từ ghép ôn tập' : 'Từ ghép mở rộng',
    strokeCount: detected.word.length * 5,
    components: componentString,
    mnemonic: customNotes,
    customNotes,
    examples: detected.exampleSentence ? [detected.exampleSentence] : [],
    listIds,
    createdAt: Date.now(),
    srs: { ...DEFAULT_SRS },
  };
}

/**
 * Automatically detects and synchronizes 100% learned compound words into the user's vocabulary list.
 * This ensures that whenever the constituent single characters exist in the user's library,
 * the compound word is automatically available in "Tất cả từ vựng" and all study modes.
 */
export function syncLearnedCompoundWords(currentCharacters: Character[]): {
  updatedCharacters: Character[];
  addedCount: number;
} {
  const existingHanziMap = new Map<string, Character>();
  currentCharacters.forEach((c) => existingHanziMap.set(c.hanzi, c));

  // Detect compound words from current characters
  const detected = detectCompoundWordsFromCharacters(currentCharacters);
  const fullMatchCompounds = detected.filter((dc) => dc.isFullMatch);

  let addedCount = 0;
  const newCharacters: Character[] = [];

  fullMatchCompounds.forEach((dc) => {
    if (!existingHanziMap.has(dc.word)) {
      // Find list IDs from constituent characters
      const constituentListIds = new Set<string>();
      dc.constituents.forEach((constituent) => {
        const matchingChar = existingHanziMap.get(constituent.char);
        if (matchingChar && matchingChar.listIds) {
          matchingChar.listIds.forEach((lid) => constituentListIds.add(lid));
        }
      });

      const listIds = constituentListIds.size > 0 ? Array.from(constituentListIds) : ['hsk1'];
      const converted = convertCompoundToCharacter(dc, listIds);
      existingHanziMap.set(dc.word, converted);
      newCharacters.push(converted);
      addedCount++;
    }
  });

  if (addedCount === 0) {
    return {
      updatedCharacters: currentCharacters,
      addedCount: 0,
    };
  }

  return {
    updatedCharacters: [...currentCharacters, ...newCharacters],
    addedCount,
  };
}
