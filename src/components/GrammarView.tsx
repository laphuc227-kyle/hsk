import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpenCheck,
  Search,
  Sparkles,
  Volume2,
  HelpCircle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Bot,
  Lightbulb,
  Check,
  RotateCcw,
} from 'lucide-react';
import { GrammarTopic, GrammarPracticeQuestion } from '../types';
import { INITIAL_GRAMMAR_TOPICS } from '../data/grammarData';
import { speakChinese } from '../services/audio';

interface GrammarViewProps {
  onOpenTutorWithContext?: (context: string) => void;
}

export const GrammarView: React.FC<GrammarViewProps> = ({ onOpenTutorWithContext }) => {
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activePracticeTopic, setActivePracticeTopic] = useState<GrammarTopic | null>(null);

  // Practice state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [userAnswer, setUserAnswer] = useState<string>('');
  const [selectedTokens, setSelectedTokens] = useState<string[]>([]);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState<boolean>(false);
  const [isCorrect, setIsCorrect] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);

  // Speech TTS handler for sentence
  const handleSpeakSentence = (text: string) => {
    speakChinese(text, 0.85);
  };

  // Filter grammar topics
  const filteredTopics = INITIAL_GRAMMAR_TOPICS.filter((topic) => {
    const matchesLevel = selectedLevel === 'all' || topic.level === selectedLevel;
    const matchesSearch =
      !searchQuery ||
      topic.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      topic.pattern.toLowerCase().includes(searchQuery.toLowerCase()) ||
      topic.explanation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      topic.examples.some(
        (e) =>
          e.sentence.includes(searchQuery) ||
          e.pinyin.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.meaning.toLowerCase().includes(searchQuery.toLowerCase())
      );
    return matchesLevel && matchesSearch;
  });

  const startPractice = (topic: GrammarTopic) => {
    setActivePracticeTopic(topic);
    setCurrentQuestionIndex(0);
    setUserAnswer('');
    setSelectedTokens([]);
    setIsAnswerSubmitted(false);
    setIsCorrect(false);
    setScore(0);
  };

  const handleSelectOption = (opt: string) => {
    if (isAnswerSubmitted) return;
    setUserAnswer(opt);
  };

  const handleToggleToken = (token: string, index: number) => {
    if (isAnswerSubmitted) return;
    // For reorder, we track token sequence
    setSelectedTokens((prev) => [...prev, token]);
  };

  const handleResetTokens = () => {
    if (isAnswerSubmitted) return;
    setSelectedTokens([]);
  };

  const handleSubmitAnswer = (q: GrammarPracticeQuestion) => {
    if (isAnswerSubmitted) return;

    let finalAnswer = userAnswer;
    if (q.type === 'reorder') {
      finalAnswer = selectedTokens.join('');
    }

    const correct = finalAnswer.trim() === q.correctAnswer.trim();
    setIsCorrect(correct);
    setIsAnswerSubmitted(true);
    if (correct) {
      setScore((s) => s + 1);
    }
  };

  const handleNextQuestion = () => {
    if (!activePracticeTopic || !activePracticeTopic.practiceQuestions) return;
    if (currentQuestionIndex < activePracticeTopic.practiceQuestions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
      setUserAnswer('');
      setSelectedTokens([]);
      setIsAnswerSubmitted(false);
      setIsCorrect(false);
    } else {
      // Finished all practice questions for this topic
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950/30 to-slate-900 rounded-3xl p-6 border border-emerald-500/30 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold uppercase tracking-wider">
              <BookOpenCheck className="w-4 h-4 text-emerald-400" />
              Ngữ Pháp Hán Ngữ HSK
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
              Hệ Thống Ngữ Pháp & Cấu Trúc Câu
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Tổng hợp công thức ngữ pháp HSK1 - HSK4, giải thích chi tiết quy tắc sử dụng, ví dụ có âm đọc giọng chuẩn và bài tập luyện tập thực hành.
            </p>
          </div>

          {onOpenTutorWithContext && (
            <button
              onClick={() => onOpenTutorWithContext('Tôi muốn học và giải đáp ngữ pháp tiếng Trung HSK')}
              className="px-4 py-2.5 rounded-xl bg-cyan-950/80 hover:bg-cyan-900 text-cyan-200 border border-cyan-500/40 text-xs font-semibold flex items-center gap-2 cursor-pointer transition shadow-lg shrink-0"
            >
              <Bot className="w-4 h-4 text-cyan-400" />
              <span>Hỏi Gia Sư AI Ngữ Pháp</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Level Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {['all', 'HSK1', 'HSK2', 'HSK3', 'HSK4', 'Cấu trúc đặc biệt'].map((lvl) => {
            const label = lvl === 'all' ? 'Tất cả ngữ pháp' : lvl;
            const isActive = selectedLevel === lvl;
            return (
              <button
                key={lvl}
                onClick={() => setSelectedLevel(lvl)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition border cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 border-emerald-500/50 shadow-xs'
                    : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm ngữ pháp (ví dụ: 比, 是...的)..."
            className="w-full bg-slate-900/90 text-slate-100 placeholder-slate-500 text-xs rounded-xl pl-9 pr-3 py-2 border border-slate-800 focus:outline-hidden focus:border-emerald-500/50 transition"
          />
        </div>
      </div>

      {/* Topic List Cards */}
      <div className="grid grid-cols-1 gap-6">
        {filteredTopics.length === 0 ? (
          <div className="text-center py-12 bg-slate-900/40 rounded-2xl border border-slate-800">
            <HelpCircle className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-300">Không tìm thấy ngữ pháp phù hợp</p>
            <p className="text-xs text-slate-500 pt-1">Thử đổi từ khóa hoặc chọn mức độ ngữ pháp khác.</p>
          </div>
        ) : (
          filteredTopics.map((topic) => (
            <motion.div
              key={topic.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-900/80 backdrop-blur-md rounded-2xl p-5 border border-slate-800/80 hover:border-slate-700 transition space-y-4 shadow-lg"
            >
              {/* Header Info */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/40 uppercase tracking-wider font-mono">
                      {topic.level}
                    </span>
                    <h2 className="text-lg font-bold text-slate-100">{topic.title}</h2>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed pt-0.5">{topic.explanation}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {topic.practiceQuestions && topic.practiceQuestions.length > 0 && (
                    <button
                      onClick={() => startPractice(topic)}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 hover:to-teal-200 text-slate-950 text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Luyện tập</span>
                    </button>
                  )}

                  {onOpenTutorWithContext && (
                    <button
                      onClick={() =>
                        onOpenTutorWithContext(
                          `Hãy giải thích chi tiết hơn và cho tôi thêm ví dụ về ngữ pháp: "${topic.title}" (${topic.pattern})`
                        )
                      }
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 transition cursor-pointer"
                      title="Hỏi AI về ngữ pháp này"
                    >
                      <Bot className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Formula Blueprint */}
              <div className="bg-slate-950/90 rounded-xl p-3.5 border border-slate-800/80 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-mono">
                  Công thức / Cấu trúc mẫu:
                </span>
                <p className="text-sm font-bold text-emerald-300 font-mono tracking-wide">
                  {topic.pattern}
                </p>
              </div>

              {/* Usage Notes */}
              {topic.usageNotes && topic.usageNotes.length > 0 && (
                <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <Lightbulb className="w-4 h-4 text-amber-400" />
                    <span>Lưu ý quan trọng:</span>
                  </div>
                  <ul className="list-disc list-inside text-xs text-amber-200/90 space-y-0.5 pl-1">
                    {topic.usageNotes.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Examples List */}
              <div className="space-y-2 pt-1">
                <span className="text-xs font-bold text-slate-300 block">Ví dụ minh họa:</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {topic.examples.map((ex, exIdx) => (
                    <div
                      key={exIdx}
                      className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/60 hover:border-slate-700 transition flex items-start justify-between gap-3 group"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-100 flex items-center gap-2">
                          <span>{ex.sentence}</span>
                        </p>
                        <p className="text-xs font-mono text-cyan-400">{ex.pinyin}</p>
                        <p className="text-xs text-slate-300 font-medium">{ex.meaning}</p>
                      </div>

                      <button
                        onClick={() => handleSpeakSentence(ex.sentence)}
                        className="p-2 rounded-lg bg-slate-900 group-hover:bg-slate-800 text-slate-400 group-hover:text-emerald-300 transition shrink-0 cursor-pointer"
                        title="Phát âm tiếng Trung"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Interactive Practice Modal */}
      <AnimatePresence>
        {activePracticeTopic && activePracticeTopic.practiceQuestions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-6 relative overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    Luyện tập ngữ pháp
                  </span>
                  <h3 className="text-sm font-bold text-slate-200">{activePracticeTopic.title}</h3>
                </div>
                <button
                  onClick={() => setActivePracticeTopic(null)}
                  className="text-slate-400 hover:text-slate-100 text-xs font-semibold px-2 py-1 bg-slate-800 rounded-lg cursor-pointer"
                >
                  Đóng
                </button>
              </div>

              {/* Question card */}
              {(() => {
                const questions = activePracticeTopic.practiceQuestions!;
                const q = questions[currentQuestionIndex];
                const isFinished = currentQuestionIndex >= questions.length;

                if (!q) {
                  return (
                    <div className="text-center py-6 space-y-4">
                      <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 mx-auto flex items-center justify-center font-bold text-xl">
                        {score}/{questions.length}
                      </div>
                      <h4 className="text-lg font-bold text-slate-100">Hoàn thành bài tập!</h4>
                      <p className="text-xs text-slate-300">
                        Bạn đã trả lời đúng {score} trên tổng số {questions.length} câu ngữ pháp.
                      </p>
                      <button
                        onClick={() => startPractice(activePracticeTopic)}
                        className="px-5 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-bold cursor-pointer"
                      >
                        Làm lại bài tập
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>
                        Câu {currentQuestionIndex + 1} / {questions.length}
                      </span>
                      <span>Điểm: {score}</span>
                    </div>

                    <p className="text-sm font-semibold text-slate-100 leading-snug">{q.prompt}</p>

                    {/* Question Type: Choice */}
                    {q.type === 'choice' && q.options && (
                      <div className="space-y-2">
                        {q.options.map((opt, idx) => {
                          const isSelected = userAnswer === opt;
                          let btnStyle =
                            'bg-slate-950/80 text-slate-200 border-slate-800 hover:border-slate-700';
                          if (isSelected) {
                            btnStyle = 'bg-cyan-950/80 text-cyan-200 border-cyan-500/60';
                          }
                          if (isAnswerSubmitted) {
                            if (opt === q.correctAnswer) {
                              btnStyle = 'bg-emerald-950/90 text-emerald-200 border-emerald-500';
                            } else if (isSelected && !isCorrect) {
                              btnStyle = 'bg-rose-950/90 text-rose-200 border-rose-500';
                            }
                          }

                          return (
                            <button
                              key={idx}
                              disabled={isAnswerSubmitted}
                              onClick={() => handleSelectOption(opt)}
                              className={`w-full text-left p-3 rounded-xl border text-xs font-medium transition flex items-center justify-between cursor-pointer ${btnStyle}`}
                            >
                              <span>{opt}</span>
                              {isAnswerSubmitted && opt === q.correctAnswer && (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                              )}
                              {isAnswerSubmitted && isSelected && !isCorrect && (
                                <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Question Type: Reorder */}
                    {q.type === 'reorder' && q.scrambledTokens && (
                      <div className="space-y-3">
                        {/* Target Assembly Area */}
                        <div className="min-h-12 bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center flex-wrap gap-2">
                          {selectedTokens.length === 0 ? (
                            <span className="text-xs text-slate-500 italic">
                              Bấm vào các từ bên dưới để ghép thành câu hoàn chỉnh...
                            </span>
                          ) : (
                            selectedTokens.map((t, idx) => (
                              <span
                                key={idx}
                                className="px-3 py-1 bg-cyan-950 text-cyan-300 border border-cyan-500/40 rounded-lg text-xs font-bold"
                              >
                                {t}
                              </span>
                            ))
                          )}
                        </div>

                        {/* Reset Tokens Button */}
                        {!isAnswerSubmitted && selectedTokens.length > 0 && (
                          <div className="flex justify-end">
                            <button
                              onClick={handleResetTokens}
                              className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Làm lại ghép từ</span>
                            </button>
                          </div>
                        )}

                        {/* Token Buttons Pool */}
                        <div className="flex flex-wrap gap-2 pt-1">
                          {q.scrambledTokens.map((t, idx) => {
                            const isUsed = selectedTokens.includes(t);
                            return (
                              <button
                                key={idx}
                                disabled={isAnswerSubmitted || isUsed}
                                onClick={() => handleToggleToken(t, idx)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                                  isUsed
                                    ? 'bg-slate-900 text-slate-600 border-slate-800 opacity-40 cursor-not-allowed'
                                    : 'bg-slate-800 text-slate-100 border-slate-700 hover:border-cyan-500/50'
                                }`}
                              >
                                {t}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Result Feedback */}
                    {isAnswerSubmitted && (
                      <div
                        className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                          isCorrect
                            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                            : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-bold">
                          {isCorrect ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              <span>Chính xác! Rất tốt.</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4 text-rose-400" />
                              <span>Chưa đúng. Đáp án chuẩn: {q.correctAnswer}</span>
                            </>
                          )}
                        </div>
                        <p className="text-[11px] opacity-90">{q.explanation}</p>
                      </div>
                    )}

                    {/* Footer Action Button */}
                    <div className="pt-2 flex justify-end">
                      {!isAnswerSubmitted ? (
                        <button
                          disabled={q.type === 'reorder' ? selectedTokens.length === 0 : !userAnswer}
                          onClick={() => handleSubmitAnswer(q)}
                          className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 hover:to-teal-200 disabled:opacity-40 text-slate-950 text-xs font-bold cursor-pointer shadow-md transition"
                        >
                          Kiểm tra đáp án
                        </button>
                      ) : (
                        <button
                          onClick={handleNextQuestion}
                          className="px-5 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-bold cursor-pointer shadow-md transition flex items-center gap-1.5"
                        >
                          <span>
                            {currentQuestionIndex < questions.length - 1 ? 'Câu tiếp theo' : 'Xem kết quả'}
                          </span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
