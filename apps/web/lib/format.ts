export function dateLabel(date: string) {
  return new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Ulaanbaatar' }).format(new Date(date));
}

export function bytesLabel(value: string | number) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4);
  return `${(bytes / 1024 ** unit).toFixed(1)} ${['B', 'KB', 'MB', 'GB', 'TB'][unit]}`;
}

export function durationLabel(ms: number | null) {
  if (ms === null) return '—';
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 3600).toString().padStart(2, '0')}:${Math.floor(total / 60 % 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

export function languageLabel(id: string | null) {
  return id ? ({ en: 'English', 'zh-CN': 'Simplified Chinese', 'zh-TW': 'Traditional Chinese' }[id] || id) : 'Not declared';
}
