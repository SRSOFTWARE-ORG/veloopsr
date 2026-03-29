import { useState, useEffect, useCallback } from "react";
import { getSyncQueueSize } from "@/lib/offline-sync";

export type ConnectionStatus = "online" | "offline" | "syncing";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const refreshPending = useCallback(async () => {
    const count = await getSyncQueueSize();
    setPendingCount(count);
  }, []);

  useEffect(() => {
    refreshPending();
    const interval = setInterval(refreshPending, 5000);
    return () => clearInterval(interval);
  }, [refreshPending]);

  const status: ConnectionStatus = !isOnline
    ? "offline"
    : isSyncing
    ? "syncing"
    : "online";

  return { isOnline, status, pendingCount, setIsSyncing, refreshPending };
}
