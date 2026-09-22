import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Search, Sparkles, BookOpen, Layers, Volume2, Edit, Loader2, ListPlus, FileText, CheckCircle2, Target, Zap, Flame, GraduationCap, Download, Copy, Check, FileSpreadsheet, Share2, Combine, ArrowRight, FileQuestion } from 'lucide-react';
import { Character, WordList, StudySessionMode } from '../types';
import { addCharacter, removeCharacter, saveWordLists, saveCharacters } from '../services/storage';
import { DEFAULT_SRS } from '../services/dictionary';
import { speakChinese } from '../services/audio';
import { detectCompoundWordsFromCharacters, convertCompoundToCharacter, DetectedCompoundWord } from '../services/compoundWordDetector';
import { autoCategorizeCharacters } from '../services/hskClassifier';
import { lookupBuiltIn } from '../services/builtInDictionary';

interface WordListManagerProps {
  characters: Character[];
  wordLists: WordList[];
  selectedListId: string | null;
  onSelectList: (listId: string | null) => void;
  onRefreshData: () => void;
  onSelectCharacter: (character: Character) => void;
  onStartSession?: (mode: StudySessionMode, listId?: string) => void;
}

export const WordListManager: React.FC<WordListManagerProps> = ({
  characters,
  wordLists,
  selectedListId,
  onSelectList,
  onRefreshData,
  onSelectCharacter,
  onStartSession,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddListModal, setShowAddListModal] = useState(false);
  const [showAddWordModal, setShowAddWordModal] = useState(false);

  // New List State
  const [newListName, setNewListName] = useState('');
  const [newListDesc, setNewListDesc] = useState('');

  // New Word Batch Input State
  const [batchInputText, setBatchInputText] = useState('');
  const [targetListIdForAdd, setTargetListIdForAdd] = useState<string>(selectedListId || 'hsk1');
  const [isProcessingAdd, setIsProcessingAdd] = useState(false);
  const [addStatusMessage, setAddStatusMessage] = useState('');

  // Export Modal State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportScope, setExportScope] = useState<'current' | 'all'>('current');
  const [copyFormat, setCopyFormat] = useState<'simple' | 'detailed' | 'tsv'>('detailed');
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  // Word type filter (Tất cả / Chữ đơn / Từ ghép)
  const [wordTypeFilter, setWordTypeFilter] = useState<'all' | 'single' | 'compound'>('all');

  // Sub-filter when viewing compounds: 'all_compounds' | 'compound_review' | 'compound_expansion'
  const [compoundSubFilter, setCompoundSubFilter] = useState<'all_compounds' | 'compound_review' | 'compound_expansion'>('all_compounds');

  // Filter base characters depending on selected sidebar list
  const scopeCharacters = characters.filter((c) => {
    if (!selectedListId) return true;
    if (selectedListId === 'all_single') return c.hanzi.length === 1;
    if (selectedListId === 'all_compound') return c.hanzi.length > 1;
    return c.listIds.includes(selectedListId);
  });

  // Auto-detect compound words from user's entire character library
  const detectedCompounds = detectCompoundWordsFromCharacters(characters);

  // 1. Strictly 100% full match (all single characters are in user's list) - Từ ghép ôn tập
  const fullMatchCompounds = detectedCompounds.filter((d) => d.isFullMatch);

  // 2. Expansion matches (contains 1+ known single character + 1+ new character) - Từ ghép mở rộng
  const expansionCompounds = detectedCompounds.filter((d) => d.isExpansionMatch);

  // Active compound list based on sub-filter
  const activeCompoundList =
    compoundSubFilter === 'compound_review'
      ? fullMatchCompounds
      : compoundSubFilter === 'compound_expansion'
      ? expansionCompounds
      : detectedCompounds;

  const filteredCompoundList = activeCompoundList.filter((dc) => {
    if (!searchTerm) return true;
    return (
      dc.word.includes(searchTerm) ||
      dc.pinyin.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dc.meaning.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (dc.hanViet && dc.hanViet.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  const handleSaveDetectedCompound = (dc: DetectedCompoundWord) => {
    const listTarget = selectedListId && !['all_single', 'all_compound'].includes(selectedListId)
      ? [selectedListId]
      : ['hsk1'];
    const charObj = convertCompoundToCharacter(dc, listTarget);
    addCharacter(charObj);
    onRefreshData();
  };

  const handleAutoCategorizeHSK = () => {
    const categorized = autoCategorizeCharacters(characters);
    saveCharacters(categorized);
    onRefreshData();
  };

  // Filter characters by wordTypeFilter and searchTerm
  const activeList = wordLists.find((l) => l.id === selectedListId);

  const filteredCharacters = scopeCharacters.filter((c) => {
    const matchesType =
      wordTypeFilter === 'all'
        ? true
        : wordTypeFilter === 'single'
        ? c.hanzi.length === 1
        : c.hanzi.length > 1;
    const matchesSearch =
      !searchTerm ||
      c.hanzi.includes(searchTerm) ||
      c.pinyin.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.meaning.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.hanViet.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  const singleCount = scopeCharacters.filter((c) => c.hanzi.length === 1).length;
  const compoundCount = characters.filter((c) => c.hanzi.length > 1).length;

  const targetExportCharacters = exportScope === 'current' ? filteredCharacters : characters;

  const handleCopyVocabulary = () => {
    let text = '';
    if (copyFormat === 'simple') {
      text = targetExportCharacters.map((c) => c.hanzi).join(' ');
    } else if (copyFormat === 'detailed') {
      text = targetExportCharacters
        .map((c, idx) => `${idx + 1}. ${c.hanzi} (${c.pinyin}) [${c.hanViet}] - ${c.meaning}`)
        .join('\n');
    } else if (copyFormat === 'tsv') {
      text = ['Chữ Hán\tPinyin\tHán Việt\tNghĩa\tMẹo Nhớ']
        .concat(
          targetExportCharacters.map(
            (c) => `${c.hanzi}\t${c.pinyin}\t${c.hanViet}\t${c.meaning}\t${c.mnemonic || ''}`
          )
        )
        .join('\n');
    }

    navigator.clipboard.writeText(text);
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 2200);
  };

  const handleDownloadExcel = () => {
    const listLabel = exportScope === 'current' && activeList ? activeList.name : 'TatCaTuVung';
    const tableHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>TuVung</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          th { background-color: #0d9488; color: #ffffff; font-weight: bold; padding: 10px; border: 1px solid #0f766e; text-align: left; }
          td { padding: 8px; border: 1px solid #e2e8f0; vertical-align: top; mso-number-format:"\\@"; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
        </style>
      </head>
      <body>
        <h2>Danh Sách Từ Vựng Chữ Hán - ${listLabel}</h2>
        <table border="1" style="border-collapse: collapse;">
          <thead>
            <tr>
              <th class="center">STT</th>
              <th>Chữ Hán</th>
              <th>Pinyin</th>
              <th>Hán Việt</th>
              <th>Nghĩa Tiếng Việt</th>
              <th>Mẹo Nhớ / Cấu Tạo</th>
            </tr>
          </thead>
          <tbody>
            ${targetExportCharacters
              .map(
                (c, idx) => `
              <tr>
                <td class="center">${idx + 1}</td>
                <td class="bold" style="font-size: 14pt;">${c.hanzi}</td>
                <td style="color: #0284c7;">${c.pinyin}</td>
                <td class="bold" style="color: #0d9488;">${c.hanViet}</td>
                <td>${c.meaning}</td>
                <td>${c.mnemonic || ''}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(['\uFEFF' + tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Hanzi_TuVung_${listLabel.replace(/\s+/g, '_')}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCSV = (delimiter: ',' | ';' = ',') => {
    const listLabel = exportScope === 'current' && activeList ? activeList.name : 'TatCaTuVung';
    const headers = ['Chữ Hán', 'Pinyin', 'Hán Việt', 'Nghĩa Tiếng Việt', 'Mẹo Nhớ'];
    const rows = targetExportCharacters.map((c) => [
      `"${c.hanzi.replace(/"/g, '""')}"`,
      `"${c.pinyin.replace(/"/g, '""')}"`,
      `"${c.hanViet.replace(/"/g, '""')}"`,
      `"${c.meaning.replace(/"/g, '""')}"`,
      `"${(c.mnemonic || '').replace(/"/g, '""')}"`,
    ]);

    // sep= directive forces Excel on Windows to use the correct delimiter regardless of Windows regional settings
    const csvContent =
      '\uFEFF' +
      `sep=${delimiter}\n` +
      headers.join(delimiter) +
      '\n' +
      rows.map((r) => r.join(delimiter)).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const suffix = delimiter === ';' ? '_ExcelVN' : '_Standard';
    link.download = `Hanzi_TuVung_${listLabel.replace(/\s+/g, '_')}${suffix}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJSON = () => {
    const jsonContent = JSON.stringify(targetExportCharacters, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Hanzi_TuVung_Backup.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadTXT = () => {
    const textContent = targetExportCharacters
      .map((c, idx) => `${idx + 1}. ${c.hanzi} (${c.pinyin}) [${c.hanViet}] - ${c.meaning}`)
      .join('\n');
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Hanzi_TuVung.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateList = () => {
    if (!newListName.trim()) return;
    const newList: WordList = {
      id: `list_${Date.now()}`,
      name: newListName.trim(),
      description: newListDesc.trim(),
      createdAt: Date.now(),
    };
    const updatedLists = [...wordLists, newList];
    saveWordLists(updatedLists);
    onSelectList(newList.id);
    setNewListName('');
    setNewListDesc('');
    setShowAddListModal(false);
    onRefreshData();
  };

  const handleBatchAddCharacters = async () => {
    if (!batchInputText.trim()) return;
    setIsProcessingAdd(true);
    setAddStatusMessage('Đang phân tích chữ Hán...');

    // Extract Chinese words or characters from text
    // Handles spaces, newlines, English/Chinese commas, semicolons, tabs
    const rawTokens = batchInputText
      .replace(/[^\u4e00-\u9fa5\s,，、;\n\r\t]/g, ' ')
      .split(/[\s,，、;\n\r\t]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const extractedHanzi: string[] = [];
    rawTokens.forEach((tok) => {
      // If user pasted a continuous string of more than 4 Chinese chars without spaces, split into single chars
      if (tok.length > 4) {
        for (const ch of tok) {
          if (/[\u4e00-\u9fa5]/.test(ch) && !extractedHanzi.includes(ch)) {
            extractedHanzi.push(ch);
          }
        }
      } else if (!extractedHanzi.includes(tok)) {
        extractedHanzi.push(tok);
      }
    });

    if (extractedHanzi.length === 0) {
      setAddStatusMessage('Không tìm thấy chữ Hán hợp lệ trong đoạn văn bản.');
      setIsProcessingAdd(false);
      return;
    }

    setAddStatusMessage(`Đã tìm thấy ${extractedHanzi.length} chữ. Đang bổ sung thông tin chi tiết...`);

    try {
      // Call AI Enrich endpoint (with fast built-in path & server fallback)
      const res = await fetch('/api/gemini/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characters: extractedHanzi }),
      });

      const json = await res.json();

      if (json.success && Array.isArray(json.data)) {
        json.data.forEach((item: any) => {
          const dict = lookupBuiltIn(item.hanzi);
          const newChar: Character = {
            id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            hanzi: item.hanzi,
            pinyin: item.pinyin && item.pinyin !== 'chưa rõ' ? item.pinyin : (dict?.pinyin || 'chưa rõ'),
            hanViet: item.hanViet && item.hanViet !== 'CHƯA RÕ' ? item.hanViet : (dict?.hanViet || 'CHƯA RÕ'),
            meaning: item.meaning && !item.meaning.includes('Từ vựng mới') ? item.meaning : (dict?.meaning || 'Chưa có nghĩa'),
            radical: item.radical || dict?.radical || 'Bộ thủ',
            strokeCount: item.strokeCount || dict?.strokeCount || 1,
            components: item.components || dict?.components,
            mnemonic: item.mnemonic || dict?.mnemonic,
            examples: (Array.isArray(item.examples) && item.examples.length > 0) ? item.examples : (dict?.examples || []),
            compoundWords: (Array.isArray(item.compoundWords) && item.compoundWords.length > 0) ? item.compoundWords : (dict?.compoundWords || []),
            listIds: [targetListIdForAdd],
            createdAt: Date.now(),
            srs: { ...DEFAULT_SRS },
          };
          addCharacter(newChar);
        });

        setAddStatusMessage(`Thành công! Đã thêm ${json.data.length} chữ vào danh sách.`);
        setTimeout(() => {
          setShowAddWordModal(false);
          setBatchInputText('');
          setAddStatusMessage('');
          onRefreshData();
        }, 800);
      } else {
        throw new Error('Fallback to local dictionary');
      }
    } catch (err) {
      // Offline / Local dictionary fallback: NEVER use dummy 'pinyin' or 'Từ vựng mới'
      extractedHanzi.forEach((h) => {
        const dict = lookupBuiltIn(h);
        const newChar: Character = {
          id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          hanzi: h,
          pinyin: dict?.pinyin || 'chưa có phiên âm',
          hanViet: dict?.hanViet || 'CHƯA RÕ',
          meaning: dict?.meaning || 'Từ vựng tiếng Trung',
          radical: dict?.radical || 'Bộ',
          strokeCount: dict?.strokeCount || 1,
          components: dict?.components || '',
          mnemonic: dict?.mnemonic || '',
          examples: dict?.examples || [],
          compoundWords: dict?.compoundWords || [],
          listIds: [targetListIdForAdd],
          createdAt: Date.now(),
          srs: { ...DEFAULT_SRS },
        };
        addCharacter(newChar);
      });

      setAddStatusMessage(`Đã thêm ${extractedHanzi.length} chữ thành công.`);
      setTimeout(() => {
        setShowAddWordModal(false);
        setBatchInputText('');
        setAddStatusMessage('');
        onRefreshData();
      }, 800);
    } finally {
      setIsProcessingAdd(false);
    }
  };

  const [deletingChar, setDeletingChar] = useState<Character | null>(null);

  const handleConfirmDelete = () => {
    if (deletingChar) {
      removeCharacter(deletingChar.id);
      onRefreshData();
      setDeletingChar(null);
    }
  };

  const handleDeleteCharacter = (e: React.MouseEvent, char: Character) => {
    e.preventDefault();
    e.stopPropagation();
    setDeletingChar(char);
  };

  return (
    <div className="space-y-6 text-slate-100">
      {/* Top Header / Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2.5 bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent">
            <BookOpen className="w-5 h-5 text-emerald-400" />
            {selectedListId === 'all_single'
              ? 'Tất cả chữ đơn'
              : selectedListId === 'all_compound'
              ? 'Tất cả từ ghép'
              : selectedListId === null
              ? 'Tất cả từ vựng'
              : activeList
              ? activeList.name
              : 'Tất cả từ vựng'}
          </h2>
          <p className="text-xs text-slate-400 pt-0.5">
            {selectedListId === 'all_single'
              ? `Hiển thị ${singleCount} chữ Hán đơn độc lập`
              : selectedListId === 'all_compound'
              ? `Hiển thị các từ ghép từ 2 chữ Hán trở lên`
              : selectedListId === null
              ? `Tổng cộng ${characters.length} từ vựng (bao gồm chữ đơn & từ ghép ôn tập 100% đã học)`
              : activeList
              ? activeList.description
              : `Tổng cộng ${characters.length} từ vựng`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoCategorizeHSK}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-cyan-300 bg-slate-900 hover:bg-slate-800 rounded-xl border border-cyan-500/30 transition cursor-pointer"
            title="Tự động phân loại tất cả từ vựng trong bộ vào HSK1, HSK2, HSK3"
          >
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>Phân loại HSK</span>
          </button>

          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-200 bg-slate-900 hover:bg-slate-800 hover:text-emerald-300 rounded-xl border border-slate-800 hover:border-emerald-500/40 transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Xuất / Sao chép</span>
          </button>

          <button
            onClick={() => {
              setTargetListIdForAdd(selectedListId && !['all_single', 'all_compound'].includes(selectedListId) ? selectedListId : 'hsk1');
              setShowAddWordModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 hover:to-teal-200 rounded-xl shadow-md shadow-emerald-500/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Thêm chữ mới</span>
          </button>

          <button
            onClick={() => setShowAddListModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-cyan-300 bg-slate-900 hover:bg-slate-800 rounded-xl border border-cyan-500/30 transition cursor-pointer"
          >
            <ListPlus className="w-4 h-4 text-cyan-400" />
            <span>Tạo danh sách</span>
          </button>
        </div>
      </div>

      {/* Conditionally Render Filter Bar */}
      {/* 1. HSK lists / Custom lists: 3-way Filter (Tất cả, Chữ đơn, Từ ghép) */}
      {selectedListId !== null && selectedListId !== 'all_single' && selectedListId !== 'all_compound' && (
        <div className="flex items-center justify-between flex-wrap gap-2 bg-slate-900/60 p-3 rounded-2xl border border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Lọc theo loại:</span>
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setWordTypeFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                  wordTypeFilter === 'all'
                    ? 'bg-slate-800 text-slate-100 font-bold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tất cả từ vựng
              </button>
              <button
                onClick={() => setWordTypeFilter('single')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                  wordTypeFilter === 'single'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Chỉ chữ đơn ({singleCount})
              </button>
              <button
                onClick={() => setWordTypeFilter('compound')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                  wordTypeFilter === 'compound'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Chỉ từ ghép ({scopeCharacters.filter((c) => c.hanzi.length > 1).length})
              </button>
            </div>
          </div>

          <span className="text-xs font-medium text-slate-400">
            Hiển thị <strong>{filteredCharacters.length}</strong> mục
          </span>
        </div>
      )}

      {/* 2. All Compound Words view: 3-type Filter requested by user */}
      {selectedListId === 'all_compound' && (
        <div className="flex items-center justify-between flex-wrap gap-3 bg-slate-900/80 p-3 rounded-2xl border border-slate-800/80 shadow-md">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Combine className="w-4 h-4 text-amber-400" />
              Bộ lọc từ ghép:
            </span>
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setCompoundSubFilter('all_compounds')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  compoundSubFilter === 'all_compounds'
                    ? 'bg-slate-800 text-slate-100 border border-slate-700 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Tất cả từ ghép</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-700 text-slate-300 font-mono">
                  {detectedCompounds.length}
                </span>
              </button>

              <button
                onClick={() => setCompoundSubFilter('compound_review')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  compoundSubFilter === 'compound_review'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Từ ghép ôn tập</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                  {fullMatchCompounds.length}
                </span>
              </button>

              <button
                onClick={() => setCompoundSubFilter('compound_expansion')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  compoundSubFilter === 'compound_expansion'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Từ ghép mở rộng</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                  {expansionCompounds.length}
                </span>
              </button>
            </div>
          </div>

          <span className="text-xs font-medium text-slate-400">
            Hiển thị <strong>{filteredCompoundList.length}</strong> từ ghép
          </span>
        </div>
      )}

      {/* Prominent Banner for Reviewing / Testing Selected List */}
      {onStartSession && (
        <div className="bg-gradient-to-r from-slate-900 via-teal-950/40 to-slate-900 text-slate-100 rounded-2xl p-4 shadow-xl border border-emerald-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="space-y-1 z-10">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase tracking-wider flex items-center gap-1">
                {selectedListId === 'all_compound' ? (
                  <>
                    <Combine className="w-3 h-3 text-amber-400" />
                    {compoundSubFilter === 'compound_review'
                      ? 'Từ ghép ôn tập'
                      : compoundSubFilter === 'compound_expansion'
                      ? 'Từ ghép mở rộng'
                      : 'Tất cả từ ghép'}
                  </>
                ) : (
                  'Luyện tập danh mục'
                )}
              </span>
              <span className="text-xs font-bold text-slate-100">
                {selectedListId === 'all_single'
                  ? 'Tất cả chữ đơn'
                  : selectedListId === 'all_compound'
                  ? compoundSubFilter === 'compound_review'
                    ? 'Từ ghép ôn tập (100% chữ đơn sẵn có)'
                    : compoundSubFilter === 'compound_expansion'
                    ? 'Từ ghép mở rộng (Gợi ý chữ mới)'
                    : 'Tất cả từ ghép'
                  : selectedListId === null
                  ? 'Tất cả từ vựng'
                  : activeList
                  ? activeList.name
                  : 'Tất cả từ vựng'}
              </span>
              <span className="text-xs text-cyan-400 font-mono">
                ({selectedListId === 'all_compound' ? filteredCompoundList.length : filteredCharacters.length} mục)
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
              {selectedListId === 'all_compound' ? (
                compoundSubFilter === 'compound_review' ? (
                  'Những từ ghép được suy ra 100% từ danh sách các chữ đơn bạn đã học. Dùng để ôn tập, củng cố mối liên kết từ mà không phát sinh thêm chữ mới.'
                ) : compoundSubFilter === 'compound_expansion' ? (
                  'Những từ ghép mở rộng chứa 1 hoặc 2 chữ đơn bạn đã biết kết hợp với chữ đơn mới bên ngoài hệ thống gợi ý cho bạn nên học.'
                ) : (
                  'Tất cả từ ghép trong hệ thống bao gồm từ ghép ôn tập (100% chữ đơn sẵn có) và từ ghép mở rộng (chứa chữ đơn mới gợi ý).'
                )
              ) : (
                `Luyện học flashcard và làm bài trắc nghiệm quiz dành riêng cho danh mục ${
                  selectedListId === 'all_single'
                    ? 'Tất cả chữ đơn'
                    : selectedListId === null
                    ? 'Tất cả từ vựng'
                    : activeList
                    ? activeList.name
                    : 'Tất cả từ vựng'
                }.`
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0 z-10">
            {selectedListId === 'all_compound' ? (
              <>
                {compoundSubFilter !== 'compound_expansion' && fullMatchCompounds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onStartSession('compound_words', undefined)}
                    className="px-3.5 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-yellow-300 hover:from-amber-300 hover:to-yellow-200 active:scale-95 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-amber-500/20"
                  >
                    <Combine className="w-4 h-4 stroke-[2.5]" />
                    <span>Ôn từ ghép đã học ({fullMatchCompounds.length})</span>
                  </button>
                )}

                {compoundSubFilter !== 'compound_review' && expansionCompounds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onStartSession('compound_expansion', undefined)}
                    className="px-3.5 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 hover:to-teal-200 active:scale-95 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/20"
                  >
                    <Sparkles className="w-4 h-4 stroke-[2.5]" />
                    <span>Học từ ghép mở rộng ({expansionCompounds.length})</span>
                  </button>
                )}
              </>
            ) : (
              <>
                {selectedListId !== 'all_single' && detectedCompounds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onStartSession('compound_words', selectedListId || undefined)}
                    className="px-3.5 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-yellow-300 hover:from-amber-300 hover:to-yellow-200 active:scale-95 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-amber-500/20"
                  >
                    <Combine className="w-4 h-4 stroke-[2.5]" />
                    <span>Từ ghép gợi ý ({detectedCompounds.length})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onStartSession('quick_flashcard', selectedListId || undefined)}
                  className="px-3.5 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-cyan-400 to-sky-300 hover:from-cyan-300 hover:to-sky-200 active:scale-95 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-cyan-500/20"
                >
                  <Zap className="w-4 h-4 stroke-[2.5]" />
                  <span>Học Flashcard</span>
                </button>

                <button
                  type="button"
                  onClick={() => onStartSession('random_test', selectedListId || undefined)}
                  className="px-3.5 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 hover:to-teal-200 active:scale-95 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/20"
                >
                  <Target className="w-4 h-4 stroke-[2.5]" />
                  <span>Kiểm tra Quiz</span>
                </button>

                <button
                  type="button"
                  onClick={() => onStartSession('sentence_cloze', selectedListId || undefined)}
                  className="px-3.5 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-violet-400 to-purple-300 hover:from-violet-300 hover:to-purple-200 active:scale-95 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-violet-500/20"
                >
                  <FileQuestion className="w-4 h-4 stroke-[2.5]" />
                  <span>Điền khuyết câu</span>
                </button>

                <button
                  type="button"
                  onClick={() => onStartSession('smart_daily', selectedListId || undefined)}
                  className="px-3.5 py-2 text-xs font-semibold text-emerald-300 bg-slate-900 hover:bg-slate-800 border border-emerald-500/40 active:scale-95 rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Sparkles className="w-4 h-4 text-emerald-400 fill-emerald-400" />
                  <span>Ôn SRS</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Tìm theo chữ Hán, Pinyin, Hán Việt hoặc Nghĩa..."
          className="w-full text-xs pl-10 pr-4 py-2.5 bg-slate-900/90 text-slate-100 border border-slate-800 rounded-xl focus:outline-hidden focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20 placeholder:text-slate-500 transition"
        />
      </div>

      {/* Cards Grid */}
      {selectedListId === 'all_compound' ? (
        <div className="space-y-4">
          {filteredCompoundList.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
              <Combine className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-300">Không tìm thấy từ ghép phù hợp</p>
              <p className="text-xs text-slate-500 pt-1">
                {compoundSubFilter === 'compound_review'
                  ? 'Hãy thêm các cặp chữ đơn liên quan vào bộ từ vựng để hệ thống tự ghép từ ôn tập 100%!'
                  : 'Hãy thêm chữ đơn vào từ vựng để hệ thống phát hiện và gợi ý các từ ghép mở rộng!'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCompoundList.map((dc) => (
                <div
                  key={dc.id}
                  className={`bg-slate-900/90 p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 shadow-md ${
                    dc.isFullMatch
                      ? 'border-amber-500/30 hover:border-amber-400/60 shadow-amber-500/5'
                      : 'border-emerald-500/30 hover:border-emerald-400/60 shadow-emerald-500/5'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-3xl font-serif font-bold text-slate-100">{dc.word}</span>
                          <button
                            type="button"
                            onClick={() => speakChinese(dc.word)}
                            className="p-1 text-slate-400 hover:text-cyan-300 bg-slate-800 rounded-lg border border-slate-700 transition cursor-pointer"
                            title="Nghe phát âm"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 pt-0.5">
                          <span className="text-xs font-mono font-bold text-cyan-400">{dc.pinyin}</span>
                          {dc.hanViet && (
                            <span className="text-[11px] font-bold text-teal-300 uppercase">[{dc.hanViet}]</span>
                          )}
                        </div>
                      </div>

                      {dc.isFullMatch ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 shrink-0">
                          <CheckCircle2 className="w-3 h-3 text-amber-400" />
                          100% Đã học
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shrink-0">
                          <Sparkles className="w-3 h-3 text-emerald-400" />
                          {dc.matchPercentage}% Đã biết
                        </span>
                      )}
                    </div>

                    <p className="text-xs font-medium text-slate-200 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                      {dc.meaning}
                    </p>

                    {/* Breakdown */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Các chữ đơn cấu thành:</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {dc.constituents.map((c, idx) => (
                          <React.Fragment key={idx}>
                            {idx > 0 && <span className="text-slate-600 font-bold text-xs">+</span>}
                            {c.inVocabulary ? (
                              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                                <span className="font-serif text-sm">{c.char}</span>
                                {c.meaning && <span className="text-[10px] opacity-80 font-normal">({c.meaning})</span>}
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-950/80 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                                <span className="font-serif text-sm">{c.char}</span>
                                <span className="text-[9px] font-mono text-amber-200 bg-amber-900/60 px-1 rounded">Chữ mới</span>
                              </span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>

                    {/* Example sentence if available */}
                    {dc.exampleSentence && (
                      <div className="p-2 bg-slate-950/50 rounded-xl border border-slate-800/80 text-[11px] space-y-0.5">
                        <p className="font-serif font-bold text-slate-200">{dc.exampleSentence.sentence}</p>
                        <p className="text-[10px] font-mono text-cyan-400">{dc.exampleSentence.pinyin}</p>
                        <p className="text-[10px] text-slate-400">{dc.exampleSentence.meaning}</p>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    {dc.isInUserList ? (
                      <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/30">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        Đã trong từ vựng
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSaveDetectedCompound(dc)}
                        className="px-3 py-1.5 text-xs font-bold text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 hover:to-teal-200 rounded-xl transition cursor-pointer flex items-center gap-1 shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[3]" />
                        <span>Lưu vào từ vựng</span>
                      </button>
                    )}

                    {onStartSession && (
                      <button
                        type="button"
                        onClick={() => onStartSession(dc.isFullMatch ? 'compound_words' : 'compound_expansion', undefined)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1 ${
                          dc.isFullMatch
                            ? 'text-slate-950 bg-amber-400 hover:bg-amber-300'
                            : 'text-slate-950 bg-emerald-400 hover:bg-emerald-300'
                        }`}
                      >
                        <span>{dc.isFullMatch ? 'Ôn bài này' : 'Học từ này'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCharacters.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
              <BookOpen className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-300">Chưa có chữ Hán nào phù hợp</p>
              <p className="text-xs text-slate-500 pt-1">Thử thay đổi bộ lọc hoặc thêm chữ Hán mới vào bộ vựng.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
              {filteredCharacters.map((char) => (
                <div
                  key={char.id}
                  onClick={() => onSelectCharacter(char)}
                  className="group bg-slate-900/80 p-3.5 rounded-2xl border border-slate-800/80 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/10 transition-all cursor-pointer relative flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                    <span className="font-mono bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-300">
                      {char.hanzi.length > 1 ? `${char.strokeCount || 2} nét` : char.radical}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`font-semibold font-mono ${
                          char.srs.masteryLevel >= 80
                            ? 'text-emerald-400'
                            : char.srs.masteryLevel >= 40
                            ? 'text-cyan-400'
                            : 'text-slate-500'
                        }`}
                      >
                        {char.srs.masteryLevel}%
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteCharacter(e, char)}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 active:scale-95 transition cursor-pointer z-10"
                        title="Xóa chữ này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="text-center py-1">
                    {char.hanzi.length > 1 && (
                      <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 mb-1.5 shadow-xs">
                        {char.radical === 'Từ ghép mở rộng' ? 'Từ ghép mở rộng' : 'Từ ghép ôn tập'}
                      </span>
                    )}
                    <div className={`font-serif font-bold text-slate-100 group-hover:text-emerald-300 group-hover:scale-105 transition-all ${char.hanzi.length > 2 ? 'text-2xl' : 'text-3xl'}`}>
                      {char.hanzi}
                    </div>
                    <div className="text-xs font-mono text-cyan-400 font-medium pt-0.5">
                      {char.pinyin}
                    </div>
                    <div className="text-[11px] font-semibold text-teal-300 uppercase pt-0.5">
                      {char.hanViet}
                    </div>
                  </div>

                  <div className="text-xs text-slate-400 text-center line-clamp-1 pt-1.5 border-t border-slate-800/60 mt-2">
                    {char.meaning}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}


      {/* Modal: Create New Word List */}
      {showAddListModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-800 p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <ListPlus className="w-5 h-5 text-cyan-400" />
              Tạo danh sách từ vựng mới
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Tên danh sách</label>

                <input
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="Ví dụ: Từ trong anime, Từ trong giáo trình..."
                  className="w-full p-2.5 bg-slate-950 text-slate-100 border border-slate-800 rounded-xl focus:outline-hidden focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Mô tả ngắn</label>
                <input
                  type="text"
                  value={newListDesc}
                  onChange={(e) => setNewListDesc(e.target.value)}
                  placeholder="Mục đích học tập của danh sách này..."
                  className="w-full p-2.5 bg-slate-950 text-slate-100 border border-slate-800 rounded-xl focus:outline-hidden focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddListModal(false)}
                className="px-3.5 py-2 text-xs text-slate-400 hover:bg-slate-800 rounded-xl"
              >
                Hủy
              </button>
              <button
                onClick={handleCreateList}
                disabled={!newListName.trim()}
                className="px-4 py-2 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl disabled:opacity-50 cursor-pointer"
              >
                Tạo danh sách
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Batch Add Words */}
      {showAddWordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                Thêm chữ Hán mới (Nhập đơn hoặc Hàng loạt)
              </h3>
              <button
                onClick={() => setShowAddWordModal(false)}
                className="text-slate-500 hover:text-slate-300 text-xs font-mono cursor-pointer"
              >
                [Đóng]
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Chọn danh sách lưu trữ</label>
                <select
                  value={targetListIdForAdd}
                  onChange={(e) => setTargetListIdForAdd(e.target.value)}
                  className="w-full p-2.5 bg-slate-950 text-slate-100 border border-slate-800 rounded-xl focus:outline-hidden focus:border-cyan-500"
                >
                  {wordLists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Nhập hoặc Dán các chữ Hán muốn học:
                </label>
                <textarea
                  value={batchInputText}
                  onChange={(e) => setBatchInputText(e.target.value)}
                  placeholder="Dán chữ Hán tùy ý vào đây, ví dụ:&#10;学 喜欢 电脑 老师 工作..."
                  rows={4}
                  className="w-full p-3 bg-slate-950 text-slate-100 border border-slate-800 rounded-xl font-serif text-lg focus:outline-hidden focus:border-cyan-500"
                />
                <p className="text-[11px] text-slate-400 pt-1">
                  💡 AI sẽ tự động tra cứu Pinyin, Hán Việt, Bộ thủ, Nghĩa Việt, Mẹo nhớ và Ví dụ cho từng chữ.
                </p>
              </div>

              {addStatusMessage && (
                <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs text-slate-200 flex items-center gap-2">
                  {isProcessingAdd ? (
                    <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  )}
                  <span>{addStatusMessage}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddWordModal(false)}
                disabled={isProcessingAdd}
                className="px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 rounded-xl"
              >
                Hủy
              </button>
              <button
                onClick={handleBatchAddCharacters}
                disabled={isProcessingAdd || !batchInputText.trim()}
                className="px-4 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 hover:to-teal-200 rounded-xl disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-500/20"
              >
                {isProcessingAdd ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang tự động bổ sung AI...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                    <span>Lưu & Tự bổ sung AI</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Character Confirmation Modal */}
      {deletingChar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl border border-slate-800 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/30">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">Xác nhận xóa chữ Hán</h3>
                <p className="text-xs text-slate-400 pt-0.5">
                  Bạn có chắc muốn xóa chữ{' '}
                  <span className="font-bold text-emerald-300 font-serif">{deletingChar.hanzi}</span> ({deletingChar.pinyin}) khỏi hệ thống không?
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeletingChar(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-xs cursor-pointer"
              >
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export & Copy Vocabulary Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-800 p-6 space-y-5 text-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 text-cyan-300 flex items-center justify-center border border-cyan-500/30">
                  <Download className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Xuất & Sao Chép Từ Vựng</h3>
                  <p className="text-xs text-slate-400">Tải file Excel/CSV, JSON, TXT hoặc copy vào bộ nhớ tạm</p>
                </div>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-slate-400 hover:text-slate-200 text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Scope Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block">1. Chọn phạm vi từ vựng muốn xuất:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setExportScope('current')}
                  className={`p-3 text-left rounded-xl border text-xs transition cursor-pointer ${
                    exportScope === 'current'
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 font-bold'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="block font-semibold">Danh sách đang chọn</span>
                  <span className="text-[11px] opacity-75">
                    {activeList ? activeList.name : 'Tất cả'} ({filteredCharacters.length} chữ)
                  </span>
                </button>

                <button
                  onClick={() => setExportScope('all')}
                  className={`p-3 text-left rounded-xl border text-xs transition cursor-pointer ${
                    exportScope === 'all'
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 font-bold'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="block font-semibold">Toàn bộ kho từ vựng</span>
                  <span className="text-[11px] opacity-75">Tất cả danh sách ({characters.length} chữ)</span>
                </button>
              </div>
            </div>

            {/* Download File Options */}
            <div className="space-y-2 pt-1">
              <label className="text-xs font-bold text-slate-300 block">2. Tải về dưới dạng File (Tự động chia đúng cột):</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  onClick={handleDownloadExcel}
                  className="p-3 bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-500/50 rounded-xl text-center space-y-1 group transition cursor-pointer"
                >
                  <FileSpreadsheet className="w-5 h-5 text-emerald-400 mx-auto group-hover:scale-110 transition-transform" />
                  <span className="block text-xs font-bold text-emerald-300">File Excel (.xls)</span>
                  <span className="block text-[10px] text-emerald-200/80">Khuyên dùng cho Excel</span>
                </button>

                <button
                  onClick={() => handleDownloadCSV(',')}
                  className="p-3 bg-slate-950/80 hover:bg-slate-800/80 border border-cyan-500/30 hover:border-cyan-500/60 rounded-xl text-center space-y-1 group transition cursor-pointer"
                >
                  <FileSpreadsheet className="w-5 h-5 text-cyan-400 mx-auto group-hover:scale-110 transition-transform" />
                  <span className="block text-xs font-bold text-cyan-300">File CSV (Dấu ',')</span>
                  <span className="block text-[10px] text-slate-400">Google Sheets / Anki</span>
                </button>

                <button
                  onClick={() => handleDownloadCSV(';')}
                  className="p-3 bg-slate-950/80 hover:bg-slate-800/80 border border-teal-500/30 hover:border-teal-500/60 rounded-xl text-center space-y-1 group transition cursor-pointer"
                >
                  <FileSpreadsheet className="w-5 h-5 text-teal-400 mx-auto group-hover:scale-110 transition-transform" />
                  <span className="block text-xs font-bold text-teal-300">File CSV (Dấu ';')</span>
                  <span className="block text-[10px] text-slate-400">Excel Tiếng Việt</span>
                </button>

                <button
                  onClick={handleDownloadTXT}
                  className="p-3 bg-slate-950/80 hover:bg-slate-800/80 border border-slate-700 hover:border-slate-500 rounded-xl text-center space-y-1 group transition cursor-pointer"
                >
                  <FileText className="w-5 h-5 text-slate-300 mx-auto group-hover:scale-110 transition-transform" />
                  <span className="block text-xs font-bold text-slate-200">File Văn Bản TXT</span>
                  <span className="block text-[10px] text-slate-400">Ghi chú, in ấn</span>
                </button>
              </div>
            </div>

            {/* Copy to Clipboard Options */}
            <div className="space-y-3 pt-2 border-t border-slate-800/80">
              <label className="text-xs font-bold text-slate-300 block">3. Hoặc Sao Chép Nhanh Vào Bộ Nhớ Tạm:</label>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setCopyFormat('simple')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border cursor-pointer ${
                    copyFormat === 'simple'
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-bold'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  Chỉ chữ Hán
                </button>
                <button
                  onClick={() => setCopyFormat('detailed')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border cursor-pointer ${
                    copyFormat === 'detailed'
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-bold'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  Đầy đủ (Hán + Pinyin + Nghĩa)
                </button>
                <button
                  onClick={() => setCopyFormat('tsv')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border cursor-pointer ${
                    copyFormat === 'tsv'
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-bold'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  Bảng Excel (Tab)
                </button>
              </div>

              <button
                onClick={handleCopyVocabulary}
                className="w-full py-2.5 px-4 text-xs font-bold text-slate-950 bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300 hover:from-emerald-300 hover:to-cyan-200 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-emerald-500/20 active:scale-95"
              >
                {copiedSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-slate-950 stroke-[3]" />
                    <span>Đã Sao Chép Vào Bộ Nhớ Tạm!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-950 stroke-[2.5]" />
                    <span>Sao Chép {targetExportCharacters.length} Từ Vựng</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-950 hover:bg-slate-800 rounded-xl border border-slate-800 cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
