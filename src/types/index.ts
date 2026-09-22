export type QuestionType =
  | 'flashcard'
  | 'hanzi_to_meaning'
  | 'meaning_to_hanzi'
  | 'pinyin_to_hanzi'
  | 'hanzi_to_pinyin'
  | 'audio_to_hanzi'
  | 'type_pinyin'
  | 'type_hanzi'
  | 'matching'
  | 'fill_sentence'
  | 'reorder_words'
  | 'stroke_writing';

export type StudySessionMode =
  | 'smart_daily'
  | 'quick_flashcard'
  | 'weakness'
  | 'random_test'
  | 'sentence_cloze'
  | 'compound_words'
  | 'compound_expansion'
  | 'custom_list';

export interface ExampleSentence {
  sentence: string;
  pinyin: string;
  meaning: string;
}

export interface CompoundWord {
  word: string;
  pinyin: string;
  meaning: string;
}

export interface GrammarPracticeQuestion {
  id: string;
  type: 'choice' | 'reorder' | 'fill';
  prompt: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  scrambledTokens?: string[];
}

export interface GrammarTopic {
  id: string;
  level: 'HSK1' | 'HSK2' | 'HSK3' | 'HSK4' | 'Cấu trúc đặc biệt';
  title: string;
  pattern: string;
  explanation: string;
  usageNotes?: string[];
  examples: Array<{
    sentence: string;
    pinyin: string;
    meaning: string;
    highlight?: string;
  }>;
  practiceQuestions?: GrammarPracticeQuestion[];
}

export interface SRSData {
  easinessFactor: number; // default 2.5
  interval: number; // days
  repetitions: number;
  nextReviewDate: number; // timestamp ms
  totalCorrect: number;
  totalIncorrect: number;
  consecutiveCorrect: number;
  lastReviewedAt: number | null;
  masteryLevel: number; // 0 to 100%
  difficultyScore: number; // higher = harder
}

export interface Character {
  id: string;
  hanzi: string;
  pinyin: string;
  hanViet: string;
  meaning: string;
  radical: string;
  strokeCount: number;
  components?: string;
  mnemonic?: string;
  customNotes?: string;
  examples?: ExampleSentence[];
  compoundWords?: CompoundWord[];
  listIds: string[];
  createdAt: number;
  srs: SRSData;
}

export interface WordList {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  isPredefined?: boolean;
  createdAt: number;
}

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  character: Character;
  prompt: string;
  subtitle?: string;
  audioText?: string;
  options?: string[];
  correctAnswer: string;
  explanation?: string;
  matchPairs?: Array<{ left: string; right: string }>;
  scrambledTokens?: string[];
  clozeSentence?: {
    fullSentence: string;
    blankSentence: string;
    targetWord: string;
    pinyin: string;
    meaning: string;
    blankPosition: number;
    optionsDetail?: Array<{
      word: string;
      pinyin: string;
      meaning: string;
    }>;
  };
}

export interface ReviewLog {
  id: string;
  characterId: string;
  hanzi: string;
  questionType: QuestionType;
  isCorrect: boolean;
  timeSpentMs: number;
  timestamp: number;
}

export interface UserStats {
  totalSaved: number;
  totalMastered: number;
  totalReviews: number;
  accuracy: number;
  streakDays: number;
  lastStudyDate: string; // YYYY-MM-DD
  totalStudyTimeSeconds: number;
}

export interface AIResponseEnrich {
  hanzi: string;
  pinyin: string;
  hanViet: string;
  meaning: string;
  radical: string;
  strokeCount: number;
  components?: string;
  mnemonic?: string;
  examples?: ExampleSentence[];
  compoundWords?: CompoundWord[];
}
