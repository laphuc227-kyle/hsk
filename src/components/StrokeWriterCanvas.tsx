import React, { useRef, useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  RefreshCw,
  Play,
  Volume2,
  Eye,
  EyeOff,
  Edit3,
  CheckCircle2,
  Sparkles,
  Pin,
} from 'lucide-react';
import HanziWriter from 'hanzi-writer';
import { speakChinese } from '../services/audio';

interface StrokeWriterCanvasProps {
  hanzi: string;
  pinyin?: string;
  size?: number;
  onComplete?: () => void;
  autoStartQuiz?: boolean;
  hideOutlineByDefault?: boolean;
  previewOutlineSeconds?: number;
  dockControlsOnMobile?: boolean;
  onStrokeSuccess?: (current: number, total: number) => void;
  onStrokeMistake?: () => void;
}

export const StrokeWriterCanvas: React.FC<StrokeWriterCanvasProps> = ({
  hanzi,
  pinyin,
  size: propSize,
  onComplete,
  autoStartQuiz = false,
  hideOutlineByDefault = false,
  previewOutlineSeconds = 0,
  dockControlsOnMobile = false,
  onStrokeSuccess,
  onStrokeMistake,
}) => {
  // If the word has multiple characters (compound words like 你好, 学习), let the user pick which char to write
  const characters = useMemo(() => {
    return (Array.from(hanzi) as string[]).filter((char) => /\p{Script=Han}/u.test(char));
  }, [hanzi]);

  const [selectedCharIndex, setSelectedCharIndex] = useState(0);
  const activeChar = characters[selectedCharIndex] || characters[0] || hanzi;

  // Responsive canvas size calculation: generous size for mobile finger writing & desktop
  const [computedSize, setComputedSize] = useState<number>(() => {
    if (propSize) return propSize;
    if (typeof window !== 'undefined') {
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      if (screenWidth < 380) return Math.max(245, Math.min(295, screenWidth - 44));
      if (screenWidth < 640) return Math.max(255, Math.min(315, screenWidth - 48, screenHeight - 265));
      return 300;
    }
    return 290;
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const writerRef = useRef<any>(null);

  const [alwaysShowOutline, setAlwaysShowOutline] = useState(!hideOutlineByDefault);
  const [showGuide, setShowGuide] = useState(previewOutlineSeconds > 0 ? true : !hideOutlineByDefault);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isQuizMode, setIsQuizMode] = useState(autoStartQuiz);
  const [quizSuccess, setQuizSuccess] = useState(false);
  const [strokeProgress, setStrokeProgress] = useState<{ current: number; total: number } | null>(null);
  const [outlineCountdown, setOutlineCountdown] = useState<number | null>(
    previewOutlineSeconds > 0 ? Math.ceil(previewOutlineSeconds) : null
  );

  const previewTimerRef = useRef<any>(null);
  const intervalTimerRef = useRef<any>(null);
  const alwaysShowOutlineRef = useRef(alwaysShowOutline);
  alwaysShowOutlineRef.current = alwaysShowOutline;
  const showGuideRef = useRef(showGuide);
  showGuideRef.current = showGuide;

  const clearOutlineTimers = () => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    if (intervalTimerRef.current) {
      clearInterval(intervalTimerRef.current);
      intervalTimerRef.current = null;
    }
    setOutlineCountdown(null);
  };

  useEffect(() => {
    return () => {
      clearOutlineTimers();
    };
  }, []);

  // Update responsive size on screen resize
  useEffect(() => {
    if (propSize) {
      setComputedSize(propSize);
      return;
    }
    const updateSize = () => {
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      if (screenWidth < 380) {
        setComputedSize(Math.max(245, Math.min(295, screenWidth - 44)));
      } else if (screenWidth < 640) {
        setComputedSize(Math.max(255, Math.min(315, screenWidth - 48, screenHeight - 265)));
      } else {
        setComputedSize(300);
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [propSize]);

  // Initialize or re-create HanziWriter when activeChar or computedSize changes
  useEffect(() => {
    if (!containerRef.current || !activeChar) return;
    let isCancelled = false;

    containerRef.current.innerHTML = '';
    clearOutlineTimers();
    setIsQuizMode(autoStartQuiz);
    setQuizSuccess(false);
    setIsAnimating(false);
    setStrokeProgress(null);

    const hasPreview = previewOutlineSeconds > 0;
    const initialShowOutline = hasPreview ? true : !hideOutlineByDefault;
    setAlwaysShowOutline(!hideOutlineByDefault);
    setShowGuide(initialShowOutline);
    if (hasPreview) {
      setOutlineCountdown(Math.ceil(previewOutlineSeconds));
    }

    try {
      const writer = HanziWriter.create(containerRef.current, activeChar, {
        width: computedSize,
        height: computedSize,
        padding: 16,
        showOutline: initialShowOutline,
        strokeAnimationSpeed: 1.1,
        delayBetweenStrokes: 160,
        strokeColor: '#34D399', // Emerald / mint stroke color
        outlineColor: '#475569', // Crisp ghost outline on dark slate
        drawingColor: '#38BDF8', // Cyan drawing stroke color for user's finger!
        drawingWidth: Math.max(20, Math.round(computedSize * 0.085)),
        showCharacter: false,
        showHintAfterMisses: 2,
        highlightOnComplete: true,
        onLoadCharDataSuccess: () => {
          if (isCancelled || !writerRef.current || !hasPreview) return;
          writerRef.current.showOutline();
          let remaining = Math.ceil(previewOutlineSeconds);
          setOutlineCountdown(remaining);

          if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
          intervalTimerRef.current = setInterval(() => {
            if (isCancelled) return;
            remaining -= 1;
            if (remaining <= 0) {
              if (intervalTimerRef.current) {
                clearInterval(intervalTimerRef.current);
                intervalTimerRef.current = null;
              }
              setOutlineCountdown(null);
            } else {
              setOutlineCountdown(remaining);
            }
          }, 950);

          if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
          previewTimerRef.current = setTimeout(() => {
            if (isCancelled) return;
            if (!alwaysShowOutlineRef.current) {
              if (writerRef.current) {
                writerRef.current.hideOutline();
              }
              setShowGuide(false);
            }
            clearOutlineTimers();
          }, previewOutlineSeconds * 1000);
        },
      });

      writerRef.current = writer;

      if (autoStartQuiz) {
        writer.quiz({
          onCorrectStroke: (strokeData: any) => {
            clearOutlineTimers();
            if (!alwaysShowOutlineRef.current && writerRef.current) {
              writerRef.current.hideOutline();
              setShowGuide(false);
            }
            const current = strokeData.strokeNum + 1;
            const total = strokeData.character?.strokes?.length || strokeData.strokeNum + 1;
            setStrokeProgress({ current, total });
            onStrokeSuccess?.(current, total);
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
              try {
                navigator.vibrate(25);
              } catch (e) {
                // ignore
              }
            }
          },
          onMistake: () => {
            clearOutlineTimers();
            if (!alwaysShowOutlineRef.current && writerRef.current) {
              writerRef.current.hideOutline();
              setShowGuide(false);
            }
            onStrokeMistake?.();
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
              try {
                navigator.vibrate([30, 40, 30]);
              } catch (e) {
                // ignore
              }
            }
          },
          onComplete: () => {
            clearOutlineTimers();
            setQuizSuccess(true);
            speakChinese(activeChar);
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
              try {
                navigator.vibrate([40, 40, 80]);
              } catch (e) {
                // ignore
              }
            }
            if (onComplete) {
              onComplete();
            }
          },
        });
      }
    } catch (err) {
      console.error('Error creating HanziWriter:', err);
    }

    return () => {
      isCancelled = true;
      clearOutlineTimers();
    };
  }, [activeChar, computedSize, autoStartQuiz, hideOutlineByDefault, previewOutlineSeconds]);

  // Toggle guide visibility
  useEffect(() => {
    if (!writerRef.current) return;
    if (showGuide || alwaysShowOutline) {
      writerRef.current.showOutline();
    } else {
      writerRef.current.hideOutline();
    }
  }, [showGuide, alwaysShowOutline]);

  // Start interactive finger-drawing quiz mode
  const handleStartQuiz = (preserveGuide = false) => {
    if (!writerRef.current) return;
    clearOutlineTimers();
    if (!preserveGuide && hideOutlineByDefault && !alwaysShowOutlineRef.current) {
      writerRef.current.hideOutline();
      setShowGuide(false);
    }
    setIsQuizMode(true);
    setQuizSuccess(false);
    setIsAnimating(false);

    // Provide haptic tick on start
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(20);
      } catch (e) {
        // ignore
      }
    }

    writerRef.current.quiz({
      onCorrectStroke: (strokeData: any) => {
        clearOutlineTimers();
        if (!alwaysShowOutlineRef.current && writerRef.current) {
          writerRef.current.hideOutline();
          setShowGuide(false);
        }
        const current = strokeData.strokeNum + 1;
        const total = strokeData.character?.strokes?.length || strokeData.strokeNum + 1;
        setStrokeProgress({ current, total });
        onStrokeSuccess?.(current, total);
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate(25);
          } catch (e) {
            // ignore
          }
        }
      },
      onMistake: () => {
        clearOutlineTimers();
        if (!alwaysShowOutlineRef.current && writerRef.current) {
          writerRef.current.hideOutline();
          setShowGuide(false);
        }
        onStrokeMistake?.();
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate([30, 40, 30]);
          } catch (e) {
            // ignore
          }
        }
      },
      onComplete: () => {
        clearOutlineTimers();
        setQuizSuccess(true);
        speakChinese(activeChar);
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate([40, 40, 80]);
          } catch (e) {
            // ignore
          }
        }
        if (onComplete) {
          onComplete();
        }
      },
    });
  };

  // Animate stroke writing demonstration
  const handleAnimate = () => {
    if (!writerRef.current || isAnimating) return;
    clearOutlineTimers();
    setIsAnimating(true);
    setIsQuizMode(false);
    setQuizSuccess(false);
    setStrokeProgress(null);
    speakChinese(activeChar);

    writerRef.current.hideCharacter();
    writerRef.current.animateCharacter({
      onComplete: () => {
        setIsAnimating(false);
        if (autoStartQuiz) {
          handleStartQuiz(true);
        }
      },
    });
  };

  // Reset and clear drawing
  const handleReset = () => {
    if (!writerRef.current) return;
    clearOutlineTimers();
    setIsQuizMode(autoStartQuiz);
    setQuizSuccess(false);
    setIsAnimating(false);
    setStrokeProgress(null);
    writerRef.current.hideCharacter();
    if (showGuide || alwaysShowOutlineRef.current) {
      writerRef.current.showOutline();
    } else {
      writerRef.current.hideOutline();
    }
    if (autoStartQuiz) {
      handleStartQuiz(true);
    }
  };

  // Temporary peek: shows outline until the user draws the next stroke
  const handleToggleGuide = () => {
    clearOutlineTimers();
    if (alwaysShowOutline) {
      setAlwaysShowOutline(false);
      setShowGuide(false);
      return;
    }
    setShowGuide((prev) => !prev);
  };

  // Persistent toggle: keeps outline visible even while drawing strokes
  const handleToggleAlwaysShow = () => {
    clearOutlineTimers();
    setAlwaysShowOutline((prev) => {
      const next = !prev;
      setShowGuide(next);
      return next;
    });
  };

  const isGuideCurrentlyVisible = alwaysShowOutline || showGuide;

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto space-y-3 select-none">
      {/* If compound word: Character Tabs Switcher */}
      {characters.length > 1 && (
        <div className="flex items-center gap-1.5 p-1 bg-slate-900/90 rounded-xl border border-slate-800 shadow-xs mb-1">
          <span className="text-[10px] font-mono text-slate-400 pl-2 pr-1">Tập viết:</span>
          {characters.map((char, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setSelectedCharIndex(idx)}
              className={`px-3 py-1 text-sm font-serif font-bold rounded-lg transition cursor-pointer active:scale-95 ${
                selectedCharIndex === idx
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              {char}
            </button>
          ))}
        </div>
      )}

      {/* Rice Grid Box with strict touch isolation */}
      <div
        className={`relative rounded-2xl overflow-hidden border-2 bg-slate-950 flex justify-center items-center touch-none select-none transition-all duration-300 ${
          quizSuccess
            ? 'border-emerald-400 shadow-[0_0_28px_rgba(52,211,153,0.35)] scale-[1.015]'
            : 'border-slate-800 shadow-2xl'
        }`}
        style={{
          width: computedSize,
          height: computedSize,
          touchAction: 'none',
          WebkitTouchCallout: 'none',
        }}
      >
        {/* Background Rice Grid Lines (米字格) */}
        <svg
          width={computedSize}
          height={computedSize}
          className="absolute inset-0 pointer-events-none"
        >
          <rect
            x="0"
            y="0"
            width={computedSize}
            height={computedSize}
            fill="none"
            stroke="#1E293B"
            strokeWidth="2"
          />
          <line
            x1="0"
            y1={computedSize / 2}
            x2={computedSize}
            y2={computedSize / 2}
            stroke="#334155"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          <line
            x1={computedSize / 2}
            y1="0"
            x2={computedSize / 2}
            y2={computedSize}
            stroke="#334155"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          <line
            x1="0"
            y1="0"
            x2={computedSize}
            y2={computedSize}
            stroke="#334155"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          <line
            x1={computedSize}
            y1="0"
            x2="0"
            y2={computedSize}
            stroke="#334155"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        </svg>

        {/* HanziWriter Target Container */}
        <div
          ref={containerRef}
          className="relative z-10 cursor-crosshair touch-none select-none"
          style={{ touchAction: 'none' }}
        />

        {/* Pinyin Badge */}
        {pinyin && (
          <div className="absolute top-2.5 left-2.5 z-20 text-xs sm:text-sm font-mono font-bold text-cyan-300 bg-slate-900/95 backdrop-blur-md px-2.5 py-1 rounded-xl border border-cyan-500/40 shadow-xs pointer-events-none flex items-center gap-1.5">
            <span className="text-[10px] font-sans text-slate-400 font-normal">Pinyin:</span>
            <span>{pinyin}</span>
          </div>
        )}

        {/* Outline Preview Countdown Badge */}
        {outlineCountdown !== null && (
          <div className="absolute top-2.5 right-2.5 z-20 text-[10px] font-mono font-semibold text-amber-300 bg-amber-950/90 backdrop-blur-md px-2.5 py-1 rounded-xl border border-amber-500/50 shadow-xs flex items-center gap-1 animate-pulse pointer-events-none">
            <span>Ghi nhớ nét ({outlineCountdown}s)</span>
          </div>
        )}

        {/* Live Quiz Stroke Indicator */}
        {isQuizMode && !quizSuccess && strokeProgress && outlineCountdown === null && (
          <div className="absolute top-2.5 right-2.5 z-20 text-[11px] font-mono font-semibold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded-md border border-emerald-500/40 shadow-xs pointer-events-none">
            Nét {strokeProgress.current}
          </div>
        )}

        {/* Quiz Success Feedback Banner */}
        {quizSuccess && (
          <div className="absolute inset-x-3 bottom-3 z-20 flex items-center justify-center gap-1.5 bg-emerald-400 text-slate-950 text-xs font-bold px-3 py-1.5 rounded-xl shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Viết chuẩn thứ tự nét!</span>
          </div>
        )}
      </div>

      {/* Helpful Mobile Tip */}
      <p
        className={`text-[11px] text-slate-400 text-center items-center justify-center gap-1 ${
          dockControlsOnMobile ? 'hidden sm:flex' : 'flex'
        }`}
      >
        <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" />
        <span>Dùng ngón tay hoặc bút cảm ứng vẽ trực tiếp vào ô vuông</span>
      </p>

      {/* Control Buttons Bar (Inline on desktop, or always inline when dockControlsOnMobile is false) */}
      <div className={`w-full space-y-2 pt-1 ${dockControlsOnMobile ? 'hidden md:block' : ''}`}>
        {/* Row 1: 4 compact action tools in 4-col grid */}
        <div className="grid grid-cols-4 gap-1.5 w-full">
          {/* Play Simulation Button */}
          <button
            type="button"
            onClick={handleAnimate}
            disabled={isAnimating}
            className="py-2 px-1 text-emerald-300 bg-slate-900 hover:bg-slate-800 active:bg-slate-750 border border-emerald-500/30 rounded-xl transition flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer shadow-xs disabled:opacity-50 active:scale-95 min-h-[38px]"
            title="Mô phỏng viết theo từng nét chuẩn (Bút thuận)"
          >
            <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400 shrink-0" />
            <span className="text-[11px] font-semibold truncate">{isAnimating ? 'Đang viết...' : 'Mô phỏng'}</span>
          </button>

          {/* Button 2: Luôn hiện nét (when autoStartQuiz) OR Tự viết (in detail modal) */}
          {autoStartQuiz ? (
            <button
              type="button"
              onClick={handleToggleAlwaysShow}
              className={`py-2 px-1 rounded-xl transition border flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer shadow-xs active:scale-95 min-h-[38px] ${
                alwaysShowOutline
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500 font-bold shadow-md shadow-cyan-500/20'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border-slate-700/80'
              }`}
              title="Bật/tắt chế độ luôn hiển thị nét mờ khi viết"
            >
              <Pin className={`w-3.5 h-3.5 shrink-0 ${alwaysShowOutline ? 'text-cyan-300' : 'text-cyan-400'}`} />
              <span className="text-[11px] font-semibold truncate">Luôn hiện</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleStartQuiz()}
              className={`py-2 px-1 rounded-xl transition border flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer shadow-xs active:scale-95 min-h-[38px] ${
                isQuizMode
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500 font-bold shadow-md shadow-cyan-500/20'
                  : 'bg-slate-900 text-slate-200 hover:bg-slate-800 border-slate-700/80'
              }`}
              title="Tự tập viết từng nét theo thứ tự chuẩn"
            >
              <Edit3 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-[11px] font-semibold truncate">{isQuizMode ? 'Đang viết' : 'Tự viết'}</span>
            </button>
          )}

          {/* Toggle Temporary Guide Outline Button (auto hides on next stroke) */}
          <button
            type="button"
            onClick={handleToggleGuide}
            className={`py-2 px-1 rounded-xl transition border flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer shadow-xs active:scale-95 min-h-[38px] ${
              isGuideCurrentlyVisible
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                : 'bg-slate-900 text-slate-400 hover:bg-slate-800 border-slate-800'
            }`}
            title="Xem nhanh nét mẫu (tự ẩn khi bạn viết nét tiếp theo)"
          >
            {isGuideCurrentlyVisible ? <Eye className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
            <span className="text-[11px] font-semibold truncate">{isGuideCurrentlyVisible ? 'Ẩn mẫu' : 'Nét mẫu'}</span>
          </button>

          {/* Speak Audio Button */}
          <button
            type="button"
            onClick={() => speakChinese(activeChar)}
            className="py-2 px-1 text-cyan-300 bg-slate-900 border border-slate-800 hover:bg-slate-800 active:bg-slate-750 rounded-xl transition flex flex-col sm:flex-row items-center justify-center gap-1 cursor-pointer shadow-xs active:scale-95 min-h-[38px]"
            title="Phát âm chữ này"
          >
            <Volume2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-[11px] font-semibold truncate">Phát âm</span>
          </button>
        </div>

        {/* Row 2: Prominent Reset Button - Spans full width, 100% visible on all mobile screens */}
        <button
          type="button"
          onClick={handleReset}
          className="w-full py-2.5 px-3 text-slate-300 hover:text-white bg-slate-900/90 hover:bg-slate-800 active:bg-slate-750 border border-slate-700/80 hover:border-slate-600 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-95 text-xs font-semibold"
          title="Xóa nét vẽ làm lại từ đầu"
        >
          <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
          <span>Xóa nét vẽ làm lại</span>
        </button>
      </div>

      {/* Mobile Fixed Bottom Action Bar (replaces old bottom nav in stroke_writing mode) */}
      {dockControlsOnMobile &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/90 px-2 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl select-none">
            <div className="grid grid-cols-5 gap-1 max-w-md mx-auto">
              {/* 1. Mô phỏng */}
              <button
                type="button"
                onClick={handleAnimate}
                disabled={isAnimating}
                className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl text-emerald-300 hover:bg-slate-800/80 active:scale-95 transition cursor-pointer disabled:opacity-50"
                title="Mô phỏng viết theo từng nét chuẩn"
              >
                <Play className="w-4 h-4 text-emerald-400 fill-emerald-400 shrink-0" />
                <span className="text-[10px] font-semibold tracking-tight leading-tight truncate max-w-full">
                  {isAnimating ? 'Đang viết' : 'Mô phỏng'}
                </span>
              </button>

              {/* 2. Luôn hiện nét (or Tự viết if !autoStartQuiz) */}
              {autoStartQuiz ? (
                <button
                  type="button"
                  onClick={handleToggleAlwaysShow}
                  className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl active:scale-95 transition cursor-pointer ${
                    alwaysShowOutline
                      ? 'bg-cyan-500/15 text-cyan-300 font-bold border border-cyan-500/40'
                      : 'text-slate-300 hover:bg-slate-800/80'
                  }`}
                  title="Bật/tắt chế độ luôn hiện nét mờ khi viết"
                >
                  <Pin className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="text-[10px] font-semibold tracking-tight leading-tight truncate max-w-full">
                    Luôn hiện
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleStartQuiz()}
                  className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl active:scale-95 transition cursor-pointer ${
                    isQuizMode
                      ? 'bg-cyan-500/15 text-cyan-300 font-bold border border-cyan-500/40'
                      : 'text-slate-300 hover:bg-slate-800/80'
                  }`}
                  title="Tự tập viết từng nét theo thứ tự chuẩn"
                >
                  <Edit3 className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="text-[10px] font-semibold tracking-tight leading-tight truncate max-w-full">
                    {isQuizMode ? 'Đang viết' : 'Tự viết'}
                  </span>
                </button>
              )}

              {/* 3. Nét mẫu (tự ẩn khi viết nét tiếp theo) */}
              <button
                type="button"
                onClick={handleToggleGuide}
                className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl active:scale-95 transition cursor-pointer ${
                  isGuideCurrentlyVisible
                    ? 'bg-emerald-500/15 text-emerald-300 font-bold border border-emerald-500/40'
                    : 'text-slate-400 hover:bg-slate-800/80'
                }`}
                title="Xem nhanh nét mẫu (tự ẩn khi viết nét tiếp theo)"
              >
                {isGuideCurrentlyVisible ? (
                  <Eye className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <EyeOff className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <span className="text-[10px] font-semibold tracking-tight leading-tight truncate max-w-full">
                  {isGuideCurrentlyVisible ? 'Ẩn mẫu' : 'Nét mẫu'}
                </span>
              </button>

              {/* 4. Phát âm */}
              <button
                type="button"
                onClick={() => speakChinese(activeChar)}
                className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl text-cyan-300 hover:bg-slate-800/80 active:scale-95 transition cursor-pointer"
                title="Phát âm chữ này"
              >
                <Volume2 className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="text-[10px] font-semibold tracking-tight leading-tight truncate max-w-full">
                  Phát âm
                </span>
              </button>

              {/* 5. Xóa nét vẽ làm lại */}
              <button
                type="button"
                onClick={handleReset}
                className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl text-amber-300 hover:bg-slate-800/80 active:scale-95 transition cursor-pointer"
                title="Xóa nét vẽ làm lại"
              >
                <RefreshCw className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-[10px] font-semibold tracking-tight leading-tight truncate max-w-full">
                  Làm lại
                </span>
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
