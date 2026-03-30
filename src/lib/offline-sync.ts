import { get, set, del, keys } from "idb-keyval";

const QUEUE_PREFIX = "veloop_sync_";
const MAX_RETRIES = 3;

export interface SyncAction {
  id: string;
  table: string;
  type: "insert" | "update" | "delete";
  payload: Record<string, unknown>;
  createdAt: number;
  retries: number;
  localUpdatedAt: number; // timestamp for conflict resolution
}

export async function addToSyncQueue(
  action: Omit<SyncAction, "id" | "createdAt" | "retries" | "localUpdatedAt">
) {
  const now = Date.now();
  const entry: SyncAction = {
    ...action,
    id: `${QUEUE_PREFIX}${now}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    retries: 0,
    localUpdatedAt: now,
  };

  // Deduplicate: if same table + same record id + same type exists, replace it
  if (action.type === "update" && action.payload.id) {
    const existing = await getSyncQueue();
    const duplicate = existing.find(
      (e) =>
        e.table === action.table &&
        e.type === "update" &&
        e.payload.id === action.payload.id
    );
    if (duplicate) {
      // Merge payloads, keep latest
      entry.payload = { ...duplicate.payload, ...action.payload };
      await del(duplicate.id);
    }
  }

  await set(entry.id, entry);
  return entry;
}

export async function getSyncQueue(): Promise<SyncAction[]> {
  const allKeys = await keys();
  const syncKeys = allKeys.filter((k) => String(k).startsWith(QUEUE_PREFIX));
  const items: SyncAction[] = [];
  for (const key of syncKeys) {
    const val = await get<SyncAction>(key);
    if (val) items.push(val);
  }
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeSyncItem(id: string) {
  await del(id);
}

export async function incrementRetry(action: SyncAction): Promise<boolean> {
  const newRetries = (action.retries || 0) + 1;
  if (newRetries >= MAX_RETRIES) {
    // Max retries reached, remove from queue
    await del(action.id);
    return false;
  }
  await set(action.id, { ...action, retries: newRetries });
  return true;
}

export async function getSyncQueueSize(): Promise<number> {
  const allKeys = await keys();
  return allKeys.filter((k) => String(k).startsWith(QUEUE_PREFIX)).length;
}
