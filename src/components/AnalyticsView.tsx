import React from 'react';
import { BarChart3, Flame, CheckCircle, FlameKindling, AlertCircle, BookOpen, Clock, Target } from 'lucide-react';
import { Character, UserStats } from '../types';

interface AnalyticsViewProps {
  characters: Character[];
  stats: UserStats;
  onPracticeCharacter: (character: Character) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  characters,
  stats,
  onPracticeCharacter,
}) => {
  const totalSaved = characters.length;
  const masteredCount = characters.filter((c) => c.srs.masteryLevel >= 80).length;
  const learningCount = characters.filter((c) => c.srs.masteryLevel > 0 && c.srs.masteryLevel < 80).length;
  const newCount = characters.filter((c) => c.srs.masteryLevel === 0).length;

  // Top 20 hardest characters (sorted by totalIncorrect)
  const hardest20 = [...characters]
    .filter((c) => c.srs.totalIncorrect > 0)
    .sort((a, b) => b.srs.totalIncorrect - a.srs.totalIncorrect)
    .slice(0, 20);

  return (
    <div className="space-y-6 text-slate-100">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent tracking-tight flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-cyan-400" />
          Thống Kê Tiến Độ Học Tập
        </h2>
        <p className="text-xs text-slate-400 pt-0.5">
          Theo dõi mức độ thành thạo và những chữ Hán cần cải thiện
        </p>
      </div>

      {/* Hero Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-mono font-bold uppercase">Đã lưu</span>
            <BookOpen className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-black text-slate-100">{totalSaved}</p>
          <span className="text-[10px] text-slate-500 font-mono">chữ Hán trong kho</span>
        </div>

        <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-mono font-bold uppercase">Đã thuộc</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-400">{masteredCount}</p>
          <span className="text-[10px] text-slate-500 font-mono">Mastery ≥ 80%</span>
        </div>

        <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-mono font-bold uppercase">Tỷ lệ đúng</span>
            <Target className="w-4 h-4 text-teal-300" />
          </div>
          <p className="text-2xl font-black text-cyan-300">{stats.accuracy}%</p>
          <span className="text-[10px] text-slate-500 font-mono">{stats.totalReviews} lượt ôn tập</span>
        </div>

        <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-mono font-bold uppercase">Chuỗi ngày</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-black text-amber-400">{stats.streakDays} ngày</p>
          <span className="text-[10px] text-slate-500 font-mono">học liên tục</span>
        </div>
      </div>

      {/* Mastery Breakdown */}
      <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-xl space-y-3">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
          Phân bố mức độ ghi nhớ
        </h3>

        <div className="h-3 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
          <div
            style={{ width: `${totalSaved ? (masteredCount / totalSaved) * 100 : 0}%` }}
            className="bg-emerald-400 h-full"
            title="Đã thuộc"
          />
          <div
            style={{ width: `${totalSaved ? (learningCount / totalSaved) * 100 : 0}%` }}
            className="bg-cyan-400 h-full"
            title="Đang học"
          />
          <div
            style={{ width: `${totalSaved ? (newCount / totalSaved) * 100 : 0}%` }}
            className="bg-slate-700 h-full"
            title="Chưa học"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between text-xs text-slate-300 pt-1 gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
            <span>Đã thuộc ({masteredCount})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />
            <span>Đang ôn luyện ({learningCount})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-700 inline-block" />
            <span>Chữ mới ({newCount})</span>
          </div>
        </div>
      </div>

      {/* Top 20 Hardest Characters */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 space-y-4 shadow-xl backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              20 Chữ Hán Bạn Hay Quên Nhất
            </h3>
            <p className="text-xs text-slate-400">Ưu tiên tập trung luyện nhớ những chữ này</p>
          </div>
        </div>

        {hardest20.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-4 text-center font-mono">
            Tuyệt vời! Bạn chưa trả lời sai chữ nào. Hãy làm thêm bài tập để đo lường.
          </p>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {hardest20.map((char, index) => (
              <div
                key={char.id}
                className="py-2.5 flex items-center justify-between text-xs hover:bg-slate-800/50 px-2 rounded-xl transition"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-slate-500 w-5 font-bold text-right">
                    #{index + 1}
                  </span>
                  <span className="text-2xl font-serif font-bold text-slate-100">{char.hanzi}</span>
                  <div>
                    <div className="font-mono font-bold text-cyan-300">{char.pinyin}</div>
                    <div className="text-slate-400 text-[11px]">{char.meaning}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-rose-400 font-bold font-mono">
                      {char.srs.totalIncorrect} lần sai
                    </span>
                    <span className="block text-[10px] text-slate-400 font-mono">
                      Độ thuộc: {char.srs.masteryLevel}%
                    </span>
                  </div>

                  <button
                    onClick={() => onPracticeCharacter(char)}
                    className="px-2.5 py-1 text-[11px] font-bold text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/60 rounded-lg border border-emerald-500/30 transition cursor-pointer"
                  >
                    Xem chữ
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
