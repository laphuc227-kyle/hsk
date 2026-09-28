import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { lookupBuiltIn, BUILT_IN_DICTIONARY } from './src/services/builtInDictionary';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Lazy getter for GoogleGenAI to ensure GEMINI_API_KEY is retrieved dynamically
function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Fallback helper across stable models without restrictive short timeout (allows AI to finish generating full details)
async function generateWithModelFallback(ai: GoogleGenAI, config: any, timeoutMs = 60000) {
  const models = ['gemini-3.8-flash', 'gemini-2.5-flash'];
  let lastError: any = null;
  for (const model of models) {
    try {
      const callPromise = ai.models.generateContent({
        ...config,
        model,
      });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms on model ${model}`)), timeoutMs)
      );
      const response = (await Promise.race([callPromise, timeoutPromise])) as any;
      return response;
    } catch (err: any) {
      lastError = err;
      console.warn(`Model ${model} failed or timed out:`, err?.message || err);
    }
  }
  throw lastError;
}

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Endpoint: Auto-enrich Hanzi details (Pinyin, Nghĩa Việt, Âm Hán Việt, Bộ thủ, Số nét, Cấu tạo, Ví dụ, Từ ghép, Mẹo nhớ)
app.post('/api/gemini/enrich', async (req, res) => {
  try {
    const { characters } = req.body;
    if (!characters || !Array.isArray(characters) || characters.length === 0) {
      return res.status(400).json({ error: 'Missing or invalid characters array.' });
    }

    // 1. Separate characters that already exist in builtInDictionary from those that need AI analysis
    const builtInResults: Record<string, any> = {};
    const charsNeedingAI: string[] = [];

    for (const char of characters) {
      const dictMatch = lookupBuiltIn(char);
      if (dictMatch) {
        builtInResults[char] = { ...dictMatch };
      } else {
        charsNeedingAI.push(char);
      }
    }

    // Fast path: if all requested characters are available in built-in dictionary, return immediately!
    if (charsNeedingAI.length === 0) {
      const data = characters.map((c) => ({ ...builtInResults[c] }));
      return res.json({ success: true, data });
    }

    const ai = getGenAI();
    const prompt = `Phân tích và trả về thông tin chi tiết đầy đủ cho các chữ Hán hoặc từ vựng tiếng Trung sau đây để người Việt Nam học dễ nhớ nhất:
Các từ/chữ cần phân tích: ${charsNeedingAI.join(', ')}

Trả về định dạng JSON là một mảng danh sách đối tượng (Array of objects) với cấu trúc chuẩn:
- hanzi: Chữ Hán hoặc từ vựng Hán (chính xác từng chữ/từ trong danh sách: ${charsNeedingAI.join(', ')})
- pinyin: Phiên âm Pinyin kèm dấu thanh (ví dụ: xué hoặc liǎng)
- hanViet: Âm Hán Việt (ví dụ: HỌC hoặc LƯỠNG)
- meaning: Nghĩa tiếng Việt ngắn gọn, rõ nghĩa nhất (ví dụ: Học, nghiên cứu hoặc Hai, đôi)
- radical: Bộ thủ chính (ví dụ: 子 Tử hoặc 一 Nhất)
- strokeCount: Số nét (số nguyên)
- components: Các thành phần cấu tạo chữ (ví dụ: ⺌ + 宀 + 子)
- mnemonic: Mẹo nhớ chữ Hán thông minh, dễ tưởng tượng dựa trên hình tượng/bộ thủ (viết bằng tiếng Việt)
- examples: Mảng 2-3 câu ví dụ thực tế (mỗi object có: sentence: câu chữ Hán tự nhiên chuẩn xác - TUYỆT ĐỐI CHỈ GỒM CHỮ HÁN VÀ DẤU CÂU TIẾNG TRUNG, KHÔNG CHỨA BẤT KỲ TỪ TIẾNG ANH HAY TIẾNG VIỆT NÀO, pinyin: pinyin có dấu thanh điệu, meaning: nghĩa tiếng Việt chuẩn xác)
- compoundWords: Mảng 2-4 từ ghép phổ biến chứa chữ này (mỗi object có: word: chữ Hán từ ghép, pinyin: pinyin, meaning: nghĩa tiếng Việt)`;

    let data: any[] = [];
    try {
      const response = await generateWithModelFallback(ai, {
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                hanzi: { type: Type.STRING },
                pinyin: { type: Type.STRING },
                hanViet: { type: Type.STRING },
                meaning: { type: Type.STRING },
                radical: { type: Type.STRING },
                strokeCount: { type: Type.INTEGER },
                components: { type: Type.STRING },
                mnemonic: { type: Type.STRING },
                examples: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      sentence: { type: Type.STRING },
                      pinyin: { type: Type.STRING },
                      meaning: { type: Type.STRING },
                    },
                    required: ['sentence', 'pinyin', 'meaning'],
                  },
                },
                compoundWords: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      word: { type: Type.STRING },
                      pinyin: { type: Type.STRING },
                      meaning: { type: Type.STRING },
                    },
                    required: ['word', 'pinyin', 'meaning'],
                  },
                },
              },
              required: ['hanzi', 'pinyin', 'hanViet', 'meaning', 'radical', 'strokeCount', 'mnemonic'],
            },
          },
        },
      }, 60000);

      const resultText = response.text;
      if (resultText) {
        let cleaned = resultText.trim();
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        }
        try {
          const rawData = JSON.parse(cleaned);
          if (Array.isArray(rawData)) {
            data = rawData;
          } else if (rawData && typeof rawData === 'object') {
            if (Array.isArray(rawData.characters)) {
              data = rawData.characters;
            } else if (Array.isArray(rawData.data)) {
              data = rawData.data;
            } else if (rawData.hanzi) {
              data = [rawData];
            }
          }
        } catch (parseErr) {
          console.warn('JSON parse error from Gemini enrich:', parseErr, resultText);
        }
      }
    } catch (aiError) {
      console.warn('Gemini API enrich failed, checking built-in dictionary and fallbacks:', aiError);
    }

    // Merge or fill with built-in dictionary for any missing characters
    const finalData = characters.map((char) => {
      const foundInAi = data.find((d) => d.hanzi?.trim() === char.trim());
      const dict = builtInResults[char] || lookupBuiltIn(char);

      if (foundInAi) {
        return {
          ...foundInAi,
          hanzi: char,
          pinyin: foundInAi.pinyin || dict?.pinyin || 'chưa rõ',
          hanViet: foundInAi.hanViet || dict?.hanViet || 'CHƯA RÕ',
          meaning: foundInAi.meaning || dict?.meaning || 'Chưa có nghĩa',
          radical: foundInAi.radical || dict?.radical || 'Bộ',
          strokeCount: Number(foundInAi.strokeCount) || dict?.strokeCount || 1,
          components: foundInAi.components || dict?.components || '',
          mnemonic: foundInAi.mnemonic || dict?.mnemonic || '',
          examples: (Array.isArray(foundInAi.examples) && foundInAi.examples.length > 0)
            ? foundInAi.examples.map((ex: any) => ({
                ...ex,
                sentence: typeof ex.sentence === 'string'
                  ? ex.sentence.replace(/[a-zA-Z]+/g, '').replace(/\s+/g, '').trim()
                  : ex.sentence,
                pinyin: typeof ex.pinyin === 'string'
                  ? ex.pinyin.replace(/\b(association|mnemonic|example)\b/gi, '').replace(/\s+/g, ' ').trim()
                  : ex.pinyin,
              }))
            : (dict?.examples || []),
          compoundWords: (Array.isArray(foundInAi.compoundWords) && foundInAi.compoundWords.length > 0)
            ? foundInAi.compoundWords
            : (dict?.compoundWords || []),
        };
      }

      if (dict) {
        return { ...dict };
      }

      // Safe fallback for unlisted characters when AI is temporarily unavailable
      return {
        hanzi: char,
        pinyin: 'chưa rõ',
        hanViet: 'CHƯA RÕ',
        meaning: 'Từ vựng mới (Cần kết nối AI để bổ sung)',
        radical: 'Bộ thủ',
        strokeCount: 1,
        components: '',
        mnemonic: '',
        examples: [],
        compoundWords: [],
      };
    });

    res.json({ success: true, data: finalData });
  } catch (error: any) {
    console.error('Error in /api/gemini/enrich:', error);
    res.status(500).json({ error: error.message || 'Error processing request' });
  }
});

// Endpoint: AI Gia Sư Chữ Hán (Interactive Tutor)
app.post('/api/gemini/tutor', async (req, res) => {
  try {
    const { prompt, contextHanzi, history } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const ai = getGenAI();
    const systemInstruction = `Bạn là Gia Sư Chữ Hán AI uyên bác, thân thiện, súc tích và cực kỳ giỏi về Khoa học ghi nhớ (Cognitive Science).
Nhiệm vụ của bạn:
1. Giải thích sâu về nguồn gốc chữ Hán (chiết tự, tượng hình, hội ý, hình thanh).
2. Giúp phân biệt các chữ dễ nhầm lẫn (ví dụ 拔 vs 拨, 已 vs 己 vs 巳).
3. Đặt câu ví dụ tự nhiên theo trình độ người học.
4. Trả lời bằng tiếng Việt ngắn gọn, trình bày Notion-like dễ nhìn, dùng markdown sạch sẽ.
${contextHanzi ? `Bối cảnh chữ Hán người dùng đang xem: "${contextHanzi}"` : ''}`;

    let contents: any = prompt;
    if (history && Array.isArray(history) && history.length > 0) {
      // Chat with fallback
      const models = ['gemini-3.8-flash', 'gemini-2.5-flash'];
      let lastErr: any = null;
      for (const m of models) {
        try {
          const chat = ai.chats.create({
            model: m,
            config: { systemInstruction },
          });
          for (const msg of history) {
            if (msg.role === 'user' || msg.role === 'model') {
              await chat.sendMessage({ message: msg.content });
            }
          }
          const response = await chat.sendMessage({ message: prompt });
          return res.json({ success: true, text: response.text });
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr;
    }

    const response = await generateWithModelFallback(ai, {
      contents,
      config: { systemInstruction },
    });

    res.json({ success: true, text: response.text });
  } catch (error: any) {
    console.error('Error in /api/gemini/tutor:', error);
    res.status(500).json({ error: error.message || 'Error in AI Tutor response' });
  }
});

// Endpoint: Generate custom Mnemonic story for a character
app.post('/api/gemini/mnemonic', async (req, res) => {
  try {
    const { hanzi, meaning, radical, components } = req.body;
    if (!hanzi) {
      return res.status(400).json({ error: 'Hanzi is required' });
    }

    const ai = getGenAI();
    const prompt = `Tạo 2 mẹo nhớ (Mnemonic) cực kỳ sinh động, hài hước hoặc có tính liên tưởng thị giác cao cho chữ Hán: "${hanzi}".
Nghĩa: ${meaning || 'chưa rõ'}
Bộ thủ: ${radical || 'chưa rõ'}
Thành phần: ${components || 'chưa rõ'}

Hãy đưa ra 2 phong cách mẹo nhớ:
1. Phong cách Chiết tự Tượng hình (Logic truyền thống)
2. Phong cách Hài hước / Hiện đại / Câu chuyện dễ thuộc`;

    const response = await generateWithModelFallback(ai, {
      contents: prompt,
      config: {
        systemInstruction: 'Trả về định dạng JSON thuần chứa mảng 2 mẹo nhớ.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              style: { type: Type.STRING, description: 'Tên phong cách' },
              story: { type: Type.STRING, description: 'Nội dung mẹo nhớ' },
              breakdown: { type: Type.STRING, description: 'Chi tiết liên tưởng' },
            },
            required: ['style', 'story'],
          },
        },
      },
    });

    const data = JSON.parse(response.text || '[]');
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error in /api/gemini/mnemonic:', error);
    res.status(500).json({ error: error.message || 'Error generating mnemonic' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Hanzi Tutor Server] Running on http://localhost:${PORT}`);
  });
}

startServer();
