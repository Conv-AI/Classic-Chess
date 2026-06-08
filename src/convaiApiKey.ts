const STORAGE_KEY = 'classic-chess.convaiApiKey.v1';

export function getEnvConvaiApiKey(): string {
  return (import.meta.env.VITE_CONVAI_API_KEY as string | undefined)?.trim() ?? '';
}

export function getStoredConvaiApiKey(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function getConvaiApiKey(): string {
  return getStoredConvaiApiKey() || getEnvConvaiApiKey();
}

export function hasConvaiApiKey(): boolean {
  return Boolean(getConvaiApiKey());
}

export function setStoredConvaiApiKey(key: string): void {
  const trimmed = key.trim();
  if (!trimmed) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, trimmed);
}

export function maskConvaiApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 4) return '••••';
  return `${key.slice(0, 2)}***`;
}
