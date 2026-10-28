import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Send, X, Bot, User, Loader2, BookOpen, HelpCircle } from 'lucide-react';
import { getApiUrl, isStaticHost } from '../services/apiClient';
import { lookupBuiltIn } from '../services/builtInDictionary';

interface AITutorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  contextHanzi?: string;
}

interface Message {
  role: 'user' | 'model';
  content: string;
}

export const AITutorDrawer: React.FC<AITutorDrawerProps> = ({
  isOpen,
  onClose,
  contextHanzi,
}) => {
  if (!isOpen) return null;

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'model',
      content: contextHanzi
        ? `Chào bạn! Tôi là Gia Sư Chữ Hán AI. Bạn có thắc mắc gì về chữ "${contextHanzi}" không? Tôi có thể phân tích bộ thủ, đặt câu ví dụ, hoặc tạo mẹo ghi nhớ cho bạn.`
        : 'Chào bạn! Tôi là Gia Sư Chữ Hán AI của bạn. Hãy hỏi tôi bất cứ điều gì về chữ Hán, bộ thủ, cấu tạo từ, hoặc cách phân biệt các chữ dễ nhầm lẫn!',
    },
  ]);
  const [loading, setLoading] = useState(false);

  const handleSend = async (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim() || loading) return;

    const userMsg: Message = { role: 'user', content: query.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    if (isStaticHost()) {
      if (contextHanzi) {
        const dict = lookupBuiltIn(contextHanzi);
        if (dict) {
          const offlineAnswer = `**Chi tiết chữ ${dict.hanzi}** (${dict.pinyin} - [${dict.hanViet}])\n\n• **Nghĩa:** ${dict.meaning}\n• **Bộ thủ:** ${dict.radical}\n• **Số nét:** ${dict.strokeCount}\n• **Cấu tạo:** ${dict.components || 'Chiết tự chuẩn'}\n• **Mẹo nhớ:** ${dict.mnemonic || 'Xem chi tiết bộ thủ'}\n\n*(Ghi chú: Trên GitHub Pages máy chủ tĩnh, hệ thống tra cứu nhanh từ từ điển tích hợp. Để trò chuyện mở rộng với Gia Sư AI, hãy mở ứng dụng trên AI Studio!)*`;
          setMessages([...updatedMessages, { role: 'model', content: offlineAnswer }]);
          setLoading(false);
          return;
        }
      }
      setMessages([
        ...updatedMessages,
        {
          role: 'model',
          content: '⚡ Bạn đang mở ứng dụng từ GitHub Pages (máy chủ tĩnh). Tính năng đàm thoại tự do với Gia Sư AI Gemini cần máy chủ bảo mật API Key nên khả dụng khi chạy trên môi trường Google AI Studio. Trên GitHub Pages, bạn vẫn có thể sử dụng đầy đủ toàn bộ tính năng tra cứu từ điển, thẻ Flashcard SRS, luyện viết chữ Hán, phát âm và đồng bộ Firebase bình thường!',
        },
      ]);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(getApiUrl('/api/gemini/tutor'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: query,
          contextHanzi,
          history: messages,
        }),
      });

      const json = await res.json();
      if (json.success && json.text) {
        setMessages([...updatedMessages, { role: 'model', content: json.text }]);
      } else {
        setMessages([
          ...updatedMessages,
          { role: 'model', content: 'Có lỗi xảy ra khi kết nối với Gia sư AI. Bạn vui lòng thử lại sau.' },
        ]);
      }
    } catch (e) {
      setMessages([
        ...updatedMessages,
        { role: 'model', content: 'Lỗi mạng hoặc server không phản hồi. Vui lòng kiểm tra lại kết nối mạng.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const samplePrompts = [
    `Giải thích chi tiết cấu tạo chữ ${contextHanzi || '学'}`,
    `Phân biệt chữ ${contextHanzi || '拔'} với chữ dễ nhầm`,
    `Tạo 3 câu ví dụ HSK có chữ ${contextHanzi || '喜欢'}`,
    `Mẹo nhớ chữ Hán qua hình ảnh tượng hình`,
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="bg-slate-900 w-full max-w-lg h-full shadow-2xl border-l border-slate-800 flex flex-col justify-between text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-tr from-emerald-500 to-cyan-500 text-slate-950 rounded-xl shadow-md shadow-emerald-500/20">
              <Sparkles className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-sm font-bold bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">
                Gia Sư Chữ Hán AI
              </h3>
              <p className="text-[11px] text-slate-400">Phân tích sâu & Giải đáp thắc mắc</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl cursor-pointer transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.2 }}
              className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'model' && (
                <div className="w-7 h-7 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/30 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[82%] p-3.5 rounded-2xl text-xs leading-relaxed whitespace-pre-line ${
                  m.role === 'user'
                    ? 'bg-gradient-to-r from-emerald-400 to-teal-300 text-slate-950 font-bold shadow-md shadow-emerald-500/10'
                    : 'bg-slate-950/80 border border-slate-800 text-slate-200'
                }`}
              >
                {m.content}
              </div>

              {m.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-slate-800 text-slate-300 border border-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </motion.div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-cyan-300 italic p-2 font-mono">
              <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
              <span>Gia Sư AI đang phân tích...</span>
            </div>
          )}
        </div>

        {/* Suggestion Chips */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60 space-y-2">
          <p className="text-[10px] text-slate-400 uppercase font-mono font-bold">Gợi ý câu hỏi nhanh:</p>
          <div className="flex flex-wrap gap-1.5">
            {samplePrompts.map((p, i) => (
              <button
                key={i}
                onClick={() => handleSend(p)}
                className="text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 px-2.5 py-1 rounded-xl border border-slate-800 hover:border-cyan-500/30 transition text-left cursor-pointer"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/90">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Hỏi Gia sư AI bất kỳ điều gì..."
              className="flex-1 text-xs p-2.5 bg-slate-900 text-slate-100 border border-slate-800 rounded-xl focus:outline-hidden focus:border-cyan-500"
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="p-2.5 bg-gradient-to-r from-emerald-400 to-teal-300 hover:from-emerald-300 hover:to-teal-200 text-slate-950 rounded-xl disabled:opacity-50 transition cursor-pointer font-bold shadow-md shadow-emerald-500/20"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
