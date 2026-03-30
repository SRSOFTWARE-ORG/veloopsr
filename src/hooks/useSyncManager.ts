import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSyncQueue, removeSyncItem, incrementRetry, type SyncAction } from "@/lib/offline-sync";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface UseSyncManagerProps {
  isOnline: boolean;
  setIsSyncing: (v: boolean) => void;
  refreshPending: () => Promise<void>;
}

export function useSyncManager({ isOnline, setIsSyncing, refreshPending }: UseSyncManagerProps) {
  const queryClient = useQueryClient();
  const processingRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    const queue = await getSyncQueue();
    if (queue.length === 0) return;

    processingRef.current = true;
    setIsSyncing(true);

    let synced = 0;
    let failed = 0;

    for (const action of queue) {
      try {
        await processAction(action);
        await removeSyncItem(action.id);
        synced++;
      } catch (err) {
        console.error("[Sync] Falha ao sincronizar:", action, err);
        const canRetry = await incrementRetry(action);
        if (!canRetry) {
          failed++;
          console.warn("[Sync] Ação removida após 3 tentativas:", action);
        }
        // Continue to next action instead of stopping
      }
    }

    processingRef.current = false;
    setIsSyncing(false);
    await refreshPending();

    // Invalidate queries to refresh data
    if (synced > 0) {
      queryClient.invalidateQueries();
      toast.success(`${synced} alteração(ões) sincronizada(s) com sucesso`);
    }
    if (failed > 0) {
      toast.error(`${failed} ação(ões) falharam após 3 tentativas`);
    }
  }, [setIsSyncing, refreshPending, queryClient]);

  // Sync when coming back online
  useEffect(() => {
    if (isOnline) {
      processQueue();
    }
  }, [isOnline, processQueue]);

  // Periodic sync attempt every 30s
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
      const recordId = id as string;

      // Conflict resolution: "last write wins" via updated_at
      const { data: serverData } = await supabase
        .from(table as any)
        .select("updated_at")
        .eq("id", recordId)
        .single() as { data: { updated_at?: string } | null };

      if (serverData?.updated_at) {
        const serverTime = new Date(serverData.updated_at).getTime();
        if (serverTime > action.localUpdatedAt) {
          console.info("[Sync] Conflito: servidor mais recente, ignorando atualização local", recordId);
          return;
        }
      }

      const { error } = await supabase
        .from(table as any)
        .update({ ...rest, updated_at: new Date().toISOString() } as any)
        .eq("id", recordId);
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
