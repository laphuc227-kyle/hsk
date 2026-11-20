import express from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { lookupBuiltIn } from './src/services/builtInDictionary.ts';
import { getHskLevelNumber } from './src/services/hskClassifier.ts';
import {
  ensureHanziStarted,
  loadSharedCacheFromDisk,
  getCachedEntry,
  upsertCachedEntry,
  upsertCachedMnemonics,
  lookupExtendedDictionary,
  lookupDictionaryNoAI,
} from './server/dictionaryService.ts';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Enable CORS for external static frontends (e.g. GitHub Pages)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Load Firebase API key from local applet config to verify incoming Firebase ID tokens cleanly
function getFirebaseWebApiKey(): string | null {
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (typeof parsed?.apiKey === 'string' && parsed.apiKey.trim()) {
        return parsed.apiKey.trim();
      }
    }
  } catch {
    // ignore
  }
  return process.env.VITE_FIREBASE_API_KEY || null;
}

const FIREBASE_WEB_API_KEY = getFirebaseWebApiKey();

// Verified Firebase token cache (token -> { uid, email, expiresAt })
const tokenVerifyCache = new Map<string, { uid: string; email?: string; expiresAt: number }>();

interface ActorIdentity {
  uid: string | null;
  actorKey: string;
  isAuthenticated: boolean;
}

async function resolveActorIdentity(req: express.Request): Promise<ActorIdentity> {
  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ') && FIREBASE_WEB_API_KEY) {
    const idToken = authHeader.slice(7).trim();
    if (idToken) {
      const cached = tokenVerifyCache.get(idToken);
      if (cached && cached.expiresAt > Date.now()) {
        return { uid: cached.uid, actorKey: `uid:${cached.uid}`, isAuthenticated: true };
      }

      try {
        const resp = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          }
        );
        if (resp.ok) {
          const data: any = await resp.json();
          const user = data?.users?.[0];
          if (user?.localId) {
            tokenVerifyCache.set(idToken, {
              uid: user.localId,
              email: user.email,
              expiresAt: Date.now() + 5 * 60 * 1000,
            });
            // Prune stale cache if too large
            if (tokenVerifyCache.size > 500) {
              const now = Date.now();
              for (const [k, v] of tokenVerifyCache.entries()) {
                if (v.expiresAt <= now) tokenVerifyCache.delete(k);
              }
            }
            return { uid: user.localId, actorKey: `uid:${user.localId}`, isAuthenticated: true };
          }
        }
      } catch (err) {
        console.warn('[Auth] Token lookup failed, falling back to IP rate limit:', err);
      }
    }
  }

  return { uid: null, actorKey: `ip:${clientIp}`, isAuthenticated: false };
}

// Burst + Daily AI Quota Tracking (authenticated users only; only counted when Gemini AI is invoked)
const DAILY_ENRICH_LIMIT_AUTH = 150;
const DAILY_MNEMONIC_LIMIT_AUTH = 40;
const BURST_WINDOW_MS = 60 * 1000;
const BURST_MAX_CALLS = 25;

interface UsageBucket {
  date: string;
  enrichChars: number;
  mnemonicCalls: number;
  burstTimestamps: number[];
}

const actorUsageMap = new Map<string, UsageBucket>();

function getUsageBucket(actorKey: string): UsageBucket {
  const today = new Date().toISOString().split('T')[0];
  let bucket = actorUsageMap.get(actorKey);
  if (!bucket || bucket.date !== today) {
    bucket = { date: today, enrichChars: 0, mnemonicCalls: 0, burstTimestamps: [] };
    actorUsageMap.set(actorKey, bucket);
  }
  return bucket;
}

function checkAndConsumeQuota(
  actor: ActorIdentity,
  type: 'enrich' | 'mnemonic',
  amount: number
): { allowed: boolean; reason?: string } {
  if (!actor.isAuthenticated) {
    return {
      allowed: false,
      reason: 'Vui lòng đăng nhập tài khoản Google để sử dụng AI tra từ mới.',
    };
  }

  const bucket = getUsageBucket(actor.actorKey);
  const now = Date.now();
  bucket.burstTimestamps = bucket.burstTimestamps.filter((ts) => now - ts < BURST_WINDOW_MS);

  if (bucket.burstTimestamps.length >= BURST_MAX_CALLS) {
    return {
      allowed: false,
      reason: 'Bạn thao tác quá nhanh, vui lòng đợi vài giây rồi thử lại.',
    };
  }

  if (type === 'enrich') {
    const limit = DAILY_ENRICH_LIMIT_AUTH;
    if (bucket.enrichChars + amount > limit) {
      return {
        allowed: false,
        reason: `Đã đạt giới hạn tra AI hôm nay (${limit} từ/ngày). Dữ liệu từ điển sẵn & cache chung vẫn dùng miễn phí!`,
      };
    }
    bucket.enrichChars += amount;
  } else {
    const limit = DAILY_MNEMONIC_LIMIT_AUTH;
    if (bucket.mnemonicCalls + amount > limit) {
      return {
        allowed: false,
        reason: `Đã đạt giới hạn tạo mẹo AI hôm nay (${limit} lượt/ngày).`,
      };
    }
    bucket.mnemonicCalls += amount;
  }

  bucket.burstTimestamps.push(now);
  return { allowed: true };
}

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

// Fallback helper across recommended fast models with ThinkingLevel.LOW
async function generateWithModelFallback(ai: GoogleGenAI, config: any, timeoutMs = 45000) {
  const models = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
  let lastError: any = null;
  for (const model of models) {
    try {
      const mergedConfig = {
        ...(config.config || {}),
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      };
      const callPromise = ai.models.generateContent({
        ...config,
        model,
        config: mergedConfig,
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

function sanitizeExamples(examples: any[]) {
  if (!Array.isArray(examples)) return [];
  return examples
    .filter((ex) => ex && typeof ex.sentence === 'string' && typeof ex.meaning === 'string')
    .map((ex: any) => ({
      sentence: ex.sentence.replace(/[a-zA-Z]+/g, '').replace(/\s+/g, '').trim(),
      pinyin:
        typeof ex.pinyin === 'string'
          ? ex.pinyin.replace(/\b(association|mnemonic|example)\b/gi, '').replace(/\s+/g, ' ').trim()
          : '',
      meaning: ex.meaning.trim(),
    }))
    .filter((ex) => ex.sentence.length > 0 && ex.meaning.length > 0);
}

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

// Pure Dictionary & Shared Cache Lookup Endpoint (0 AI calls)
app.post('/api/dictionary/lookup', (req, res) => {
  try {
    const { characters } = req.body;
    if (!characters || !Array.isArray(characters) || characters.length === 0) {
      return res.status(400).json({ error: 'Missing or invalid characters array.' });
    }

    const data: Record<string, any> = {};
    for (const rawChar of characters.slice(0, 200)) {
      if (typeof rawChar !== 'string') continue;
      const char = rawChar.trim();
      if (!char) continue;
      const result = lookupDictionaryNoAI(char);
      if (result) {
        data[char] = result;
      }
    }

    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error in /api/dictionary/lookup:', error);
    res.status(500).json({ error: error.message || 'Lookup failed' });
  }
});

// Endpoint: 3-Tier Auto-Enrich Hanzi details
// Tier 1 (HSK 1-6 built-in) -> Tier 2 (Shared cache) -> Tier 3 (Gemini + CC-CEDICT hints, then cached)
app.post('/api/gemini/enrich', async (req, res) => {
  try {
    const { characters, forceRefresh } = req.body;
    if (!characters || !Array.isArray(characters) || characters.length === 0) {
      return res.status(400).json({ error: 'Missing or invalid characters array.' });
    }

    const cleanChars = Array.from(
      new Set(
        characters
          .filter((c: any): c is string => typeof c === 'string')
          .map((c: string) => c.trim())
          .filter((c: string) => c.length > 0 && c.length <= 50)
      )
    ).slice(0, 60);

    if (cleanChars.length === 0) {
      return res.status(400).json({ error: 'No valid Hanzi strings provided.' });
    }

    const resolvedMap: Record<string, any> = {};
    const sources: Record<string, 'builtin' | 'shared_cache' | 'ai_generated' | 'cedict_extended'> = {};
    const charsNeedingAI: string[] = [];
    const extendedHints: Record<string, any> = {};

    for (const char of cleanChars) {
      if (!forceRefresh) {
        // Tier 1A: Rich Vietnamese built-in dictionary
        const builtIn = lookupBuiltIn(char);
        if (builtIn) {
          const cached = getCachedEntry(char);
          resolvedMap[char] = {
            ...builtIn,
            hskLevel: builtIn.hskLevel || getHskLevelNumber(char),
            aiMnemonics: cached?.aiMnemonics,
          };
          sources[char] = 'builtin';
          continue;
        }

        // Tier 2: Persistent shared server cache (skip any polluted English entries)
        const cached = getCachedEntry(char);
        if (
          cached &&
          cached.meaning &&
          !cached.meaning.includes('Từ vựng mới') &&
          !cached.meaning.startsWith('(EN)')
        ) {
          resolvedMap[char] = {
            hanzi: cached.hanzi,
            pinyin: cached.pinyin,
            hanViet: cached.hanViet,
            meaning: cached.meaning,
            radical: cached.radical,
            strokeCount: cached.strokeCount,
            components: cached.components || '',
            mnemonic: cached.mnemonic || '',
            hskLevel: cached.hskLevel || getHskLevelNumber(char),
            examples: cached.examples || [],
            compoundWords: cached.compoundWords || [],
            aiMnemonics: cached.aiMnemonics,
          };
          sources[char] = 'shared_cache';
          continue;
        }
      }

      // Tier 1B: Extended metadata hints (CC-CEDICT + pinyin-pro + decomposition) for AI translation context
      const ext = lookupExtendedDictionary(char);
      if (ext) {
        extendedHints[char] = ext;
      }
      charsNeedingAI.push(char);
    }

    // Fast path: 100% resolved from Tier 1 or Tier 2 shared cache (0 AI tokens used)
    if (charsNeedingAI.length === 0) {
      const data = cleanChars.map((c) => resolvedMap[c]);
      return res.json({ success: true, data, unresolvedCharacters: [], sources, aiCallsUsed: 0 });
    }

    const actor = await resolveActorIdentity(req);
    if (!actor.isAuthenticated) {
      const resolvedOnly = cleanChars.map((c) => resolvedMap[c]).filter(Boolean);
      return res.json({
        success: true,
        data: resolvedOnly,
        unresolvedCharacters: charsNeedingAI,
        authRequired: true,
        sources,
        aiCallsUsed: 0,
        quotaWarning:
          'Vui lòng đăng nhập Google để sử dụng AI tra nghĩa tiếng Việt cho các từ chưa có trong từ điển sẵn hoặc cache chung.',
      });
    }

    const quotaCheck = checkAndConsumeQuota(actor, 'enrich', charsNeedingAI.length);
    let quotaErrorMessage: string | undefined;

    let aiResults: any[] = [];
    if (!quotaCheck.allowed) {
      quotaErrorMessage = quotaCheck.reason;
    } else if (process.env.GEMINI_API_KEY) {
      try {
        const ai = getGenAI();
        const hintLines = charsNeedingAI
          .map((c) => {
            const h = extendedHints[c];
            if (!h) return `- ${c}`;
            return `- ${c} (pinyin gợi ý: ${h.pinyin || '?'}, bộ: ${h.radical || '?'}, nét: ${h.strokeCount || '?'}, ngữ nghĩa gốc cần dịch sang tiếng Việt: ${h.englishGloss || 'không có'})`;
          })
          .join('\n');

        const prompt = `Phân tích và trả về thông tin chi tiết BẰNG TIẾNG VIỆT 100% cho người Việt học các chữ/từ tiếng Trung sau (TUYỆT ĐỐI KHÔNG giữ lại tiếng Anh):
${hintLines}

Trả về JSON Array gồm các object với cấu trúc chuẩn:
- hanzi: chính xác chữ/từ trong danh sách
- pinyin: Pinyin có dấu thanh (ví dụ: xué hoặc shén me)
- hanViet: Âm Hán Việt viết hoa bằng tiếng Việt (ví dụ: HỌC, THẬP MA)
- meaning: Nghĩa tiếng Việt súc tích, tự nhiên, chuẩn xác (KHÔNG viết tiếng Anh)
- radical: Bộ thủ chính kèm tên Hán Việt (ví dụ: 子 (Tử))
- strokeCount: Tổng số nét (số nguyên)
- components: Chiết tự thành phần giải thích ngắn bằng tiếng Việt (ví dụ: ⺌ + 宀 + 子)
- mnemonic: Mẹo nhớ ngắn gọn, sinh động bằng tiếng Việt
- examples: 2 câu ví dụ ngắn (sentence: CHỈ GỒM CHỮ HÁN VÀ DẤU CÂU TIẾNG TRUNG; pinyin: có dấu thanh; meaning: nghĩa tiếng Việt)
- compoundWords: 2-3 từ ghép phổ biến (word, pinyin, meaning tiếng Việt)`;

        const response = await generateWithModelFallback(
          ai,
          {
            contents: prompt,
            config: {
              systemInstruction:
                'Bạn là từ điển Hán - Việt - Trung chuyên nghiệp dành riêng cho người Việt. BẮT BUỘC toàn bộ các trường meaning, hanViet, radical, components, mnemonic, examples[].meaning và compoundWords[].meaning phải viết hoàn toàn bằng TIẾNG VIỆT tự nhiên có dấu. TUYỆT ĐỐI KHÔNG trả về tiếng Anh ở bất kỳ trường nào.',
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
          },
          45000
        );

        const resultText = response.text;
        if (resultText) {
          let cleaned = resultText.trim();
          if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
          }
          const rawData = JSON.parse(cleaned);
          if (Array.isArray(rawData)) {
            aiResults = rawData;
          } else if (rawData && typeof rawData === 'object') {
            if (Array.isArray(rawData.characters)) aiResults = rawData.characters;
            else if (Array.isArray(rawData.data)) aiResults = rawData.data;
            else if (rawData.hanzi) aiResults = [rawData];
          }
        }
      } catch (aiError) {
        console.warn('Gemini Tier 3 enrich failed, falling back to Tier 1B CC-CEDICT:', aiError);
      }
    }

    let aiCallsUsed = 0;
    const unresolvedCharacters: string[] = [];

    // Build final results & save AI-generated entries back into Tier 2 shared cache
    const finalData = cleanChars
      .map((char) => {
        if (resolvedMap[char]) {
          return resolvedMap[char];
        }

        const foundInAi =
          aiResults.find((d) => d?.hanzi?.trim() === char) ||
          aiResults.find((d) => d?.hanzi?.replace(/\s+/g, '') === char) ||
          (charsNeedingAI.length === 1 && aiResults.length === 1 ? aiResults[0] : undefined);
        const ext = extendedHints[char];
        const dict = lookupBuiltIn(char);
        const existingCache = getCachedEntry(char);

        if (foundInAi && foundInAi.meaning && !String(foundInAi.meaning).startsWith('(EN)')) {
          aiCallsUsed++;
          const safeCompounds = Array.isArray(foundInAi.compoundWords) && foundInAi.compoundWords.length > 0
            ? foundInAi.compoundWords
            : ext?.compoundWords || dict?.compoundWords || [];

          const entryObj = {
            hanzi: char,
            pinyin: foundInAi.pinyin || ext?.pinyin || dict?.pinyin || 'chưa rõ',
            hanViet: foundInAi.hanViet || dict?.hanViet || 'CHƯA RÕ',
            meaning: foundInAi.meaning || dict?.meaning || 'Chưa có nghĩa',
            radical: foundInAi.radical || ext?.radical || dict?.radical || 'Bộ thủ',
            strokeCount: Number(foundInAi.strokeCount) || ext?.strokeCount || dict?.strokeCount || 1,
            components: foundInAi.components || ext?.components || dict?.components || '',
            mnemonic: foundInAi.mnemonic || dict?.mnemonic || '',
            hskLevel: dict?.hskLevel || ext?.hskLevel || getHskLevelNumber(char),
            examples:
              Array.isArray(foundInAi.examples) && foundInAi.examples.length > 0
                ? sanitizeExamples(foundInAi.examples)
                : dict?.examples || [],
            compoundWords: safeCompounds,
            aiMnemonics: existingCache?.aiMnemonics,
          };

          // Persist into server Tier 2 shared cache for future users
          upsertCachedEntry({
            ...entryObj,
            source: 'ai_cached',
            createdBy: actor.uid || 'server_ai',
          });
          sources[char] = 'ai_generated';
          return entryObj;
        }

        if (dict) {
          sources[char] = 'builtin';
          return { ...dict };
        }

        // Do NOT return raw English CC-CEDICT text as Vietnamese vocabulary meaning
        unresolvedCharacters.push(char);
        return null;
      })
      .filter(Boolean);

    res.json({
      success: true,
      data: finalData,
      unresolvedCharacters,
      sources,
      aiCallsUsed,
      quotaWarning: quotaErrorMessage,
    });
  } catch (error: any) {
    console.error('Error in /api/gemini/enrich:', error);
    res.status(500).json({ error: error.message || 'Error processing request' });
  }
});

// Endpoint: Generate or retrieve cached AI Mnemonic stories for a character
app.post('/api/gemini/mnemonic', async (req, res) => {
  try {
    const { hanzi, meaning, radical, components, forceRefresh } = req.body;
    const cleanHanzi = typeof hanzi === 'string' ? hanzi.trim() : '';
    if (!cleanHanzi) {
      return res.status(400).json({ error: 'Hanzi is required' });
    }

    // 1. Check Tier 2 shared server cache first unless explicit forceRefresh
    if (!forceRefresh) {
      const cached = getCachedEntry(cleanHanzi);
      if (cached && Array.isArray(cached.aiMnemonics) && cached.aiMnemonics.length > 0) {
        return res.json({
          success: true,
          data: cached.aiMnemonics,
          fromCache: true,
        });
      }
    }

    // 2. Require Google Sign-In + enforce daily quota before invoking Gemini AI
    const actor = await resolveActorIdentity(req);
    if (!actor.isAuthenticated) {
      return res.status(401).json({
        success: false,
        requireAuth: true,
        error: 'Vui lòng đăng nhập tài khoản Google để gọi AI tạo mẹo nhớ mới.',
      });
    }

    const quota = checkAndConsumeQuota(actor, 'mnemonic', 1);
    if (!quota.allowed) {
      return res.status(429).json({
        success: false,
        error: quota.reason || 'Bạn đã dùng hết lượt tạo mẹo AI hôm nay.',
      });
    }

    const ai = getGenAI();
    const prompt = `Tạo 2 mẹo nhớ (Mnemonic) cực kỳ sinh động, hài hước hoặc có tính liên tưởng thị giác cao cho chữ Hán: "${cleanHanzi}".
Nghĩa: ${meaning || 'chưa rõ'}
Bộ thủ: ${radical || 'chưa rõ'}
Thành phần: ${components || 'chưa rõ'}

Hãy đưa ra 2 phong cách mẹo nhớ:
1. Phong cách Chiết tự Tượng hình (Logic truyền thống)
2. Phong cách Hài hước / Hiện đại / Câu chuyện dễ thuộc`;

    const response = await generateWithModelFallback(ai, {
      contents: prompt,
      config: {
        systemInstruction:
          'Bắt buộc viết toàn bộ style, story và breakdown 100% bằng TIẾNG VIỆT tự nhiên có dấu, không dùng tiếng Anh. Trả về định dạng JSON thuần chứa mảng 2 mẹo nhớ.',
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

    let rawText = (response.text || '[]').trim();
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }
    const parsed = JSON.parse(rawText);
    const data = Array.isArray(parsed)
      ? parsed.filter((m: any) => m && typeof m.style === 'string' && typeof m.story === 'string')
      : [];

    if (data.length > 0) {
      upsertCachedMnemonics(
        cleanHanzi,
        { meaning, radical, components },
        data,
        actor.uid || 'server_ai'
      );
    }

    res.json({ success: true, data, fromCache: false });
  } catch (error: any) {
    console.error('Error in /api/gemini/mnemonic:', error);
    res.status(500).json({ error: error.message || 'Error generating mnemonic' });
  }
});

async function startServer() {
  // Initialize dictionary cache & hanzi CC-CEDICT engine eagerly in background
  loadSharedCacheFromDisk();
  setTimeout(() => ensureHanziStarted(), 50);

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
