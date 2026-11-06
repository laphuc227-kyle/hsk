import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  BookOpen,
  Sparkles,
  Layers,
  Volume2,
  CheckCircle2,
  ArrowRight,
  Filter,
  GraduationCap,
  HelpCircle,
  RotateCcw,
  Trophy,
  X,
  ExternalLink,
} from 'lucide-react';
import { Character } from '../types';
import {
  RadicalInfo,
  KANGXI_RADICALS_DATABASE,
  findRadicalInfo,
} from '../services/radicalsDatabase';
import { speakChinese } from '../services/audio';

interface RadicalsViewProps {
  characters: Character[];
  onSelectCharacter: (character: Character) => void;
  onOpenTutor?: (context: string) => void;
  initialRadicalId?: string | null;
  onClearInitialRadical?: () => void;
}

export const RadicalsView: React.FC<RadicalsViewProps> = ({
  characters,
  onSelectCharacter,
  onOpenTutor,
  initialRadicalId,
  onClearInitialRadical,
}) => {
  // Navigation tabs: 'my_radicals' | 'all_radicals' | 'quiz'
  const [activeTab, setActiveTab] = useState<'my_radicals' | 'all_radicals' | 'quiz'>('my_radicals');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStrokeFilter, setSelectedStrokeFilter] = useState<number | 'all'>('all');
  const [selectedRadical, setSelectedRadical] = useState<RadicalInfo | null>(null);

  // Automatically select and display detail of initial radical if passed
  useEffect(() => {
    if (initialRadicalId) {
      const found =
        KANGXI_RADICALS_DATABASE.find((r) => r.id === initialRadicalId) ||
        findRadicalInfo(initialRadicalId);
      if (found) {
        setSelectedRadical(found);
      }
    }
  }, [initialRadicalId]);

  const handleCloseDetail = () => {
    setSelectedRadical(null);
    if (onClearInitialRadical) {
      onClearInitialRadical();
    }
  };

  // Quiz state
  const [quizScore, setQuizScore] = useState(0);
  const [quizRound, setQuizRound] = useState(0);
  const [quizSelectedOption, setQuizSelectedOption] = useState<string | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  // Group user characters by radical
  const userRadicalGroups = useMemo(() => {
    const map = new Map<string, { radicalInfo: RadicalInfo; characters: Character[] }>();

    characters.forEach((char) => {
      // Don't group long compounds without clear radical
      if (!char.radical || char.radical.includes('Từ ghép')) return;

      const info = findRadicalInfo(char.radical) || findRadicalInfo(char.hanzi[0]);
      if (info) {
        if (!map.has(info.id)) {
          map.set(info.id, { radicalInfo: info, characters: [] });
        }
        map.get(info.id)!.characters.push(char);
      }
    });

    // Sort by count descending (most frequent radical in user's library first)
    return Array.from(map.values()).sort((a, b) => b.characters.length - a.characters.length);
  }, [characters]);

  // Filtered radicals based on active tab and search
  const filteredRadicals = useMemo(() => {
    const rawQ = searchQuery.trim().toLowerCase();

    if (activeTab === 'my_radicals') {
      return userRadicalGroups.filter(({ radicalInfo, characters: chars }) => {
        const matchesStroke =
          selectedStrokeFilter === 'all' || radicalInfo.strokeCount === selectedStrokeFilter;

        if (!rawQ) return matchesStroke;

        const matchHanzi = radicalInfo.hanzi.includes(rawQ);
        const matchVariants = radicalInfo.variants.some((v) => v.includes(rawQ));
        const matchHanViet = radicalInfo.hanViet.toLowerCase().includes(rawQ);
        const matchPinyin = radicalInfo.pinyin.toLowerCase().includes(rawQ);
        const matchMeaning = radicalInfo.meaning.toLowerCase().includes(rawQ);
        const matchChars = chars.some((c) => c.hanzi.includes(rawQ) || c.meaning.toLowerCase().includes(rawQ));

        return matchesStroke && (matchHanzi || matchVariants || matchHanViet || matchPinyin || matchMeaning || matchChars);
      });
    }

    // All 214 radicals
    return KANGXI_RADICALS_DATABASE.filter((r) => {
      const matchesStroke =
        selectedStrokeFilter === 'all' || r.strokeCount === selectedStrokeFilter;

      if (!rawQ) return matchesStroke;

      const matchHanzi = r.hanzi.includes(rawQ);
      const matchVariants = r.variants.some((v) => v.includes(rawQ));
      const matchHanViet = r.hanViet.toLowerCase().includes(rawQ);
      const matchPinyin = r.pinyin.toLowerCase().includes(rawQ);
      const matchMeaning = r.meaning.toLowerCase().includes(rawQ);

      return matchesStroke && (matchHanzi || matchVariants || matchHanViet || matchPinyin || matchMeaning);
    }).map((r) => {
      const userGroup = userRadicalGroups.find((g) => g.radicalInfo.id === r.id);
      return {
        radicalInfo: r,
        characters: userGroup ? userGroup.characters : [],
      };
    });
  }, [activeTab, userRadicalGroups, searchQuery, selectedStrokeFilter]);

  // Quiz Question Generator
  const currentQuizQuestion = useMemo(() => {
    if (activeTab !== 'quiz') return null;

    // Pick a radical with known characters or from master list
    const pool = userRadicalGroups.length >= 4
      ? userRadicalGroups.map((g) => g.radicalInfo)
      : KANGXI_RADICALS_DATABASE.slice(0, 30);

    const targetIdx = quizRound % pool.length;
    const target = pool[targetIdx];

    // Pick 3 wrong options
    const otherOptions = KANGXI_RADICALS_DATABASE.filter((r) => r.id !== target.id)
      .sort(() => 0.5 - Math.random())
      .slice(0, 3);

    const options = [target, ...otherOptions].sort(() => 0.5 - Math.random());

    return {
      target,
      options,
    };
  }, [activeTab, quizRound, userRadicalGroups]);

  const handleSelectQuizOption = (optId: string) => {
    if (quizSubmitted) return;
    setQuizSelectedOption(optId);
    setQuizSubmitted(true);
    if (currentQuizQuestion && optId === currentQuizQuestion.target.id) {
      setQuizScore((prev) => prev + 1);
    }
  };

  const handleNextQuiz = () => {
    setQuizSubmitted(false);
    setQuizSelectedOption(null);
    setQuizRound((prev) => prev + 1);
  };

  const handleResetQuiz = () => {
    setQuizScore(0);
    setQuizRound(0);
    setQuizSubmitted(false);
    setQuizSelectedOption(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-teal-500/20 text-cyan-300 border border-cyan-500/30">
              <Layers className="w-5 h-5" />
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
              Sổ Tay Bộ Thủ
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Hệ thống hóa 214 Bộ Thủ Khang Hy và liên tưởng ý nghĩa tượng hình sâu sắc của chữ Hán
          </p>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-3 text-xs">
          <div className="bg-slate-900 px-3 py-2 rounded-xl border border-slate-800 flex items-center gap-2">
            <span className="text-slate-400">Bộ thủ trong từ vựng:</span>
            <span className="font-bold text-cyan-300 font-mono">{userRadicalGroups.length} bộ</span>
          </div>
          <div className="bg-slate-900 px-3 py-2 rounded-xl border border-slate-800 flex items-center gap-2">
            <span className="text-slate-400">Chữ Hán bao phủ:</span>
            <span className="font-bold text-emerald-400 font-mono">
              {userRadicalGroups.reduce((acc, curr) => acc + curr.characters.length, 0)} chữ
            </span>
          </div>
        </div>
      </div>

      {/* Tabs & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Navigation Segmented Buttons */}
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl max-w-fit">
          <button
            onClick={() => setActiveTab('my_radicals')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'my_radicals'
                ? 'bg-slate-800 text-cyan-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Bộ thủ của bạn ({userRadicalGroups.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('all_radicals')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'all_radicals'
                ? 'bg-slate-800 text-cyan-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Trọn bộ 214 Bộ Thủ</span>
          </button>

          <button
            onClick={() => setActiveTab('quiz')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'quiz'
                ? 'bg-slate-800 text-emerald-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5 text-emerald-400" />
            <span>Luyện nhớ bộ thủ</span>
          </button>
        </div>

        {/* Search input (if not in quiz mode) */}
        {activeTab !== 'quiz' && (
          <div className="relative min-w-[240px] sm:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo mặt chữ, Thủy, Nước..."
              className="w-full text-xs pl-9 pr-8 py-2 bg-slate-900 text-slate-100 border border-slate-800 rounded-xl focus:outline-hidden focus:border-cyan-500/60 placeholder:text-slate-500 transition shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-0.5 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Stroke Count Sub-filter (for my_radicals and all_radicals) */}
      {activeTab !== 'quiz' && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs pt-1">
          <span className="text-slate-400 text-[11px] font-medium pr-1">Số nét:</span>
          <button
            onClick={() => setSelectedStrokeFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
              selectedStrokeFilter === 'all'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
            }`}
          >
            Tất cả
          </button>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
            <button
              key={s}
              onClick={() => setSelectedStrokeFilter(s)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                selectedStrokeFilter === s
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              {s} nét
            </button>
          ))}
        </div>
      )}

      {/* TAB 1 & 2: Radicals Grid */}
      {activeTab !== 'quiz' && (
        <div className="space-y-4">
          {filteredRadicals.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800 space-y-2">
              <Layers className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-sm font-medium text-slate-300">Không tìm thấy bộ thủ nào phù hợp</p>
              <p className="text-xs text-slate-500">
                Thử thay đổi từ khóa tìm kiếm hoặc bấm chuyển qua tab &quot;Trọn bộ 214 Bộ Thủ&quot;.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredRadicals.map(({ radicalInfo, characters: chars }) => (
                <div
                  key={radicalInfo.id}
                  onClick={() => setSelectedRadical(radicalInfo)}
                  className="group bg-slate-900/90 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/40 rounded-2xl p-4 transition-all cursor-pointer flex flex-col justify-between space-y-3 shadow-md hover:shadow-cyan-950/20"
                >
                  <div className="space-y-2.5">
                    {/* Header: Big Radical Character + Variant + Info */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="text-4xl font-serif font-bold text-cyan-300 group-hover:scale-110 transition-transform">
                          {radicalInfo.variants.length > 0
                            ? radicalInfo.variants[0]
                            : radicalInfo.hanzi}
                        </span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-slate-100">
                              Bộ {radicalInfo.hanViet}
                            </span>
                            <span className="text-[11px] font-mono text-cyan-400">
                              ({radicalInfo.pinyin})
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            {radicalInfo.variants.length > 0 && (
                              <span>Gốc: {radicalInfo.hanzi} · </span>
                            )}
                            <span>{radicalInfo.strokeCount} nét</span>
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          speakChinese(radicalInfo.hanzi);
                        }}
                        className="p-1.5 text-slate-400 hover:text-cyan-300 bg-slate-800/80 hover:bg-slate-800 rounded-lg border border-slate-700/80 transition cursor-pointer"
                        title="Nghe phát âm"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Meaning summary */}
                    <p className="text-xs text-slate-200 leading-snug line-clamp-2">
                      {radicalInfo.meaning}
                    </p>

                    {/* Associative Tip */}
                    <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 text-[11px] text-cyan-200/90 leading-tight">
                      <span className="font-semibold text-cyan-400">💡 Mẹo nhớ: </span>
                      {radicalInfo.associationTip}
                    </div>
                  </div>

                  {/* User Characters with this Radical */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    {chars.length > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-emerald-400">
                          {chars.length} chữ của bạn:
                        </span>
                        <div className="flex items-center gap-1">
                          {chars.slice(0, 4).map((c) => (
                            <span
                              key={c.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectCharacter(c);
                              }}
                              className="font-serif text-sm px-1.5 py-0.5 rounded-md bg-slate-800 hover:bg-emerald-500/20 text-slate-200 hover:text-emerald-300 border border-slate-700/60 transition"
                              title={`${c.hanzi} (${c.pinyin}): ${c.meaning}`}
                            >
                              {c.hanzi}
                            </span>
                          ))}
                          {chars.length > 4 && (
                            <span className="text-[10px] text-slate-400">+{chars.length - 4}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400">
                        Chưa có chữ nào trong từ vựng
                      </span>
                    )}

                    <span className="text-cyan-400 hover:text-cyan-300 font-semibold text-[11px] flex items-center gap-0.5">
                      Chi tiết <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Radical Quiz / Flashcard Mode */}
      {activeTab === 'quiz' && currentQuizQuestion && (
        <div className="max-w-xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                <Trophy className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-100">Luyện nhớ phản xạ Bộ Thủ</h3>
                <p className="text-xs text-slate-400">Câu số {quizRound + 1} · Đúng {quizScore}/{quizRound + (quizSubmitted ? 1 : 0)}</p>
              </div>
            </div>

            <button
              onClick={handleResetQuiz}
              className="p-2 text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl transition cursor-pointer"
              title="Làm lại từ đầu"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Question Card */}
          <div className="text-center py-6 bg-slate-950/80 rounded-2xl border border-slate-800/80 space-y-3">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
              Bộ thủ này mang ý nghĩa gì?
            </span>
            <div className="flex items-center justify-center gap-3">
              <div className="text-6xl font-serif font-black text-cyan-300">
                {currentQuizQuestion.target.variants.length > 0
                  ? currentQuizQuestion.target.variants[0]
                  : currentQuizQuestion.target.hanzi}
              </div>
              <button
                type="button"
                onClick={() => speakChinese(currentQuizQuestion.target.hanzi)}
                className="p-2 text-slate-400 hover:text-cyan-300 bg-slate-900 rounded-xl border border-slate-800 transition cursor-pointer"
                title="Nghe phát âm"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>
            <div className="text-sm font-bold text-slate-200">
              Bộ {currentQuizQuestion.target.hanViet} ({currentQuizQuestion.target.pinyin}) · {currentQuizQuestion.target.strokeCount} nét
            </div>
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {currentQuizQuestion.options.map((opt) => {
              const isSelected = quizSelectedOption === opt.id;
              const isCorrect = opt.id === currentQuizQuestion.target.id;

              let btnStyle = 'bg-slate-950/70 border-slate-800 hover:border-cyan-500/40 text-slate-200';
              if (quizSubmitted) {
                if (isCorrect) {
                  btnStyle = 'bg-emerald-950/60 border-emerald-500 text-emerald-200 shadow-lg shadow-emerald-950/30 font-bold';
                } else if (isSelected) {
                  btnStyle = 'bg-rose-950/60 border-rose-500 text-rose-200';
                } else {
                  btnStyle = 'bg-slate-950/40 border-slate-800/40 opacity-50 text-slate-400';
                }
              }

              return (
                <button
                  key={opt.id}
                  onClick={() => handleSelectQuizOption(opt.id)}
                  disabled={quizSubmitted}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-1 ${btnStyle}`}
                >
                  <span className="text-xs font-bold leading-snug line-clamp-2">
                    {opt.meaning}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Bộ {opt.hanViet}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Next Button & Explanation */}
          {quizSubmitted && (
            <div className="space-y-4 pt-2">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                <div className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Giải nghĩa nguồn gốc:
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {currentQuizQuestion.target.description}
                </p>
                <p className="text-xs text-cyan-200 font-medium">
                  💡 {currentQuizQuestion.target.associationTip}
                </p>
              </div>

              <button
                onClick={handleNextQuiz}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
              >
                <span>Câu tiếp theo</span>
                <ArrowRight className="w-4 h-4 stroke-[3]" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Radical Detail Modal / Slide-over */}
      {selectedRadical && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="relative w-full max-w-lg bg-slate-900 border border-cyan-500/30 rounded-3xl p-6 sm:p-7 shadow-2xl text-left space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-4">
                <div className="text-5xl sm:text-6xl font-serif font-black text-cyan-300">
                  {selectedRadical.variants.length > 0
                    ? selectedRadical.variants[0]
                    : selectedRadical.hanzi}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-100">
                      Bộ {selectedRadical.hanViet}
                    </h3>
                    <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                      {selectedRadical.pinyin}
                    </span>
                    <button
                      onClick={() => speakChinese(selectedRadical.hanzi)}
                      className="p-1 text-slate-400 hover:text-cyan-300 transition cursor-pointer"
                      title="Nghe phát âm"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 pt-0.5">
                    Số thứ tự Khang Hy #{selectedRadical.number} · {selectedRadical.strokeCount} nét
                    {selectedRadical.variants.length > 0 && (
                      <span> · Biến thể: {selectedRadical.variants.join(', ')}</span>
                    )}
                  </p>
                </div>
              </div>

              <button
                onClick={handleCloseDetail}
                className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Core Meaning & Philosophical Origin */}
            <div className="space-y-3">
              <div>
                <h4 className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold mb-1">
                  Ý nghĩa cốt lõi
                </h4>
                <p className="text-sm font-semibold text-slate-100">
                  {selectedRadical.meaning}
                </p>
              </div>

              <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 space-y-1.5">
                <h4 className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 font-bold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Triết lý hình tượng & Nguồn gốc cổ nhân
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {selectedRadical.description}
                </p>
              </div>

              {/* Associative Mnemonic */}
              <div className="bg-cyan-950/30 p-3.5 rounded-2xl border border-cyan-500/30 space-y-1">
                <span className="text-[11px] font-bold text-cyan-300 flex items-center gap-1">
                  💡 Mẹo ghi nhớ & suy đoán nghĩa từ:
                </span>
                <p className="text-xs text-cyan-200/90 leading-relaxed">
                  {selectedRadical.associationTip}
                </p>
              </div>
            </div>

            {/* Characters in User's Library */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <h4 className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                  Từ vựng của bạn mang bộ này
                </h4>
                <span className="text-xs text-emerald-400 font-bold">
                  {userRadicalGroups.find((g) => g.radicalInfo.id === selectedRadical.id)?.characters.length || 0} chữ
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {(userRadicalGroups.find((g) => g.radicalInfo.id === selectedRadical.id)?.characters || []).map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      handleCloseDetail();
                      onSelectCharacter(c);
                    }}
                    className="p-2.5 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-cyan-500/40 rounded-xl transition cursor-pointer flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl font-serif font-bold text-slate-100">{c.hanzi}</span>
                      <div>
                        <div className="text-xs font-mono text-cyan-400 font-semibold">{c.pinyin}</div>
                        <div className="text-[11px] text-slate-300 line-clamp-1">{c.meaning}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold">{c.srs.masteryLevel}%</span>
                  </div>
                ))}
                {(userRadicalGroups.find((g) => g.radicalInfo.id === selectedRadical.id)?.characters.length || 0) === 0 && (
                  <p className="text-xs text-slate-400 col-span-2 py-2">
                    Bạn chưa có chữ Hán nào mang bộ này trong bộ từ. Thêm từ mới để mở khóa!
                  </p>
                )}
              </div>
            </div>

            {/* Common HSK Examples */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <h4 className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                Chữ Hán phổ biến mang bộ này trong tiếng Trung
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                {selectedRadical.exampleCharacters.map((ex, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-xl text-xs flex items-center gap-1.5"
                  >
                    <span className="text-base font-serif font-bold text-slate-200">{ex.hanzi}</span>
                    <span className="font-mono text-cyan-400 text-[10px]">{ex.pinyin}</span>
                    <span className="text-slate-400 text-[11px]">({ex.meaning})</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Footer action: Ask AI Tutor about this radical */}
            {onOpenTutor && (
              <div className="pt-2 border-t border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const rad = selectedRadical;
                    handleCloseDetail();
                    onOpenTutor(`Bộ ${rad.hanViet} (${rad.variants.length > 0 ? rad.variants[0] : rad.hanzi})`);
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-bold text-xs rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Sparkles className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Hỏi Gia Sư AI về bộ này</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
