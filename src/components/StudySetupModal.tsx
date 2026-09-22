import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  X,
  BookOpen,
  Layers,
  Combine,
  GraduationCap,
  Sparkles,
  CheckCircle2,
  Zap,
  Flame,
  Target,
  ArrowRight,
  FolderHeart,
  FileQuestion,
} from 'lucide-react';
import { WordList, StudySessionMode, Character } from '../types';
import { detectCompoundWordsFromCharacters } from '../services/compoundWordDetector';

interface StudySetupModalProps {
  isOpen: boolean;
  initialMode: StudySessionMode;
  initialListId?: string | null;
  wordLists: WordList[];
  allCharacters: Character[];
  onClose: () => void;
  onConfirmStart: (mode: StudySessionMode, listId: string | null, questionLimit?: number | 'all') => void;
}

export const StudySetupModal: React.FC<StudySetupModalProps> = ({
  isOpen,
  initialMode,
  initialListId = null,
  wordLists,
  allCharacters,
  onClose,
  onConfirmStart,
}) => {
  // State for chosen source
  // Source options: 'all' | 'all_single' | 'all_compound' | 'hsk1' | 'hsk2' | 'hsk3' | custom list ID
  const [selectedSource, setSelectedSource] = useState<string>(initialListId || 'all');

  // Sub-choice if selectedSource === 'all_compound': 'compound_review' | 'compound_expansion'
  const [compoundType, setCompoundType] = useState<'compound_review' | 'compound_expansion'>('compound_review');

  // Question limit
  const [questionLimit, setQuestionLimit] = useState<number | 'all'>(20);

  if (!isOpen) return null;

  // Compute counts for sources
  const totalCount = allCharacters.length;
  const singleCount = allCharacters.filter((c) => c.hanzi.length === 1).length;

  // Compound calculations
  const detectedCompounds = detectCompoundWordsFromCharacters(allCharacters);
  const fullMatchCompounds = detectedCompounds.filter((d) => d.isFullMatch);
  const expansionCompounds = detectedCompounds.filter((d) => d.isExpansionMatch);
  const totalCompoundsCount = fullMatchCompounds.length + expansionCompounds.length;

  // Accurately compute count for "Tất cả từ vựng" (All single chars + all compound words including 100% learned review compounds)
  const existingHanziSet = new Set(allCharacters.map((c) => c.hanzi));
  const newFullMatchCount = fullMatchCompounds.filter((d) => !existingHanziSet.has(d.word)).length;
  const totalAllVocabularyCount = allCharacters.length + newFullMatchCount;

  const hsk1List = wordLists.find((l) => l.id === 'hsk1');
  const hsk2List = wordLists.find((l) => l.id === 'hsk2');
  const hsk3List = wordLists.find((l) => l.id === 'hsk3');

  const customLists = wordLists.filter((l) => !['hsk1', 'hsk2', 'hsk3'].includes(l.id) && !l.isPredefined);

  // Helper mode info
  const getModeInfo = (m: StudySessionMode) => {
    switch (m) {
      case 'smart_daily':
        return {
          title: 'Hôm nay học gì (SRS)',
          desc: 'Thuật toán lặp lại ngắt quãng tự động chọn từ sắp quên để ôn tập.',
          icon: Sparkles,
          color: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30',
        };
      case 'quick_flashcard':
        return {
          title: 'Học nhanh (Flashcard)',
          desc: 'Lật thẻ phản xạ nhanh ghi nhớ âm hán việt, pinyin và ý nghĩa.',
          icon: Zap,
          color: 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30',
        };
      case 'weakness':
        return {
          title: 'Luyện nhớ (Chữ hay sai)',
          desc: 'Tập trung luyện tập các từ có tỉ lệ trả lời sai cao hoặc điểm ghi nhớ thấp.',
          icon: Flame,
          color: 'text-amber-400 bg-amber-500/20 border-amber-500/30',
        };
      case 'random_test':
        return {
          title: 'Kiểm tra (Quiz)',
          desc: 'Trắc nghiệm ngẫu nhiên kiểm tra kiến thức tổng hợp.',
          icon: Target,
          color: 'text-teal-400 bg-teal-500/20 border-teal-500/30',
        };
      case 'sentence_cloze':
        return {
          title: 'Điền khuyết vào câu',
          desc: 'Điền từ đơn hoặc từ ghép 100% đã học vào câu. Trắc nghiệm 4 đáp án thử thách chiều sâu trí nhớ.',
          icon: FileQuestion,
          color: 'text-violet-400 bg-violet-500/20 border-violet-500/30',
        };
      default:
        return {
          title: 'Luyện tập từ vựng',
          desc: 'Luyện tập từ vựng theo nhu cầu cá nhân.',
          icon: BookOpen,
          color: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30',
        };
    }
  };

  const modeInfo = getModeInfo(initialMode);
  const ModeIcon = modeInfo.icon;

  const handleStart = () => {
    let finalMode = initialMode;
    let finalListId: string | null = selectedSource === 'all' ? null : selectedSource;

    // Special logic if user picks compound source
    if (selectedSource === 'all_compound') {
      if (initialMode === 'sentence_cloze') {
        finalMode = 'sentence_cloze';
      } else if (compoundType === 'compound_review') {
        finalMode = 'compound_words';
      } else {
        finalMode = 'compound_expansion';
      }
    }

    onConfirmStart(finalMode, finalListId, questionLimit);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl border ${modeInfo.color}`}>
              <ModeIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Chế độ học</span>
              </div>
              <h2 className="text-base font-bold text-slate-100">{modeInfo.title}</h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-100 bg-slate-800/60 hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 scrollbar-thin scrollbar-thumb-slate-800">
          {/* Step 1: Select Vocabulary Source */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>1. Chọn nguồn từ vựng muốn học</span>
              <span className="text-[10px] text-emerald-400 lowercase font-normal">(Yêu cầu chọn)</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Option: Tất cả từ vựng */}
              <button
                type="button"
                onClick={() => setSelectedSource('all')}
                className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex items-center justify-between ${
                  selectedSource === 'all'
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-sm shadow-emerald-500/10'
                    : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-slate-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <BookOpen className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-xs font-bold">Tất cả từ vựng</div>
                    <div className="text-[10px] text-slate-400">Bao gồm toàn bộ chữ đơn & từ ghép ôn tập (100% đã học)</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  {totalAllVocabularyCount}
                </span>
              </button>

              {/* Option: Tất cả chữ đơn */}
              <button
                type="button"
                onClick={() => setSelectedSource('all_single')}
                className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex items-center justify-between ${
                  selectedSource === 'all_single'
                    ? 'bg-teal-500/15 border-teal-500/50 text-teal-300 shadow-sm shadow-teal-500/10'
                    : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-slate-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Layers className="w-4 h-4 text-teal-400 shrink-0" />
                  <div>
                    <div className="text-xs font-bold">Tất cả chữ đơn</div>
                    <div className="text-[10px] text-slate-400">Chỉ các Hán tự 1 chữ đơn</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  {singleCount}
                </span>
              </button>

              {/* Option: Tất cả từ ghép */}
              <button
                type="button"
                onClick={() => setSelectedSource('all_compound')}
                className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex items-center justify-between sm:col-span-2 ${
                  selectedSource === 'all_compound'
                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-sm shadow-amber-500/10'
                    : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-slate-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Combine className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      Tất cả từ ghép
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">
                        Có 2 loại
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Từ ghép suy ra 100% chữ đơn sẵn có & Từ ghép mở rộng
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {totalCompoundsCount} từ
                </span>
              </button>

              {/* HSK 1 */}
              <button
                type="button"
                onClick={() => setSelectedSource('hsk1')}
                className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                  selectedSource === 'hsk1'
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <GraduationCap className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="text-xs font-bold">HSK 1</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {hsk1List ? allCharacters.filter((c) => c.listIds.includes('hsk1')).length : 0} mục
                </span>
              </button>

              {/* HSK 2 */}
              <button
                type="button"
                onClick={() => setSelectedSource('hsk2')}
                className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                  selectedSource === 'hsk2'
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <GraduationCap className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="text-xs font-bold">HSK 2</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {hsk2List ? allCharacters.filter((c) => c.listIds.includes('hsk2')).length : 0} mục
                </span>
              </button>

              {/* HSK 3 */}
              <button
                type="button"
                onClick={() => setSelectedSource('hsk3')}
                className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between sm:col-span-2 ${
                  selectedSource === 'hsk3'
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <GraduationCap className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="text-xs font-bold">HSK 3</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {hsk3List ? allCharacters.filter((c) => c.listIds.includes('hsk3')).length : 0} mục
                </span>
              </button>

              {/* Custom User Lists if any */}
              {customLists.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => setSelectedSource(list.id)}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                    selectedSource === list.id
                      ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <FolderHeart className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-xs font-bold truncate">{list.name}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-2">
                    {allCharacters.filter((c) => c.listIds.includes(list.id)).length} mục
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2 (Sub-selection): If "Tất cả từ ghép" is selected */}
          {selectedSource === 'all_compound' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3"
            >
              <div className="flex items-center gap-2">
                <Combine className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-amber-200 uppercase tracking-wider">
                  Chọn loại từ ghép bạn muốn học:
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Choice A: Từ ghép ôn tập */}
                <button
                  type="button"
                  onClick={() => setCompoundType('compound_review')}
                  className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between space-y-2 ${
                    compoundType === 'compound_review'
                      ? 'bg-amber-500/25 border-amber-400 text-amber-100 shadow-md shadow-amber-500/10'
                      : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-amber-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5 text-amber-300">
                      <CheckCircle2 className="w-4 h-4 text-amber-400" />
                      Từ ghép ôn tập
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      100% Đã học ({fullMatchCompounds.length})
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Những từ ghép được suy ra 100% từ danh sách các chữ đơn sẵn có của bạn. Dùng để củng cố ghép từ.
                  </p>
                </button>

                {/* Choice B: Từ ghép mở rộng */}
                <button
                  type="button"
                  onClick={() => setCompoundType('compound_expansion')}
                  className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between space-y-2 ${
                    compoundType === 'compound_expansion'
                      ? 'bg-emerald-500/25 border-emerald-400 text-emerald-100 shadow-md shadow-emerald-500/10'
                      : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-emerald-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5 text-emerald-300">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      Từ ghép mở rộng
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Gợi ý chữ mới ({expansionCompounds.length})
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Những từ ghép chứa 1 hoặc 2 chữ đơn bạn đã biết kết hợp với chữ đơn mới bên ngoài hệ thống gợi ý nên học.
                  </p>
                </button>
              </div>
            </motion.div>
          )}

          {/* Question limit selector */}
          <div className="space-y-2 pt-2 border-t border-slate-800/60">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Số lượng câu hỏi bài học:
            </label>
            <div className="flex items-center gap-2">
              {[10, 20, 30, 'all'].map((limit) => (
                <button
                  key={String(limit)}
                  type="button"
                  onClick={() => setQuestionLimit(limit as number | 'all')}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    questionLimit === limit
                      ? 'bg-slate-800 text-emerald-300 border-emerald-500/40 shadow-xs'
                      : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {limit === 'all' ? 'Tất cả từ' : `${limit} câu`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-5 border-t border-slate-800/80 bg-slate-950/80 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition cursor-pointer"
          >
            Hủy bỏ
          </button>

          <button
            type="button"
            onClick={handleStart}
            className="px-6 py-2.5 text-xs font-bold text-slate-950 bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300 hover:from-emerald-300 hover:to-cyan-200 active:scale-95 rounded-xl transition cursor-pointer shadow-lg shadow-emerald-500/20 flex items-center gap-2"
          >
            <span>Bắt đầu học ngay</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </motion.div>
    </div>
  );
};
