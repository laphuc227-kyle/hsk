/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sidebar } from './components/Sidebar';
import { WordListManager } from './components/WordListManager';
import { StudySession } from './components/StudySession';
import { CharacterDetailModal } from './components/CharacterDetailModal';
import { AITutorDrawer } from './components/AITutorDrawer';
import { AnalyticsView } from './components/AnalyticsView';
import { GrammarView } from './components/GrammarView';
import { SettingsModal } from './components/SettingsModal';
import { StudySetupModal } from './components/StudySetupModal';
import {
  BookOpen,
  BookOpenCheck,
  Sparkles,
  Bot,
  Menu,
  Settings,
} from 'lucide-react';
import { Character, WordList, UserStats, StudySessionMode } from './types';
import {
  initializeStorage,
  getCharacters,
  saveCharacters,
  getWordLists,
  getUserStats,
  removeCharacter,
} from './services/storage';
import { autoCategorizeCharacters } from './services/hskClassifier';
import { syncLearnedCompoundWords } from './services/compoundWordDetector';

export default function App() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [wordLists, setWordLists] = useState<WordList[]>([]);
  const [stats, setStats] = useState<UserStats>({
    totalSaved: 0,
    totalMastered: 0,
    totalReviews: 0,
    accuracy: 0,
    streakDays: 1,
    lastStudyDate: new Date().toISOString().split('T')[0],
    totalStudyTimeSeconds: 0,
  });

  // UI State
  const [activeView, setActiveView] = useState<'lists' | 'study' | 'analytics' | 'grammar'>('lists');
  const [studyMode, setStudyMode] = useState<StudySessionMode>('smart_daily');
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Modals / Drawers
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [isTutorOpen, setIsTutorOpen] = useState(false);
  const [tutorContextHanzi, setTutorContextHanzi] = useState<string | undefined>(undefined);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Study Setup Modal State
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [pendingStudyMode, setPendingStudyMode] = useState<StudySessionMode>('smart_daily');
  const [pendingListId, setPendingListId] = useState<string | null>(null);
  const [sessionQuestionLimit, setSessionQuestionLimit] = useState<number | 'all'>(20);

  // Initialize and load data on mount
  useEffect(() => {
    initializeStorage();
    const loadedChars = getCharacters();
    // Auto-sync 100% learned review compound words into all vocabulary
    const { updatedCharacters } = syncLearnedCompoundWords(loadedChars);
    const categorized = autoCategorizeCharacters(updatedCharacters);
    saveCharacters(categorized);
    setCharacters(categorized);
    setWordLists(getWordLists());
    setStats(getUserStats());
  }, []);

  const refreshAllData = () => {
    const loadedChars = getCharacters();
    // Auto-sync 100% learned review compound words into all vocabulary
    const { updatedCharacters } = syncLearnedCompoundWords(loadedChars);
    const categorized = autoCategorizeCharacters(updatedCharacters);
    saveCharacters(categorized);
    setCharacters(categorized);
    setWordLists(getWordLists());
    setStats(getUserStats());
  };

  // Due count calculation for SRS badge
  const now = Date.now();
  const dueCount = characters.filter((c) => c.srs.nextReviewDate <= now).length;

  const handleStartSession = (mode: StudySessionMode, listId?: string) => {
    setPendingStudyMode(mode);
    setPendingListId(listId !== undefined ? listId : selectedListId);
    setIsSetupModalOpen(true);
  };

  const handleConfirmStartStudy = (
    mode: StudySessionMode,
    listId: string | null,
    questionLimit?: number | 'all'
  ) => {
    setStudyMode(mode);
    setSelectedListId(listId);
    if (questionLimit !== undefined) {
      setSessionQuestionLimit(questionLimit);
    }
    setIsSetupModalOpen(false);
    setActiveView('study');
  };

  const handleSelectList = (listId: string | null) => {
    setSelectedListId(listId);
    setActiveView('lists');
  };

  const handleOpenTutorForHanzi = (hanzi?: string) => {
    setTutorContextHanzi(hanzi);
    setIsTutorOpen(true);
  };

  // Canva-style slide/scale page transition variants
  const pageVariants = {
    initial: { opacity: 0, scale: 0.98, y: 14 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.98, y: -14 },
  };

  const pageTransition = {
    duration: 0.35,
    ease: [0.22, 1, 0.36, 1],
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#090D16] font-sans text-slate-100 antialiased overflow-hidden selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Background Subtle Mint & Ocean Blue Ambient Glow */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl" />
      </div>

      {/* Mobile Top Header (< 768px) */}
      <header className="md:hidden flex items-center justify-between px-3.5 py-2.5 bg-slate-900/95 backdrop-blur-xl border-b border-slate-800/80 shrink-0 z-30">
        <div
          onClick={() => {
            setActiveView('lists');
            setSelectedListId(null);
          }}
          className="flex items-center gap-2.5 cursor-pointer"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-400 text-slate-950 flex items-center justify-center font-serif font-black text-lg shadow-md shadow-emerald-500/20">
            字
          </div>
          <div>
            <h1 className="text-sm font-bold bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent leading-none">
              Hanzi Tutor
            </h1>
            <span className="text-[10px] text-cyan-400/80 font-mono">Gia Sư Chữ Hán</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {dueCount > 0 && (
            <button
              onClick={() => handleStartSession('smart_daily')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold cursor-pointer active:scale-95 transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>{dueCount}</span>
            </button>
          )}

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer active:scale-95"
            title="Cài đặt & Sao lưu"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 rounded-xl text-slate-300 hover:text-emerald-300 hover:bg-slate-800 transition cursor-pointer active:scale-95"
            title="Mở danh mục HSK & Chế độ học"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Notion-style Dark Glass Sidebar (Desktop permanent, Mobile slide-in drawer) */}
      <Sidebar
        wordLists={wordLists}
        selectedListId={selectedListId}
        activeView={activeView}
        dueCount={dueCount}
        onStartSession={handleStartSession}
        onOpenTutor={() => handleOpenTutorForHanzi()}
        onOpenAnalytics={() => setActiveView('analytics')}
        onOpenGrammar={() => setActiveView('grammar')}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSelectList={handleSelectList}
        isOpenOnMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Area with Canva Slide Transition */}
      <main className="relative z-10 flex-1 overflow-y-auto px-3.5 py-4 sm:p-6 md:p-8 max-w-6xl mx-auto w-full pb-24 md:pb-8">
        <AnimatePresence mode="wait">
          {activeView === 'lists' && (
            <motion.div
              key="lists"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageTransition}
              className="w-full"
            >
              <WordListManager
                characters={characters}
                wordLists={wordLists}
                selectedListId={selectedListId}
                onSelectList={handleSelectList}
                onRefreshData={refreshAllData}
                onSelectCharacter={(char) => setSelectedCharacter(char)}
                onStartSession={handleStartSession}
              />
            </motion.div>
          )}

          {activeView === 'study' && (
            <motion.div
              key="study"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageTransition}
              className="w-full"
            >
              <StudySession
                mode={studyMode}
                allCharacters={characters}
                selectedListId={selectedListId || undefined}
                wordLists={wordLists}
                initialQuestionLimit={sessionQuestionLimit}
                onFinishSession={() => {
                  refreshAllData();
                  setActiveView('lists');
                }}
                onOpenCharacterDetail={(char) => setSelectedCharacter(char)}
                onChangeList={(listId) => setSelectedListId(listId)}
              />
            </motion.div>
          )}

          {activeView === 'analytics' && (
            <motion.div
              key="analytics"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageTransition}
              className="w-full"
            >
              <AnalyticsView
                characters={characters}
                stats={stats}
                onPracticeCharacter={(char) => setSelectedCharacter(char)}
              />
            </motion.div>
          )}

          {activeView === 'grammar' && (
            <motion.div
              key="grammar"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageTransition}
              className="w-full"
            >
              <GrammarView
                onOpenTutorWithContext={(promptText) => {
                  setTutorContextHanzi(promptText);
                  setIsTutorOpen(true);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Navigation Bar (iPhone / Android) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/80 px-2 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl flex items-center justify-around select-none">
        <button
          onClick={() => {
            setActiveView('lists');
            setSelectedListId(null);
          }}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition cursor-pointer active:scale-95 ${
            activeView === 'lists' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Từ vựng</span>
        </button>

        <button
          onClick={() => handleStartSession('smart_daily')}
          className={`relative flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition cursor-pointer active:scale-95 ${
            activeView === 'study' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            {dueCount > 0 && (
              <span className="absolute -top-1 -right-2 min-w-4 h-4 px-1 bg-emerald-500 text-slate-950 font-bold text-[9px] rounded-full flex items-center justify-center">
                {dueCount > 99 ? '99+' : dueCount}
              </span>
            )}
          </div>
          <span className="text-[10px] tracking-tight">Học ngay</span>
        </button>

        <button
          onClick={() => setActiveView('grammar')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition cursor-pointer active:scale-95 ${
            activeView === 'grammar' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpenCheck className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Ngữ pháp</span>
        </button>

        <button
          onClick={() => handleOpenTutorForHanzi()}
          className="flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl text-cyan-400 hover:text-cyan-300 transition cursor-pointer active:scale-95"
        >
          <Bot className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Gia sư AI</span>
        </button>

        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl text-slate-400 hover:text-slate-200 transition cursor-pointer active:scale-95"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">Menu</span>
        </button>
      </nav>

      {/* Modals & Drawers */}
      <AnimatePresence>
        {selectedCharacter && (
          <CharacterDetailModal
            key="char-modal"
            character={selectedCharacter}
            onClose={() => setSelectedCharacter(null)}
            onUpdateCharacter={() => refreshAllData()}
            onOpenTutor={(hanzi) => handleOpenTutorForHanzi(hanzi)}
            onDeleteCharacter={(id) => {
              removeCharacter(id);
              refreshAllData();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isTutorOpen && (
          <AITutorDrawer
            key="tutor-drawer"
            isOpen={isTutorOpen}
            onClose={() => setIsTutorOpen(false)}
            contextHanzi={tutorContextHanzi}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSettingsOpen && (
          <SettingsModal
            key="settings-modal"
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            onRefreshData={refreshAllData}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSetupModalOpen && (
          <StudySetupModal
            key="study-setup-modal"
            isOpen={isSetupModalOpen}
            initialMode={pendingStudyMode}
            initialListId={pendingListId}
            wordLists={wordLists}
            allCharacters={characters}
            onClose={() => setIsSetupModalOpen(false)}
            onConfirmStart={handleConfirmStartStudy}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
