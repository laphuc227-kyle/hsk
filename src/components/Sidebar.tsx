import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Zap,
  Flame,
  Target,
  BarChart3,
  BookOpen,
  Settings,
  Bot,
  GraduationCap,
  Layers,
  BookOpenCheck,
  Combine,
  FileQuestion,
  X,
  Cloud,
  RefreshCw,
  LogIn,
  LogOut,
  CheckCircle2,
} from 'lucide-react';
import { WordList, StudySessionMode } from '../types';

interface SidebarProps {
  wordLists: WordList[];
  selectedListId: string | null;
  activeView: 'lists' | 'study' | 'analytics' | 'grammar';
  dueCount: number;
  onStartSession: (mode: StudySessionMode, listId?: string) => void;
  onOpenTutor: () => void;
  onOpenAnalytics: () => void;
  onOpenGrammar: () => void;
  onOpenSettings: () => void;
  onSelectList: (listId: string | null) => void;
  isOpenOnMobile?: boolean;
  onCloseMobile?: () => void;
  currentUser?: { displayName?: string | null; email?: string | null; photoURL?: string | null } | null;
  isSyncing?: boolean;
  onSignInGoogle?: () => void;
  onSignOut?: () => void;
  onSyncNow?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  wordLists,
  selectedListId,
  activeView,
  dueCount,
  onStartSession,
  onOpenTutor,
  onOpenAnalytics,
  onOpenGrammar,
  onOpenSettings,
  onSelectList,
  isOpenOnMobile = false,
  onCloseMobile,
  currentUser,
  isSyncing = false,
  onSignInGoogle,
  onSignOut,
  onSyncNow,
}) => {
  const handleAction = (action: () => void) => {
    action();
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const renderContent = (isMobile: boolean = false) => (
    <div className="flex flex-col h-full justify-between select-none text-slate-200">
      {/* Top Header Logo */}
      <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-400 text-slate-950 flex items-center justify-center font-serif font-black text-xl shadow-lg shadow-emerald-500/20">
            字
          </div>
          <div>
            <h1 className="text-sm font-bold bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent tracking-tight leading-none">
              Hanzi Tutor
            </h1>
            <span className="text-[10px] text-cyan-400/80 font-mono font-medium">Gia Sư Chữ Hán AI</span>
          </div>
        </div>

        {isMobile && (
          <button
            onClick={onCloseMobile}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
            aria-label="Đóng menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-800">
        {/* Core AI Study Actions */}
        <div className="space-y-1">
          <p className="px-2 text-[10px] font-bold text-slate-400/80 uppercase tracking-wider">
            Chế độ học thông minh
          </p>

          <button
            onClick={() => handleAction(() => onStartSession('smart_daily', selectedListId || undefined))}
            className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:text-emerald-300 hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/20 transition group cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition" />
              <span>Hôm nay học gì</span>
            </div>
            {dueCount > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold shadow-2xs">
                {dueCount}
              </span>
            )}
          </button>

          <button
            onClick={() => handleAction(() => onStartSession('quick_flashcard', selectedListId || undefined))}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/10 border border-transparent hover:border-cyan-500/20 transition cursor-pointer group"
          >
            <Zap className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition" />
            <span>Học nhanh (Flashcard)</span>
          </button>

          <button
            onClick={() => handleAction(() => onStartSession('weakness', selectedListId || undefined))}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-amber-300 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/20 transition cursor-pointer group"
          >
            <Flame className="w-4 h-4 text-amber-400 group-hover:scale-110 transition" />
            <span>Luyện nhớ (Chữ hay sai)</span>
          </button>

          <button
            onClick={() => handleAction(() => onStartSession('random_test', selectedListId || undefined))}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-teal-300 hover:bg-teal-500/10 border border-transparent hover:border-teal-500/20 transition cursor-pointer group"
          >
            <Target className="w-4 h-4 text-teal-400 group-hover:scale-110 transition" />
            <span>Kiểm tra (Quiz)</span>
          </button>

          <button
            onClick={() => handleAction(() => onStartSession('sentence_cloze', selectedListId || undefined))}
            className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-violet-300 hover:bg-violet-500/10 border border-transparent hover:border-violet-500/20 transition cursor-pointer group"
          >
            <div className="flex items-center gap-2.5">
              <FileQuestion className="w-4 h-4 text-violet-400 group-hover:scale-110 transition" />
              <span>Điền khuyết câu</span>
            </div>
            <span className="text-[9px] font-bold font-mono px-1.5 py-0.2 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
              Mới
            </span>
          </button>
        </div>

        {/* AI Tutor Assistant */}
        <div className="space-y-1">
          <p className="px-2 text-[10px] font-bold text-slate-400/80 uppercase tracking-wider">
            Trợ lý & Ngữ pháp
          </p>

          <button
            onClick={() => handleAction(onOpenGrammar)}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activeView === 'grammar'
                ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 border border-emerald-500/30 shadow-xs'
                : 'text-slate-200 hover:text-emerald-300 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <BookOpenCheck className="w-4 h-4 text-emerald-400" />
              <span>Ngữ pháp Hán ngữ</span>
            </div>
            <span className="text-[9px] font-bold font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              HSK
            </span>
          </button>

          <button
            onClick={() => handleAction(onOpenTutor)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold text-cyan-200 bg-gradient-to-r from-cyan-950/60 to-slate-900 hover:from-cyan-900/80 hover:to-slate-800 border border-cyan-500/30 transition cursor-pointer shadow-xs group"
          >
            <Bot className="w-4 h-4 text-cyan-400 group-hover:rotate-12 transition" />
            <span>Hỏi Gia Sư AI</span>
          </button>

          <button
            onClick={() => handleAction(onOpenAnalytics)}
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
              activeView === 'analytics'
                ? 'bg-slate-800 text-emerald-300 font-semibold border border-emerald-500/30 shadow-xs'
                : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-slate-400" />
            <span>Thống kê tiến độ</span>
          </button>
        </div>

        {/* Custom Word Lists */}
        <div className="space-y-1">
          <div className="flex items-center justify-between px-2">
            <p className="text-[10px] font-bold text-slate-400/80 uppercase tracking-wider">
              Danh sách từ vựng
            </p>
          </div>

          <button
            onClick={() => handleAction(() => onSelectList(null))}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
              activeView === 'lists' && selectedListId === null
                ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-emerald-300 font-semibold border border-emerald-500/30 shadow-xs'
                : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
              <span>Tất cả từ vựng</span>
            </div>
          </button>

          <button
            onClick={() => handleAction(() => onSelectList('all_single'))}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
              activeView === 'lists' && selectedListId === 'all_single'
                ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 font-semibold border border-emerald-500/30 shadow-xs'
                : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Layers className="w-3.5 h-3.5 text-teal-400" />
              <span>Tất cả chữ đơn</span>
            </div>
          </button>

          <button
            onClick={() => handleAction(() => onSelectList('all_compound'))}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
              activeView === 'lists' && selectedListId === 'all_compound'
                ? 'bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-300 font-semibold border border-amber-500/30 shadow-xs'
                : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Combine className="w-3.5 h-3.5 text-amber-400" />
              <span>Tất cả từ ghép</span>
            </div>
          </button>

          {/* HSK Lists Section */}
          <div className="pt-2 pb-1 px-2 border-t border-slate-800/60 mt-2">
            <p className="text-[10px] font-bold text-slate-400/80 uppercase tracking-wider">
              Cấp độ HSK
            </p>
          </div>

          {wordLists
            .filter((l) => ['hsk1', 'hsk2', 'hsk3'].includes(l.id) || l.isPredefined)
            .map((list) => {
              const isSelected = activeView === 'lists' && selectedListId === list.id;
              return (
                <div key={list.id} className="group relative flex items-center">
                  <button
                    onClick={() => handleAction(() => onSelectList(list.id))}
                    className={`w-full flex items-center justify-between pl-2.5 pr-8 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30 shadow-xs'
                        : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <GraduationCap className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="truncate">{list.name}</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAction(() => onStartSession('random_test', list.id));
                    }}
                    className="absolute right-1.5 p-1 rounded-lg hover:bg-emerald-500/20 text-slate-500 hover:text-emerald-300 transition cursor-pointer opacity-70 group-hover:opacity-100"
                    title={`Kiểm tra danh sách ${list.name}`}
                  >
                    <Target className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}

          {/* Custom user lists if any */}
          {wordLists.filter((l) => !['hsk1', 'hsk2', 'hsk3'].includes(l.id) && !l.isPredefined).length > 0 && (
            <div className="pt-2 pb-1 px-2 border-t border-slate-800/60 mt-2">
              <p className="text-[10px] font-bold text-slate-400/80 uppercase tracking-wider">
                Danh sách tự tạo
              </p>
              {wordLists
                .filter((l) => !['hsk1', 'hsk2', 'hsk3'].includes(l.id) && !l.isPredefined)
                .map((list) => {
                  const isSelected = activeView === 'lists' && selectedListId === list.id;
                  return (
                    <div key={list.id} className="group relative flex items-center my-0.5">
                      <button
                        onClick={() => handleAction(() => onSelectList(list.id))}
                        className={`w-full flex items-center justify-between pl-2.5 pr-8 py-2 rounded-xl text-xs font-medium transition cursor-pointer ${
                          isSelected
                            ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30 shadow-xs'
                            : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <span
                            className="w-2 h-2 rounded-full shrink-0 shadow-2xs"
                            style={{ backgroundColor: list.color || '#2DD4BF' }}
                          />
                          <span className="truncate">{list.name}</span>
                        </div>
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Cloud Sync Account Card */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/60 space-y-2">
        {currentUser ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || 'Avatar'}
                    className="w-7 h-7 rounded-full border border-emerald-500/40 object-cover shrink-0"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-xs flex items-center justify-center border border-emerald-500/30 shrink-0">
                    {currentUser.displayName ? currentUser.displayName[0].toUpperCase() : 'U'}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-200 truncate">
                    {currentUser.displayName || 'Tài khoản Google'}
                  </p>
                  <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Đã kết nối Cloud</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onSyncNow}
                disabled={isSyncing}
                className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-slate-800/80 transition cursor-pointer active:scale-95 disabled:opacity-50"
                title="Đồng bộ đám mây ngay"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-cyan-400' : ''}`} />
              </button>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[10px]">
              <span className="text-slate-500">Tự động đồng bộ</span>
              <button
                type="button"
                onClick={onSignOut}
                className="text-slate-400 hover:text-rose-400 transition cursor-pointer flex items-center gap-1"
              >
                <LogOut className="w-3 h-3" />
                <span>Đăng xuất</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                <Cloud className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-200">Đồng bộ Đám mây</p>
                <p className="text-[10px] text-slate-400 truncate">Đồng bộ Laptop & iPhone</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onSignInGoogle}
              className="w-full py-1.5 px-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 transition cursor-pointer active:scale-95"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Đăng nhập Google</span>
            </button>
          </div>
        )}

        <button
          onClick={() => handleAction(onOpenSettings)}
          className="w-full flex items-center gap-2.5 px-2 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-xl transition cursor-pointer"
        >
          <Settings className="w-4 h-4 text-slate-400" />
          <span>Sao lưu & Cài đặt</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar (>= 768px) */}
      <aside className="hidden md:flex w-64 bg-slate-900/90 backdrop-blur-xl border-r border-slate-800/80 h-screen shrink-0 z-20">
        {renderContent(false)}
      </aside>

      {/* Mobile Drawer (Slides out on < 768px when isOpenOnMobile is true) */}
      <AnimatePresence>
        {isOpenOnMobile && (
          <div className="fixed inset-0 z-50 md:hidden">
            {/* Backdrop Blur Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onCloseMobile}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />

            {/* Slide-in Drawer */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="relative w-72 max-w-[85vw] h-full bg-slate-900 border-r border-slate-800 shadow-2xl flex flex-col z-10"
            >
              {renderContent(true)}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
