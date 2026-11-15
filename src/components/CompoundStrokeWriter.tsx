import React, {
  useRef,
  useState,
  useEffect,
  useMemo,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  RefreshCw,
  Play,
  Volume2,
  Eye,
  EyeOff,
  Edit3,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  RotateCw,
  Smartphone,
  X,
  Pin,
} from 'lucide-react';
import HanziWriter from 'hanzi-writer';
import { speakChinese } from '../services/audio';
import { lookupBuiltIn } from '../services/builtInDictionary';
import { splitCompoundPinyin } from '../utils/pinyinUtils';

interface CompoundStrokeWriterProps {
  hanzi: string;
  pinyin?: string;
  currentQuestionNum?: number;
  totalQuestions?: number;
  onComplete: () => void;
  onSkip: () => void;
  onExit?: () => void;
  isHoldTransition?: boolean;
  onSkipHold?: () => void;
  forcePortraitMode?: boolean;
  onForcePortraitModeChange?: (val: boolean) => void;
}

interface HanziSlotHandle {
  animate: () => void;
  startQuiz: () => void;
  reset: () => void;
  setOutline: (visible: boolean) => void;
}

interface HanziSlotBoxProps {
  char: string;
  slotIndex: number;
  charPinyin?: string;
  size: number;
  isActive: boolean;
  isCompleted: boolean;
  guideVisible: boolean;
  alwaysShowOutline: boolean;
  shouldAutoPreview: boolean;
  onFocusSlot: (index: number) => void;
  onSlotCompleted: (index: number) => void;
  onPreviewConsumed: (index: number) => void;
  onAnimationStateChange?: (animating: boolean) => void;
  onManualInteract?: () => void;
}

const HanziSlotBox = forwardRef<HanziSlotHandle, HanziSlotBoxProps>(
  (
    {
      char,
      slotIndex,
      charPinyin,
      size,
      isActive,
      isCompleted,
      guideVisible,
      alwaysShowOutline,
      shouldAutoPreview,
      onFocusSlot,
      onSlotCompleted,
      onPreviewConsumed,
      onAnimationStateChange,
      onManualInteract,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const writerRef = useRef<any>(null);
    const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [strokeProgress, setStrokeProgress] = useState<{ current: number; total: number } | null>(null);
    const [outlineCountdown, setOutlineCountdown] = useState<number | null>(null);
    const [localPreviewActive, setLocalPreviewActive] = useState(false);

    // Keep latest callbacks in refs so HanziWriter quiz closures stay fresh
    const onFocusSlotRef = useRef(onFocusSlot);
    const onSlotCompletedRef = useRef(onSlotCompleted);
    const onPreviewConsumedRef = useRef(onPreviewConsumed);
    const onManualInteractRef = useRef(onManualInteract);
    const onAnimationStateChangeRef = useRef(onAnimationStateChange);
    const guideVisibleRef = useRef(guideVisible);
    const alwaysShowOutlineRef = useRef(alwaysShowOutline);
    const shouldAutoPreviewRef = useRef(shouldAutoPreview);
    const isPreviewingRef = useRef(false);

    onFocusSlotRef.current = onFocusSlot;
    onSlotCompletedRef.current = onSlotCompleted;
    onPreviewConsumedRef.current = onPreviewConsumed;
    onManualInteractRef.current = onManualInteract;
    onAnimationStateChangeRef.current = onAnimationStateChange;
    guideVisibleRef.current = guideVisible;
    alwaysShowOutlineRef.current = alwaysShowOutline;
    shouldAutoPreviewRef.current = shouldAutoPreview;

    const clearTimers = useCallback(() => {
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      isPreviewingRef.current = false;
      setOutlineCountdown(null);
      setLocalPreviewActive(false);
    }, []);

    useEffect(() => {
      return () => clearTimers();
    }, [clearTimers]);

    const attachQuiz = useCallback(
      (writer: any) => {
        if (!writer) return;
        writer.quiz({
          onCorrectStroke: (strokeData: any) => {
            onFocusSlotRef.current(slotIndex);
            clearTimers();
            onPreviewConsumedRef.current(slotIndex);
            onManualInteractRef.current?.();
            if (!alwaysShowOutlineRef.current && writerRef.current) {
              writerRef.current.hideOutline();
            }
            const current = strokeData.strokeNum + 1;
            const total = strokeData.character?.strokes?.length || strokeData.strokeNum + 1;
            setStrokeProgress({ current, total });
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
              try {
                navigator.vibrate(20);
              } catch {
                // ignore
              }
            }
          },
          onMistake: () => {
            onFocusSlotRef.current(slotIndex);
            clearTimers();
            onPreviewConsumedRef.current(slotIndex);
            onManualInteractRef.current?.();
            if (!alwaysShowOutlineRef.current && writerRef.current) {
              writerRef.current.hideOutline();
            }
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
              try {
                navigator.vibrate([25, 35, 25]);
              } catch {
                // ignore
              }
            }
          },
          onComplete: () => {
            clearTimers();
            onPreviewConsumedRef.current(slotIndex);
            setStrokeProgress(null);
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
              try {
                navigator.vibrate([35, 35, 70]);
              } catch {
                // ignore
              }
            }
            onSlotCompletedRef.current(slotIndex);
          },
        });
      },
      [slotIndex, clearTimers]
    );

    // Create / recreate HanziWriter instance when char, size, or completion state changes
    useEffect(() => {
      if (!containerRef.current || !char) return;
      let isCancelled = false;
      containerRef.current.innerHTML = '';
      clearTimers();
      setStrokeProgress(null);

      const willPreview = !isCompleted && shouldAutoPreviewRef.current && !guideVisibleRef.current;
      const initialOutline = isCompleted ? false : guideVisibleRef.current || willPreview;

      if (willPreview) {
        isPreviewingRef.current = true;
        setLocalPreviewActive(true);
        setOutlineCountdown(3);
      }

      try {
        const writer = HanziWriter.create(containerRef.current, char, {
          width: size,
          height: size,
          padding: Math.max(10, Math.round(size * 0.07)),
          showOutline: initialOutline,
          strokeAnimationSpeed: 1.15,
          delayBetweenStrokes: 150,
          strokeColor: '#34D399',
          outlineColor: '#475569',
          drawingColor: '#38BDF8',
          drawingWidth: Math.max(15, Math.round(size * 0.095)),
          showCharacter: isCompleted,
          showHintAfterMisses: 2,
          highlightOnComplete: true,
          onLoadCharDataSuccess: () => {
            if (isCancelled || !writerRef.current || isCompleted) return;
            if (willPreview && !guideVisibleRef.current && isPreviewingRef.current) {
              writerRef.current.showOutline();
              let remaining = 3;
              setOutlineCountdown(remaining);

              if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
              countdownTimerRef.current = setInterval(() => {
                if (isCancelled) return;
                remaining -= 1;
                if (remaining <= 0) {
                  if (countdownTimerRef.current) {
                    clearInterval(countdownTimerRef.current);
                    countdownTimerRef.current = null;
                  }
                  setOutlineCountdown(null);
                } else {
                  setOutlineCountdown(remaining);
                }
              }, 900);

              if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
              previewTimerRef.current = setTimeout(() => {
                if (isCancelled) return;
                if (writerRef.current && !guideVisibleRef.current) {
                  writerRef.current.hideOutline();
                }
                clearTimers();
                onPreviewConsumedRef.current(slotIndex);
              }, 2700);
            }
          },
        });

        writerRef.current = writer;

        if (isCompleted) {
          return () => {
            isCancelled = true;
          };
        }

        attachQuiz(writer);
      } catch (err) {
        console.error('Error creating HanziWriter slot:', err);
      }

      return () => {
        isCancelled = true;
        clearTimers();
      };
    }, [char, size, isCompleted, clearTimers, attachQuiz, slotIndex]);

    // Sync outline visibility when guideVisible toggles externally
    useEffect(() => {
      if (!writerRef.current || isCompleted) return;
      if (guideVisible) {
        clearTimers();
        writerRef.current.showOutline();
      } else if (!isPreviewingRef.current && !localPreviewActive) {
        writerRef.current.hideOutline();
      }
    }, [guideVisible, isCompleted, localPreviewActive, clearTimers]);

    useImperativeHandle(
      ref,
      () => ({
        animate: () => {
          if (!writerRef.current) return;
          clearTimers();
          onPreviewConsumedRef.current(slotIndex);
          onAnimationStateChangeRef.current?.(true);
          speakChinese(char);
          writerRef.current.hideCharacter();
          writerRef.current.animateCharacter({
            onComplete: () => {
              onAnimationStateChangeRef.current?.(false);
              if (!isCompleted) {
                if (guideVisibleRef.current) {
                  writerRef.current?.showOutline();
                } else {
                  writerRef.current?.hideOutline();
                }
                attachQuiz(writerRef.current);
              }
            },
          });
        },
        startQuiz: () => {
          if (!writerRef.current || isCompleted) return;
          clearTimers();
          if (guideVisible) {
            writerRef.current.showOutline();
          } else {
            writerRef.current.hideOutline();
          }
          attachQuiz(writerRef.current);
        },
        reset: () => {
          if (!writerRef.current) return;
          clearTimers();
          setStrokeProgress(null);
          writerRef.current.hideCharacter();
          if (guideVisible) {
            writerRef.current.showOutline();
          } else {
            writerRef.current.hideOutline();
          }
          attachQuiz(writerRef.current);
        },
        setOutline: (visible: boolean) => {
          if (!writerRef.current || isCompleted) return;
          clearTimers();
          if (visible) {
            writerRef.current.showOutline();
          } else {
            writerRef.current.hideOutline();
          }
        },
      }),
      [char, isCompleted, guideVisible, clearTimers, attachQuiz, slotIndex]
    );

    const isCompact = size < 175;

    return (
      <div
        onPointerDown={() => onFocusSlot(slotIndex)}
        className={`relative rounded-2xl overflow-hidden border-2 bg-slate-950 flex justify-center items-center touch-none select-none transition-all duration-300 shrink-0 ${
          isCompleted
            ? 'border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.3)]'
            : isActive
            ? 'border-cyan-400/80 shadow-[0_0_20px_rgba(34,211,238,0.18)]'
            : 'border-slate-800 hover:border-slate-700 shadow-xl'
        }`}
        style={{
          width: size,
          height: size,
          touchAction: 'none',
          WebkitTouchCallout: 'none',
        }}
      >
        {/* Rice Grid Lines (米字格) */}
        <svg width={size} height={size} className="absolute inset-0 pointer-events-none">
          <rect x="0" y="0" width={size} height={size} fill="none" stroke="#1E293B" strokeWidth="2" />
          <line x1="0" y1={size / 2} x2={size} y2={size / 2} stroke="#334155" strokeWidth="1" strokeDasharray="4 4" />
          <line x1={size / 2} y1="0" x2={size / 2} y2={size} stroke="#334155" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="0" y1="0" x2={size} y2={size} stroke="#334155" strokeWidth="1" strokeDasharray="4 4" />
          <line x1={size} y1="0" x2="0" y2={size} stroke="#334155" strokeWidth="1" strokeDasharray="4 4" />
        </svg>

        {/* HanziWriter Target */}
        <div
          ref={containerRef}
          className={`relative z-10 touch-none select-none ${isCompleted ? 'pointer-events-none' : 'cursor-crosshair'}`}
          style={{ touchAction: 'none' }}
        />

        {/* Discreet Top-Left Per-Char Pinyin + Index Badge */}
        <div
          className={`absolute top-1.5 left-1.5 z-20 pointer-events-none flex items-center gap-1 rounded-lg border backdrop-blur-md shadow-xs ${
            isCompact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
          } ${
            isCompleted
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-300'
              : isActive
              ? 'bg-slate-900/95 border-cyan-500/50 text-cyan-300'
              : 'bg-slate-900/90 border-slate-700/80 text-slate-300'
          }`}
        >
          <span className="text-[9px] font-mono opacity-75">#{slotIndex + 1}</span>
          {charPinyin && <span className="font-mono font-bold">{charPinyin}</span>}
        </div>

        {/* Top-Right Outline Preview Countdown OR Live Stroke Counter */}
        {outlineCountdown !== null && !isCompleted && (
          <div
            className={`absolute top-1.5 right-1.5 z-20 font-mono font-semibold text-amber-300 bg-amber-950/90 backdrop-blur-md rounded-lg border border-amber-500/50 shadow-xs animate-pulse pointer-events-none ${
              isCompact ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5'
            }`}
          >
            {outlineCountdown}s
          </div>
        )}

        {!isCompleted && strokeProgress && outlineCountdown === null && (
          <div
            className={`absolute top-1.5 right-1.5 z-20 font-mono font-semibold text-emerald-300 bg-emerald-950/85 rounded-lg border border-emerald-500/40 shadow-xs pointer-events-none ${
              isCompact ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5'
            }`}
          >
            Nét {strokeProgress.current}
          </div>
        )}

        {/* Completed Banner */}
        {isCompleted && (
          <div
            className={`absolute inset-x-2 bottom-1.5 z-20 flex items-center justify-center gap-1 bg-emerald-400 text-slate-950 font-bold rounded-lg shadow-lg pointer-events-none ${
              isCompact ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
            }`}
          >
            <CheckCircle2 className={isCompact ? 'w-3 h-3 shrink-0' : 'w-3.5 h-3.5 shrink-0'} />
            <span>Đã xong</span>
          </div>
        )}
      </div>
    );
  }
);

HanziSlotBox.displayName = 'HanziSlotBox';

export const CompoundStrokeWriter: React.FC<CompoundStrokeWriterProps> = ({
  hanzi,
  pinyin,
  currentQuestionNum,
  totalQuestions,
  onComplete,
  onSkip,
  onExit,
  isHoldTransition = false,
  onSkipHold,
  forcePortraitMode,
  onForcePortraitModeChange,
}) => {
  const hanziChars = useMemo(
    () => (Array.from(hanzi) as string[]).filter((ch) => /\p{Script=Han}/u.test(ch)),
    [hanzi]
  );

  const charPinyins = useMemo(
    () =>
      splitCompoundPinyin(pinyin, hanziChars, (ch) => {
        const entry = lookupBuiltIn(ch);
        return entry?.pinyin;
      }),
    [pinyin, hanziChars]
  );

  const [completedSlots, setCompletedSlots] = useState<boolean[]>(() => hanziChars.map(() => false));
  const [previewedSlots, setPreviewedSlots] = useState<boolean[]>(() => hanziChars.map(() => false));
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [windowStartIndex, setWindowStartIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1);
  const [showGuide, setShowGuide] = useState(false);
  const [alwaysShowOutline, setAlwaysShowOutline] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [internalForcePortrait, setInternalForcePortrait] = useState(false);

  const forcePortraitSingle = forcePortraitMode !== undefined ? forcePortraitMode : internalForcePortrait;
  const setForcePortraitSingle = (val: boolean) => {
    if (onForcePortraitModeChange) {
      onForcePortraitModeChange(val);
    } else {
      setInternalForcePortrait(val);
    }
  };

  const alwaysShowOutlineRef = useRef(alwaysShowOutline);
  alwaysShowOutlineRef.current = alwaysShowOutline;
  const hasTriggeredCompleteRef = useRef(false);
  const slotRefs = useRef<Map<number, HanziSlotHandle>>(new Map());

  // Reset all state when target word changes
  useEffect(() => {
    setCompletedSlots(hanziChars.map(() => false));
    setPreviewedSlots(hanziChars.map(() => false));
    setActiveSlotIndex(0);
    setWindowStartIndex(0);
    setSlideDirection(1);
    setShowGuide(false);
    setAlwaysShowOutline(false);
    setIsAnimating(false);
    hasTriggeredCompleteRef.current = false;
  }, [hanzi]);

  // Track viewport size & orientation reliably
  const [viewport, setViewport] = useState<{ width: number; height: number }>(() => {
    if (typeof window !== 'undefined') {
      return { width: window.innerWidth, height: window.innerHeight };
    }
    return { width: 1024, height: 768 };
  });

  useEffect(() => {
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    const handleOrientation = () => {
      updateViewport();
      setTimeout(updateViewport, 100);
      setTimeout(updateViewport, 300);
    };

    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', handleOrientation);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', handleOrientation);
    };
  }, []);

  const isLandscape = viewport.width > viewport.height;
  const isSmallScreen = Math.min(viewport.width, viewport.height) < 640;
  const isMobilePortrait = isSmallScreen && !isLandscape;
  const isMobileLandscape = isSmallScreen && isLandscape;

  // Dynamic Rice Grid canvas sizing (generous for both single and 2-box compound words)
  const boxSize = useMemo(() => {
    const isSingle = hanziChars.length <= 1;
    const hasArrows = hanziChars.length >= 3;
    if (isMobileLandscape) {
      // Compact top + bottom strips (~66px total), left vertical dock (~64px)
      const availH = viewport.height - 66;
      if (isSingle) {
        const availW = viewport.width - 64 - 24;
        return Math.max(175, Math.min(320, Math.floor(Math.min(availH, availW))));
      }
      const arrowsW = hasArrows ? 82 : 8;
      const availW = (viewport.width - 64 - arrowsW - 20) / 2;
      return Math.max(155, Math.min(305, Math.floor(Math.min(availH, availW))));
    }
    if (isMobilePortrait) {
      // Single-box portrait fallback
      const arrowsW = hanziChars.length >= 2 ? 84 : 0;
      const availH = viewport.height - 260;
      const availW = viewport.width - 44 - arrowsW;
      return Math.max(210, Math.min(315, Math.floor(Math.min(availH, availW))));
    }
    // Desktop / Tablet
    if (isSingle) {
      return Math.max(250, Math.min(315, viewport.width - 140));
    }
    const arrowsW = hasArrows ? 104 : 20;
    const availW = (Math.min(viewport.width - 100, 800) - arrowsW) / 2;
    return Math.max(210, Math.min(300, Math.floor(availW)));
  }, [isMobileLandscape, isMobilePortrait, viewport.width, viewport.height, hanziChars.length]);

  const completedCount = completedSlots.filter(Boolean).length;
  const maxWindowStart = Math.max(0, hanziChars.length - 2);

  // Check if all characters are completed -> fire onComplete once
  useEffect(() => {
    if (hanziChars.length > 0 && completedSlots.length === hanziChars.length && completedSlots.every(Boolean)) {
      if (!hasTriggeredCompleteRef.current) {
        hasTriggeredCompleteRef.current = true;
        speakChinese(hanzi);
        onComplete();
      }
    }
  }, [completedSlots, hanziChars.length, hanzi, onComplete]);

  const handleSlotCompleted = useCallback(
    (idx: number) => {
      setCompletedSlots((prev) => {
        if (prev[idx]) return prev;
        const next = [...prev];
        next[idx] = true;

        // Auto-focus next uncompleted slot in current 2-box view (or stay ready for right arrow)
        if (idx + 1 < next.length && !next[idx + 1] && idx + 1 <= windowStartIndex + 1) {
          setActiveSlotIndex(idx + 1);
        } else {
          const firstIncompleteInView = [windowStartIndex, windowStartIndex + 1].find(
            (i) => i < next.length && !next[i]
          );
          if (firstIncompleteInView !== undefined) {
            setActiveSlotIndex(firstIncompleteInView);
          }
        }
        return next;
      });
    },
    [windowStartIndex]
  );

  const handlePreviewConsumed = useCallback((idx: number) => {
    setPreviewedSlots((prev) => {
      if (prev[idx]) return prev;
      const next = [...prev];
      next[idx] = true;
      return next;
    });
  }, []);

  const handleSlideRight = () => {
    if (isMobilePortrait && forcePortraitSingle) {
      if (activeSlotIndex < hanziChars.length - 1) {
        setSlideDirection(1);
        setActiveSlotIndex((prev) => prev + 1);
      }
      return;
    }
    if (windowStartIndex < maxWindowStart) {
      const nextStart = Math.min(maxWindowStart, windowStartIndex + 1);
      setSlideDirection(1);
      setWindowStartIndex(nextStart);
      const newlyRevealed = Math.min(hanziChars.length - 1, nextStart + 1);
      setActiveSlotIndex(!completedSlots[newlyRevealed] ? newlyRevealed : nextStart);
    }
  };

  const handleSlideLeft = () => {
    if (isMobilePortrait && forcePortraitSingle) {
      if (activeSlotIndex > 0) {
        setSlideDirection(-1);
        setActiveSlotIndex((prev) => prev - 1);
      }
      return;
    }
    if (windowStartIndex > 0) {
      const prevStart = Math.max(0, windowStartIndex - 1);
      setSlideDirection(-1);
      setWindowStartIndex(prevStart);
      setActiveSlotIndex(prevStart);
    }
  };

  const handleSelectCharPill = (idx: number) => {
    setActiveSlotIndex(idx);
    if (!(isMobilePortrait && forcePortraitSingle) && hanziChars.length > 2) {
      if (idx < windowStartIndex) {
        setSlideDirection(-1);
        setWindowStartIndex(idx);
      } else if (idx > windowStartIndex + 1) {
        setSlideDirection(1);
        setWindowStartIndex(Math.min(maxWindowStart, idx - 1));
      }
    }
  };

  // Determine target slot for toolbar actions (prefer active uncompleted slot in view)
  const getTargetSlotIndex = (): number => {
    if (isMobilePortrait && forcePortraitSingle) return activeSlotIndex;
    const visibleIndices = hanziChars.length === 1 ? [0] : [windowStartIndex, windowStartIndex + 1];
    if (visibleIndices.includes(activeSlotIndex) && !completedSlots[activeSlotIndex]) {
      return activeSlotIndex;
    }
    const firstUncompletedVisible = visibleIndices.find((i) => i < hanziChars.length && !completedSlots[i]);
    return firstUncompletedVisible !== undefined ? firstUncompletedVisible : activeSlotIndex;
  };

  const handleAnimate = () => {
    if (isAnimating) return;
    const targetIdx = getTargetSlotIndex();
    slotRefs.current.get(targetIdx)?.animate();
  };

  const handleStrokeClearPeek = useCallback(() => {
    if (!alwaysShowOutlineRef.current) {
      setShowGuide(false);
    }
  }, []);

  const handleToggleAlwaysShow = () => {
    const nextAlways = !alwaysShowOutline;
    setAlwaysShowOutline(nextAlways);
    setShowGuide(nextAlways);
    setPreviewedSlots(hanziChars.map(() => true));
    const visibleIndices =
      isMobilePortrait && forcePortraitSingle
        ? [activeSlotIndex]
        : [windowStartIndex, Math.min(hanziChars.length - 1, windowStartIndex + 1)];
    visibleIndices.forEach((idx) => {
      slotRefs.current.get(idx)?.setOutline(nextAlways);
    });
  };

  const handleToggleGuide = () => {
    if (alwaysShowOutline) {
      setAlwaysShowOutline(false);
      setShowGuide(false);
      setPreviewedSlots(hanziChars.map(() => true));
      const visibleIndices =
        isMobilePortrait && forcePortraitSingle
          ? [activeSlotIndex]
          : [windowStartIndex, Math.min(hanziChars.length - 1, windowStartIndex + 1)];
      visibleIndices.forEach((idx) => {
        slotRefs.current.get(idx)?.setOutline(false);
      });
      return;
    }
    const nextGuide = !showGuide;
    setShowGuide(nextGuide);
    setPreviewedSlots(hanziChars.map(() => true));
    const visibleIndices =
      isMobilePortrait && forcePortraitSingle
        ? [activeSlotIndex]
        : [windowStartIndex, Math.min(hanziChars.length - 1, windowStartIndex + 1)];
    visibleIndices.forEach((idx) => {
      slotRefs.current.get(idx)?.setOutline(nextGuide);
    });
  };

  const isGuideCurrentlyVisible = alwaysShowOutline || showGuide;

  const handleReset = () => {
    const targetIdx = getTargetSlotIndex();
    if (completedSlots[targetIdx]) {
      // Allow redoing a completed character if user specifically taps Reset while focused on it
      setCompletedSlots((prev) => {
        const next = [...prev];
        next[targetIdx] = false;
        return next;
      });
      hasTriggeredCompleteRef.current = false;
    } else {
      slotRefs.current.get(targetIdx)?.reset();
    }
  };

  // Highlight right arrow when both currently visible boxes are done and uncompleted chars remain ahead
  const canSlideRight =
    isMobilePortrait && forcePortraitSingle
      ? activeSlotIndex < hanziChars.length - 1
      : windowStartIndex < maxWindowStart;
  const canSlideLeft =
    isMobilePortrait && forcePortraitSingle ? activeSlotIndex > 0 : windowStartIndex > 0;

  const shouldPulseRightArrow = useMemo(() => {
    if (!canSlideRight) return false;
    if (isMobilePortrait && forcePortraitSingle) {
      return Boolean(completedSlots[activeSlotIndex]) && completedSlots.slice(activeSlotIndex + 1).some((c) => !c);
    }
    const visibleDone =
      Boolean(completedSlots[windowStartIndex]) && Boolean(completedSlots[windowStartIndex + 1]);
    const remainingAhead = completedSlots.slice(windowStartIndex + 2).some((c) => !c);
    return visibleDone && remainingAhead;
  }, [canSlideRight, isMobilePortrait, forcePortraitSingle, completedSlots, activeSlotIndex, windowStartIndex]);

  const registerSlotRef = (idx: number) => (el: HanziSlotHandle | null) => {
    if (el) {
      slotRefs.current.set(idx, el);
    } else {
      slotRefs.current.delete(idx);
    }
  };

  // Reusable bottom indicator + "Xem đáp án & bỏ qua" block (placed cleanly below canvases)
  const renderBottomIndicatorAndSkip = (compact = false) => {
    if (isHoldTransition) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className={`w-full max-w-md mx-auto space-y-1 ${compact ? 'px-2' : 'pt-1'}`}
        >
          <div className="flex items-center justify-between text-[11px] font-medium text-emerald-300 px-1">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>Tuyệt vời! Đang mở khóa thông tin...</span>
            </span>
            {onSkipHold && (
              <button
                type="button"
                onClick={onSkipHold}
                className="text-cyan-300 hover:text-cyan-200 font-semibold cursor-pointer"
              >
                Mở ngay →
              </button>
            )}
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 1.5, ease: 'linear' }}
              style={{ transformOrigin: 'left' }}
              className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-full"
            />
          </div>
        </motion.div>
      );
    }

    return (
      <div
        className={`flex items-center justify-center ${
          compact ? 'flex-row flex-wrap gap-x-3 gap-y-0.5' : 'flex-col gap-1.5 pt-0.5'
        }`}
      >
        {/* Character selection / progress strip */}
        {hanziChars.length > 1 ? (
          <div className="flex items-center justify-center gap-1.5 flex-wrap text-[11px] text-slate-300">
            <span className="text-slate-400 font-medium">Đang viết:</span>
            <div className="flex items-center gap-1">
              {hanziChars.map((_, idx) => {
                const done = completedSlots[idx];
                const isFocused = idx === activeSlotIndex;
                const isInWindow =
                  isMobilePortrait && forcePortraitSingle
                    ? idx === activeSlotIndex
                    : idx === windowStartIndex || idx === windowStartIndex + 1;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectCharPill(idx)}
                    className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold transition cursor-pointer flex items-center gap-1 border ${
                      done
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                        : isFocused
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/70'
                        : isInWindow
                        ? 'bg-slate-800 text-slate-200 border-slate-700'
                        : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
                    }`}
                  >
                    <span>Chữ {idx + 1}</span>
                    {done && <span className="text-emerald-400">✓</span>}
                  </button>
                );
              })}
            </div>
            <span className="text-slate-500">•</span>
            <span className="font-mono text-[10px] text-emerald-300 font-semibold">
              {completedCount}/{hanziChars.length}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <span>Vẽ trực tiếp vào ô vuông</span>
            <span>•</span>
            <span className="font-mono text-[10px] text-emerald-300 font-semibold">
              {completedCount}/1
            </span>
          </div>
        )}

        {/* Skip / Reveal button directly underneath (or inline on ultra-compact landscape) */}
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-4 cursor-pointer py-0.5 px-2 transition"
        >
          👁️ Xem đáp án & bỏ qua
        </button>
      </div>
    );
  };

  // =========================================================================
  // CASE 1: MOBILE PORTRAIT (Encourage Landscape Rotation + Portrait Fallback)
  // =========================================================================
  if (isMobilePortrait && !forcePortraitSingle) {
    return (
      <div className="flex flex-col items-center w-full max-w-sm mx-auto space-y-4 py-2 text-center select-none">
        <div className="w-full rounded-2xl bg-slate-950/90 border border-cyan-500/30 p-5 space-y-4 shadow-xl">
          <div className="flex flex-col items-center gap-3">
            <div className="relative w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-300">
              <motion.div
                animate={{ rotate: [0, 90, 90, 0] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Smartphone className="w-8 h-8 text-cyan-400" />
              </motion.div>
              <RotateCw className="w-4 h-4 text-emerald-400 absolute -bottom-1 -right-1 bg-slate-950 rounded-full p-0.5" />
            </div>

            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[11px] font-mono font-bold text-amber-300">
                {hanziChars.length === 1 ? 'Chữ đơn 1 chữ' : `Từ ghép ${hanziChars.length} chữ`}
              </span>
              <h3 className="text-base font-bold text-slate-100 leading-snug">
                Xoay ngang điện thoại để luyện viết nét
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {hanziChars.length >= 3
                  ? 'Xoay ngang cố định cho cả chữ đơn và từ ghép: hiển thị 2 ô rộng rãi song song và dùng nút ➔ để trượt sang chữ thứ 3.'
                  : hanziChars.length === 2
                  ? 'Xoay ngang cố định cho cả phiên học để hiển thị 2 ô mễ điền rộng rãi song song và thao tác thuận tiện hơn.'
                  : 'Giao diện luyện viết được thiết kế đồng nhất theo màn hình ngang giúp ô viết lớn hơn và không cần xoay qua lại giữa chữ đơn và từ ghép.'}
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={() => setForcePortraitSingle(true)}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 transition cursor-pointer active:scale-95 flex items-center justify-center gap-2"
            >
              <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Vẫn viết trên màn hình dọc</span>
            </button>

            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-4 cursor-pointer py-1 px-2 transition"
            >
              👁️ Xem đáp án & bỏ qua
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // CASE 2: MOBILE PORTRAIT FALLBACK (1 Box at a time + Arrows + Bottom Dock)
  // =========================================================================
  if (isMobilePortrait && forcePortraitSingle) {
    const activeChar = hanziChars[activeSlotIndex] || hanziChars[0];
    return (
      <div className="flex flex-col items-center w-full max-w-md mx-auto space-y-2.5 select-none">
        {/* Single Box + Left/Right Slide Arrows (arrows only for 2+ char words) */}
        <div className="flex items-center justify-center gap-2 w-full">
          {hanziChars.length >= 2 && (
            <button
              type="button"
              onClick={handleSlideLeft}
              disabled={!canSlideLeft}
              className={`p-2 rounded-xl border transition shrink-0 ${
                canSlideLeft
                  ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700 cursor-pointer active:scale-95'
                  : 'bg-slate-950/50 text-slate-700 border-slate-900 cursor-not-allowed'
              }`}
              title="Chữ trước"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={`portrait-slot-${activeSlotIndex}`}
              initial={{ opacity: 0.4, x: slideDirection * 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0.4, x: slideDirection * -18 }}
              transition={{ duration: 0.2 }}
            >
              <HanziSlotBox
                ref={registerSlotRef(activeSlotIndex)}
                char={activeChar}
                slotIndex={activeSlotIndex}
                charPinyin={charPinyins[activeSlotIndex]}
                size={boxSize}
                isActive={true}
                isCompleted={Boolean(completedSlots[activeSlotIndex])}
                guideVisible={isGuideCurrentlyVisible}
                alwaysShowOutline={alwaysShowOutline}
                shouldAutoPreview={!previewedSlots[activeSlotIndex]}
                onFocusSlot={setActiveSlotIndex}
                onSlotCompleted={handleSlotCompleted}
                onPreviewConsumed={handlePreviewConsumed}
                onAnimationStateChange={setIsAnimating}
                onManualInteract={handleStrokeClearPeek}
              />
            </motion.div>
          </AnimatePresence>

          {hanziChars.length >= 2 && (
            <button
              type="button"
              onClick={handleSlideRight}
              disabled={!canSlideRight}
              className={`p-2 rounded-xl border transition shrink-0 ${
                shouldPulseRightArrow
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400 shadow-lg shadow-emerald-500/20 animate-pulse cursor-pointer active:scale-95'
                  : canSlideRight
                  ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700 cursor-pointer active:scale-95'
                  : 'bg-slate-950/50 text-slate-700 border-slate-900 cursor-not-allowed'
              }`}
              title="Chữ tiếp theo"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Indicator + Skip */}
        {renderBottomIndicatorAndSkip(false)}

        <button
          type="button"
          onClick={() => setForcePortraitSingle(false)}
          className="text-[11px] text-cyan-400/90 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
        >
          <RotateCw className="w-3 h-3" />
          <span>Chuyển về giao diện xoay ngang</span>
        </button>

        {/* Mobile Bottom 5-button Portal Dock */}
        {typeof document !== 'undefined' &&
          createPortal(
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/90 px-2 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl select-none">
              <div className="grid grid-cols-5 gap-1 max-w-md mx-auto">
                <button
                  type="button"
                  onClick={handleAnimate}
                  disabled={isAnimating}
                  className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl text-emerald-300 hover:bg-slate-800/80 active:scale-95 transition cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-4 h-4 text-emerald-400 fill-emerald-400 shrink-0" />
                  <span className="text-[10px] font-semibold leading-tight truncate">
                    {isAnimating ? 'Đang viết' : 'Mô phỏng'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleToggleAlwaysShow}
                  className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl active:scale-95 transition cursor-pointer ${
                    alwaysShowOutline
                      ? 'bg-cyan-500/15 text-cyan-300 font-bold border border-cyan-500/40'
                      : 'text-slate-300 hover:bg-slate-800/80'
                  }`}
                  title="Bật/tắt chế độ luôn hiện nét mờ"
                >
                  <Pin className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="text-[10px] font-semibold leading-tight truncate">Luôn hiện</span>
                </button>
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
                  <span className="text-[10px] font-semibold leading-tight truncate">
                    {isGuideCurrentlyVisible ? 'Ẩn mẫu' : 'Nét mẫu'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => speakChinese(hanzi)}
                  className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl text-cyan-300 hover:bg-slate-800/80 active:scale-95 transition cursor-pointer"
                >
                  <Volume2 className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="text-[10px] font-semibold leading-tight truncate">Phát âm</span>
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl text-amber-300 hover:bg-slate-800/80 active:scale-95 transition cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-[10px] font-semibold leading-tight truncate">Làm lại</span>
                </button>
              </div>
            </div>,
            document.body
          )}
      </div>
    );
  }

  // Visible 2-char slice for Landscape Mobile & Desktop/Tablet
  const visibleIndices = [windowStartIndex, windowStartIndex + 1].filter((i) => i < hanziChars.length);

  // =========================================================================
  // CASE 3: MOBILE LANDSCAPE ZEN MODE (Fullscreen Portal with Left Vertical Dock)
  // =========================================================================
  if (isMobileLandscape && typeof document !== 'undefined') {
    return createPortal(
      <div className="fixed inset-0 z-40 bg-[#090D16] text-slate-100 flex items-stretch overflow-hidden select-none">
        {/* Left Vertical 5-Button Tool Dock */}
        <aside className="w-[64px] shrink-0 bg-slate-900/95 border-r border-slate-800/90 flex flex-col justify-evenly py-1 px-1 pl-[max(0.25rem,env(safe-area-inset-left))] shadow-2xl">
          <button
            type="button"
            onClick={handleAnimate}
            disabled={isAnimating}
            className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-0.5 rounded-xl text-emerald-300 hover:bg-slate-800/80 active:scale-95 transition cursor-pointer disabled:opacity-50"
            title="Mô phỏng nét chữ"
          >
            <Play className="w-4 h-4 text-emerald-400 fill-emerald-400 shrink-0" />
            <span className="text-[9px] font-semibold leading-none truncate max-w-full">
              {isAnimating ? 'Đang...' : 'Mô phỏng'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleToggleAlwaysShow}
            className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-0.5 rounded-xl active:scale-95 transition cursor-pointer ${
              alwaysShowOutline
                ? 'bg-cyan-500/15 text-cyan-300 font-bold border border-cyan-500/40'
                : 'text-slate-300 hover:bg-slate-800/80'
            }`}
            title="Bật/tắt chế độ luôn hiện nét mờ"
          >
            <Pin className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="text-[9px] font-semibold leading-none truncate max-w-full">
              Luôn hiện
            </span>
          </button>

          <button
            type="button"
            onClick={handleToggleGuide}
            className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-0.5 rounded-xl active:scale-95 transition cursor-pointer ${
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
            <span className="text-[9px] font-semibold leading-none truncate max-w-full">
              {isGuideCurrentlyVisible ? 'Ẩn mẫu' : 'Nét mẫu'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => speakChinese(hanzi)}
            className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-0.5 rounded-xl text-cyan-300 hover:bg-slate-800/80 active:scale-95 transition cursor-pointer"
            title="Nghe phát âm"
          >
            <Volume2 className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="text-[9px] font-semibold leading-none truncate max-w-full">Phát âm</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-0.5 rounded-xl text-amber-300 hover:bg-slate-800/80 active:scale-95 transition cursor-pointer"
            title="Làm lại chữ đang chọn"
          >
            <RefreshCw className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-[9px] font-semibold leading-none truncate max-w-full">Làm lại</span>
          </button>
        </aside>

        {/* Main Center Writing Arena */}
        <div className="flex-1 flex flex-col items-center justify-between py-1.5 px-2 pr-[max(0.75rem,env(safe-area-inset-right))] min-w-0">
          {/* Ultra-compact top bar: Question counter + Exit (NO pinyin, NO meaning hint) */}
          <div className="w-full flex items-center justify-between px-1 shrink-0">
            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
              {currentQuestionNum && totalQuestions ? (
                <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300 font-bold">
                  Câu {currentQuestionNum}/{totalQuestions}
                </span>
              ) : null}
              <span className="text-slate-500">
                {hanziChars.length === 1 ? 'Chữ đơn' : `Từ ghép ${hanziChars.length} chữ`}
              </span>
            </div>

            {onExit && (
              <button
                type="button"
                onClick={onExit}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Thoát</span>
              </button>
            )}
          </div>

          {/* 2 Side-by-Side Rice Grids + Sliding Arrows for 3+ char words */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 my-auto">
            {hanziChars.length >= 3 && (
              <button
                type="button"
                onClick={handleSlideLeft}
                disabled={!canSlideLeft}
                className={`p-2 rounded-xl border transition shrink-0 ${
                  canSlideLeft
                    ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700 cursor-pointer active:scale-95 shadow-md'
                    : 'bg-slate-950/40 text-slate-700 border-slate-900 cursor-not-allowed opacity-50'
                }`}
                title="Trượt sang trái"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}

            <AnimatePresence mode="wait">
              <motion.div
                key={`landscape-window-${windowStartIndex}`}
                initial={{ opacity: 0.55, x: slideDirection * 22 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0.55, x: slideDirection * -22 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center justify-center gap-2.5"
              >
                {visibleIndices.map((idx) => (
                  <HanziSlotBox
                    key={`${hanzi}-slot-${idx}`}
                    ref={registerSlotRef(idx)}
                    char={hanziChars[idx]}
                    slotIndex={idx}
                    charPinyin={charPinyins[idx]}
                    size={boxSize}
                    isActive={activeSlotIndex === idx}
                    isCompleted={Boolean(completedSlots[idx])}
                    guideVisible={isGuideCurrentlyVisible}
                    alwaysShowOutline={alwaysShowOutline}
                    shouldAutoPreview={!previewedSlots[idx]}
                    onFocusSlot={setActiveSlotIndex}
                    onSlotCompleted={handleSlotCompleted}
                    onPreviewConsumed={handlePreviewConsumed}
                    onAnimationStateChange={setIsAnimating}
                    onManualInteract={handleStrokeClearPeek}
                  />
                ))}
              </motion.div>
            </AnimatePresence>

            {hanziChars.length >= 3 && (
              <button
                type="button"
                onClick={handleSlideRight}
                disabled={!canSlideRight}
                className={`flex flex-col items-center justify-center gap-0.5 p-2 rounded-xl border transition shrink-0 ${
                  shouldPulseRightArrow
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400 shadow-lg shadow-emerald-500/25 animate-pulse cursor-pointer active:scale-95'
                    : canSlideRight
                    ? 'bg-slate-900 hover:bg-slate-800 text-cyan-300 border-cyan-500/40 cursor-pointer active:scale-95 shadow-md'
                    : 'bg-slate-950/40 text-slate-700 border-slate-900 cursor-not-allowed opacity-50'
                }`}
                title="Trượt sang chữ tiếp theo"
              >
                <ArrowRight className="w-4 h-4" />
                {canSlideRight && (
                  <span className="text-[8px] font-mono font-bold leading-none">
                    Chữ {windowStartIndex + 3}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Bottom Indicator + Skip directly underneath */}
          <div className="w-full shrink-0">{renderBottomIndicatorAndSkip(true)}</div>
        </div>
      </div>,
      document.body
    );
  }

  // =========================================================================
  // CASE 4: DESKTOP / TABLET SIDE-BY-SIDE 2-BOX ARENA
  // =========================================================================
  return (
    <div className="flex flex-col items-center w-full mx-auto space-y-3 select-none">
      {/* 2 Side-by-Side Rice Grids + Sliding Arrows for 3+ char words */}
      <div className="flex items-center justify-center gap-3 w-full">
        {hanziChars.length >= 3 && (
          <button
            type="button"
            onClick={handleSlideLeft}
            disabled={!canSlideLeft}
            className={`p-2.5 rounded-xl border transition shrink-0 ${
              canSlideLeft
                ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700 cursor-pointer active:scale-95 shadow-md'
                : 'bg-slate-950/40 text-slate-700 border-slate-900 cursor-not-allowed opacity-50'
            }`}
            title="Trượt sang chữ trước"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={`desktop-window-${windowStartIndex}`}
            initial={{ opacity: 0.55, x: slideDirection * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0.55, x: slideDirection * -24 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center justify-center gap-3 sm:gap-4"
          >
            {visibleIndices.map((idx) => (
              <HanziSlotBox
                key={`${hanzi}-slot-${idx}`}
                ref={registerSlotRef(idx)}
                char={hanziChars[idx]}
                slotIndex={idx}
                charPinyin={charPinyins[idx]}
                size={boxSize}
                isActive={activeSlotIndex === idx}
                isCompleted={Boolean(completedSlots[idx])}
                guideVisible={isGuideCurrentlyVisible}
                alwaysShowOutline={alwaysShowOutline}
                shouldAutoPreview={!previewedSlots[idx]}
                onFocusSlot={setActiveSlotIndex}
                onSlotCompleted={handleSlotCompleted}
                onPreviewConsumed={handlePreviewConsumed}
                onAnimationStateChange={setIsAnimating}
                onManualInteract={handleStrokeClearPeek}
              />
            ))}
          </motion.div>
        </AnimatePresence>

        {hanziChars.length >= 3 && (
          <button
            type="button"
            onClick={handleSlideRight}
            disabled={!canSlideRight}
            className={`flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl border transition shrink-0 ${
              shouldPulseRightArrow
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400 shadow-lg shadow-emerald-500/25 animate-pulse cursor-pointer active:scale-95'
                : canSlideRight
                ? 'bg-slate-900 hover:bg-slate-800 text-cyan-300 border-cyan-500/40 cursor-pointer active:scale-95 shadow-md'
                : 'bg-slate-950/40 text-slate-700 border-slate-900 cursor-not-allowed opacity-50'
            }`}
            title="Trượt sang chữ tiếp theo"
          >
            <ArrowRight className="w-5 h-5" />
            {canSlideRight && (
              <span className="text-[10px] font-mono font-bold leading-none">
                Chữ {windowStartIndex + 3}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Indicator + Skip directly underneath */}
      {renderBottomIndicatorAndSkip(false)}

      {/* Desktop 5-Button Control Toolbar */}
      <div className="w-full max-w-lg grid grid-cols-5 gap-2 pt-1">
        <button
          type="button"
          onClick={handleAnimate}
          disabled={isAnimating}
          className="py-2 px-2 text-emerald-300 bg-slate-900 hover:bg-slate-800 border border-emerald-500/30 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 active:scale-95 text-xs font-semibold"
          title="Mô phỏng viết nét chữ đang chọn"
        >
          <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400 shrink-0" />
          <span className="truncate">{isAnimating ? 'Đang viết' : 'Mô phỏng'}</span>
        </button>

        <button
          type="button"
          onClick={handleToggleAlwaysShow}
          className={`py-2 px-2 rounded-xl transition border flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95 text-xs font-semibold ${
            alwaysShowOutline
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500 font-bold shadow-md shadow-cyan-500/20'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border-slate-700/80'
          }`}
          title="Bật/tắt chế độ luôn hiển thị nét mờ khi viết"
        >
          <Pin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="truncate">Luôn hiện</span>
        </button>

        <button
          type="button"
          onClick={handleToggleGuide}
          className={`py-2 px-2 rounded-xl transition border flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95 text-xs font-semibold ${
            isGuideCurrentlyVisible
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800 border-slate-800'
          }`}
          title="Xem nhanh nét mẫu (tự ẩn khi viết nét tiếp theo)"
        >
          {isGuideCurrentlyVisible ? (
            <Eye className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <EyeOff className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          )}
          <span className="truncate">{isGuideCurrentlyVisible ? 'Ẩn mẫu' : 'Nét mẫu'}</span>
        </button>

        <button
          type="button"
          onClick={() => speakChinese(hanzi)}
          className="py-2 px-2 text-cyan-300 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95 text-xs font-semibold"
          title="Phát âm cả từ ghép"
        >
          <Volume2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="truncate">Phát âm</span>
        </button>

        <button
          type="button"
          onClick={handleReset}
          className="py-2 px-2 text-amber-300 bg-slate-900 border border-slate-700/80 hover:bg-slate-800 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95 text-xs font-semibold"
          title="Xóa nét chữ đang chọn làm lại"
        >
          <RefreshCw className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="truncate">Làm lại</span>
        </button>
      </div>
    </div>
  );
};
