import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Download, Upload, Trash2, X, Check, AlertTriangle, ShieldCheck } from 'lucide-react';
import { exportBackupData, importBackupData, resetAllData } from '../services/storage';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshData: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onRefreshData,
}) => {
  if (!isOpen) return null;

  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleExport = () => {
    const jsonStr = exportBackupData();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hanzi_tutor_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const result = importBackupData(content);
        setImportStatus(result.message);
        if (result.success) {
          onRefreshData();
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-800 p-6 space-y-6 text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <h3 className="text-base font-bold bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
            Cài Đặt & Sao Lưu Dữ Liệu
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200 rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          {/* Export Section */}
          <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <h4 className="font-bold text-cyan-300 flex items-center gap-1.5">
              <Download className="w-4 h-4 text-cyan-400" />
              Xuất dữ liệu dự phòng (Backup JSON)
            </h4>
            <p className="text-slate-400">
              Tải toàn bộ từ vựng, danh sách cá nhân và lịch sử học tập về máy để lưu trữ.
            </p>
            <button
              onClick={handleExport}
              className="px-3.5 py-1.5 font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition cursor-pointer shadow-md shadow-cyan-500/20"
            >
              Tải file JSON
            </button>
          </div>

          {/* Import Section */}
          <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <h4 className="font-bold text-emerald-300 flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-emerald-400" />
              Khôi phục từ file JSON
            </h4>
            <p className="text-slate-400">
              Nhập dữ liệu đã sao lưu từ trước để tiếp tục học tập.
            </p>
            <input
              type="file"
              accept=".json"
              onChange={handleImportFile}
              className="block w-full text-xs text-slate-400 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-800 file:text-emerald-300 hover:file:bg-slate-700 cursor-pointer"
            />
            {importStatus && (
              <p className="text-xs text-emerald-400 font-bold pt-1">{importStatus}</p>
            )}
          </div>

          {/* Danger Zone */}
          <div className="p-3.5 bg-rose-950/30 border border-rose-500/30 rounded-xl space-y-2">
            <h4 className="font-bold text-rose-300 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              Đặt lại dữ liệu ban đầu
            </h4>
            <p className="text-rose-200/80">
              Khôi phục danh sách từ vựng gốc và xóa tiến trình cá nhân.
            </p>
            {!showResetConfirm ? (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="px-3.5 py-1.5 font-semibold text-rose-300 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-500/40 rounded-xl transition cursor-pointer"
              >
                Đặt lại toàn bộ
              </button>
            ) : (
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => {
                    resetAllData();
                    onRefreshData();
                    onClose();
                  }}
                  className="px-3.5 py-1.5 font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition cursor-pointer shadow-md"
                >
                  Xác nhận reset
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs transition cursor-pointer"
                >
                  Hủy
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-100 rounded-xl transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
