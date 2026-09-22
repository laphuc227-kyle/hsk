import React, { useRef, useState, useEffect } from 'react';
import { RefreshCw, Play, Volume2, Eye, Edit3, CheckCircle2 } from 'lucide-react';
import HanziWriter from 'hanzi-writer';
import { speakChinese } from '../services/audio';

interface StrokeWriterCanvasProps {
  hanzi: string;
  pinyin?: string;
  size?: number;
}

export const StrokeWriterCanvas: React.FC<StrokeWriterCanvasProps> = ({
  hanzi,
  pinyin,
  size = 230,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const writerRef = useRef<any>(null);
  const [showGuide, setShowGuide] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isQuizMode, setIsQuizMode] = useState(false);
  const [quizSuccess, setQuizSuccess] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !hanzi) return;

    containerRef.current.innerHTML = '';
    setIsQuizMode(false);
    setQuizSuccess(false);
    setIsAnimating(false);

    try {
      const writer = HanziWriter.create(containerRef.current, hanzi, {
        width: size,
        height: size,
        padding: 12,
        showOutline: showGuide,
        strokeAnimationSpeed: 1,
        delayBetweenStrokes: 180,
        strokeColor: '#34D399', // Mint green stroke color for dark mode!
        outlineColor: '#334155', // Slate outline
        drawingWidth: 16,
        showCharacter: false,
        showHintAfterMisses: 2,
        highlightOnComplete: true,
      });

      writerRef.current = writer;
    } catch (err) {
      console.error('Error creating HanziWriter:', err);
    }
  }, [hanzi, size]);

  useEffect(() => {
    if (!writerRef.current) return;
    if (showGuide) {
      writerRef.current.showOutline();
    } else {
      writerRef.current.hideOutline();
    }
  }, [showGuide]);

  const handleAnimate = () => {
    if (!writerRef.current || isAnimating) return;
    setIsAnimating(true);
    setIsQuizMode(false);
    setQuizSuccess(false);
    speakChinese(hanzi);

    writerRef.current.hideCharacter();
    writerRef.current.animateCharacter({
      onComplete: () => {
        setIsAnimating(false);
      },
    });
  };

  const handleStartQuiz = () => {
    if (!writerRef.current) return;
    setIsQuizMode(true);
    setQuizSuccess(false);
    setIsAnimating(false);

    writerRef.current.quiz({
      onComplete: () => {
        setQuizSuccess(true);
        speakChinese(hanzi);
      },
    });
  };

  const handleReset = () => {
    if (!writerRef.current) return;
    setIsQuizMode(false);
    setQuizSuccess(false);
    setIsAnimating(false);
    writerRef.current.hideCharacter();
    if (showGuide) {
      writerRef.current.showOutline();
    } else {
      writerRef.current.hideOutline();
    }
  };

  return (
    <div className="flex flex-col items-center w-full max-w-sm mx-auto space-y-3 select-none">
      {/* Rice Grid Box */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-inner flex justify-center items-center">
        {/* Background Rice Grid Lines (米字格) */}
        <svg
          width={size}
          height={size}
          className="absolute inset-0 pointer-events-none"
        >
          <rect x="0" y="0" width={size} height={size} fill="none" stroke="#1E293B" strokeWidth="2" />
          <line x1="0" y1={size / 2} x2={size} y2={size / 2} stroke="#334155" strokeWidth="1" strokeDasharray="4 4" />
          <line x1={size / 2} y1="0" x2={size / 2} y2={size} stroke="#334155" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="0" y1="0" x2={size} y2={size} stroke="#334155" strokeWidth="1" strokeDasharray="4 4" />
          <line x1={size} y1="0" x2="0" y2={size} stroke="#334155" strokeWidth="1" strokeDasharray="4 4" />
        </svg>

        {/* HanziWriter Target Container */}
        <div ref={containerRef} className="relative z-10 cursor-pointer" />

        {/* Pinyin Badge */}
        {pinyin && (
          <div className="absolute top-2.5 left-2.5 z-20 text-xs font-mono font-bold text-cyan-300 bg-slate-900/90 backdrop-blur-md px-2.5 py-0.5 rounded-lg border border-cyan-500/30 shadow-xs pointer-events-none">
            {pinyin}
          </div>
        )}

        {/* Quiz Success Feedback */}
        {quizSuccess && (
          <div className="absolute bottom-3 z-20 flex items-center gap-1.5 bg-emerald-400 text-slate-950 text-xs font-bold px-3 py-1 rounded-full shadow-lg animate-in fade-in zoom-in-95 duration-200">
            <CheckCircle2 className="w-4 h-4" />
            <span>Viết đúng thứ tự nét!</span>
          </div>
        )}
      </div>

      {/* Control Buttons Bar */}
      <div className="flex items-center justify-center gap-2 w-full text-xs">
        <button
          type="button"
          onClick={() => speakChinese(hanzi)}
          className="p-2 text-cyan-300 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-xl transition flex items-center gap-1 cursor-pointer shadow-xs"
          title="Phát âm chữ Hán"
        >
          <Volume2 className="w-4 h-4 text-cyan-400" />
          <span className="text-[11px] font-medium">Đọc</span>
        </button>

        <button
          type="button"
          onClick={handleAnimate}
          disabled={isAnimating}
          className="px-3 py-2 text-emerald-300 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
          title="Mô phỏng viết theo từng nét chuẩn (Bút thuận)"
        >
          <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
          <span className="text-[11px] font-medium">{isAnimating ? 'Đang viết...' : 'Mô phỏng'}</span>
        </button>

        <button
          type="button"
          onClick={handleStartQuiz}
          className={`px-3 py-2 rounded-xl transition border flex items-center gap-1.5 cursor-pointer shadow-xs ${
            isQuizMode
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-bold'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border-slate-800'
          }`}
          title="Tự tập viết từng nét theo thứ tự"
        >
          <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[11px] font-medium">Tự viết</span>
        </button>

        <button
          type="button"
          onClick={() => setShowGuide(!showGuide)}
          className={`p-2 rounded-xl transition border cursor-pointer shadow-xs ${
            showGuide
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800 border-slate-800'
          }`}
          title="Bật/tắt nét mẫu mờ"
        >
          <Eye className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleReset}
          className="p-2 text-slate-400 bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:text-slate-200 rounded-xl transition cursor-pointer shadow-xs"
          title="Xóa nét vẽ làm lại"
        >
          <RefreshCw className="w-4 h-4 text-slate-400" />
        </button>
      </div>
    </div>
  );
};
