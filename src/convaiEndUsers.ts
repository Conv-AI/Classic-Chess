import { getKnownEndUserIds } from './auth';
import { getConvaiApiKey } from './convaiApiKey';
import { debugLog } from './debugLog';

const API_BASE = 'https://api.convai.com';

function apiHeaders(): Record<string, string> {
  return {
    'CONVAI-API-KEY': getConvaiApiKey(),
    'Content-Type': 'application/json',
  };
}

function extractEndUserId(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const candidate = record.end_user_id ?? record.endUserId ?? record.id ?? record.speaker_id;
  return typeof candidate === 'string' ? candidate.trim() : '';
}

function parseEndUserIds(payload: unknown): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const add = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    ordered.push(trimmed);
  };

  if (Array.isArray(payload)) {
    for (const item of payload) add(extractEndUserId(item));
    return ordered;
  }

  if (!payload || typeof payload !== 'object') return ordered;
  const record = payload as Record<string, unknown>;

  const directList = record.end_user_ids ?? record.endUserIds ?? record.speaker_ids ?? record.speakerIds;
  if (Array.isArray(directList)) {
    for (const item of directList) add(extractEndUserId(item));
  }

  const nestedList = record.end_users ?? record.endUsers ?? record.users ?? record.speakers ?? record.data ?? record.items;
  if (Array.isArray(nestedList)) {
    for (const item of nestedList) add(extractEndUserId(item));
  }

  return ordered;
}

export function isMauLimitError(message: string): boolean {
  const normalized = message.toLowerCase();
  return /ltm speaker limit/.test(normalized)
    || /resource_exhausted/.test(normalized)
    || /mau limit/.test(normalized)
    || /monthly active user/.test(normalized);
}

export async function listEndUsers(): Promise<string[]> {
  const apiKey = getConvaiApiKey();
  if (!apiKey) return [];

  const res = await fetch(`${API_BASE}/user/end-users/list`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Convai end-user list failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const payload = await res.json();
  return parseEndUserIds(payload);
}

export async function deleteEndUser(endUserId: string): Promise<boolean> {
  const value = endUserId.trim();
  if (!value) return false;

  const apiKey = getConvaiApiKey();
  if (!apiKey) return false;

  const res = await fetch(`${API_BASE}/user/end-users/delete`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ end_user_id: value }),
  });

  if (res.ok) {
    debugLog('Convai', `Deleted end user ${value}`);
    return true;
  }

  if (res.status === 404) {
    debugLog('Convai', `End user already deleted: ${value}`);
    return true;
  }

  const text = await res.text().catch(() => '');
  debugLog('Convai', `Failed to delete end user ${value} (${res.status}): ${text.slice(0, 160)}`);
  return false;
}

export async function deleteAllEndUsers(fallbackIds: string[] = []): Promise<{ deleted: number; failed: number }> {
  let ids: string[] = [];
  try {
    ids = await listEndUsers();
  } catch (err) {
    debugLog('Convai', 'End-user list failed — using local registry fallback:', String(err));
    ids = [...new Set([...fallbackIds, ...getKnownEndUserIds()])];
  }

  if (ids.length === 0) {
    ids = [...new Set([...fallbackIds, ...getKnownEndUserIds()])];
  }

  let deleted = 0;
  let failed = 0;
  for (const endUserId of ids) {
    const ok = await deleteEndUser(endUserId);
    if (ok) deleted += 1;
    else failed += 1;
  }

  return { deleted, failed };
}
