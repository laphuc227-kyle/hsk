import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Volume2, CheckCircle, XCircle, ArrowRight, RefreshCw, Sparkles, BookOpen, Clock, ShieldCheck, Award, Filter, Eye, EyeOff, FileQuestion } from 'lucide-react';
import { Character, QuizQuestion, StudySessionMode, QuestionType, WordList } from '../types';
import { selectCharactersForSession, generateQuestionForCharacter, calculateSRSUpdate } from '../services/srs';
import { generateSentenceClozeQuestions } from '../services/sentenceCloze';
import { addCharacter, addReviewLog } from '../services/storage';
import { speakChinese } from '../services/audio';
import { StrokeWriterCanvas } from './StrokeWriterCanvas';
import { checkPinyinAnswer } from '../utils/pinyinUtils';

interface StudySessionProps {
  mode: StudySessionMode;
  allCharacters: Character[];
  selectedListId?: string;
  wordLists?: WordList[];
  initialQuestionLimit?: number | 'all';
  onFinishSession: () => void;
  onOpenCharacterDetail: (character: Character) => void;
  onChangeList?: (listId: string | null) => void;
}

export const StudySession: React.FC<StudySessionProps> = ({
  mode,
  allCharacters,
  selectedListId,
  wordLists = [],
  initialQuestionLimit = 20,
  onFinishSession,
  onOpenCharacterDetail,
  onChangeList,
}) => {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [typingInput, setTypingInput] = useState('');
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [flashcardFlipped, setFlashcardFlipped] = useState(false);

  // Session Stats
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [startTime] = useState(Date.now());
  const [isCompleted, setIsCompleted] = useState(false);

  // Detailed Answer Tracking
  interface QuestionResult {
    question: QuizQuestion;
    userAnswer?: string;
    isCorrect: boolean;
    ratingLabel?: string;
  }
  const [sessionResults, setSessionResults] = useState<QuestionResult[]>([]);

  // User custom question limit selection: 'all' or specific number
  const [selectedQuestionLimit, setSelectedQuestionLimit] = useState<number | 'all'>(initialQuestionLimit);

  // User customizable visibility settings (toggle ON/OFF for difficulty)
  const [showPinyin, setShowPinyin] = useState<boolean>(true);
  const [showHanViet, setShowHanViet] = useState<boolean>(true);
  const [showMeaning, setShowMeaning] = useState<boolean>(true);

  // Helper to filter question subtitles based on user visibility toggles
  const getFilteredSubtitle = (subtitle?: string) => {
    if (!subtitle) return null;
    const lines = subtitle.split('\n');
    const filteredLines = lines
      .map((line) => {
        const parts = line.split('|').map((s) => s.trim());
        const filteredParts = parts.filter((part) => {
          const lower = part.toLowerCase();
          const isPinyinPart = lower.includes('pinyin');
          const isHanVietPart = lower.includes('âm hán việt') || lower.includes('hán việt');
          const isMeaningPart =
            lower.includes('nghĩa:') || lower.includes('(dịch:') || lower.includes('nghĩa tiếng việt');

          if (isPinyinPart && !showPinyin) return false;
          if (isHanVietPart && !showHanViet) return false;
          if (isMeaningPart && !showMeaning) return false;
          return true;
        });
        return filteredParts.join(' | ');
      })
      .filter((line) => line.trim().length > 0);

    if (filteredLines.length === 0) return null;
    return filteredLines.join('\n');
  };

  // Calculate available pool size directly using SRS selector function
  const availablePool = selectCharactersForSession(allCharacters, mode, selectedListId, 9999);
  const availablePoolCount = availablePool.length;

  // Initialize session questions
  useEffect(() => {
    let targetCount = availablePoolCount;
    if (selectedQuestionLimit !== 'all') {
      targetCount = Math.min(selectedQuestionLimit, availablePoolCount);
    }

    if (mode === 'sentence_cloze') {
      const clozeQuestions = generateSentenceClozeQuestions(
        allCharacters,
        targetCount > 0 ? targetCount : 20,
        selectedListId
      );
      setQuestions(clozeQuestions);
      setSessionResults([]);
      setCurrentIndex(0);
      setIsCompleted(false);
      return;
    }

    const selectedChars = selectCharactersForSession(
      allCharacters,
      mode,
      selectedListId,
      targetCount > 0 ? targetCount : 20
    );

    const generatedQuestions: QuizQuestion[] = selectedChars.map((char) => {
      let forcedType: QuestionType | undefined = undefined;
      if (mode === 'quick_flashcard') forcedType = 'flashcard';
      return generateQuestionForCharacter(char, allCharacters, forcedType);
    });

    setQuestions(generatedQuestions);
    setSessionResults([]);
    setCurrentIndex(0);
    setIsCompleted(false);
  }, [mode, allCharacters, selectedListId, selectedQuestionLimit, availablePoolCount]);

  const currentQ = questions[currentIndex];

  useEffect(() => {
    setFlashcardFlipped(false);
    setSelectedOption(null);
    setTypingInput('');
    setIsAnswered(false);
  }, [currentIndex, currentQ]);

  const handlePlayAudio = () => {
    if (currentQ?.audioText) {
      speakChinese(currentQ.audioText);
    } else if (currentQ?.character?.hanzi) {
      speakChinese(currentQ.character.hanzi);
    }
  };

  if (questions.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-16 bg-slate-900/80 rounded-2xl border border-slate-800 p-8 space-y-4 max-w-lg mx-auto text-slate-100 shadow-xl"
      >
        <BookOpen className="w-10 h-10 text-slate-600 mx-auto" />
        <h3 className="text-base font-bold text-slate-100">
          {mode === 'sentence_cloze'
            ? 'Chưa đủ câu thích hợp từ các từ đã học'
            : 'Không có chữ Hán phù hợp để luyện tập'}
        </h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          {mode === 'sentence_cloze'
            ? 'Chế độ này chỉ sử dụng các từ đơn & từ ghép ôn tập (100% đã học) để tạo câu và các đáp án phức tạp. Hãy học thêm một số từ hoặc chuyển sang nguồn "Tất cả từ vựng".'
            : 'Hãy dán hoặc tạo thêm từ vựng vào danh sách của bạn trước khi bắt đầu bài tập.'}
        </p>
        <button
          onClick={onFinishSession}
          className="px-4 py-2 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl cursor-pointer transition"
        >
          Quay lại danh sách
        </button>
      </motion.div>
    );
  }

  // Render cloze sentence with interactive animated blank
  const renderClozeSentenceWithBlank = (
    q: QuizQuestion,
    answered: boolean,
    userChoice: string | null
  ) => {
    if (!q.clozeSentence) {
      return q.prompt;
    }
    const rawSentence = q.clozeSentence.fullSentence || '';
    const rawTarget = q.clozeSentence.targetWord || '';
    const cleanFullSentence = rawSentence.replace(/[a-zA-Z]+/g, '').replace(/\s+/g, '').trim();
    const cleanTarget = rawTarget.replace(/[a-zA-Z]+/g, '').replace(/\s+/g, '').trim();

    const parts = cleanFullSentence.split(cleanTarget);
    if (parts.length < 2) {
      return cleanFullSentence;
    }

    const before = parts[0];
    const after = parts.slice(1).join(cleanTarget);

    if (!answered) {
      return (
        <span className="inline leading-relaxed">
          <span>{before}</span>
          <span className="inline-block px-3.5 py-0.5 mx-1.5 align-middle rounded-xl border-2 border-dashed border-violet-400/90 bg-violet-500/20 text-violet-300 font-sans font-bold text-base sm:text-xl animate-pulse tracking-wider shadow-inner">
            （ _____ ）
          </span>
          <span>{after}</span>
        </span>
      );
    }

    const isUserCorrect = userChoice === q.correctAnswer;

    if (isUserCorrect) {
      return (
        <span className="inline leading-relaxed">
          <span>{before}</span>
          <span className="inline-block px-3 py-0.5 mx-1.5 align-middle rounded-xl border border-emerald-400 bg-emerald-500/25 text-emerald-200 font-serif font-bold text-2xl sm:text-3xl shadow-lg shadow-emerald-500/20">
            {q.correctAnswer}
          </span>
          <span>{after}</span>
        </span>
      );
    }

    return (
      <span className="inline leading-relaxed">
        <span>{before}</span>
        {userChoice && (
          <span className="inline-block px-2 py-0.5 mx-1 align-middle rounded-xl border border-rose-400 bg-rose-500/20 text-rose-300 font-serif font-bold text-xl line-through">
            {userChoice}
          </span>
        )}
        <span className="inline-block px-3 py-0.5 mx-1.5 align-middle rounded-xl border border-emerald-400 bg-emerald-500/25 text-emerald-200 font-serif font-bold text-2xl sm:text-3xl shadow-md">
          {q.correctAnswer}
        </span>
        <span>{after}</span>
      </span>
    );
  };

  // Handle Multiple Choice selection
  const handleSelectOption = (option: string) => {
    if (isAnswered) return;
    setSelectedOption(option);
    setIsAnswered(true);

    const correct = option === currentQ.correctAnswer;
    setIsCorrect(correct);

    // Update stats
    if (correct) {
      setCorrectCount((prev) => prev + 1);
    } else {
      setIncorrectCount((prev) => prev + 1);
    }

    setSessionResults((prev) => [
      ...prev,
      {
        question: currentQ,
        userAnswer: option,
        isCorrect: correct,
      },
    ]);

    // Save SRS update
    saveAnswerSRS(correct ? 2 : 0);
  };

  // Handle Typing Answer
  const handleCheckTyping = () => {
    if (isAnswered) return;
    setIsAnswered(true);

    let correct = false;
    if (currentQ.type === 'type_pinyin') {
      correct = checkPinyinAnswer(typingInput, currentQ.correctAnswer);
    } else {
      const normalizedUser = typingInput.trim().toLowerCase().replace(/\s+/g, '');
      const normalizedCorrect = currentQ.correctAnswer.trim().toLowerCase().replace(/\s+/g, '');
      correct = normalizedUser === normalizedCorrect;
    }

    setIsCorrect(correct);

    if (correct) {
      setCorrectCount((prev) => prev + 1);
    } else {
      setIncorrectCount((prev) => prev + 1);
    }

    setSessionResults((prev) => [
      ...prev,
      {
        question: currentQ,
        userAnswer: typingInput.trim() || '(Bỏ trống)',
        isCorrect: correct,
      },
    ]);

    saveAnswerSRS(correct ? 2 : 0);
  };

  // Handle Flashcard Rating (SM-2)
  const handleFlashcardRating = (rating: 0 | 1 | 2 | 3) => {
    const correct = rating >= 2;
    if (correct) {
      setCorrectCount((prev) => prev + 1);
    } else {
      setIncorrectCount((prev) => prev + 1);
    }

    const ratingLabels = ['Chưa nhớ', 'Hơi khó', 'Đã nhớ', 'Rất thuộc'];
    setSessionResults((prev) => [
      ...prev,
      {
        question: currentQ,
        userAnswer: `Đã lật thẻ (${ratingLabels[rating]})`,
        isCorrect: correct,
        ratingLabel: ratingLabels[rating],
      },
    ]);

    saveAnswerSRS(rating);
    handleNextQuestion();
  };

  const saveAnswerSRS = (rating: 0 | 1 | 2 | 3) => {
    if (!currentQ || !currentQ.character) return;

    const updatedSRS = calculateSRSUpdate(currentQ.character.srs, rating);
    const updatedChar: Character = {
      ...currentQ.character,
      srs: updatedSRS,
    };

    addCharacter(updatedChar);

    // Save review log
    addReviewLog({
      id: `log_${Date.now()}`,
      characterId: currentQ.character.id,
      hanzi: currentQ.character.hanzi,
      questionType: currentQ.type,
      isCorrect: rating >= 2,
      timeSpentMs: 3000,
      timestamp: Date.now(),
    });
  };

  const handleNextQuestion = () => {
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setIsCompleted(true);
    }
  };

  // Session Completion Screen
  if (isCompleted) {
    const totalSpentSeconds = Math.round((Date.now() - startTime) / 1000);
    const totalAsked = questions.length;
    const accuracyPct = Math.round((correctCount / totalAsked) * 100);

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 md:p-8 max-w-3xl mx-auto space-y-6 my-6 shadow-2xl backdrop-blur-xl text-slate-100"
      >
        <div className="text-center space-y-3">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.5, delay: 0.1, type: 'spring' }}
            className="w-16 h-16 bg-gradient-to-tr from-emerald-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto text-slate-950 shadow-lg shadow-emerald-500/20"
          >
            <Award className="w-8 h-8 stroke-[2.5]" />
          </motion.div>

          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent">
              Hoàn Thành Bài Học!
            </h2>
            <p className="text-xs text-slate-400 pt-1">
              Chế độ luyện tập: <span className="font-semibold text-cyan-300">{getModeTitle(mode)}</span>
            </p>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-3 gap-3 text-center bg-slate-950/80 p-4 rounded-xl border border-slate-800/80">
          <div>
            <span className="text-2xl md:text-3xl font-black text-emerald-400">{accuracyPct}%</span>
            <span className="block text-[10px] text-slate-400 uppercase pt-1 font-mono">Độ chính xác</span>
          </div>
          <div>
            <span className="text-2xl md:text-3xl font-black text-cyan-400">{correctCount} / {totalAsked}</span>
            <span className="block text-[10px] text-slate-400 uppercase pt-1 font-mono">Trả lời đúng</span>
          </div>
          <div>
            <span className="text-2xl md:text-3xl font-black text-slate-200">{totalSpentSeconds}s</span>
            <span className="block text-[10px] text-slate-400 uppercase pt-1 font-mono">Thời gian làm</span>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex justify-center pt-2">
          <button
            onClick={onFinishSession}
            className="w-full sm:w-auto px-8 py-3 text-xs font-bold text-slate-950 bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 rounded-xl transition cursor-pointer shadow-md shadow-emerald-500/20 active:scale-95"
          >
            Quay lại danh sách từ vựng
          </button>
        </div>

        {/* Detailed Question Answers Summary List */}
        <div className="border-t border-slate-800/80 pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-400" />
              <span>Danh Sách Đáp Án Tất Cả Câu Hỏi ({sessionResults.length})</span>
            </h3>
            <span className="text-xs text-slate-400">Bấm vào từng chữ để xem nét vẽ & từ điển</span>
          </div>

          <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
            {sessionResults.map((res, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-xl border transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                  res.isCorrect
                    ? 'bg-slate-950/60 border-slate-800 hover:border-emerald-500/40'
                    : 'bg-rose-950/20 border-rose-900/40 hover:border-rose-500/40'
                }`}
              >
                <div className="flex items-start gap-3 flex-1">
                  {/* Result Badge */}
                  <div className="shrink-0 pt-0.5">
                    {res.isCorrect ? (
                      <span className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-xs">
                        ✓
                      </span>
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 font-bold text-xs">
                        ✕
                      </span>
                    )}
                  </div>

                  {/* Character Hanzi & Details */}
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-mono text-slate-500">#{idx + 1}</span>
                      <button
                        onClick={() => onOpenCharacterDetail(res.question.character)}
                        className="text-2xl font-serif font-bold text-slate-100 hover:text-emerald-300 transition cursor-pointer"
                      >
                        {res.question.character.hanzi}
                      </button>
                      <button
                        onClick={() => speakChinese(res.question.character.hanzi)}
                        title="Nghe phát âm"
                        className="p-1 text-slate-400 hover:text-cyan-300 bg-slate-900 rounded-lg border border-slate-800 transition cursor-pointer"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-mono font-bold text-cyan-400">
                        {res.question.character.pinyin}
                      </span>
                      <span className="text-[11px] font-bold text-teal-300 uppercase">
                        [{res.question.character.hanViet}]
                      </span>
                      <span className="text-xs text-slate-300">
                        • {res.question.character.meaning}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 pt-0.5">
                      <span className="font-semibold text-slate-300">Câu hỏi:</span> {res.question.prompt}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs pt-1 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80">
                      <div>
                        <span className="text-slate-500">Lựa chọn của bạn: </span>
                        <span className={`font-semibold ${res.isCorrect ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {res.userAnswer || '(Không trả lời)'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Đáp án chính xác: </span>
                        <span className="font-semibold text-cyan-300">
                          {res.question.correctAnswer}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* View Details Button */}
                <button
                  onClick={() => onOpenCharacterDetail(res.question.character)}
                  className="shrink-0 px-3 py-1.5 text-[11px] font-semibold text-cyan-300 hover:text-cyan-200 bg-slate-900 hover:bg-slate-800 rounded-lg border border-cyan-500/30 transition cursor-pointer self-end sm:self-center"
                >
                  Chi tiết chữ
                </button>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  const currentListObj = wordLists.find((l) => l.id === selectedListId);

  return (
    <div className="max-w-2xl mx-auto space-y-6 text-slate-100">
      {/* Session Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-xl">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-100">
              {getModeTitle(mode)}
            </span>

            {/* Active List Badge / Selector */}
            {mode === 'compound_words' ? (
              <span className="text-xs font-bold text-amber-300 bg-amber-500/20 px-2.5 py-0.5 rounded-lg border border-amber-500/40">
                Từ ghép 100% đã học
              </span>
            ) : mode === 'compound_expansion' ? (
              <span className="text-xs font-bold text-emerald-300 bg-emerald-500/20 px-2.5 py-0.5 rounded-lg border border-emerald-500/40">
                Từ ghép mở rộng (Chữ mới)
              </span>
            ) : onChangeList && wordLists && wordLists.length > 0 ? (
              <div className="flex items-center gap-1 text-xs">
                <span className="text-slate-400 text-[11px]">Danh sách:</span>
                <select
                  value={selectedListId || ''}
                  onChange={(e) => onChangeList(e.target.value ? e.target.value : null)}
                  className="text-xs font-bold text-emerald-300 bg-slate-950 border border-emerald-500/40 rounded-lg px-2 py-0.5 cursor-pointer focus:outline-hidden"
                >
                  <option value="">Tất cả từ vựng</option>
                  {wordLists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <span className="text-xs font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-lg border border-emerald-500/40">
                {currentListObj ? currentListObj.name : 'Tất cả từ vựng'}
              </span>
            )}

            {/* Question Count Selector */}
            <div className="flex items-center gap-1 text-xs">
              <span className="text-slate-400 text-[11px]">Số câu:</span>
              <select
                value={selectedQuestionLimit}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedQuestionLimit(val === 'all' ? 'all' : Number(val));
                }}
                className="text-xs font-bold text-cyan-300 bg-slate-950 border border-cyan-500/40 rounded-lg px-2 py-0.5 cursor-pointer focus:outline-hidden"
              >
                <option value="all">Tất cả ({availablePoolCount} câu)</option>
                {availablePoolCount >= 5 && <option value={5}>5 câu</option>}
                {availablePoolCount >= 10 && <option value={10}>10 câu</option>}
                {availablePoolCount >= 15 && <option value={15}>15 câu</option>}
                {availablePoolCount >= 20 && <option value={20}>20 câu</option>}
                {availablePoolCount >= 30 && <option value={30}>30 câu</option>}
                {availablePoolCount >= 50 && <option value={50}>50 câu</option>}
                {availablePoolCount >= 100 && <option value={100}>100 câu</option>}
              </select>
            </div>
          </div>

          <span className="text-[11px] font-mono text-slate-400 block pt-1">
            Câu {currentIndex + 1} / {questions.length}
          </span>
        </div>

        {/* Progress Bar & Actions */}
        <div className="flex items-center gap-3">
          <div className="w-28 sm:w-36 bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
            <div
              className="bg-gradient-to-r from-emerald-400 to-cyan-400 h-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
            />
          </div>

          <button
            onClick={handlePlayAudio}
            className="p-1.5 px-2.5 rounded-xl text-xs flex items-center gap-1.5 border border-cyan-500/30 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 transition active:scale-95 font-medium cursor-pointer shadow-2xs shrink-0"
            title="Nhấn để nghe phát âm"
          >
            <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs hidden sm:inline">Nghe phát âm</span>
          </button>

          <button
            onClick={onFinishSession}
            className="text-xs font-medium text-slate-400 hover:text-slate-200 px-2 py-1 rounded cursor-pointer shrink-0"
          >
            Thoát
          </button>
        </div>
      </div>

      {/* Question Visibility & Difficulty Control Toolbar */}
      <div className="flex items-center justify-between gap-3 bg-slate-900/80 p-3 px-4 rounded-2xl border border-slate-800 shadow-lg text-xs backdrop-blur-xl">
        <div className="flex items-center gap-2 text-slate-300 font-medium">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="hidden sm:inline text-xs font-bold">Chế độ thử thách:</span>
          <span className="sm:hidden text-xs font-bold">Hiển thị:</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPinyin(!showPinyin)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
              showPinyin
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-xs'
                : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
            }`}
            title={showPinyin ? 'Ẩn Pinyin để tăng độ khó' : 'Bật hiển thị Pinyin'}
          >
            {showPinyin ? <Eye className="w-3.5 h-3.5 text-cyan-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
            <span>Pinyin {showPinyin ? 'Hiện' : 'Ẩn'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHanViet(!showHanViet)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
              showHanViet
                ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 shadow-xs'
                : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
            }`}
            title={showHanViet ? 'Ẩn Âm Hán Việt để thử thách trí nhớ' : 'Bật hiển thị Âm Hán Việt'}
          >
            {showHanViet ? <Eye className="w-3.5 h-3.5 text-teal-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
            <span>Hán Việt {showHanViet ? 'Hiện' : 'Ẩn'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowMeaning(!showMeaning)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
              showMeaning
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-xs'
                : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
            }`}
            title={showMeaning ? 'Ẩn Nghĩa tiếng Việt để thử thách trí nhớ' : 'Bật hiển thị Nghĩa tiếng Việt'}
          >
            {showMeaning ? <Eye className="w-3.5 h-3.5 text-purple-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
            <span>Nghĩa {showMeaning ? 'Hiện' : 'Ẩn'}</span>
          </button>
        </div>
      </div>

      {/* Main Question Box with Canva Slide Animation */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, x: 30, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -30, scale: 0.98 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 md:p-8 space-y-6 shadow-2xl backdrop-blur-xl relative overflow-hidden"
        >
          {/* Question Prompt */}
          <div className="text-center space-y-2">
            <p className="text-sm font-semibold text-slate-300">
              {currentQ.clozeSentence ? 'Chọn từ thích hợp nhất để điền vào chỗ trống:' : currentQ.prompt}
            </p>
            {!currentQ.clozeSentence && getFilteredSubtitle(currentQ.subtitle) && (
              <p className="text-xs text-slate-300 whitespace-pre-line bg-slate-950/80 p-3 rounded-xl border border-slate-800 inline-block font-mono">
                {getFilteredSubtitle(currentQ.subtitle)}
              </p>
            )}
          </div>

          {/* Question Type: Flashcard Mode */}
          {currentQ.type === 'flashcard' ? (
            <div className="space-y-6">
              <motion.div
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => setFlashcardFlipped(!flashcardFlipped)}
                className="bg-slate-950/80 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-8 text-center cursor-pointer min-h-[220px] flex flex-col items-center justify-center space-y-3 transition-colors group shadow-inner"
              >
                <div className="text-6xl font-serif font-bold text-slate-100 group-hover:text-emerald-300 transition-colors">
                  {currentQ.character.hanzi}
                </div>

                {!flashcardFlipped ? (
                  <p className="text-xs text-slate-500 font-mono group-hover:text-cyan-400 transition">
                    [Chạm để lật xem đáp án]
                  </p>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-1.5"
                  >
                    {showPinyin && (
                      <p className="text-base font-mono font-bold text-cyan-400">
                        {currentQ.character.pinyin}
                      </p>
                    )}
                    {showHanViet && (
                      <p className="text-xs font-bold text-teal-300 uppercase">
                        {currentQ.character.hanViet}
                      </p>
                    )}
                    {showMeaning && (
                      <p className="text-sm text-slate-200 font-medium">
                        {currentQ.character.meaning}
                      </p>
                    )}
                    {(!showPinyin || !showHanViet || !showMeaning) && (
                      <p className="text-[10px] text-slate-500 italic">
                        ({[!showPinyin && 'Pinyin', !showHanViet && 'Hán Việt', !showMeaning && 'Nghĩa'].filter(Boolean).join(' & ')} đang ẩn)
                      </p>
                    )}
                    {currentQ.character.mnemonic && (
                      <p className="text-xs text-emerald-300 bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/30 max-w-sm mx-auto">
                        💡 {currentQ.character.mnemonic}
                      </p>
                    )}

                    <div className="pt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenCharacterDetail(currentQ.character);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:text-cyan-200 bg-slate-900 hover:bg-slate-800 rounded-lg border border-cyan-500/40 transition cursor-pointer shadow-xs active:scale-95"
                      >
                        <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Xem chi tiết chữ (Nét vẽ, từ điển)</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </motion.div>

              {flashcardFlipped && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="grid grid-cols-4 gap-2 pt-2"
                >
                  <button
                    onClick={() => handleFlashcardRating(0)}
                    className="py-2.5 px-2 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-medium text-center transition cursor-pointer active:scale-95"
                  >
                    <span className="block font-bold">Chưa nhớ</span>
                    <span className="text-[10px] opacity-75">Gặp lại hôm nay</span>
                  </button>
                  <button
                    onClick={() => handleFlashcardRating(1)}
                    className="py-2.5 px-2 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/30 text-amber-300 rounded-xl text-xs font-medium text-center transition cursor-pointer active:scale-95"
                  >
                    <span className="block font-bold">Hơi khó</span>
                    <span className="text-[10px] opacity-75">Sau 1 ngày</span>
                  </button>
                  <button
                    onClick={() => handleFlashcardRating(2)}
                    className="py-2.5 px-2 bg-sky-950/40 hover:bg-sky-900/60 border border-sky-500/30 text-sky-300 rounded-xl text-xs font-medium text-center transition cursor-pointer active:scale-95"
                  >
                    <span className="block font-bold">Đã nhớ</span>
                    <span className="text-[10px] opacity-75">Sau 3 ngày</span>
                  </button>
                  <button
                    onClick={() => handleFlashcardRating(3)}
                    className="py-2.5 px-2 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-medium text-center transition cursor-pointer active:scale-95"
                  >
                    <span className="block font-bold">Rất thuộc</span>
                    <span className="text-[10px] opacity-75">Sau 6 ngày</span>
                  </button>
                </motion.div>
              )}
            </div>
          ) : currentQ.type === 'stroke_writing' && currentQ.character.hanzi.length === 1 ? (
            /* Question Type: Stroke Writing Practice (Single Hanzi only) */
            <div className="flex flex-col items-center space-y-4">
              <StrokeWriterCanvas
                hanzi={currentQ.character.hanzi}
                pinyin={showPinyin ? currentQ.character.pinyin : undefined}
                size={220}
              />
              <p className="text-xs text-slate-400">Dùng chuột hoặc ngón tay vẽ nét chữ lên ô Mễ tự cách ở trên.</p>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <button
                  onClick={() => onOpenCharacterDetail(currentQ.character)}
                  className="py-2.5 px-4 text-xs font-semibold text-cyan-300 hover:text-cyan-200 bg-slate-950 hover:bg-slate-800 rounded-xl border border-cyan-500/40 flex items-center gap-1.5 cursor-pointer transition active:scale-95 shadow-xs"
                >
                  <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Xem chi tiết chữ (Nét vẽ, từ điển)</span>
                </button>
                <button
                  onClick={() => {
                    setSessionResults((prev) => [
                      ...prev,
                      {
                        question: currentQ,
                        userAnswer: 'Đã hoàn thành luyện nét',
                        isCorrect: true,
                      },
                    ]);
                    saveAnswerSRS(2);
                    handleNextQuestion();
                  }}
                  className="py-2.5 px-6 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl cursor-pointer shadow-md shadow-emerald-500/20 active:scale-95 transition"
                >
                  Hoàn thành nét & Qua câu tiếp
                </button>
              </div>
            </div>
          ) : currentQ.clozeSentence ? (
            /* Question Type: Điền khuyết vào câu */
            <div className="space-y-6">
              {/* Sentence Card with animated interactive blank */}
              <div className="p-6 md:p-8 rounded-2xl bg-slate-950/85 border border-violet-500/30 text-center space-y-4 shadow-inner relative">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 flex items-center gap-1.5">
                    <FileQuestion className="w-3.5 h-3.5" />
                    Điền từ chính xác vào câu
                  </span>
                  <button
                    type="button"
                    onClick={handlePlayAudio}
                    className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-400 hover:text-cyan-300 transition cursor-pointer"
                    title="Nghe phát âm cả câu"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>

                {/* The Sentence with Blank */}
                <div className="text-2xl sm:text-3xl md:text-4xl font-serif font-bold text-slate-100 tracking-wide leading-relaxed py-2">
                  {renderClozeSentenceWithBlank(currentQ, isAnswered, selectedOption)}
                </div>

                {/* Translation hint */}
                <p className="text-xs sm:text-sm text-slate-400 font-sans italic max-w-xl mx-auto">
                  {currentQ.clozeSentence.meaning}
                </p>
              </div>

              {/* 4 Tricky Options Grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Chọn 1 trong 4 đáp án thử thách:
                  </span>
                  <span className="text-[11px] font-mono text-violet-300 bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20">
                    Độ dài từ: {currentQ.correctAnswer.length} chữ
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {currentQ.options?.map((option, idx) => {
                    const letter = String.fromCharCode(65 + idx);
                    let btnClass = 'bg-slate-950/80 hover:bg-slate-800/90 border-slate-800 text-slate-100 hover:border-violet-500/50';
                    let badgeClass = 'bg-slate-800 text-slate-400 border-slate-700';

                    if (isAnswered) {
                      if (option === currentQ.correctAnswer) {
                        btnClass = 'bg-emerald-500/20 border-emerald-500 text-emerald-200 font-bold shadow-md shadow-emerald-500/10';
                        badgeClass = 'bg-emerald-500/30 text-emerald-300 border-emerald-500/40';
                      } else if (option === selectedOption) {
                        btnClass = 'bg-rose-500/20 border-rose-500 text-rose-200 font-bold shadow-md shadow-rose-500/10';
                        badgeClass = 'bg-rose-500/30 text-rose-300 border-rose-500/40';
                      } else {
                        btnClass = 'bg-slate-950/40 border-slate-900 text-slate-600 opacity-40';
                        badgeClass = 'bg-slate-900 text-slate-700 border-slate-900';
                      }
                    }

                    return (
                      <motion.button
                        key={idx}
                        whileHover={!isAnswered ? { scale: 1.01 } : undefined}
                        whileTap={!isAnswered ? { scale: 0.99 } : undefined}
                        onClick={() => handleSelectOption(option)}
                        disabled={isAnswered}
                        className={`p-4 rounded-2xl border text-left transition flex items-center justify-between cursor-pointer ${btnClass}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-8 h-8 rounded-xl border flex items-center justify-center text-xs font-mono font-bold shrink-0 ${badgeClass}`}>
                            {letter}
                          </span>
                          <span className="text-xl sm:text-2xl font-serif font-bold tracking-wider">
                            {option}
                          </span>
                        </div>

                        {isAnswered && option === currentQ.correctAnswer && (
                          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                        )}
                        {isAnswered && option === selectedOption && option !== currentQ.correctAnswer && (
                          <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : currentQ.options ? (
            /* Question Type: Multiple Choice */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentQ.options.map((option, idx) => {
                let btnClass = 'bg-slate-950/80 hover:bg-slate-800 border-slate-800 text-slate-200';
                if (isAnswered) {
                  if (option === currentQ.correctAnswer) {
                    btnClass = 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold';
                  } else if (option === selectedOption) {
                    btnClass = 'bg-rose-500/20 border-rose-500 text-rose-300 font-bold';
                  } else {
                    btnClass = 'bg-slate-950/40 border-slate-900 text-slate-600 opacity-50';
                  }
                }

                return (
                  <motion.button
                    key={idx}
                    whileHover={!isAnswered ? { scale: 1.01 } : undefined}
                    whileTap={!isAnswered ? { scale: 0.99 } : undefined}
                    onClick={() => handleSelectOption(option)}
                    disabled={isAnswered}
                    className={`p-4 rounded-xl border text-sm text-left transition flex items-center justify-between cursor-pointer ${btnClass}`}
                  >
                    <span className="font-medium">{option}</span>
                    {isAnswered && option === currentQ.correctAnswer && (
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                    {isAnswered && option === selectedOption && option !== currentQ.correctAnswer && (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                  </motion.button>
                );
              })}
            </div>
          ) : (
            /* Question Type: Typing Input */
            <div className="space-y-4 max-w-md mx-auto">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={typingInput}
                  onChange={(e) => setTypingInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCheckTyping()}
                  disabled={isAnswered}
                  placeholder="Nhập câu trả lời..."
                  className="flex-1 p-3 text-sm bg-slate-950 text-slate-100 border border-slate-800 rounded-xl focus:outline-hidden focus:border-cyan-500"
                />
                <button
                  onClick={handleCheckTyping}
                  disabled={isAnswered || !typingInput.trim()}
                  className="px-4 py-3 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl disabled:opacity-50 cursor-pointer shadow-md shadow-emerald-500/20"
                >
                  Kiểm tra
                </button>
              </div>
            </div>
          )}

          {/* Answer Feedback & Explanation Box */}
          <AnimatePresence>
            {isAnswered && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className={`p-4 rounded-xl border space-y-2 ${
                  isCorrect
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                    {isCorrect ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-emerald-400" /> Đúng rồi!
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 text-rose-400" /> Chưa chính xác
                      </>
                    )}
                  </span>

                  <button
                    onClick={() => onOpenCharacterDetail(currentQ.character)}
                    className="text-xs text-cyan-300 hover:text-cyan-200 underline font-medium cursor-pointer"
                  >
                    Xem chi tiết chữ
                  </button>
                </div>

                {/* Sentence Cloze Detailed Comparative Breakdown */}
                {currentQ.clozeSentence ? (
                  <div className="space-y-3 pt-2 border-t border-slate-800/80">
                    <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Câu hoàn chỉnh & Dịch nghĩa:
                        </span>
                        <button
                          type="button"
                          onClick={handlePlayAudio}
                          className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Nghe cả câu</span>
                        </button>
                      </div>
                      <p className="text-base sm:text-lg font-serif font-bold text-slate-100 tracking-wide">
                        {currentQ.clozeSentence.fullSentence.replace(/[a-zA-Z]+/g, '').replace(/\s+/g, '').trim()}
                      </p>
                      <p className="text-xs font-mono text-cyan-400">
                        {currentQ.clozeSentence.pinyin.replace(/\b(association|mnemonic|example)\b/gi, '').replace(/\s+/g, ' ').trim()}
                      </p>
                      <p className="text-xs text-slate-300">
                        {currentQ.clozeSentence.meaning}
                      </p>
                    </div>

                    {/* Breakdown of 4 Options */}
                    {currentQ.clozeSentence.optionsDetail && currentQ.clozeSentence.optionsDetail.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Phân biệt 4 đáp án thử thách:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {currentQ.clozeSentence.optionsDetail.map((opt, i) => {
                            const isCorrectOpt = opt.word === currentQ.correctAnswer;
                            const isChosen = opt.word === selectedOption;
                            return (
                              <div
                                key={i}
                                className={`p-2.5 rounded-xl border text-xs space-y-1 ${
                                  isCorrectOpt
                                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                                    : isChosen
                                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                                    : 'bg-slate-950/60 border-slate-800/80 text-slate-300'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-serif font-bold text-sm">
                                    {opt.word}
                                    {isCorrectOpt && (
                                      <span className="ml-1.5 text-[10px] font-sans px-1.5 py-0.2 rounded bg-emerald-500/30 text-emerald-300 font-semibold">
                                        Đáp án đúng
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-mono text-[10px] text-cyan-300">
                                    {opt.pinyin}
                                  </span>
                                </div>
                                <p className="text-[11px] opacity-90">{opt.meaning}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed text-slate-300">{currentQ.explanation}</p>
                )}

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleNextQuestion}
                    className="px-4 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 hover:to-teal-200 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/20 active:scale-95 transition"
                  >
                    <span>Câu tiếp theo</span>
                    <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

function getModeTitle(mode: StudySessionMode): string {
  switch (mode) {
    case 'smart_daily':
      return 'Hôm nay học gì (Smart Review)';
    case 'quick_flashcard':
      return 'Học nhanh (Flashcards)';
    case 'weakness':
      return 'Luyện nhớ (Những chữ hay quên)';
    case 'random_test':
      return 'Kiểm tra ngẫu nhiên';
    case 'sentence_cloze':
      return 'Điền khuyết vào câu (100% Từ vựng đã học)';
    case 'compound_words':
      return 'Ôn tập từ ghép (100% Chữ đơn đã học)';
    case 'compound_expansion':
      return 'Mở rộng từ ghép (Chứa chữ đơn mới)';
    default:
      return 'Luyện tập từ vựng';
  }
}
