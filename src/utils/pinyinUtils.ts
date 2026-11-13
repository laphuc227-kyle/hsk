// Pinyin normalization & flexible matching utility

const ACCENT_TO_TONE_MAP: Record<string, { base: string; tone: number }> = {
  ā: { base: 'a', tone: 1 }, á: { base: 'a', tone: 2 }, ǎ: { base: 'a', tone: 3 }, à: { base: 'a', tone: 4 },
  ē: { base: 'e', tone: 1 }, é: { base: 'e', tone: 2 }, ě: { base: 'e', tone: 3 }, è: { base: 'e', tone: 4 },
  ī: { base: 'i', tone: 1 }, í: { base: 'i', tone: 2 }, ǐ: { base: 'i', tone: 3 }, ì: { base: 'i', tone: 4 },
  ō: { base: 'o', tone: 1 }, ó: { base: 'o', tone: 2 }, ǒ: { base: 'o', tone: 3 }, ò: { base: 'o', tone: 4 },
  ū: { base: 'u', tone: 1 }, ú: { base: 'u', tone: 2 }, ǔ: { base: 'u', tone: 3 }, ù: { base: 'u', tone: 4 },
  ǖ: { base: 'v', tone: 1 }, ǘ: { base: 'v', tone: 2 }, ǚ: { base: 'v', tone: 3 }, ǜ: { base: 'v', tone: 4 },
  ü: { base: 'v', tone: 0 },
};

/**
 * Converts pinyin with tone accents (e.g. "nǐ", "xuéxí") to numbered format ("ni3", "xue2xi2")
 */
export function pinyinToNumbered(pinyin: string): string {
  if (!pinyin) return '';
  let text = pinyin.toLowerCase().trim().replace(/u:|ü/g, 'v');
  const syllables = text.split(/[\s,.-]+/);
  const resultSyllables: string[] = [];

  for (const syllable of syllables) {
    if (!syllable) continue;
    let baseSyllable = '';
    let foundTone = 0;

    for (const char of syllable) {
      if (ACCENT_TO_TONE_MAP[char]) {
        baseSyllable += ACCENT_TO_TONE_MAP[char].base;
        foundTone = ACCENT_TO_TONE_MAP[char].tone;
      } else {
        baseSyllable += char;
      }
    }

    const digitMatch = baseSyllable.match(/^([a-z]+)([1-5]?)$/i);
    if (digitMatch) {
      const letters = digitMatch[1];
      const existingTone = digitMatch[2] ? parseInt(digitMatch[2], 10) : 0;
      const finalTone = foundTone || existingTone;
      resultSyllables.push(finalTone > 0 ? `${letters}${finalTone}` : letters);
    } else {
      resultSyllables.push(foundTone > 0 ? `${baseSyllable}${foundTone}` : baseSyllable);
    }
  }

  return resultSyllables.join('');
}

/**
 * Removes all tone marks and numbers from pinyin (e.g. "nǐ" -> "ni", "ni3" -> "ni")
 */
export function stripPinyinTones(pinyin: string): string {
  if (!pinyin) return '';
  let text = pinyin.toLowerCase().trim().replace(/u:|ü/g, 'v');
  let clean = '';
  for (const char of text) {
    if (ACCENT_TO_TONE_MAP[char]) {
      clean += ACCENT_TO_TONE_MAP[char].base;
    } else if (!/[1-5\s,.-]/.test(char)) {
      clean += char;
    }
  }
  return clean;
}

/**
 * Checks if user typed pinyin matches target pinyin (supports accented "nǐ", numbered "ni3", or toneless "ni")
 */
export function checkPinyinAnswer(userInput: string, targetPinyin: string): boolean {
  if (!userInput || !targetPinyin) return false;

  const userClean = userInput.toLowerCase().trim().replace(/u:|ü/g, 'v').replace(/\s+/g, '');
  const targetClean = targetPinyin.toLowerCase().trim().replace(/u:|ü/g, 'v').replace(/\s+/g, '');

  // 1. Direct match (e.g. "nǐ" === "nǐ")
  if (userClean === targetClean) return true;

  // 2. Numbered match (e.g. "ni3" === "ni3")
  const userNumbered = pinyinToNumbered(userClean);
  const targetNumbered = pinyinToNumbered(targetClean);
  if (userNumbered === targetNumbered) return true;

  // 3. Toneless match (e.g. "ni" === "ni")
  const userToneless = stripPinyinTones(userClean);
  const targetToneless = stripPinyinTones(targetClean);
  if (userToneless === targetToneless) return true;

  return false;
}

const PINYIN_SYLLABLE_REGEX =
  /(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?(?:iang|iong|uang|ueng|ian|iao|ing|ong|uai|uan|ang|eng|ai|ei|ao|ou|an|en|in|un|er|ia|ie|iu|ua|uo|ue|ve|a|o|e|i|u|ü|v)(?:r(?![aeiouüvāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]))?/gi;

function normalizeAccentedToAscii(str: string): string {
  let out = '';
  for (const ch of str.toLowerCase()) {
    if (ACCENT_TO_TONE_MAP[ch]) {
      out += ACCENT_TO_TONE_MAP[ch].base;
    } else if (ch === 'ü') {
      out += 'v';
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Splits a compound word's pinyin (e.g. "xuéshēng" or "nǐ hǎo") into per-character syllables.
 * Falls back to provided single-char lookup pinyins when joined pinyin is ambiguous.
 */
export function splitCompoundPinyin(
  wordPinyin: string | undefined,
  hanziChars: string[],
  fallbackLookup?: (ch: string) => string | undefined
): string[] {
  const count = hanziChars.length;
  if (count === 0) return [];
  if (!wordPinyin || !wordPinyin.trim()) {
    return hanziChars.map((ch) => fallbackLookup?.(ch)?.split(/[/,;]/)[0]?.trim() || '');
  }

  // 1. Space / separator delimited tokens (e.g. "nǐ hǎo", "mǎi dōngxi")
  const rawTokens = wordPinyin
    .trim()
    .split(/[\s'’\-]+/)
    .filter(Boolean);

  if (rawTokens.length === count) {
    return rawTokens;
  }

  // 2. Segment each token into Mandarin syllables while preserving original tone marks
  const segmented: string[] = [];
  for (const token of rawTokens) {
    const asciiToken = normalizeAccentedToAscii(token);
    const matches = asciiToken.match(PINYIN_SYLLABLE_REGEX);
    if (matches && matches.join('').length === asciiToken.length) {
      let cursor = 0;
      const origChars = Array.from(token);
      for (const m of matches) {
        const slice = origChars.slice(cursor, cursor + m.length).join('');
        segmented.push(slice);
        cursor += m.length;
      }
    } else {
      segmented.push(token);
    }
  }

  if (segmented.length === count) {
    return segmented;
  }

  // 3. Fallback: try per-character dictionary lookup
  return hanziChars.map((ch, idx) => {
    const looked = fallbackLookup?.(ch)?.split(/[/,;]/)[0]?.trim();
    if (looked) return looked;
    return segmented[idx] || (idx === 0 ? wordPinyin : '');
  });
}

