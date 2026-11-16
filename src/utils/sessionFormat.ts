import { StudySessionMode, WordList } from '../types';

export function getStudyModeLabel(mode: StudySessionMode): string {
  switch (mode) {
    case 'smart_daily':
      return 'Hôm nay học gì (SRS)';
    case 'quick_flashcard':
      return 'Học nhanh (Flashcard)';
    case 'stroke_writing':
      return 'Luyện viết nét';
    case 'weakness':
      return 'Luyện nhớ (Chữ hay sai)';
    case 'random_test':
      return 'Kiểm tra (Quiz)';
    case 'sentence_cloze':
      return 'Điền khuyết vào câu';
    case 'compound_words':
      return 'Ôn từ ghép đã học';
    case 'compound_expansion':
      return 'Học từ ghép mở rộng';
    default:
      return 'Luyện tập từ vựng';
  }
}

export function getStudySourceLabel(listId: string | null, wordLists: WordList[]): string {
  if (!listId || listId === 'all') return 'Tất cả từ vựng';
  if (listId === 'all_single') return 'Từ đơn';
  if (listId === 'all_compound') return 'Tất cả từ ghép';
  if (listId === 'compound_review') return 'Từ ghép ôn tập (100% đã học)';
  if (listId === 'compound_expansion') return 'Từ ghép mở rộng (Chữ mới)';
  const found = wordLists.find((l) => l.id === listId);
  return found ? found.name : 'Tất cả từ vựng';
}

export function formatRelativeTimeVi(timestamp: number): string {
  const diffMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Hôm qua';
  return `${days} ngày trước`;
}
