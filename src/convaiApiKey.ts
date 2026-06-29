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
  const envKey = getEnvConvaiApiKey();
  if (envKey) return envKey;
  return getStoredConvaiApiKey();
}

export function hasConvaiApiKey(): boolean {
  return Boolean(getConvaiApiKey());
}

export function setStoredConvaiApiKey(key: string): boolean {
  const trimmed = key.trim();
  const existing = getStoredConvaiApiKey();
  if (!trimmed) {
    if (!existing) return false;
    window.localStorage.removeItem(STORAGE_KEY);
    return true;
  }
  if (trimmed === existing) return false;
  window.localStorage.setItem(STORAGE_KEY, trimmed);
  return true;
}

export function maskConvaiApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 4) return '••••';
  return `${key.slice(0, 2)}***`;
}
