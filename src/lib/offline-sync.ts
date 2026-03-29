import { get, set, del, keys } from "idb-keyval";

const QUEUE_PREFIX = "veloop_sync_";

export interface SyncAction {
  id: string;
  table: string;
  type: "insert" | "update" | "delete";
  payload: Record<string, unknown>;
  createdAt: number;
}

export async function addToSyncQueue(action: Omit<SyncAction, "id" | "createdAt">) {
  const entry: SyncAction = {
    ...action,
    id: `${QUEUE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
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

export async function getSyncQueueSize(): Promise<number> {
  const allKeys = await keys();
  return allKeys.filter((k) => String(k).startsWith(QUEUE_PREFIX)).length;
}
