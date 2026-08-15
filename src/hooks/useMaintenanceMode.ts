import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "produto_imagens";
const PATH = "app-config/maintenance.json";

const publicUrl = () =>
  supabase.storage.from(BUCKET).getPublicUrl(PATH).data.publicUrl;

export const readMaintenance = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${publicUrl()}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return false;
    const json = await res.json();
    return json?.manutencao === true;
  } catch {
    return false;
  }
};

export const writeMaintenance = async (manutencao: boolean) => {
  const body = new Blob([JSON.stringify({ manutencao, updated_at: new Date().toISOString() })], {
    type: "application/json",
  });

  const { error } = await supabase.storage.from(BUCKET).upload(PATH, body, {
    upsert: true,
    contentType: "application/json",
    cacheControl: "0",
  });

  if (error) throw error;
};

/** Estado global de "app fora do ar", com verificação periódica. */
export const useMaintenanceMode = (intervalMs = 15000) => {
  const [manutencao, setManutencao] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const value = await readMaintenance();
    setManutencao(value);
    setLoading(false);
    return value;
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), intervalMs);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, intervalMs]);

  return { manutencao, loading, refresh, setManutencao };
};
