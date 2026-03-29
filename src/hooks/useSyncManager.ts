import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSyncQueue, removeSyncItem, type SyncAction } from "@/lib/offline-sync";

interface UseSyncManagerProps {
  isOnline: boolean;
  setIsSyncing: (v: boolean) => void;
  refreshPending: () => Promise<void>;
}

export function useSyncManager({ isOnline, setIsSyncing, refreshPending }: UseSyncManagerProps) {
  const processQueue = useCallback(async () => {
    const queue = await getSyncQueue();
    if (queue.length === 0) return;

    setIsSyncing(true);

    for (const action of queue) {
      try {
        await processAction(action);
        await removeSyncItem(action.id);
      } catch (err) {
        console.error("[Sync] Falha ao sincronizar:", action, err);
        break; // Stop on first error to maintain order
      }
    }

    setIsSyncing(false);
    await refreshPending();
  }, [setIsSyncing, refreshPending]);

  // Sync when coming back online
  useEffect(() => {
    if (isOnline) {
      processQueue();
    }
  }, [isOnline, processQueue]);

  // Periodic sync attempt
  useEffect(() => {
    if (!isOnline) return;
    const interval = setInterval(processQueue, 30000);
    return () => clearInterval(interval);
  }, [isOnline, processQueue]);

  return { processQueue };
}

async function processAction(action: SyncAction) {
  const { table, type, payload } = action;

  switch (type) {
    case "insert": {
      const { error } = await supabase.from(table as any).insert(payload as any);
      if (error) throw error;
      break;
    }
    case "update": {
      const { id, ...rest } = payload;
      const { error } = await supabase.from(table as any).update(rest as any).eq("id", id as string);
      if (error) throw error;
      break;
    }
    case "delete": {
      const { error } = await supabase.from(table as any).delete().eq("id", payload.id as string);
      if (error) throw error;
      break;
    }
  }
}
