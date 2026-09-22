// Web Speech Synthesis Audio Service for Chinese Pronunciation

export function speakChinese(text: string, rate: number = 0.85): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      console.warn('Browser does not support Web Speech Synthesis');
      resolve();
      return;
    }

    window.speechSynthesis.cancel(); // Stop current playing speech

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = rate; // Slightly slower for clear learning pronunciation
    utterance.pitch = 1.0;

    // Try to pick a Chinese voice
    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find((v) => v.lang.includes('zh') || v.lang.includes('CN'));
    if (zhVoice) {
      utterance.voice = zhVoice;
    }

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    window.speechSynthesis.speak(utterance);
  });
}
